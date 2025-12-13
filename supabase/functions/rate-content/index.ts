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
    const { content_id, rating, content_type, platform, original_prompt, enhanced_prompt, metrics } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Determine classification
    let classification = "neutral";
    if (rating >= 4) {
      classification = "winner";
    } else if (rating <= 2) {
      classification = "loser";
    }

    // Save or update performance record
    const { data: performance, error: perfError } = await supabase
      .from("content_performance")
      .insert({
        content_id: content_id || null,
        content_type: content_type || "text",
        platform: platform || "general",
        user_rating: rating,
        classification,
        original_prompt,
        enhanced_prompt,
        views: metrics?.views || 0,
        clicks: metrics?.clicks || 0,
        shares: metrics?.shares || 0,
        conversions: metrics?.conversions || 0
      })
      .select()
      .single();

    if (perfError) {
      console.error("Error saving performance:", perfError);
      throw perfError;
    }

    // If we have prompts, extract and save patterns
    if (original_prompt || enhanced_prompt) {
      const promptToAnalyze = enhanced_prompt || original_prompt;
      
      // Simple pattern extraction for common elements
      const patterns: Array<{category: string; description: string}> = [];
      
      // Check for urgency words
      if (/urgent|emergency|fast|quick|now|today/i.test(promptToAnalyze)) {
        patterns.push({ category: "tone", description: "Uses urgency language" });
      }
      
      // Check for benefit-focused language
      if (/save|money|cost|free|discount|deal/i.test(promptToAnalyze)) {
        patterns.push({ category: "hook", description: "Emphasizes savings/value" });
      }
      
      // Check for social proof indicators
      if (/customer|review|rating|trusted|years/i.test(promptToAnalyze)) {
        patterns.push({ category: "social_proof", description: "Includes trust signals" });
      }
      
      // Check for HVAC-specific terms
      if (/hvac|ac|heating|cooling|furnace|air conditioner|repair|maintenance/i.test(promptToAnalyze)) {
        patterns.push({ category: "industry", description: "HVAC-specific terminology" });
      }

      // Save extracted patterns
      for (const pattern of patterns) {
        // Try to find existing pattern
        const { data: existingPattern } = await supabase
          .from("content_patterns")
          .select("*")
          .eq("pattern_category", pattern.category)
          .eq("pattern_description", pattern.description)
          .eq("content_type", content_type || "text")
          .single();

        if (existingPattern) {
          // Update existing pattern
          await supabase
            .from("content_patterns")
            .update({
              times_used: existingPattern.times_used + 1,
              times_successful: classification === "winner" 
                ? existingPattern.times_successful + 1 
                : existingPattern.times_successful,
              pattern_type: classification === "winner" ? "winner" : 
                           classification === "loser" ? "loser" : existingPattern.pattern_type
            })
            .eq("id", existingPattern.id);
        } else {
          // Create new pattern
          await supabase
            .from("content_patterns")
            .insert({
              content_type: content_type || "text",
              pattern_type: classification,
              pattern_category: pattern.category,
              pattern_description: pattern.description,
              times_used: 1,
              times_successful: classification === "winner" ? 1 : 0
            });
        }
      }
    }

    console.log(`Rated content: ${rating}/5 (${classification})`);

    return new Response(JSON.stringify({ 
      success: true,
      classification,
      performance_id: performance?.id
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: unknown) {
    console.error("Rate content error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
