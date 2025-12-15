import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RouteRequest {
  action: string;
  topic?: string;
  script?: string;
  duration_seconds?: number;
  quality_priority?: "cost" | "balanced" | "quality";
  require_avatar?: boolean;
  require_lip_sync?: boolean;
}

interface ProviderScore {
  provider: string;
  score: number;
  costScore: number;
  qualityScore: number;
  availabilityScore: number;
  capabilityMatch: boolean;
  reason: string;
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

    const request: RouteRequest = await req.json();
    const { action } = request;

    console.log(`[Video Router] Action: ${action}`);

    switch (action) {
      case "score_providers": {
        const {
          duration_seconds = 30,
          quality_priority = "balanced",
          require_avatar = true,
          require_lip_sync = false,
        } = request;

        // Fetch provider configs and health
        const [configRes, healthRes] = await Promise.all([
          supabase.from("video_provider_config").select("*").eq("is_enabled", true),
          supabase.from("video_provider_health").select("*"),
        ]);

        const configs = configRes.data || [];
        const healths = healthRes.data || [];

        // Calculate weights based on priority
        const weights = {
          cost: quality_priority === "cost" ? 0.6 : quality_priority === "quality" ? 0.2 : 0.4,
          quality: quality_priority === "cost" ? 0.2 : quality_priority === "quality" ? 0.6 : 0.4,
          availability: 0.2,
        };

        // Score each provider
        const scores: ProviderScore[] = configs.map(config => {
          const health = healths.find(h => h.provider === config.provider);
          
          // Check capability match
          const capabilities = config.capabilities || {};
          const capabilityMatch = 
            (!require_avatar || capabilities.avatar) &&
            (!require_lip_sync || capabilities.lip_sync) &&
            (duration_seconds <= (config.max_duration_seconds || 60));

          // Skip if capabilities don't match
          if (!capabilityMatch) {
            return {
              provider: config.provider,
              score: -1000,
              costScore: 0,
              qualityScore: 0,
              availabilityScore: 0,
              capabilityMatch: false,
              reason: `Capabilities don't match requirements (max duration: ${config.max_duration_seconds}s, avatar: ${capabilities.avatar}, lip_sync: ${capabilities.lip_sync})`,
            };
          }

          // Check health
          const isHealthy = health?.status === "healthy";
          const isDisabled = health?.is_auto_disabled || health?.status === "disabled";
          
          if (isDisabled) {
            return {
              provider: config.provider,
              score: -1000,
              costScore: 0,
              qualityScore: 0,
              availabilityScore: 0,
              capabilityMatch: true,
              reason: "Provider is disabled",
            };
          }

          // Calculate individual scores (0-100)
          const maxCost = Math.max(...configs.map(c => c.cost_per_second_cents || 1));
          const costScore = maxCost > 0 ? 100 * (1 - (config.cost_per_second_cents / maxCost)) : 100;
          const qualityScore = config.quality_score || 80;
          const availabilityScore = isHealthy ? 100 : (health?.status === "degraded" ? 50 : 0);
          
          // Failure penalty
          const failurePenalty = (health?.consecutive_failures || 0) * 15;
          
          // Calculate weighted score
          const score = (
            weights.cost * costScore +
            weights.quality * qualityScore +
            weights.availability * availabilityScore
          ) - failurePenalty;

          const reason = `Cost: ${costScore.toFixed(0)}/100, Quality: ${qualityScore}/100, Availability: ${availabilityScore}/100, Penalty: -${failurePenalty}`;

          return {
            provider: config.provider,
            score,
            costScore,
            qualityScore,
            availabilityScore,
            capabilityMatch: true,
            reason,
          };
        });

        // Sort by score descending
        scores.sort((a, b) => b.score - a.score);

        return new Response(JSON.stringify({
          success: true,
          scores,
          recommended: scores[0]?.score > 0 ? scores[0].provider : null,
          weights,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "route_request": {
        const {
          topic,
          script,
          duration_seconds = 30,
          quality_priority = "balanced",
          require_avatar = true,
        } = request;

        // Get scored providers
        const scoreResponse = await supabase.functions.invoke("video-router", {
          body: {
            action: "score_providers",
            duration_seconds,
            quality_priority,
            require_avatar,
          },
        });

        const { scores, recommended } = scoreResponse.data;

        if (!recommended) {
          throw new Error("No suitable provider available for this request");
        }

        console.log(`[Video Router] Routing to ${recommended}`);

        // Log the routing decision
        await supabase.from("video_generation_events").insert({
          provider: recommended,
          status: "pending",
          ai_decision_reason: `Routed to ${recommended}: ${scores.find((s: ProviderScore) => s.provider === recommended)?.reason}`,
          request_params: { topic, script: script?.substring(0, 200), duration_seconds, quality_priority },
        });

        return new Response(JSON.stringify({
          success: true,
          routed_to: recommended,
          all_scores: scores,
          routing_reason: scores.find((s: ProviderScore) => s.provider === recommended)?.reason,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "check_health": {
        const { data: health } = await supabase
          .from("video_provider_health")
          .select("*");

        const summary = {
          healthy: (health || []).filter(h => h.status === "healthy").length,
          degraded: (health || []).filter(h => h.status === "degraded").length,
          disabled: (health || []).filter(h => h.status === "disabled" || h.is_auto_disabled).length,
          error: (health || []).filter(h => h.status === "error").length,
        };

        const overall = summary.healthy === (health || []).length ? "healthy" :
                       summary.disabled > 0 || summary.error > 0 ? "critical" : "degraded";

        return new Response(JSON.stringify({
          success: true,
          overall_status: overall,
          summary,
          providers: health,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "handle_fallback": {
        const { failed_provider, original_request } = request as any;

        // Get next best provider
        const scoreResponse = await supabase.functions.invoke("video-router", {
          body: {
            action: "score_providers",
            ...original_request,
          },
        });

        const { scores } = scoreResponse.data;
        const fallback = scores.find((s: ProviderScore) => 
          s.provider !== failed_provider && s.score > 0
        );

        if (!fallback) {
          return new Response(JSON.stringify({
            success: false,
            error: "No fallback provider available",
          }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        console.log(`[Video Router] Fallback from ${failed_provider} to ${fallback.provider}`);

        return new Response(JSON.stringify({
          success: true,
          fallback_to: fallback.provider,
          reason: `Fallback after ${failed_provider} failure: ${fallback.reason}`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      default:
        return new Response(JSON.stringify({
          error: `Unknown action: ${action}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (error) {
    console.error("[Video Router] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});