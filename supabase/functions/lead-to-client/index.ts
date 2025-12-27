import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAudit, createAuditContext } from "../_shared/auditLogger.ts";
import { 
  isValidUUID, 
  sanitizeString, 
  sanitizeNumber,
  corsHeaders,
  createErrorResponse 
} from "../_shared/validation.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const audit = createAuditContext(supabase, 'lead-to-client', 'convert_lead');

  try {
    const body = await req.json();
    
    // Validate and sanitize inputs
    const lead_id = sanitizeString(body.lead_id, 36);
    const plan = sanitizeString(body.plan, 50);
    const mrr = sanitizeNumber(body.mrr, 0, 100000);
    const notes = sanitizeString(body.notes, 1000);

    if (!lead_id || !isValidUUID(lead_id)) {
      await audit.logError('Invalid lead_id format', { lead_id });
      return createErrorResponse("Valid lead_id (UUID) is required", 400);
    }

    console.log(`Converting lead ${lead_id} to client`);

    // Get lead data
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      throw new Error(`Lead not found: ${leadError?.message || "Unknown"}`);
    }

    // Check if already converted
    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .eq("lead_id", lead_id)
      .maybeSingle();

    if (existingClient) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: "Lead already converted to client",
        client_id: existingClient.id 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate initial health score based on lead data
    let initialHealthScore = 80; // Start healthy
    if (lead.lead_score >= 90) initialHealthScore = 95;
    else if (lead.lead_score >= 75) initialHealthScore = 85;
    else if (lead.lead_score >= 50) initialHealthScore = 75;

    // Determine plan and MRR
    const clientPlan = plan || determinePlanFromLead(lead);
    const clientMrr = mrr || getMrrFromPlan(clientPlan);

    // Create client record
    const { data: newClient, error: clientError } = await supabase
      .from("clients")
      .insert({
        lead_id: lead.id,
        name: lead.name || "Unknown",
        business_name: lead.business_name,
        email: lead.email || `lead-${lead.id}@placeholder.com`,
        phone: lead.phone,
        plan: clientPlan,
        mrr: clientMrr,
        status: "active",
        health_score: initialHealthScore,
        notes: notes || `Converted from lead. Original score: ${lead.lead_score || 0}`,
        last_contact: new Date().toISOString(),
        metadata: {
          conversion_source: "lead_conversion",
          original_lead_score: lead.lead_score,
          lead_temperature: lead.lead_temperature,
          buying_signals: lead.buying_signals,
          conversion_date: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (clientError) {
      throw new Error(`Failed to create client: ${clientError.message}`);
    }

    // Update lead status
    await supabase
      .from("leads")
      .update({ 
        status: "won",
        converted_at: new Date().toISOString(),
        revenue_value: clientMrr * 12 // Annual value
      })
      .eq("id", lead_id);

    // Update marketing attribution
    if (lead.visitor_id) {
      const { data: visitor } = await supabase
        .from("visitors")
        .select("utm_source, utm_campaign")
        .eq("visitor_id", lead.visitor_id)
        .maybeSingle();

      if (visitor?.utm_source) {
        // Get current record and increment
        const today = new Date().toISOString().split("T")[0];
        const { data: existing } = await supabase
          .from("marketing_spend")
          .select("conversions, revenue_attributed")
          .eq("source", visitor.utm_source)
          .eq("spend_date", today)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("marketing_spend")
            .update({ 
              conversions: (existing.conversions || 0) + 1,
              revenue_attributed: (existing.revenue_attributed || 0) + clientMrr * 12
            })
            .eq("source", visitor.utm_source)
            .eq("spend_date", today);
        }
      }
    }

    // Create welcome work item
    await supabase
      .from("work_queue")
      .insert({
        agent_type: "inbox",
        title: `🎉 New Client: ${lead.business_name || lead.name}`,
        description: `${lead.name} just converted! Plan: ${clientPlan}, MRR: $${clientMrr}. Schedule onboarding call.`,
        type: "task",
        priority: "high",
        source: "automation",
        metadata: {
          client_id: newClient.id,
          lead_id: lead.id,
          plan: clientPlan,
          mrr: clientMrr
        }
      });

    // Schedule initial health check (30 days)
    await supabase
      .from("client_interventions")
      .insert({
        client_id: newClient.id,
        intervention_type: "health_check",
        trigger_reason: "30-day onboarding review",
        status: "scheduled",
        scheduled_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });

    console.log(`Successfully converted lead ${lead_id} to client ${newClient.id}`);

    return new Response(JSON.stringify({
      success: true,
      client: newClient,
      message: `Successfully converted ${lead.name} to client`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Lead to client conversion error:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function determinePlanFromLead(lead: unknown): string {
  const teamSize = lead.team_size || "";
  if (teamSize.includes("10+") || teamSize.includes("10")) return "scale";
  if (teamSize.includes("5-10") || teamSize.includes("6-10")) return "growth";
  return "starter";
}

function getMrrFromPlan(plan: string): number {
  switch (plan) {
    case "scale": return 1999;
    case "growth": return 999;
    case "starter": 
    default: return 499;
  }
}
