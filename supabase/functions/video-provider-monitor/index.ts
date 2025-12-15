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

    console.log(`[Video Provider Monitor] Action: ${action}`);

    switch (action) {
      case "check_health": {
        const { data: providers } = await supabase
          .from("video_provider_health")
          .select("*");

        const { data: configs } = await supabase
          .from("video_provider_config")
          .select("*");

        // Check each provider
        const results = await Promise.all((providers || []).map(async (provider) => {
          const config = configs?.find(c => c.provider === provider.provider);
          
          // Calculate success rate from recent events
          const since = new Date();
          since.setHours(since.getHours() - 24);
          
          const { data: recentEvents } = await supabase
            .from("video_generation_events")
            .select("status")
            .eq("provider", provider.provider)
            .gte("created_at", since.toISOString());

          const total = recentEvents?.length || 0;
          const successful = recentEvents?.filter(e => e.status === "completed").length || 0;
          const successRate = total > 0 ? (successful / total) * 100 : 100;

          // Determine status based on metrics
          let newStatus = provider.status;
          if (provider.is_auto_disabled) {
            newStatus = "disabled";
          } else if (successRate < 50) {
            newStatus = "error";
          } else if (successRate < 80 || provider.consecutive_failures > 0) {
            newStatus = "degraded";
          } else {
            newStatus = "healthy";
          }

          // Update health record
          await supabase
            .from("video_provider_health")
            .update({
              status: newStatus,
              success_rate: successRate,
              last_health_check_at: new Date().toISOString(),
            })
            .eq("provider", provider.provider);

          return {
            provider: provider.provider,
            status: newStatus,
            success_rate: successRate,
            consecutive_failures: provider.consecutive_failures,
            is_auto_disabled: provider.is_auto_disabled,
            is_enabled: config?.is_enabled,
            last_success: provider.last_success_at,
            last_failure: provider.last_failure_at,
          };
        }));

        // Calculate overall health
        const healthyCount = results.filter(r => r.status === "healthy").length;
        const overallStatus = healthyCount === results.length ? "healthy" :
                             results.some(r => r.status === "disabled" || r.status === "error") ? "critical" : "degraded";

        return new Response(JSON.stringify({
          success: true,
          overall_status: overallStatus,
          providers: results,
          checked_at: new Date().toISOString(),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "record_event": {
        const { provider, status, latency_ms, error_message, duration_seconds, cost_cents, video_id, ai_decision_reason } = params;

        // Insert event
        const { data: event } = await supabase
          .from("video_generation_events")
          .insert({
            provider,
            status,
            latency_ms,
            error_message,
            duration_seconds,
            cost_cents,
            video_id,
            ai_decision_reason,
          })
          .select()
          .single();

        // Update provider health
        const { data: health } = await supabase
          .from("video_provider_health")
          .select("*")
          .eq("provider", provider)
          .single();

        if (health) {
          if (status === "completed") {
            // Success: reset consecutive failures
            await supabase
              .from("video_provider_health")
              .update({
                consecutive_failures: 0,
                last_success_at: new Date().toISOString(),
                total_videos_generated: (health.total_videos_generated || 0) + 1,
                total_seconds_generated: (health.total_seconds_generated || 0) + (duration_seconds || 0),
                total_cost_cents: (health.total_cost_cents || 0) + (cost_cents || 0),
                avg_latency_ms: health.avg_latency_ms 
                  ? Math.round((health.avg_latency_ms + latency_ms) / 2)
                  : latency_ms,
                status: "healthy",
              })
              .eq("provider", provider);
          } else if (status === "failed") {
            // Failure: increment and check for auto-disable
            const newConsecutiveFailures = (health.consecutive_failures || 0) + 1;
            const shouldAutoDisable = newConsecutiveFailures >= (health.auto_disable_threshold || 3);

            await supabase
              .from("video_provider_health")
              .update({
                consecutive_failures: newConsecutiveFailures,
                total_failures: (health.total_failures || 0) + 1,
                last_failure_at: new Date().toISOString(),
                status: shouldAutoDisable ? "disabled" : "degraded",
                is_auto_disabled: shouldAutoDisable,
              })
              .eq("provider", provider);

            // Send alert if auto-disabled
            if (shouldAutoDisable) {
              console.log(`[Video Provider Monitor] Auto-disabling ${provider} after ${newConsecutiveFailures} failures`);
              
              await supabase.functions.invoke("send-notification", {
                body: {
                  type: "video_provider_disabled",
                  severity: "critical",
                  title: `Video Provider Auto-Disabled: ${provider}`,
                  message: `${provider} has been automatically disabled after ${newConsecutiveFailures} consecutive failures. Last error: ${error_message || "Unknown"}`,
                  data: { 
                    provider, 
                    failures: newConsecutiveFailures,
                    error: error_message,
                  },
                },
              });

              // Log to automation_logs
              await supabase.from("automation_logs").insert({
                function_name: "video-provider-monitor",
                status: "completed",
                metadata: {
                  action: "auto_disable",
                  provider,
                  consecutive_failures: newConsecutiveFailures,
                  error_message,
                },
              });
            }
          }
        }

        return new Response(JSON.stringify({
          success: true,
          event,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "auto_disable_check": {
        const { provider } = params;

        const { data: health } = await supabase
          .from("video_provider_health")
          .select("*")
          .eq("provider", provider)
          .single();

        if (!health) {
          throw new Error(`Provider ${provider} not found`);
        }

        const shouldDisable = health.consecutive_failures >= (health.auto_disable_threshold || 3);

        if (shouldDisable && !health.is_auto_disabled) {
          await supabase
            .from("video_provider_health")
            .update({
              status: "disabled",
              is_auto_disabled: true,
            })
            .eq("provider", provider);

          // Send notification
          await supabase.functions.invoke("send-notification", {
            body: {
              type: "video_provider_disabled",
              severity: "critical",
              title: `Video Provider Auto-Disabled: ${provider}`,
              message: `${provider} disabled after ${health.consecutive_failures} consecutive failures`,
              data: { provider, failures: health.consecutive_failures },
            },
          });
        }

        return new Response(JSON.stringify({
          success: true,
          provider,
          should_disable: shouldDisable,
          consecutive_failures: health.consecutive_failures,
          threshold: health.auto_disable_threshold,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "re_enable_provider": {
        const { provider } = params;

        await supabase
          .from("video_provider_health")
          .update({
            status: "healthy",
            is_auto_disabled: false,
            consecutive_failures: 0,
          })
          .eq("provider", provider);

        // Log the action
        await supabase.from("automation_logs").insert({
          function_name: "video-provider-monitor",
          status: "completed",
          metadata: { action: "re_enable", provider },
        });

        return new Response(JSON.stringify({
          success: true,
          message: `Provider ${provider} re-enabled`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "get_analytics": {
        const { days = 7 } = params;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data: events } = await supabase
          .from("video_generation_events")
          .select("*")
          .gte("created_at", startDate.toISOString())
          .order("created_at", { ascending: true });

        const { data: health } = await supabase
          .from("video_provider_health")
          .select("*");

        // Aggregate metrics
        const byProvider: Record<string, any> = {};
        const dailyData: Record<string, any> = {};

        (events || []).forEach(event => {
          // By provider
          if (!byProvider[event.provider]) {
            byProvider[event.provider] = {
              total: 0,
              completed: 0,
              failed: 0,
              cost: 0,
              duration: 0,
              latency_sum: 0,
            };
          }
          byProvider[event.provider].total++;
          if (event.status === "completed") byProvider[event.provider].completed++;
          if (event.status === "failed") byProvider[event.provider].failed++;
          byProvider[event.provider].cost += event.cost_cents || 0;
          byProvider[event.provider].duration += event.duration_seconds || 0;
          byProvider[event.provider].latency_sum += event.latency_ms || 0;

          // By day
          const day = event.created_at.split("T")[0];
          if (!dailyData[day]) {
            dailyData[day] = { total: 0, completed: 0, failed: 0, cost: 0 };
          }
          dailyData[day].total++;
          if (event.status === "completed") dailyData[day].completed++;
          if (event.status === "failed") dailyData[day].failed++;
          dailyData[day].cost += event.cost_cents || 0;
        });

        // Calculate averages
        Object.keys(byProvider).forEach(provider => {
          const data = byProvider[provider];
          data.success_rate = data.total > 0 ? ((data.completed / data.total) * 100).toFixed(1) : 100;
          data.avg_latency = data.total > 0 ? Math.round(data.latency_sum / data.total) : 0;
          data.avg_cost = data.completed > 0 ? (data.cost / data.completed).toFixed(0) : 0;
        });

        return new Response(JSON.stringify({
          success: true,
          period_days: days,
          by_provider: byProvider,
          daily: Object.entries(dailyData).map(([date, data]) => ({ date, ...data })),
          current_health: health,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      default:
        return new Response(JSON.stringify({
          error: `Unknown action: ${action}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (error) {
    console.error("[Video Provider Monitor] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});