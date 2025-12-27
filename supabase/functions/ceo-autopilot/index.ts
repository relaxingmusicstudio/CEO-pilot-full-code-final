import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateDecisionCard, wrapWithDecisionCard, logValidationFailure, type DecisionCard } from "../_shared/decisionSchema.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StandingOrder {
  id: string;
  rule_name: string;
  rule_type: string;
  conditions: Record<string, unknown>;
  action_type: string;
  action_payload: Record<string, unknown>;
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

async function runScheduledChecks(supabase: unknown, config: AutopilotConfig | null) {
  const results: unknown[] = [];

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
        // Build Decision Card following Decision Framing Standard
        const decisionCard: DecisionCard = {
          decision_type: order.action_type,
          summary: `Auto-triggered: ${order.rule_name}`.slice(0, 180),
          why_now: `Standing order conditions met at ${new Date().toISOString()}`,
          expected_impact: order.action_payload?.expected_impact as string || 'Automated response to threshold/schedule trigger',
          cost: order.action_payload?.cost as string || 'Minimal - automated action',
          risk: `${order.priority >= 8 ? 'high' : order.priority >= 5 ? 'medium' : 'low'} - standing order execution`,
          reversibility: order.action_payload?.reversibility as string || 'easy',
          requires: ['Human approval'],
          confidence: Math.min(0.9, order.priority / 10),
          proposed_payload: order.action_payload,
        };

        // Validate decision card
        const validation = validateDecisionCard(decisionCard);
        if (!validation.isValid) {
          logValidationFailure('ceo-autopilot:runScheduledChecks', decisionCard, validation);
          console.error(`[CEO Autopilot] Decision card invalid for ${order.rule_name}:`, validation.missingFields);
          results.push({
            order_id: order.id,
            rule_name: order.rule_name,
            queued_for_approval: false,
            error: `Invalid decision card: ${validation.missingFields.join(', ')}`
          });
          continue;
        }

        const actionPayload = {
          action_type: order.action_type,
          target_type: "standing_order",
          target_id: order.id,
          agent_type: "ceo-autopilot",
          action_payload: wrapWithDecisionCard(validation.normalizedDecision!, order.action_payload),
          priority: order.priority,
          status: "pending_approval",
          claude_reasoning: `Autopilot triggered: ${order.rule_name}`,
        };

        // Queue for human approval
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

        await supabase.from("ceo_auto_executions").insert({
          standing_order_id: order.id,
          action_type: order.action_type,
          action_payload: wrapWithDecisionCard(validation.normalizedDecision!, order.action_payload),
          trigger_data: { type: "scheduled_check", queued_action_id: queuedAction?.id },
          result: { status: "queued_for_approval" },
          success: true,
          notified_ceo: true,
        });

        console.log(`[CEO Autopilot] Queued valid decision card for approval: ${order.rule_name} -> ${queuedAction?.id}`);
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

async function processEvent(supabase: unknown, eventType: string, eventData: unknown, config: AutopilotConfig | null) {
  const results: unknown[] = [];

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
      let shouldExecute = true;
      
      if (order.conditions.threshold && eventData?.score !== undefined) {
        shouldExecute = eventData.score >= order.conditions.threshold;
      }
      if (order.conditions.min_value && eventData?.value !== undefined) {
        shouldExecute = shouldExecute && eventData.value >= order.conditions.min_value;
      }

      if (shouldExecute) {
        // Build Decision Card following Decision Framing Standard
        const decisionCard: DecisionCard = {
          decision_type: order.action_type,
          summary: `Event "${eventType}" triggered: ${order.rule_name}`.slice(0, 180),
          why_now: `Event ${eventType} detected with data: ${JSON.stringify(eventData || {}).slice(0, 100)}`,
          expected_impact: order.action_payload?.expected_impact as string || `Response to ${eventType} event`,
          cost: order.action_payload?.cost as string || 'Minimal - event response',
          risk: `${order.priority >= 8 ? 'high' : order.priority >= 5 ? 'medium' : 'low'} - event-triggered action`,
          reversibility: order.action_payload?.reversibility as string || 'easy',
          requires: ['Human approval'],
          confidence: Math.min(0.85, order.priority / 10),
          proposed_payload: { ...order.action_payload, trigger_event: eventType, trigger_data: eventData },
        };

        const validation = validateDecisionCard(decisionCard);
        if (!validation.isValid) {
          logValidationFailure('ceo-autopilot:processEvent', decisionCard, validation);
          continue;
        }

        const actionPayload = {
          action_type: order.action_type,
          target_type: "trigger_event",
          target_id: order.id,
          agent_type: "ceo-autopilot",
          action_payload: wrapWithDecisionCard(validation.normalizedDecision!, order.action_payload),
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
          action_payload: wrapWithDecisionCard(validation.normalizedDecision!, order.action_payload),
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

async function evaluateConditions(supabase: unknown, order: StandingOrder): Promise<boolean> {
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

      const todayRevenue = (todayLeads || []).reduce((sum: number, l: unknown) => sum + (l.revenue_value || 0), 0);
      
      // Get average
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { data: weekLeads } = await supabase
        .from("leads")
        .select("revenue_value")
        .gte("created_at", weekAgo.toISOString())
        .not("revenue_value", "is", null);

      const avgDailyRevenue = (weekLeads || []).reduce((sum: number, l: unknown) => sum + (l.revenue_value || 0), 0) / 7;
      
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

// ===========================================================================
// GOVERNANCE: executeAction REMOVED - System is Propose-Only
// ===========================================================================
// This function previously contained code that would execute side effects
// (SMS alerts, campaign pauses, external API calls) when called.
// 
// It has been REMOVED to enforce the Propose-Only governance model:
// - All actions MUST be queued as pending_approval
// - Approval only changes status, it does NOT execute
// - Execution requires a separate manual "Execute" action (not yet implemented)
//
// If execution is ever needed, it must be:
// 1. Triggered by an explicit human "Execute" button
// 2. Protected by admin authentication
// 3. Logged comprehensively for audit
// ===========================================================================

// Dead code removed for governance compliance. DO NOT re-add execution logic.
