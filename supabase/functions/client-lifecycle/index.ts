import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ClientWithMetrics {
  id: string;
  name: string;
  business_name: string | null;
  email: string;
  mrr: number;
  health_score: number | null;
  status: string;
  last_contact: string | null;
  start_date: string;
  plan: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action } = await req.json();

    console.log(`Client Lifecycle: Running ${action || "full_check"}`);

    // Start automation log
    const { data: logEntry } = await supabase
      .from("automation_logs")
      .insert({
        function_name: "client-lifecycle",
        status: "running",
        metadata: { action, triggered_at: new Date().toISOString() }
      })
      .select()
      .single();

    // Get all active clients
    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("*")
      .eq("status", "active");

    if (clientsError) throw clientsError;

    const results = {
      clients_checked: 0,
      health_updated: 0,
      interventions_created: 0,
      at_risk_clients: [] as string[],
      churn_alerts: 0
    };

    for (const client of (clients || []) as ClientWithMetrics[]) {
      results.clients_checked++;

      // Calculate days since last contact
      const daysSinceContact = client.last_contact
        ? Math.floor((Date.now() - new Date(client.last_contact).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      // Calculate client tenure in months
      const tenureMonths = Math.floor(
        (Date.now() - new Date(client.start_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
      );

      // Get recent usage data
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: usageData } = await supabase
        .from("client_usage")
        .select("*")
        .eq("client_id", client.id)
        .gte("date", thirtyDaysAgo.toISOString().split("T")[0]);

      const { data: tickets } = await supabase
        .from("client_tickets")
        .select("*")
        .eq("client_id", client.id)
        .in("status", ["open", "in_progress"]);

      // Calculate comprehensive health score
      const healthMetrics = calculateHealthMetrics(client, usageData || [], tickets || [], daysSinceContact);
      
      // Update health score if changed significantly
      if (Math.abs((client.health_score || 100) - healthMetrics.score) >= 5) {
        await supabase
          .from("clients")
          .update({ health_score: healthMetrics.score })
          .eq("id", client.id);
        results.health_updated++;
      }

      // Intervention triggers
      const interventions = [];

      // 1. At-risk intervention (health < 50)
      if (healthMetrics.score < 50) {
        results.at_risk_clients.push(client.business_name || client.name);
        
        const { data: existingIntervention } = await supabase
          .from("client_interventions")
          .select("id")
          .eq("client_id", client.id)
          .eq("intervention_type", "at_risk_outreach")
          .eq("status", "pending")
          .maybeSingle();

        if (!existingIntervention) {
          interventions.push({
            client_id: client.id,
            intervention_type: "at_risk_outreach",
            trigger_reason: `Health score dropped to ${healthMetrics.score}. ${healthMetrics.reasons.join(", ")}`,
            status: "pending",
            scheduled_at: new Date().toISOString()
          });
        }
      }

      // 2. No contact intervention (> 21 days)
      if (daysSinceContact > 21) {
        const { data: existingCheck } = await supabase
          .from("client_interventions")
          .select("id")
          .eq("client_id", client.id)
          .eq("intervention_type", "check_in_call")
          .in("status", ["pending", "scheduled"])
          .maybeSingle();

        if (!existingCheck) {
          interventions.push({
            client_id: client.id,
            intervention_type: "check_in_call",
            trigger_reason: `No contact in ${daysSinceContact} days`,
            status: "scheduled",
            scheduled_at: new Date().toISOString()
          });
        }
      }

      // 3. Milestone celebrations
      if (tenureMonths === 3 || tenureMonths === 6 || tenureMonths === 12) {
        const { data: existingMilestone } = await supabase
          .from("client_interventions")
          .select("id")
          .eq("client_id", client.id)
          .eq("intervention_type", "milestone_celebration")
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .maybeSingle();

        if (!existingMilestone) {
          interventions.push({
            client_id: client.id,
            intervention_type: "milestone_celebration",
            trigger_reason: `${tenureMonths} month anniversary`,
            status: "pending"
          });
        }
      }

      // 4. Upsell opportunity (high health + tenure)
      if (healthMetrics.score >= 85 && tenureMonths >= 2 && client.plan !== "scale") {
        const { data: existingUpsell } = await supabase
          .from("client_interventions")
          .select("id")
          .eq("client_id", client.id)
          .eq("intervention_type", "upsell_opportunity")
          .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .maybeSingle();

        if (!existingUpsell) {
          interventions.push({
            client_id: client.id,
            intervention_type: "upsell_opportunity",
            trigger_reason: `High health (${healthMetrics.score}) and ${tenureMonths}mo tenure. Current plan: ${client.plan}`,
            status: "pending"
          });
        }
      }

      // 5. Churn risk alert (very low health)
      if (healthMetrics.score < 30) {
        results.churn_alerts++;
        
        await supabase
          .from("work_queue")
          .insert({
            agent_type: "inbox",
            title: `🚨 CHURN RISK: ${client.business_name || client.name}`,
            description: `Health score: ${healthMetrics.score}. MRR at risk: $${client.mrr}. Immediate action required!`,
            type: "alert",
            priority: "urgent",
            source: "automation",
            metadata: {
              client_id: client.id,
              health_score: healthMetrics.score,
              mrr: client.mrr,
              reasons: healthMetrics.reasons
            }
          });
      }

      // Insert all interventions
      if (interventions.length > 0) {
        await supabase.from("client_interventions").insert(interventions);
        results.interventions_created += interventions.length;
      }
    }

    // Update log
    if (logEntry) {
      await supabase
        .from("automation_logs")
        .update({
          status: "success",
          completed_at: new Date().toISOString(),
          items_processed: results.clients_checked,
          items_created: results.interventions_created,
          metadata: results
        })
        .eq("id", logEntry.id);
    }

    console.log("Client Lifecycle complete:", results);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Client Lifecycle error:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function calculateHealthMetrics(
  client: ClientWithMetrics,
  usageData: any[],
  tickets: any[],
  daysSinceContact: number
): { score: number; reasons: string[] } {
  let score = 100;
  const reasons: string[] = [];

  // Usage metrics (40 points)
  const totalLogins = usageData.reduce((sum, d) => sum + (d.login_count || 0), 0);
  const totalConversations = usageData.reduce((sum, d) => sum + (d.conversations_handled || 0), 0);
  const totalLeads = usageData.reduce((sum, d) => sum + (d.leads_captured || 0), 0);

  if (totalLogins === 0) {
    score -= 20;
    reasons.push("No logins in 30 days");
  } else if (totalLogins < 5) {
    score -= 10;
    reasons.push("Low login frequency");
  }

  if (totalConversations === 0 && totalLeads === 0) {
    score -= 20;
    reasons.push("No product usage");
  } else if (totalConversations < 10) {
    score -= 10;
    reasons.push("Low product engagement");
  }

  // Support metrics (30 points)
  const openTickets = tickets.length;
  const urgentTickets = tickets.filter(t => t.priority === "urgent").length;

  if (urgentTickets > 0) {
    score -= 15 * urgentTickets;
    reasons.push(`${urgentTickets} urgent ticket(s) open`);
  }
  if (openTickets > 2) {
    score -= 10;
    reasons.push(`${openTickets} open tickets`);
  }

  // Contact recency (20 points)
  if (daysSinceContact > 60) {
    score -= 20;
    reasons.push("No contact in 60+ days");
  } else if (daysSinceContact > 30) {
    score -= 10;
    reasons.push("No contact in 30+ days");
  } else if (daysSinceContact > 14) {
    score -= 5;
    reasons.push("No recent contact");
  }

  // MRR factor (10 points) - higher MRR clients get slight boost
  if (client.mrr >= 1500) {
    score = Math.min(100, score + 5);
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons
  };
}
