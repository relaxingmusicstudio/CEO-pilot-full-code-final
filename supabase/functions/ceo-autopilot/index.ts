import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StandingOrder {
  id: string;
  rule_name: string;
  rule_type: string;
  conditions: Record<string, any>;
  action_type: string;
  action_payload: Record<string, any>;
  priority: number;
}

interface AutopilotConfig {
  is_active: boolean;
  absence_start: string | null;
  absence_end: string | null;
  escalation_phone: string | null;
  escalation_email: string | null;
  auto_respond_clients: boolean;
  auto_execute_followups: boolean;
  auto_manage_campaigns: boolean;
  notify_on_execution: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, trigger_event, trigger_data } = await req.json();
    console.log(`[CEO Autopilot] Action: ${action}, Event: ${trigger_event}`);

    // Check if autopilot is active
    const { data: config } = await supabase
      .from("ceo_autopilot_config")
      .select("*")
      .limit(1)
      .single();

    const autopilotConfig = config as AutopilotConfig | null;
    
    // Check if we're in absence period
    const now = new Date();
    const isInAbsencePeriod = autopilotConfig?.absence_start && autopilotConfig?.absence_end
      ? now >= new Date(autopilotConfig.absence_start) && now <= new Date(autopilotConfig.absence_end)
      : false;

    const isActive = autopilotConfig?.is_active || isInAbsencePeriod;

    if (action === "check_status") {
      return new Response(JSON.stringify({
        is_active: isActive,
        config: autopilotConfig,
        in_absence_period: isInAbsencePeriod
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "run_scheduled_checks") {
      // Run all scheduled standing orders
      const results = await runScheduledChecks(supabase, autopilotConfig);
      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "process_event" && trigger_event) {
      // Process a specific event trigger
      const results = await processEvent(supabase, trigger_event, trigger_data, autopilotConfig);
      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_execution_log") {
      const { data: executions } = await supabase
        .from("ceo_auto_executions")
        .select("*, ceo_standing_orders(rule_name)")
        .order("executed_at", { ascending: false })
        .limit(50);

      return new Response(JSON.stringify({ executions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[CEO Autopilot] Error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function runScheduledChecks(supabase: any, config: AutopilotConfig | null) {
  const results: any[] = [];

  // Get all active scheduled standing orders
  const { data: orders } = await supabase
    .from("ceo_standing_orders")
    .select("*")
    .eq("is_active", true)
    .in("rule_type", ["schedule", "threshold"])
    .order("priority", { ascending: false });

  if (!orders?.length) return results;

  for (const order of orders as StandingOrder[]) {
    try {
      const shouldExecute = await evaluateConditions(supabase, order);
      
      if (shouldExecute) {
        // GOVERNANCE #10: Autopilot can ONLY enqueue actions as pending_approval
        // It NEVER executes directly - requires human approval
        const actionPayload = {
          action_type: order.action_type,
          target_type: "standing_order",
          target_id: order.id,
          agent_type: "ceo-autopilot",
          action_payload: order.action_payload,
          priority: order.priority,
          status: "pending_approval", // ALWAYS pending - never auto-execute
          claude_reasoning: `Autopilot triggered: ${order.rule_name}`,
        };

        // Queue for human approval instead of executing
        const { data: queuedAction, error: queueError } = await supabase
          .from("ceo_action_queue")
          .insert(actionPayload)
          .select()
          .single();

        if (queueError) {
          console.error(`[CEO Autopilot] Failed to queue action:`, queueError);
          throw queueError;
        }

        results.push({
          order_id: order.id,
          rule_name: order.rule_name,
          queued_for_approval: true,
          queued_action_id: queuedAction?.id,
        });

        // Log that we queued (not executed)
        await supabase.from("ceo_auto_executions").insert({
          standing_order_id: order.id,
          action_type: order.action_type,
          action_payload: order.action_payload,
          trigger_data: { type: "scheduled_check", queued_action_id: queuedAction?.id },
          result: { status: "queued_for_approval" },
          success: true,
          notified_ceo: true, // Always notify when queuing
        });

        console.log(`[CEO Autopilot] Queued action for approval: ${order.rule_name} -> ${queuedAction?.id}`);
      }
    } catch (err) {
      console.error(`[CEO Autopilot] Order ${order.id} failed:`, err);
      results.push({
        order_id: order.id,
        rule_name: order.rule_name,
        executed: false,
        error: err instanceof Error ? err.message : "Unknown error"
      });
    }
  }

  return results;
}

async function processEvent(supabase: any, eventType: string, eventData: any, config: AutopilotConfig | null) {
  const results: any[] = [];

  // Get trigger-based standing orders that match this event
  const { data: orders } = await supabase
    .from("ceo_standing_orders")
    .select("*")
    .eq("is_active", true)
    .eq("rule_type", "trigger")
    .order("priority", { ascending: false });

  if (!orders?.length) return results;

  for (const order of orders as StandingOrder[]) {
    if (order.conditions?.event === eventType) {
      // Check threshold conditions
      let shouldExecute = true;
      
      if (order.conditions.threshold && eventData?.score !== undefined) {
        shouldExecute = eventData.score >= order.conditions.threshold;
      }
      if (order.conditions.min_value && eventData?.value !== undefined) {
        shouldExecute = shouldExecute && eventData.value >= order.conditions.min_value;
      }

      if (shouldExecute) {
        // GOVERNANCE #10: Queue for approval instead of executing
        const actionPayload = {
          action_type: order.action_type,
          target_type: "trigger_event",
          target_id: order.id,
          agent_type: "ceo-autopilot",
          action_payload: { ...order.action_payload, trigger_event: eventType, trigger_data: eventData },
          priority: order.priority,
          status: "pending_approval",
          claude_reasoning: `Event trigger: ${eventType} matched ${order.rule_name}`,
        };

        const { data: queuedAction } = await supabase
          .from("ceo_action_queue")
          .insert(actionPayload)
          .select()
          .single();

        results.push({
          order_id: order.id,
          rule_name: order.rule_name,
          queued_for_approval: true,
          queued_action_id: queuedAction?.id,
        });

        await supabase.from("ceo_auto_executions").insert({
          standing_order_id: order.id,
          action_type: order.action_type,
          action_payload: order.action_payload,
          trigger_data: { event: eventType, data: eventData, queued_action_id: queuedAction?.id },
          result: { status: "queued_for_approval" },
          success: true,
          notified_ceo: true,
        });
      }
    }
  }

  return results;
}

async function evaluateConditions(supabase: any, order: StandingOrder): Promise<boolean> {
  const { conditions, rule_type } = order;

  if (rule_type === "schedule") {
    // For schedule type, check if enough time has passed since last execution
    const { data: lastExec } = await supabase
      .from("ceo_auto_executions")
      .select("executed_at")
      .eq("standing_order_id", order.id)
      .order("executed_at", { ascending: false })
      .limit(1)
      .single();

    if (lastExec) {
      const hoursSinceLastExec = (Date.now() - new Date(lastExec.executed_at).getTime()) / (1000 * 60 * 60);
      if (conditions.check_interval === "hourly" && hoursSinceLastExec < 1) return false;
      if (conditions.check_interval === "daily" && hoursSinceLastExec < 24) return false;
    }
    return true;
  }

  if (rule_type === "threshold") {
    const metric = conditions.metric;
    
    if (metric === "client_health_score") {
      const { count } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true })
        .lt("health_score", conditions.below)
        .eq("status", "active");
      return (count || 0) > 0;
    }

    if (metric === "daily_revenue") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data: todayLeads } = await supabase
        .from("leads")
        .select("revenue_value")
        .gte("created_at", today.toISOString())
        .not("revenue_value", "is", null);

      const todayRevenue = (todayLeads || []).reduce((sum: number, l: any) => sum + (l.revenue_value || 0), 0);
      
      // Get average
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { data: weekLeads } = await supabase
        .from("leads")
        .select("revenue_value")
        .gte("created_at", weekAgo.toISOString())
        .not("revenue_value", "is", null);

      const avgDailyRevenue = (weekLeads || []).reduce((sum: number, l: any) => sum + (l.revenue_value || 0), 0) / 7;
      
      if (avgDailyRevenue > 0) {
        const percentOfAvg = (todayRevenue / avgDailyRevenue) * 100;
        return percentOfAvg < (100 - (conditions.below_avg_percent || 50));
      }
    }

    if (metric === "campaign_roas") {
      const { data: campaigns } = await supabase
        .from("ad_campaigns")
        .select("*")
        .eq("status", "active");

      for (const campaign of campaigns || []) {
        const performance = campaign.performance || {};
        const spend = performance.spend || 0;
        const revenue = performance.revenue || 0;
        
        if (spend >= (conditions.min_spend || 0)) {
          const roas = spend > 0 ? revenue / spend : 0;
          if (roas < (conditions.below || 1.0)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

async function executeAction(supabase: any, order: StandingOrder, config: AutopilotConfig | null, eventData?: any) {
  const { action_type, action_payload } = order;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  console.log(`[CEO Autopilot] Executing action: ${action_type}`);

  switch (action_type) {
    case "send_priority_notification":
      // Send SMS/Email notification
      await fetch(`${supabaseUrl}/functions/v1/sms-alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
        body: JSON.stringify({
          message: `🚨 AUTO-ACTION: ${order.rule_name} triggered. ${JSON.stringify(eventData || {})}`,
          priority: "high",
          source: "ceo-autopilot"
        })
      });
      return { notified: true, channel: action_payload.channel };

    case "trigger_intervention":
      // Create CEO alert for intervention
      await supabase.from("ceo_alerts").insert({
        alert_type: "intervention_triggered",
        title: `Auto-Intervention: ${order.rule_name}`,
        message: `Autopilot triggered retention sequence for at-risk client`,
        priority: action_payload.priority || "high",
        source: "ceo-autopilot",
        metadata: eventData
      });
      return { intervention_started: true };

    case "escalate_to_ceo":
      await fetch(`${supabaseUrl}/functions/v1/sms-alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
        body: JSON.stringify({
          message: `🚨 CRITICAL: ${order.rule_name} - Immediate attention required`,
          priority: "critical",
          source: "ceo-autopilot"
        })
      });
      return { escalated: true };

    case "send_followup":
      // Queue follow-up emails for stale leads
      const staleDays = order.conditions.stale_days || 3;
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - staleDays);

      const { data: staleLeads } = await supabase
        .from("leads")
        .select("*")
        .lt("last_contact_at", staleDate.toISOString())
        .in("status", ["new", "contacted"])
        .limit(10);

      for (const lead of staleLeads || []) {
        await supabase.from("action_queue").insert({
          agent_type: "email-agent",
          action_type: "send_followup",
          target_type: "lead",
          target_id: lead.id,
          action_payload: { template: action_payload.template, lead_name: lead.name },
          priority: 5
        });
      }
      return { followups_queued: (staleLeads || []).length };

    case "pause_campaign":
      // Auto-pause underperforming campaigns
      const { data: badCampaigns } = await supabase
        .from("ad_campaigns")
        .select("*")
        .eq("status", "active");

      let paused = 0;
      for (const campaign of badCampaigns || []) {
        const perf = campaign.performance || {};
        const spend = perf.spend || 0;
        const revenue = perf.revenue || 0;
        const roas = spend > 0 ? revenue / spend : 0;

        if (spend >= (order.conditions.min_spend || 100) && roas < (order.conditions.below || 1.0)) {
          await supabase
            .from("ad_campaigns")
            .update({ status: "paused" })
            .eq("id", campaign.id);
          paused++;
        }
      }
      return { campaigns_paused: paused };

    case "send_celebration":
      await supabase.from("ceo_alerts").insert({
        alert_type: "celebration",
        title: `🎉 Big Win! Deal Closed`,
        message: `New deal worth $${eventData?.value?.toLocaleString() || "N/A"} closed!`,
        priority: "info",
        source: "ceo-autopilot",
        metadata: eventData
      });
      return { celebrated: true };

    default:
      console.log(`[CEO Autopilot] Unknown action type: ${action_type}`);
      return { skipped: true, reason: "unknown_action" };
  }
}
