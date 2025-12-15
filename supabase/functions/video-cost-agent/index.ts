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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, ...params } = await req.json();

    console.log(`[Video Cost Agent] Action: ${action}`);

    switch (action) {
      case "estimate_cost": {
        const { duration_seconds, provider, quality_priority = "balanced" } = params;

        // Get provider config
        const { data: configs } = await supabase
          .from("video_provider_config")
          .select("*")
          .eq("is_enabled", true);

        if (!configs?.length) {
          throw new Error("No providers configured");
        }

        // Calculate cost for each provider
        const estimates = configs.map(config => ({
          provider: config.provider,
          cost_cents: Math.round(duration_seconds * (config.cost_per_second_cents || 0)),
          cost_dollars: (duration_seconds * (config.cost_per_second_cents || 0) / 100).toFixed(2),
          quality_score: config.quality_score,
          is_recommended: false,
        }));

        // Mark recommended based on priority
        const sorted = [...estimates].sort((a, b) => {
          if (quality_priority === "cost") return a.cost_cents - b.cost_cents;
          if (quality_priority === "quality") return b.quality_score - a.quality_score;
          return (a.cost_cents * 0.5 + (100 - a.quality_score) * 0.5) - 
                 (b.cost_cents * 0.5 + (100 - b.quality_score) * 0.5);
        });
        
        if (sorted.length > 0) {
          const recommended = estimates.find(e => e.provider === sorted[0].provider);
          if (recommended) recommended.is_recommended = true;
        }

        // Calculate potential savings
        const maxCost = Math.max(...estimates.map(e => e.cost_cents));
        const minCost = Math.min(...estimates.map(e => e.cost_cents));
        const potentialSavings = maxCost - minCost;

        return new Response(JSON.stringify({
          success: true,
          duration_seconds,
          estimates,
          potential_savings_cents: potentialSavings,
          recommended_provider: sorted[0]?.provider,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "record_spend": {
        const { event_id, cost_cents, provider, duration_seconds } = params;

        // Update the event
        if (event_id) {
          await supabase
            .from("video_generation_events")
            .update({ cost_cents, duration_seconds })
            .eq("id", event_id);
        }

        // Update provider totals
        const { data: health } = await supabase
          .from("video_provider_health")
          .select("*")
          .eq("provider", provider)
          .single();

        if (health) {
          await supabase
            .from("video_provider_health")
            .update({
              total_cost_cents: (health.total_cost_cents || 0) + cost_cents,
              total_seconds_generated: (health.total_seconds_generated || 0) + duration_seconds,
            })
            .eq("provider", provider);
        }

        return new Response(JSON.stringify({
          success: true,
          recorded: { cost_cents, provider, duration_seconds },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "analyze_spend": {
        const { days = 30, group_by = "provider" } = params;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data: events } = await supabase
          .from("video_generation_events")
          .select("*")
          .gte("created_at", startDate.toISOString())
          .eq("status", "completed");

        // Aggregate data
        const byProvider: Record<string, { count: number; cost: number; duration: number }> = {};
        const byDay: Record<string, { cost: number; count: number }> = {};
        
        let totalCost = 0;
        let totalDuration = 0;
        let totalVideos = 0;

        (events || []).forEach(event => {
          // By provider
          if (!byProvider[event.provider]) {
            byProvider[event.provider] = { count: 0, cost: 0, duration: 0 };
          }
          byProvider[event.provider].count++;
          byProvider[event.provider].cost += event.cost_cents || 0;
          byProvider[event.provider].duration += event.duration_seconds || 0;

          // By day
          const day = event.created_at.split("T")[0];
          if (!byDay[day]) {
            byDay[day] = { cost: 0, count: 0 };
          }
          byDay[day].cost += event.cost_cents || 0;
          byDay[day].count++;

          // Totals
          totalCost += event.cost_cents || 0;
          totalDuration += event.duration_seconds || 0;
          totalVideos++;
        });

        // Calculate AI decision stats
        const decisions: Record<string, number> = {};
        (events || []).forEach(event => {
          if (event.ai_decision_reason) {
            const priority = event.ai_decision_reason.includes("Cost") ? "cost_priority" :
                            event.ai_decision_reason.includes("Quality") ? "quality_priority" : "balanced";
            decisions[priority] = (decisions[priority] || 0) + 1;
          }
        });

        return new Response(JSON.stringify({
          success: true,
          period_days: days,
          totals: {
            cost_cents: totalCost,
            cost_dollars: (totalCost / 100).toFixed(2),
            duration_seconds: totalDuration,
            videos: totalVideos,
            avg_cost_per_video: totalVideos > 0 ? (totalCost / totalVideos).toFixed(0) : 0,
          },
          by_provider: Object.entries(byProvider).map(([provider, data]) => ({
            provider,
            ...data,
            cost_dollars: (data.cost / 100).toFixed(2),
            avg_cost: data.count > 0 ? (data.cost / data.count).toFixed(0) : 0,
          })),
          by_day: Object.entries(byDay).map(([date, data]) => ({
            date,
            ...data,
            cost_dollars: (data.cost / 100).toFixed(2),
          })).sort((a, b) => a.date.localeCompare(b.date)),
          ai_decisions: decisions,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "check_budget": {
        const { monthly_budget_cents = 10000 } = params;
        
        // Get current month's spend
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { data: events } = await supabase
          .from("video_generation_events")
          .select("cost_cents")
          .gte("created_at", startOfMonth.toISOString())
          .eq("status", "completed");

        const currentSpend = (events || []).reduce((sum, e) => sum + (e.cost_cents || 0), 0);
        const percentUsed = (currentSpend / monthly_budget_cents) * 100;
        const remaining = monthly_budget_cents - currentSpend;

        let status: "ok" | "warning" | "critical" | "exceeded" = "ok";
        if (percentUsed >= 100) status = "exceeded";
        else if (percentUsed >= 90) status = "critical";
        else if (percentUsed >= 75) status = "warning";

        // Send alert if needed
        if (status !== "ok") {
          await supabase.functions.invoke("send-notification", {
            body: {
              type: "budget_alert",
              severity: status === "exceeded" ? "critical" : status,
              title: `Video Budget ${status === "exceeded" ? "Exceeded" : "Alert"}`,
              message: `Video generation budget is at ${percentUsed.toFixed(0)}% ($${(currentSpend / 100).toFixed(2)} of $${(monthly_budget_cents / 100).toFixed(2)})`,
              data: { current_spend: currentSpend, budget: monthly_budget_cents, percent: percentUsed },
            },
          });
        }

        return new Response(JSON.stringify({
          success: true,
          budget_cents: monthly_budget_cents,
          current_spend_cents: currentSpend,
          remaining_cents: remaining,
          percent_used: Number(percentUsed.toFixed(1)),
          status,
          days_in_month: new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0).getDate(),
          day_of_month: new Date().getDate(),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "get_savings_report": {
        const { days = 30 } = params;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Get provider configs for cost comparison
        const { data: configs } = await supabase
          .from("video_provider_config")
          .select("*");

        const { data: events } = await supabase
          .from("video_generation_events")
          .select("*")
          .gte("created_at", startDate.toISOString())
          .eq("status", "completed");

        // Calculate what it would have cost with each provider
        const actualCost = (events || []).reduce((sum, e) => sum + (e.cost_cents || 0), 0);
        const totalDuration = (events || []).reduce((sum, e) => sum + (e.duration_seconds || 0), 0);

        const alternatives = (configs || []).map(config => {
          const altCost = Math.round(totalDuration * (config.cost_per_second_cents || 0));
          return {
            provider: config.provider,
            would_have_cost: altCost,
            savings: altCost - actualCost,
          };
        });

        // Find max potential cost for savings calculation
        const maxAltCost = Math.max(...alternatives.map(a => a.would_have_cost));
        const totalSavings = maxAltCost - actualCost;

        return new Response(JSON.stringify({
          success: true,
          period_days: days,
          actual_cost_cents: actualCost,
          actual_cost_dollars: (actualCost / 100).toFixed(2),
          total_duration_seconds: totalDuration,
          alternatives: alternatives.map(a => ({
            ...a,
            would_have_cost_dollars: (a.would_have_cost / 100).toFixed(2),
            savings_dollars: (a.savings / 100).toFixed(2),
          })),
          total_savings_cents: totalSavings,
          total_savings_dollars: (totalSavings / 100).toFixed(2),
          savings_percentage: maxAltCost > 0 ? ((totalSavings / maxAltCost) * 100).toFixed(1) : 0,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      default:
        return new Response(JSON.stringify({
          error: `Unknown action: ${action}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (error) {
    console.error("[Video Cost Agent] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});