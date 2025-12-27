import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Scene {
  index: number;
  content: string;
  duration_ms: number;
  type: "intro" | "main" | "outro" | "transition";
  suggested_visuals?: string;
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

    console.log(`[Video Editor Agent] Action: ${action}`);

    switch (action) {
      case "parse_script": {
        const { script, target_duration_seconds = 60 } = params;

        if (!script) {
          throw new Error("Script is required");
        }

        // Use AI to parse script into scenes
        let scenes: Scene[] = [];

        try {
          const aiResponse = await aiChat({
            messages: [
              {
                role: "system",
                content: `You are a video editor breaking scripts into scenes. For each scene, provide:
- index: scene number (0-based)
- content: the text/dialogue for that scene
- duration_ms: estimated duration in milliseconds (average reading speed is 150 words/minute)
- type: "intro", "main", or "outro"
- suggested_visuals: what visuals would work best

Target total duration: ${target_duration_seconds} seconds.

Respond with a JSON object containing a "scenes" array.`,
              },
              {
                role: "user",
                content: `Parse this script into scenes:\n\n${script}`,
              },
            ],
            purpose: 'video_editing',
          });

          try {
            const parsed = JSON.parse(aiResponse.text);
            scenes = parsed.scenes || parsed;
          } catch {
            console.log("[Video Editor] Failed to parse AI response, using fallback");
          }
        } catch (e) {
          console.log("[Video Editor] AI call failed, using fallback:", e);
        }

        // Fallback: simple sentence-based parsing
        if (scenes.length === 0) {
          const sentences = script.split(/[.!?]+/).filter((s: string) => s.trim());
          const avgDuration = (target_duration_seconds * 1000) / sentences.length;
          
          scenes = sentences.map((sentence: string, index: number) => ({
            index,
            content: sentence.trim(),
            duration_ms: Math.round(avgDuration),
            type: index === 0 ? "intro" : index === sentences.length - 1 ? "outro" : "main",
            suggested_visuals: index === 0 ? "Speaker intro shot" : "Main content visual",
          }));
        }

        return new Response(JSON.stringify({
          success: true,
          scenes,
          total_duration_ms: scenes.reduce((sum, s) => sum + s.duration_ms, 0),
          scene_count: scenes.length,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "create_timeline": {
        const { project_id, scenes } = params;

        if (!project_id || !scenes?.length) {
          throw new Error("project_id and scenes are required");
        }

        // Create timeline items from scenes
        const currentTime = 0;
        const items = scenes.map((scene: Scene) => ({
          project_id,
          item_type: "avatar",
          track_index: 0,
          start_time_ms: currentTime,
          duration_ms: scene.duration_ms,
          content: scene.content,
          layer_props: {
            scene_type: scene.type,
            suggested_visuals: scene.suggested_visuals,
          },
        }));

        // Update currentTime for proper sequencing
        scenes.forEach((scene: Scene, index: number) => {
          if (index > 0) {
            items[index].start_time_ms = items[index - 1].start_time_ms + items[index - 1].duration_ms;
          }
        });

        // Insert items
        const { data, error } = await supabase
          .from("video_project_items")
          .insert(items)
          .select();

        if (error) throw error;

        // Update project duration
        const totalDuration = scenes.reduce((sum: number, s: Scene) => sum + s.duration_ms, 0);
        await supabase
          .from("video_projects")
          .update({ 
            duration_seconds: Math.ceil(totalDuration / 1000),
            status: "editing",
          })
          .eq("id", project_id);

        return new Response(JSON.stringify({
          success: true,
          items: data,
          total_duration_ms: totalDuration,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "add_graphics": {
        const { project_id, graphics } = params;

        if (!project_id || !graphics?.length) {
          throw new Error("project_id and graphics are required");
        }

        // Add graphic overlays to the timeline
        const items = graphics.map((graphic: unknown) => ({
          project_id,
          item_type: "graphic",
          track_index: graphic.track_index || 2,
          start_time_ms: graphic.start_time_ms,
          duration_ms: graphic.duration_ms || 3000,
          content: graphic.text,
          layer_props: {
            type: graphic.type || "lower_third", // lower_third, callout, title
            position: graphic.position || "bottom",
            style: graphic.style || {},
          },
        }));

        const { data, error } = await supabase
          .from("video_project_items")
          .insert(items)
          .select();

        if (error) throw error;

        return new Response(JSON.stringify({
          success: true,
          items: data,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "optimize_pacing": {
        const { project_id } = params;

        // Get all items for the project
        const { data: items } = await supabase
          .from("video_project_items")
          .select("*")
          .eq("project_id", project_id)
          .order("start_time_ms", { ascending: true });

        if (!items?.length) {
          throw new Error("No items found for project");
        }

        // Analyze pacing and suggest improvements
        const suggestions = [];
        
        // Check for long scenes (>30 seconds without a break)
        items.forEach((item, index) => {
          if (item.duration_ms > 30000) {
            suggestions.push({
              type: "split_scene",
              item_id: item.id,
              message: `Scene ${index + 1} is ${(item.duration_ms / 1000).toFixed(0)}s - consider splitting for better retention`,
            });
          }
        });

        // Check for pattern interrupts (should have visual change every 30s)
        const totalDuration = items.reduce((sum, i) => sum + i.duration_ms, 0);
        const visualChanges = items.filter(i => i.item_type !== "audio").length;
        const avgChangeInterval = totalDuration / visualChanges;
        
        if (avgChangeInterval > 30000) {
          suggestions.push({
            type: "add_b_roll",
            message: `Average visual change interval is ${(avgChangeInterval / 1000).toFixed(0)}s - add B-roll every 30s for better retention`,
          });
        }

        return new Response(JSON.stringify({
          success: true,
          total_duration_ms: totalDuration,
          visual_changes: visualChanges,
          avg_change_interval_ms: avgChangeInterval,
          suggestions,
          pacing_score: suggestions.length === 0 ? 100 : Math.max(50, 100 - suggestions.length * 10),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "suggest_b_roll": {
        const { project_id, script } = params;

        // Get existing timeline
        const { data: items } = await supabase
          .from("video_project_items")
          .select("*")
          .eq("project_id", project_id)
          .eq("item_type", "avatar")
          .order("start_time_ms", { ascending: true });

        // Suggest B-roll insertion points
        const suggestions = (items || []).map((item, index) => {
          const content = item.content || "";
          const needsBRoll = 
            content.toLowerCase().includes("stat") ||
            content.toLowerCase().includes("example") ||
            content.toLowerCase().includes("show") ||
            content.toLowerCase().includes("look at") ||
            content.match(/\d+%/) ||
            content.match(/\$\d+/);

          return needsBRoll ? {
            after_item_id: item.id,
            at_time_ms: item.start_time_ms + Math.round(item.duration_ms / 2),
            reason: "Content mentions data/examples that would benefit from visual support",
            suggested_type: content.match(/\d/) ? "screen_recording" : "b_roll",
          } : null;
        }).filter(Boolean);

        return new Response(JSON.stringify({
          success: true,
          suggestions,
          count: suggestions.length,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      default:
        return new Response(JSON.stringify({
          error: `Unknown action: ${action}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (error) {
    console.error("[Video Editor Agent] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
