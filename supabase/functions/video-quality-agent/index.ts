import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QualityIssue {
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  message: string;
  timestamp_ms?: number;
  auto_fixable: boolean;
}

interface QualityCheckResult {
  passed: boolean;
  score: number;
  issues: QualityIssue[];
  recommendations: string[];
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

    const { action, ...params } = await req.json();

    console.log(`[Video Quality Agent] Action: ${action}`);

    switch (action) {
      case "check_quality": {
        const { project_id, video_url } = params;

        const issues: QualityIssue[] = [];
        const recommendations: string[] = [];

        // Get project details
        const { data: project } = await supabase
          .from("video_projects")
          .select("*")
          .eq("id", project_id)
          .single();

        if (!project) {
          throw new Error("Project not found");
        }

        // Get timeline items
        const { data: items } = await supabase
          .from("video_project_items")
          .select("*")
          .eq("project_id", project_id);

        // Simulated quality checks (in production, these would analyze actual video)
        
        // Check 1: Duration
        if (project.duration_seconds && project.duration_seconds < 5) {
          issues.push({
            severity: "medium",
            category: "duration",
            message: "Video is very short (<5s). Consider adding more content.",
            auto_fixable: false,
          });
        }

        // Check 2: Scene count
        const sceneCount = items?.filter(i => i.item_type === "avatar").length || 0;
        if (sceneCount === 0) {
          issues.push({
            severity: "critical",
            category: "content",
            message: "No avatar scenes found. Video has no main content.",
            auto_fixable: false,
          });
        }

        // Check 3: Pacing (no scenes longer than 45s)
        const longScenes = items?.filter(i => i.duration_ms > 45000) || [];
        if (longScenes.length > 0) {
          issues.push({
            severity: "high",
            category: "pacing",
            message: `${longScenes.length} scene(s) exceed 45 seconds. This may hurt retention.`,
            auto_fixable: true,
          });
          recommendations.push("Split long scenes into shorter segments with pattern interrupts");
        }

        // Check 4: Graphics presence
        const hasGraphics = items?.some(i => i.item_type === "graphic");
        if (!hasGraphics && project.duration_seconds > 30) {
          issues.push({
            severity: "low",
            category: "graphics",
            message: "No graphics or text overlays found. Consider adding lower-thirds or callouts.",
            auto_fixable: true,
          });
          recommendations.push("Add speaker name lower-third at the start");
        }

        // Check 5: Audio track
        const hasAudio = items?.some(i => i.item_type === "audio");
        if (!hasAudio) {
          issues.push({
            severity: "low",
            category: "audio",
            message: "No background audio track. Consider adding subtle background music.",
            auto_fixable: true,
          });
        }

        // Calculate score
        const severityWeights = { critical: 30, high: 15, medium: 5, low: 2 };
        const totalPenalty = issues.reduce((sum, issue) => sum + severityWeights[issue.severity], 0);
        const score = Math.max(0, 100 - totalPenalty);
        const passed = !issues.some(i => i.severity === "critical") && score >= 60;

        const result: QualityCheckResult = {
          passed,
          score,
          issues,
          recommendations,
        };

        // Save result to project
        await supabase
          .from("video_projects")
          .update({
            quality_check_passed: passed,
            quality_check_result: result,
          })
          .eq("id", project_id);

        return new Response(JSON.stringify({
          success: true,
          result,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "verify_lip_sync": {
        const { video_url, audio_url } = params;

        // Simulated lip sync check (in production, would use actual analysis)
        const syncOffset = Math.random() * 200 - 50; // Simulated offset -50 to 150ms
        const isSynced = Math.abs(syncOffset) < 100;

        return new Response(JSON.stringify({
          success: true,
          synced: isSynced,
          offset_ms: Math.round(syncOffset),
          threshold_ms: 100,
          message: isSynced 
            ? "Lip sync is within acceptable range"
            : `Lip sync offset of ${Math.round(syncOffset)}ms detected. Recommend regeneration.`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "check_audio_levels": {
        const { video_url } = params;

        // Simulated audio level check
        const lufs = -16 + (Math.random() * 6 - 3); // Simulated LUFS -19 to -13
        const peakDb = -6 + (Math.random() * 6 - 3); // Simulated peak -9 to -3
        
        const issues: QualityIssue[] = [];

        if (lufs < -18 || lufs > -14) {
          issues.push({
            severity: "medium",
            category: "audio",
            message: `Audio loudness is ${lufs.toFixed(1)} LUFS. Target is -16 LUFS ±1.`,
            auto_fixable: true,
          });
        }

        if (peakDb > -3) {
          issues.push({
            severity: "high",
            category: "audio",
            message: `Audio peaks at ${peakDb.toFixed(1)}dB. Risk of distortion on playback.`,
            auto_fixable: true,
          });
        }

        return new Response(JSON.stringify({
          success: true,
          lufs: Number(lufs.toFixed(1)),
          peak_db: Number(peakDb.toFixed(1)),
          issues,
          passed: issues.length === 0,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "verify_brand_compliance": {
        const { project_id, brand_guidelines } = params;

        // Get project items for brand check
        const { data: items } = await supabase
          .from("video_project_items")
          .select("*")
          .eq("project_id", project_id)
          .eq("item_type", "graphic");

        const issues: QualityIssue[] = [];
        const guidelines = brand_guidelines || {
          primary_color: "#000000",
          font_family: "Inter",
          logo_required: true,
        };

        // Check graphics for brand compliance
        if (guidelines.logo_required) {
          const hasLogo = items?.some(i => 
            i.layer_props?.type === "logo" || 
            i.content?.toLowerCase().includes("logo")
          );
          
          if (!hasLogo) {
            issues.push({
              severity: "medium",
              category: "brand",
              message: "Brand logo not detected in video. Consider adding logo watermark.",
              auto_fixable: true,
            });
          }
        }

        return new Response(JSON.stringify({
          success: true,
          compliant: issues.length === 0,
          issues,
          guidelines_checked: Object.keys(guidelines),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "rate_engagement": {
        const { project_id } = params;

        // Get project and items for engagement prediction
        const { data: project } = await supabase
          .from("video_projects")
          .select("*")
          .eq("id", project_id)
          .single();

        const { data: items } = await supabase
          .from("video_project_items")
          .select("*")
          .eq("project_id", project_id);

        // Engagement scoring based on best practices
        let score = 50; // Base score
        const factors: string[] = [];

        // Hook presence (first 3 seconds should be engaging)
        const firstScene = items?.find(i => i.item_type === "avatar" && i.start_time_ms === 0);
        if (firstScene && firstScene.duration_ms <= 5000) {
          score += 10;
          factors.push("Strong hook in first 5 seconds (+10)");
        }

        // Pattern interrupts (visual changes)
        const visualItems = items?.filter(i => ["avatar", "graphic", "screen"].includes(i.item_type)) || [];
        const totalDuration = project?.duration_seconds || 60;
        const changesPerMinute = (visualItems.length / totalDuration) * 60;
        
        if (changesPerMinute >= 4) {
          score += 15;
          factors.push(`Good pacing with ${changesPerMinute.toFixed(1)} visual changes/min (+15)`);
        } else if (changesPerMinute >= 2) {
          score += 5;
          factors.push(`Moderate pacing with ${changesPerMinute.toFixed(1)} visual changes/min (+5)`);
        }

        // Graphics/overlays boost engagement
        const graphicsCount = items?.filter(i => i.item_type === "graphic").length || 0;
        if (graphicsCount >= 3) {
          score += 10;
          factors.push(`${graphicsCount} graphics overlays add visual interest (+10)`);
        }

        // Cap at 100
        score = Math.min(100, score);

        return new Response(JSON.stringify({
          success: true,
          engagement_score: score,
          predicted_retention: `${(score * 0.6).toFixed(0)}%`,
          factors,
          recommendations: score < 70 ? [
            "Add more visual variety with graphics and B-roll",
            "Shorten intro to get to value faster",
            "Include pattern interrupts every 30 seconds",
          ] : [],
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      default:
        return new Response(JSON.stringify({
          error: `Unknown action: ${action}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (error) {
    console.error("[Video Quality Agent] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});