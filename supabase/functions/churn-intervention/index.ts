import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, intervention_id, client_id, outcome, notes } = await req.json();

    console.log(`Churn Intervention: ${action}`);

    // Action: Complete an intervention
    if (action === "complete") {
      if (!intervention_id) throw new Error("intervention_id required");

      const { error } = await supabase
        .from("client_interventions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          outcome,
          notes
        })
        .eq("id", intervention_id);

      if (error) throw error;

      // If outcome was positive, update client's last_contact
      if (outcome === "positive" || outcome === "retained") {
        const { data: intervention } = await supabase
          .from("client_interventions")
          .select("client_id")
          .eq("id", intervention_id)
          .single();

        if (intervention) {
          await supabase
            .from("clients")
            .update({ last_contact: new Date().toISOString() })
            .eq("id", intervention.client_id);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: Generate AI retention strategy
    if (action === "generate_strategy") {
      if (!client_id) throw new Error("client_id required");

      // Get client data
      const { data: client } = await supabase
        .from("clients")
        .select("*")
        .eq("id", client_id)
        .single();

      if (!client) throw new Error("Client not found");

      // Get recent interventions
      const { data: interventions } = await supabase
        .from("client_interventions")
        .select("*")
        .eq("client_id", client_id)
        .order("created_at", { ascending: false })
        .limit(10);

      // Get usage data
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: usage } = await supabase
        .from("client_usage")
        .select("*")
        .eq("client_id", client_id)
        .gte("date", thirtyDaysAgo.toISOString().split("T")[0]);

      // Get tickets
      const { data: tickets } = await supabase
        .from("client_tickets")
        .select("*")
        .eq("client_id", client_id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (!LOVABLE_API_KEY) {
        return new Response(JSON.stringify({
          strategy: generateFallbackStrategy(client, usage || [], tickets || [])
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use AI to generate personalized retention strategy
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `You are a customer success expert specializing in SaaS retention for HVAC service businesses. Generate a specific, actionable retention strategy.

Response format:
{
  "risk_assessment": "brief risk summary",
  "primary_issue": "main problem identified",
  "retention_actions": [
    {"action": "specific action", "timeline": "when", "owner": "who", "expected_impact": "outcome"}
  ],
  "talking_points": ["personalized point 1", "point 2"],
  "offer_to_make": "specific retention offer if needed",
  "success_probability": 0-100
}`
            },
            {
              role: "user",
              content: `Generate retention strategy for this at-risk client:

CLIENT DATA:
- Name: ${client.business_name || client.name}
- Plan: ${client.plan} ($${client.mrr}/mo)
- Tenure: ${Math.floor((Date.now() - new Date(client.start_date).getTime()) / (1000 * 60 * 60 * 24 * 30))} months
- Health Score: ${client.health_score}
- Last Contact: ${client.last_contact || "Never"}

USAGE (last 30 days):
${JSON.stringify(usage?.reduce((acc: any, d: any) => ({
  logins: (acc.logins || 0) + (d.login_count || 0),
  conversations: (acc.conversations || 0) + (d.conversations_handled || 0),
  leads: (acc.leads || 0) + (d.leads_captured || 0),
  appointments: (acc.appointments || 0) + (d.appointments_booked || 0)
}), {}) || "No usage data")}

RECENT TICKETS:
${tickets?.slice(0, 5).map(t => `- ${t.subject} (${t.status}, ${t.priority})`).join("\n") || "No tickets"}

INTERVENTION HISTORY:
${interventions?.slice(0, 5).map(i => `- ${i.intervention_type}: ${i.outcome || i.status}`).join("\n") || "No prior interventions"}`
            }
          ]
        }),
      });

      if (!response.ok) {
        return new Response(JSON.stringify({
          strategy: generateFallbackStrategy(client, usage || [], tickets || [])
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiData = await response.json();
      const content = aiData.choices?.[0]?.message?.content || "";

      let strategy;
      try {
        strategy = JSON.parse(content);
      } catch {
        strategy = { raw: content };
      }

      return new Response(JSON.stringify({ strategy, client }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: Get pending interventions
    if (action === "get_pending") {
      const { data: pending } = await supabase
        .from("client_interventions")
        .select(`
          *,
          clients:client_id (id, name, business_name, mrr, health_score, plan)
        `)
        .in("status", ["pending", "scheduled"])
        .order("created_at", { ascending: true })
        .limit(50);

      return new Response(JSON.stringify({ interventions: pending || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: Get LTV/CAC metrics with real data
    if (action === "ltv_cac_metrics") {
      // Get all clients
      const { data: clients } = await supabase
        .from("clients")
        .select("*");

      // Get marketing spend
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 90);

      const { data: marketingSpend } = await supabase
        .from("marketing_spend")
        .select("*")
        .gte("spend_date", thirtyDaysAgo.toISOString().split("T")[0]);

      const totalSpend = (marketingSpend || []).reduce((sum, s) => sum + (s.spend_amount || 0), 0);

      // Calculate metrics
      const activeClients = (clients || []).filter(c => c.status === "active");
      const churnedClients = (clients || []).filter(c => c.status === "churned");

      const avgMRR = activeClients.length > 0
        ? activeClients.reduce((sum, c) => sum + c.mrr, 0) / activeClients.length
        : 0;

      const churnRate = clients && clients.length > 0
        ? (churnedClients.length / clients.length) * 100
        : 5;

      const avgLifespanMonths = churnRate > 0 ? 100 / churnRate : 24;
      const ltv = avgMRR * avgLifespanMonths;

      const newClientsLast90Days = activeClients.filter(c => {
        const start = new Date(c.start_date);
        return start >= thirtyDaysAgo;
      }).length;

      const cac = newClientsLast90Days > 0 && totalSpend > 0
        ? totalSpend / newClientsLast90Days
        : 350;

      const ltvCacRatio = cac > 0 ? ltv / cac : 0;
      const paybackMonths = avgMRR > 0 ? cac / avgMRR : 0;

      return new Response(JSON.stringify({
        ltv: Math.round(ltv),
        cac: Math.round(cac),
        ltvCacRatio: ltvCacRatio.toFixed(1),
        paybackMonths: paybackMonths.toFixed(1),
        avgMRR: Math.round(avgMRR),
        churnRate: churnRate.toFixed(1),
        avgLifespanMonths: avgLifespanMonths.toFixed(1),
        totalMarketingSpend: totalSpend,
        newClients90Days: newClientsLast90Days,
        activeClients: activeClients.length,
        totalClients: clients?.length || 0
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Churn Intervention error:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function generateFallbackStrategy(client: any, usage: any[], tickets: any[]) {
  const totalLogins = usage.reduce((sum, d) => sum + (d.login_count || 0), 0);
  const hasTickets = tickets.some(t => t.status === "open");

  const actions = [];

  if (totalLogins === 0) {
    actions.push({
      action: "Schedule re-onboarding call",
      timeline: "Within 48 hours",
      owner: "Customer Success",
      expected_impact: "Re-engage dormant user"
    });
  }

  if (hasTickets) {
    actions.push({
      action: "Escalate and resolve open tickets",
      timeline: "Within 24 hours",
      owner: "Support Lead",
      expected_impact: "Remove friction points"
    });
  }

  actions.push({
    action: "Executive check-in call",
    timeline: "This week",
    owner: "Account Manager",
    expected_impact: "Build relationship, understand concerns"
  });

  return {
    risk_assessment: `Client health at ${client.health_score}%. Immediate attention required.`,
    primary_issue: totalLogins === 0 ? "No product engagement" : "Declining health score",
    retention_actions: actions,
    talking_points: [
      "We noticed you haven't been using the platform recently",
      "Your success is our priority - how can we help?",
      "Many clients in similar situations found value in [specific feature]"
    ],
    offer_to_make: client.health_score < 30 
      ? "Consider 1 month free or plan downgrade to retain" 
      : "Offer dedicated onboarding session",
    success_probability: client.health_score < 30 ? 40 : 65
  };
}
