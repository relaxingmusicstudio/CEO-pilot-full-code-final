import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
    const { tenant_id, action = "archive_and_reset", preserve_demo_count = 5 } = await req.json();

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === "archive_only") {
      // Archive simulation data without resetting
      const { data: activityLog } = await supabase
        .from("mock_activity_log")
        .select("*")
        .eq("tenant_id", tenant_id);

      const { data: abTests } = await supabase
        .from("ab_test_results_mock")
        .select("*")
        .eq("tenant_id", tenant_id);

      const { data: simulations } = await supabase
        .from("simulation_runs")
        .select("*")
        .eq("tenant_id", tenant_id);

      const { data: timeline } = await supabase
        .from("simulation_timeline")
        .select("*")
        .eq("tenant_id", tenant_id);

      const { data: businessDna } = await supabase
        .from("business_dna")
        .select("*")
        .eq("tenant_id", tenant_id)
        .single();

      const archive = {
        archived_at: new Date().toISOString(),
        tenant_id,
        business_dna: businessDna,
        simulations,
        timeline_events: timeline,
        activity_log: activityLog,
        ab_test_results: abTests,
        stats: {
          total_simulations: simulations?.length || 0,
          total_events: timeline?.length || 0,
          total_activity_logs: activityLog?.length || 0,
          total_ab_tests: abTests?.length || 0,
        },
      };

      // Mark simulations as archived
      await supabase
        .from("simulation_runs")
        .update({ status: "archived" })
        .eq("tenant_id", tenant_id);

      return new Response(
        JSON.stringify({
          success: true,
          action: "archive_only",
          archive_summary: archive.stats,
          archive_data: archive,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "archive_and_reset") {
      // Step 1: Archive all data
      const { data: activityLog } = await supabase
        .from("mock_activity_log")
        .select("*")
        .eq("tenant_id", tenant_id);

      const { data: abTests } = await supabase
        .from("ab_test_results_mock")
        .select("*")
        .eq("tenant_id", tenant_id);

      const { data: simulations } = await supabase
        .from("simulation_runs")
        .select("*")
        .eq("tenant_id", tenant_id);

      const { data: timeline } = await supabase
        .from("simulation_timeline")
        .select("*")
        .eq("tenant_id", tenant_id);

      const { data: businessDna } = await supabase
        .from("business_dna")
        .select("*")
        .eq("tenant_id", tenant_id)
        .single();

      const archive = {
        archived_at: new Date().toISOString(),
        tenant_id,
        business_dna: businessDna,
        simulations,
        timeline_events: timeline,
        activity_log: activityLog,
        ab_test_results: abTests,
      };

      // Step 2: Identify demo data to preserve
      const { data: demoLeads } = await supabase
        .from("leads")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("is_demo_data", true)
        .limit(preserve_demo_count);

      const demoLeadIds = demoLeads?.map(l => l.id) || [];

      // Step 3: Delete transactional data (except demo data)
      // Delete in order to respect foreign keys

      // Delete mock activity log
      await supabase
        .from("mock_activity_log")
        .delete()
        .eq("tenant_id", tenant_id);

      // Delete A/B test results
      await supabase
        .from("ab_test_results_mock")
        .delete()
        .eq("tenant_id", tenant_id);

      // Delete timeline events
      await supabase
        .from("simulation_timeline")
        .delete()
        .eq("tenant_id", tenant_id);

      // Delete simulation runs
      await supabase
        .from("simulation_runs")
        .delete()
        .eq("tenant_id", tenant_id);

      // Delete deals (except demo)
      await supabase
        .from("deals")
        .delete()
        .eq("tenant_id", tenant_id)
        .not("is_demo_data", "eq", true);

      // Delete leads (except demo)
      await supabase
        .from("leads")
        .delete()
        .eq("tenant_id", tenant_id)
        .not("id", "in", `(${demoLeadIds.join(",")})`);

      // Delete follow-up tasks
      await supabase
        .from("follow_up_tasks")
        .delete()
        .eq("tenant_id", tenant_id);

      // Delete campaigns
      await supabase
        .from("campaigns")
        .delete()
        .eq("tenant_id", tenant_id);

      // Step 4: Reset business_dna to empty state
      await supabase
        .from("business_dna")
        .delete()
        .eq("tenant_id", tenant_id);

      // Step 5: Set tenant back to live mode
      await supabase
        .from("tenants")
        .update({ environment: "live" })
        .eq("id", tenant_id);

      return new Response(
        JSON.stringify({
          success: true,
          action: "archive_and_reset",
          archive_summary: {
            simulations_archived: simulations?.length || 0,
            events_archived: timeline?.length || 0,
            activity_logs_archived: activityLog?.length || 0,
            ab_tests_archived: abTests?.length || 0,
          },
          preserved: {
            demo_leads: demoLeadIds.length,
          },
          tenant_reset: true,
          environment: "live",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reset_only") {
      // Just reset without archiving
      await supabase.from("mock_activity_log").delete().eq("tenant_id", tenant_id);
      await supabase.from("ab_test_results_mock").delete().eq("tenant_id", tenant_id);
      await supabase.from("simulation_timeline").delete().eq("tenant_id", tenant_id);
      await supabase.from("simulation_runs").delete().eq("tenant_id", tenant_id);
      await supabase.from("business_dna").delete().eq("tenant_id", tenant_id);
      
      await supabase
        .from("tenants")
        .update({ environment: "live" })
        .eq("id", tenant_id);

      return new Response(
        JSON.stringify({
          success: true,
          action: "reset_only",
          tenant_reset: true,
          environment: "live",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Archive/reset error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
