import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ConvertRequest {
  deal_id: string;
  plan?: string;
  mrr?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body: ConvertRequest = await req.json();
    const { deal_id, plan, mrr } = body;

    if (!deal_id) {
      return new Response(
        JSON.stringify({ error: "deal_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[deal-to-client] Converting deal ${deal_id}`);

    // Fetch the deal
    const { data: deal, error: dealError } = await supabase
      .from("deal_pipeline")
      .select("*")
      .eq("id", deal_id)
      .single();

    if (dealError || !deal) {
      console.error("[deal-to-client] Deal not found:", dealError);
      return new Response(
        JSON.stringify({ error: "Deal not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already converted
    if (deal.converted_to_client_id) {
      return new Response(
        JSON.stringify({ error: "Deal already converted", client_id: deal.converted_to_client_id }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch lead data if available
    let leadData = null;
    if (deal.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("*")
        .eq("id", deal.lead_id)
        .single();
      leadData = lead;
    }

    // Create client
    const clientData = {
      name: deal.name,
      email: leadData?.email || null,
      phone: leadData?.phone || null,
      company: deal.company,
      status: "active",
      plan: plan || "starter",
      mrr: mrr || deal.value || 0,
      start_date: new Date().toISOString(),
      health_score: 100, // New clients start at 100%
      notes: `Converted from deal: ${deal.name}\nDeal value: $${deal.value}\nSales methodology: ${deal.sales_methodology || 'N/A'}`,
      metadata: {
        deal_id: deal.id,
        lead_id: deal.lead_id,
        conversion_date: new Date().toISOString(),
        original_deal_value: deal.value,
        sales_methodology: deal.sales_methodology
      }
    };

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .insert(clientData)
      .select()
      .single();

    if (clientError) {
      console.error("[deal-to-client] Client creation error:", clientError);
      throw clientError;
    }

    console.log(`[deal-to-client] Created client ${client.id}`);

    // Update deal with client reference
    const { error: updateError } = await supabase
      .from("deal_pipeline")
      .update({ converted_to_client_id: client.id })
      .eq("id", deal_id);

    if (updateError) {
      console.error("[deal-to-client] Deal update error:", updateError);
    }

    // Update lead status via RPC (ownership enforcement)
    if (deal.lead_id) {
      await supabase.rpc('convert_lead', {
        p_lead_id: deal.lead_id,
        p_converted_at: new Date().toISOString(),
      });
    }

    // Create onboarding record
    const { data: onboarding, error: onboardingError } = await supabase
      .from("client_onboarding")
      .insert({
        client_id: client.id,
        status: "pending",
        current_step: 0,
        total_steps: 5,
        checklist: {
          welcome_email: false,
          kickoff_call: false,
          setup_complete: false,
          training_scheduled: false,
          first_success: false
        },
        notes: "Auto-created from deal conversion"
      })
      .select()
      .single();

    if (onboardingError) {
      console.error("[deal-to-client] Onboarding creation error:", onboardingError);
    } else {
      console.log(`[deal-to-client] Created onboarding ${onboarding?.id}`);
    }

    // Create default onboarding tasks
    const defaultTasks = [
      { title: "Send welcome email", description: "Welcome the new client with onboarding materials", priority: "high" },
      { title: "Schedule kickoff call", description: "30-minute call to review goals and setup", priority: "high" },
      { title: "Complete account setup", description: "Configure their account and integrations", priority: "medium" },
      { title: "Conduct training session", description: "Walk through key features and workflows", priority: "medium" },
      { title: "First success check-in", description: "Verify client achieved initial goals", priority: "low" },
    ];

    for (const task of defaultTasks) {
      await supabase
        .from("onboarding_tasks")
        .insert({
          client_id: client.id,
          onboarding_id: onboarding?.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: "pending"
        });
    }

    console.log(`[deal-to-client] Created ${defaultTasks.length} onboarding tasks`);

    // Create CEO alert for new client
    await supabase
      .from("ceo_alerts")
      .insert({
        alert_type: "new_client",
        title: `New Client: ${client.name}`,
        message: `Deal converted to client. MRR: $${client.mrr}. Plan: ${client.plan}`,
        priority: "medium",
        metadata: { client_id: client.id, deal_id: deal.id }
      });

    return new Response(
      JSON.stringify({
        success: true,
        client: client,
        onboarding_id: onboarding?.id,
        message: `Successfully converted deal to client with onboarding`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[deal-to-client] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
