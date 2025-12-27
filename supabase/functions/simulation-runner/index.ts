import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateDecisionCard, wrapWithDecisionCard, type DecisionCard } from "../_shared/decisionSchema.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Agent response generators based on event type
const agentResponses = {
  lead_created: async (event: unknown, supabase: unknown) => {
    return {
      agent: "CRM_Agent",
      action: "assign_and_score",
      decision: "Assigned to sales queue with priority scoring",
      tasks_created: ["Initial outreach email", "Research prospect"],
      outcome: "Lead scored and queued for outreach",
    };
  },

  email_opened: async (event: unknown, supabase: unknown) => {
    return {
      agent: "Content_Agent",
      action: "trigger_follow_up",
      decision: "Detected engagement, scheduling follow-up",
      tasks_created: ["Send follow-up content"],
      outcome: "Follow-up sequence triggered",
    };
  },

  deal_created: async (event: unknown, supabase: unknown) => {
    const abVariants = {
      variant_a: {
        content: "Direct pitch: 'Ready to scale? Let's talk specifics.'",
        style: "direct",
      },
      variant_b: {
        content: "Story-driven: 'Companies like yours have seen 40% growth...'",
        style: "storytelling",
      },
    };

    // Simulate A/B test metrics
    const variantAMetrics = {
      opens: Math.floor(Math.random() * 100) + 50,
      clicks: Math.floor(Math.random() * 30) + 10,
      conversions: Math.floor(Math.random() * 10) + 2,
    };
    const variantBMetrics = {
      opens: Math.floor(Math.random() * 100) + 50,
      clicks: Math.floor(Math.random() * 30) + 10,
      conversions: Math.floor(Math.random() * 10) + 2,
    };

    // Determine winner
    const aScore = variantAMetrics.conversions / variantAMetrics.opens;
    const bScore = variantBMetrics.conversions / variantBMetrics.opens;
    const winner = Math.abs(aScore - bScore) < 0.02 ? "tie" : aScore > bScore ? "A" : "B";

    // Log A/B test
    await supabase.from("ab_test_results_mock").insert({
      tenant_id: event.tenant_id,
      simulation_id: event.simulation_id,
      test_name: `deal_outreach_${event.event_day}`,
      variant_a: abVariants.variant_a,
      variant_b: abVariants.variant_b,
      variant_a_metrics: variantAMetrics,
      variant_b_metrics: variantBMetrics,
      winner,
      confidence_score: Math.abs(aScore - bScore) * 100,
      message_type: "deal_outreach",
    });

    return {
      agent: "Sales_Agent",
      action: "create_deal_strategy",
      decision: `Created deal strategy with ${winner === "A" ? "direct" : winner === "B" ? "storytelling" : "mixed"} approach`,
      ab_test: { winner, variant_a_metrics: variantAMetrics, variant_b_metrics: variantBMetrics },
      tasks_created: ["Send proposal", "Schedule demo call"],
      outcome: "Deal strategy established",
    };
  },

  deal_won: async (event: unknown, supabase: unknown) => {
    // Trigger client creation flow
    await supabase.functions.invoke("deal-to-client", {
      body: {
        deal_id: event.target_entity_id,
        auto_create: true,
        mock_mode: true,
      },
    }).catch(() => {});

    return {
      agent: "CEO_Agent",
      action: "celebrate_and_onboard",
      decision: "Deal won! Initiating client onboarding and success protocols",
      tasks_created: ["Send welcome package", "Schedule kickoff call", "Create onboarding checklist"],
      outcome: "Client created and onboarding initiated",
      revenue_impact: event.trigger_data?.value || 0,
    };
  },

  onboarding_started: async (event: unknown, supabase: unknown) => {
    return {
      agent: "Onboarding_Agent",
      action: "initialize_onboarding",
      decision: "Starting structured onboarding sequence",
      tasks_created: ["Send training materials", "Schedule check-in calls", "Set up integrations"],
      outcome: "Onboarding workflow activated",
    };
  },

  support_ticket: async (event: unknown, supabase: unknown) => {
    const priority = event.trigger_data?.priority || "medium";
    return {
      agent: "Support_Agent",
      action: "triage_and_respond",
      decision: `Ticket triaged as ${priority} priority`,
      tasks_created: priority === "high" ? ["Escalate to specialist", "Send immediate response"] : ["Queue for response"],
      outcome: `Support ticket handled with ${priority} priority`,
    };
  },

  health_score_drop: async (event: unknown, supabase: unknown) => {
    const oldScore = event.trigger_data?.old_score || 75;
    const newScore = event.trigger_data?.new_score || 45;

    return {
      agent: "Retention_Agent",
      action: "trigger_intervention",
      decision: `Health score dropped from ${oldScore} to ${newScore}. Initiating intervention.`,
      tasks_created: ["Schedule check-in call", "Send value reinforcement content", "Review usage patterns"],
      outcome: "Intervention protocol activated",
      risk_level: newScore < 30 ? "critical" : newScore < 50 ? "high" : "medium",
    };
  },

  churn_risk_detected: async (event: unknown, supabase: unknown) => {
    const churnProb = event.trigger_data?.churn_probability || 0.65;

    // Build Decision Card for churn intervention
    const decisionCard: DecisionCard = {
      decision_type: 'churn_intervention',
      summary: `High churn risk detected: ${(churnProb * 100).toFixed(0)}% probability`,
      why_now: `Client health score dropped below threshold. Immediate action required to prevent churn.`,
      expected_impact: `Retain client worth estimated $${(Math.random() * 50000 + 10000).toFixed(0)}/year`,
      cost: '2-4 hours executive time',
      risk: churnProb > 0.7 ? 'high - client may churn within 30 days' : 'medium - churn likely within 60 days',
      reversibility: 'easy',
      requires: ['Client contact info', 'Account history', 'Discount authority'],
      confidence: churnProb,
      proposed_payload: {
        churn_probability: churnProb,
        recommended_actions: ["Executive outreach", "Discount offer", "Feature consultation"],
      },
    };

    const validation = validateDecisionCard(decisionCard);
    if (validation.isValid) {
      await supabase.from("ceo_action_queue").insert({
        action_type: "churn_intervention",
        target_type: "client",
        target_id: event.target_entity_id,
        priority: churnProb > 0.7 ? "critical" : "high",
        action_payload: wrapWithDecisionCard(validation.normalizedDecision!),
        source: "simulation",
        status: "pending_approval",
        claude_reasoning: `AI detected ${(churnProb * 100).toFixed(0)}% churn probability. Recommending immediate intervention.`,
      });
    }

    return {
      agent: "CEO_Agent",
      action: "executive_intervention",
      decision: `High churn risk (${(churnProb * 100).toFixed(0)}%) detected. Escalating to executive action.`,
      tasks_created: ["CEO personal outreach", "Prepare retention offer", "Schedule strategic review"],
      outcome: "Executive intervention queued",
      churn_probability: churnProb,
    };
  },

  expansion_opportunity: async (event: unknown, supabase: unknown) => {
    const potentialValue = event.trigger_data?.potential_value || 1500;

    return {
      agent: "Revenue_Agent",
      action: "identify_upsell",
      decision: `Expansion opportunity worth $${potentialValue.toFixed(0)} identified`,
      tasks_created: ["Prepare upsell proposal", "Schedule account review", "Create custom demo"],
      outcome: "Upsell opportunity queued",
      potential_revenue: potentialValue,
    };
  },
};

// Process a single timeline event
async function processEvent(event: unknown, supabase: unknown): Promise<unknown> {
  const handler = agentResponses[event.event_type as keyof typeof agentResponses];
  
  if (!handler) {
    return {
      agent: "System",
      action: "unhandled_event",
      decision: `No handler for event type: ${event.event_type}`,
      outcome: "Event logged but not processed",
    };
  }

  try {
    const response = await handler(event, supabase);
    
    // Log to mock activity
    await supabase.from("mock_activity_log").insert({
      tenant_id: event.tenant_id,
      simulation_id: event.simulation_id,
      service_key: "agent_system",
      action_type: event.event_type,
      simulated_result: { success: true },
      original_payload: event.trigger_data,
      mock_response: response,
      event_day: event.event_day,
    });

    return response;
  } catch (error: unknown) {
    return {
      agent: "System",
      action: "error",
      decision: `Error processing event: ${error?.message || "Unknown error"}`,
      outcome: "Event failed",
      error: error?.message || "Unknown error",
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { simulation_id, action = "run", days_to_process, speed_multiplier = 60 } = await req.json();

    if (!simulation_id) {
      return new Response(
        JSON.stringify({ error: "simulation_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get simulation run
    const { data: simulation, error: simError } = await supabase
      .from("simulation_runs")
      .select("*")
      .eq("id", simulation_id)
      .single();

    if (simError || !simulation) {
      return new Response(
        JSON.stringify({ error: "Simulation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "pause") {
      await supabase
        .from("simulation_runs")
        .update({ status: "paused" })
        .eq("id", simulation_id);

      return new Response(
        JSON.stringify({ success: true, status: "paused" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "resume" || action === "run") {
      // Update status to running
      await supabase
        .from("simulation_runs")
        .update({ status: "running", speed_multiplier })
        .eq("id", simulation_id);

      // Get pending events
      const startDay = simulation.current_day + 1;
      const endDay = days_to_process ? startDay + days_to_process - 1 : simulation.total_days_simulated;

      const { data: events, error: eventsError } = await supabase
        .from("simulation_timeline")
        .select("*")
        .eq("simulation_id", simulation_id)
        .eq("status", "pending")
        .gte("event_day", startDay)
        .lte("event_day", endDay)
        .order("event_day", { ascending: true });

      if (eventsError) {
        throw new Error(`Failed to fetch events: ${eventsError.message}`);
      }

      const results: unknown[] = [];
      let processedCount = 0;
      let errorsCount = 0;
      let currentDay = startDay;

      // Process events in batches by day
      for (const event of events || []) {
        // Update current day
        if (event.event_day > currentDay) {
          currentDay = event.event_day;
          await supabase
            .from("simulation_runs")
            .update({ current_day: currentDay })
            .eq("id", simulation_id);
        }

        // Mark event as processing
        await supabase
          .from("simulation_timeline")
          .update({ status: "processing" })
          .eq("id", event.id);

        // Process the event
        const response = await processEvent(event, supabase);
        
        // Update event with response
        const eventStatus = response.error ? "failed" : "completed";
        await supabase
          .from("simulation_timeline")
          .update({
            status: eventStatus,
            executed_at: new Date().toISOString(),
            agent_response: response,
          })
          .eq("id", event.id);

        if (response.error) {
          errorsCount++;
        } else {
          processedCount++;
        }

        results.push({
          event_id: event.id,
          day: event.event_day,
          type: event.event_type,
          status: eventStatus,
          agent: response.agent,
          outcome: response.outcome,
        });

        // Simulate time delay based on speed multiplier
        // In real mode: 60 = 1 day per minute
        // For edge function, we just process without delay
      }

      // Update simulation with final stats
      const isComplete = endDay >= simulation.total_days_simulated;
      await supabase
        .from("simulation_runs")
        .update({
          current_day: endDay,
          status: isComplete ? "completed" : "paused",
          completed_at: isComplete ? new Date().toISOString() : null,
          agent_responses_count: (simulation.agent_responses_count || 0) + processedCount,
          metrics_summary: {
            ...(simulation.metrics_summary || {}),
            last_batch: {
              processed: processedCount,
              errors: errorsCount,
              days_covered: endDay - startDay + 1,
            },
          },
        })
        .eq("id", simulation_id);

      return new Response(
        JSON.stringify({
          success: true,
          simulation_id,
          status: isComplete ? "completed" : "paused",
          current_day: endDay,
          events_processed: processedCount,
          errors: errorsCount,
          results: results.slice(0, 50), // Return first 50 for preview
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get simulation status
    if (action === "status") {
      const { data: pendingEvents } = await supabase
        .from("simulation_timeline")
        .select("id", { count: "exact" })
        .eq("simulation_id", simulation_id)
        .eq("status", "pending");

      const { data: completedEvents } = await supabase
        .from("simulation_timeline")
        .select("id", { count: "exact" })
        .eq("simulation_id", simulation_id)
        .eq("status", "completed");

      const { data: abTests } = await supabase
        .from("ab_test_results_mock")
        .select("*")
        .eq("simulation_id", simulation_id);

      return new Response(
        JSON.stringify({
          simulation,
          stats: {
            pending_events: pendingEvents?.length || 0,
            completed_events: completedEvents?.length || 0,
            ab_tests_run: abTests?.length || 0,
            progress_percentage: Math.round((simulation.current_day / simulation.total_days_simulated) * 100),
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Simulation runner error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
