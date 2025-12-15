import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VideoRequest {
  action: string;
  topic?: string;
  script?: string;
  duration_priority?: "short" | "medium" | "long";
  quality_priority?: "cost" | "balanced" | "quality";
  project_id?: string;
  scenes?: any[];
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

    const request: VideoRequest = await req.json();
    const { action } = request;

    console.log(`[Video Coordinator] Action: ${action}`, JSON.stringify(request).substring(0, 200));

    switch (action) {
      case "create_project": {
        const { topic, script, quality_priority = "balanced" } = request;
        
        // Create a new video project
        const { data: project, error: projectError } = await supabase
          .from("video_projects")
          .insert({
            title: topic || "Untitled Video",
            description: script?.substring(0, 200),
            status: "draft",
            settings: { quality_priority },
          })
          .select()
          .single();

        if (projectError) throw projectError;

        // Log to automation_logs
        await supabase.from("automation_logs").insert({
          function_name: "video-production-coordinator",
          status: "completed",
          metadata: { action: "create_project", project_id: project.id },
        });

        return new Response(JSON.stringify({
          success: true,
          project,
          message: `Project created: ${project.title}`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "route_and_generate": {
        const { topic, script, project_id, quality_priority = "balanced" } = request;
        const startTime = Date.now();

        // Get provider health and config
        const [healthRes, configRes] = await Promise.all([
          supabase.from("video_provider_health").select("*"),
          supabase.from("video_provider_config").select("*").eq("is_enabled", true),
        ]);

        const providers = configRes.data || [];
        const health = healthRes.data || [];

        // Score providers using AI algorithm
        const scoredProviders = providers.map(provider => {
          const providerHealth = health.find(h => h.provider === provider.provider);
          const isHealthy = providerHealth?.status === "healthy";
          const failurePenalty = (providerHealth?.consecutive_failures || 0) * 10;
          
          // Weights based on quality priority
          const costWeight = quality_priority === "cost" ? 0.7 : quality_priority === "quality" ? 0.3 : 0.5;
          const qualityWeight = 1 - costWeight;
          
          // Normalize scores (cost: lower is better, quality: higher is better)
          const maxCost = Math.max(...providers.map(p => p.cost_per_second_cents || 1));
          const costScore = maxCost > 0 ? 100 * (1 - (provider.cost_per_second_cents / maxCost)) : 100;
          const qualityScore = provider.quality_score || 80;
          
          const score = isHealthy 
            ? (costWeight * costScore) + (qualityWeight * qualityScore) - failurePenalty
            : -1000; // Disabled providers get very low score

          return {
            ...provider,
            health: providerHealth,
            score,
            costScore,
            qualityScore,
            failurePenalty,
          };
        }).sort((a, b) => b.score - a.score);

        const selectedProvider = scoredProviders[0];
        
        if (!selectedProvider || selectedProvider.score < 0) {
          throw new Error("No healthy providers available");
        }

        const aiDecisionReason = `Selected ${selectedProvider.provider} (score: ${selectedProvider.score.toFixed(1)}) - Cost: ${selectedProvider.costScore.toFixed(0)}, Quality: ${selectedProvider.qualityScore}, Priority: ${quality_priority}`;

        console.log(`[Video Coordinator] ${aiDecisionReason}`);

        // Record the generation event
        const { data: event } = await supabase
          .from("video_generation_events")
          .insert({
            provider: selectedProvider.provider,
            project_id,
            status: "processing",
            ai_decision_reason: aiDecisionReason,
            request_params: { topic, script: script?.substring(0, 500), quality_priority },
          })
          .select()
          .single();

        // Call the appropriate provider
        let result;
        try {
          if (selectedProvider.provider === "lovable_veo") {
            // Use visual-content-generator for Lovable/Veo
            const response = await supabase.functions.invoke("visual-content-generator", {
              body: { action: "generate_video", prompt: script || topic, duration: 8 },
            });
            result = response.data;
          } else if (selectedProvider.provider === "d_id") {
            const response = await supabase.functions.invoke("did-video", {
              body: { topic, script, idea_id: project_id },
            });
            result = response.data;
          } else if (selectedProvider.provider === "heygen") {
            const response = await supabase.functions.invoke("heygen-video", {
              body: { topic, script, idea_id: project_id },
            });
            result = response.data;
          }

          const latency = Date.now() - startTime;
          const durationSeconds = 30; // Estimate, would be actual from provider
          const costCents = Math.round(durationSeconds * (selectedProvider.cost_per_second_cents || 0));

          // Update event with success
          await supabase.from("video_generation_events")
            .update({
              status: "completed",
              video_id: result?.video_id || result?.id,
              latency_ms: latency,
              duration_seconds: durationSeconds,
              cost_cents: costCents,
            })
            .eq("id", event?.id);

          // Update provider health with success
          await supabase.from("video_provider_health")
            .update({
              consecutive_failures: 0,
              last_success_at: new Date().toISOString(),
              total_videos_generated: (selectedProvider.health?.total_videos_generated || 0) + 1,
              total_cost_cents: (selectedProvider.health?.total_cost_cents || 0) + costCents,
            })
            .eq("provider", selectedProvider.provider);

          return new Response(JSON.stringify({
            success: true,
            provider: selectedProvider.provider,
            decision_reason: aiDecisionReason,
            result,
            cost_cents: costCents,
            latency_ms: latency,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

        } catch (providerError) {
          console.error(`[Video Coordinator] Provider ${selectedProvider.provider} failed:`, providerError);

          // Update event with failure
          await supabase.from("video_generation_events")
            .update({
              status: "failed",
              error_message: providerError instanceof Error ? providerError.message : "Unknown error",
              latency_ms: Date.now() - startTime,
            })
            .eq("id", event?.id);

          // Update provider health with failure
          const newConsecutiveFailures = (selectedProvider.health?.consecutive_failures || 0) + 1;
          const shouldAutoDisable = newConsecutiveFailures >= (selectedProvider.health?.auto_disable_threshold || 3);

          await supabase.from("video_provider_health")
            .update({
              consecutive_failures: newConsecutiveFailures,
              total_failures: (selectedProvider.health?.total_failures || 0) + 1,
              last_failure_at: new Date().toISOString(),
              status: shouldAutoDisable ? "disabled" : "degraded",
              is_auto_disabled: shouldAutoDisable,
            })
            .eq("provider", selectedProvider.provider);

          // Send alert to CEO Hub if auto-disabled
          if (shouldAutoDisable) {
            await supabase.functions.invoke("send-notification", {
              body: {
                type: "video_provider_disabled",
                severity: "critical",
                title: `Video Provider Auto-Disabled: ${selectedProvider.provider}`,
                message: `${selectedProvider.provider} has been auto-disabled after ${newConsecutiveFailures} consecutive failures.`,
                data: { provider: selectedProvider.provider, failures: newConsecutiveFailures },
              },
            });
          }

          // Try fallback provider
          const fallbackProvider = scoredProviders.find(p => p.provider !== selectedProvider.provider && p.score > 0);
          if (fallbackProvider) {
            console.log(`[Video Coordinator] Attempting fallback to ${fallbackProvider.provider}`);
            // Recursive call with fallback (simplified - in production would handle this better)
          }

          throw providerError;
        }
      }

      case "get_provider_status": {
        const [healthRes, configRes] = await Promise.all([
          supabase.from("video_provider_health").select("*"),
          supabase.from("video_provider_config").select("*"),
        ]);

        const providers = (configRes.data || []).map(config => {
          const health = (healthRes.data || []).find(h => h.provider === config.provider);
          return { ...config, health };
        });

        return new Response(JSON.stringify({
          success: true,
          providers,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "get_cost_analytics": {
        const { days = 30 } = request as any;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data: events } = await supabase
          .from("video_generation_events")
          .select("*")
          .gte("created_at", startDate.toISOString())
          .order("created_at", { ascending: false });

        // Aggregate by provider
        const byProvider: Record<string, { count: number; cost: number; failures: number }> = {};
        let totalCost = 0;
        let totalVideos = 0;

        (events || []).forEach(event => {
          if (!byProvider[event.provider]) {
            byProvider[event.provider] = { count: 0, cost: 0, failures: 0 };
          }
          byProvider[event.provider].count++;
          byProvider[event.provider].cost += event.cost_cents || 0;
          if (event.status === "failed") byProvider[event.provider].failures++;
          
          totalCost += event.cost_cents || 0;
          if (event.status === "completed") totalVideos++;
        });

        // Calculate AI decision breakdown
        const decisionReasons: Record<string, number> = {};
        (events || []).forEach(event => {
          if (event.ai_decision_reason) {
            const reason = event.ai_decision_reason.split(" - ")[1] || "Unknown";
            decisionReasons[reason] = (decisionReasons[reason] || 0) + 1;
          }
        });

        return new Response(JSON.stringify({
          success: true,
          analytics: {
            total_cost_cents: totalCost,
            total_videos: totalVideos,
            avg_cost_per_video: totalVideos > 0 ? totalCost / totalVideos : 0,
            by_provider: byProvider,
            decision_breakdown: decisionReasons,
            period_days: days,
          },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "re_enable_provider": {
        const { provider } = request as any;
        
        await supabase.from("video_provider_health")
          .update({
            status: "healthy",
            is_auto_disabled: false,
            consecutive_failures: 0,
          })
          .eq("provider", provider);

        await supabase.from("automation_logs").insert({
          function_name: "video-production-coordinator",
          status: "completed",
          metadata: { action: "re_enable_provider", provider },
        });

        return new Response(JSON.stringify({
          success: true,
          message: `Provider ${provider} re-enabled`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      default:
        return new Response(JSON.stringify({
          error: `Unknown action: ${action}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (error) {
    console.error("[Video Coordinator] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});