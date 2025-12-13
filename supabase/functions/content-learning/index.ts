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

    // Fetch all performance data
    const { data: performances } = await supabase
      .from("content_performance")
      .select("*")
      .order("created_at", { ascending: false });

    // Fetch all patterns
    const { data: patterns } = await supabase
      .from("content_patterns")
      .select("*");

    // Calculate pattern statistics
    const patternStats: Record<string, { wins: number; losses: number; total: number }> = {};
    
    for (const perf of performances || []) {
      const extractedPatterns = perf.extracted_patterns as Array<{category: string; description: string; pattern_type: string}> || [];
      for (const pattern of extractedPatterns) {
        const key = `${pattern.category}:${pattern.description}`;
        if (!patternStats[key]) {
          patternStats[key] = { wins: 0, losses: 0, total: 0 };
        }
        patternStats[key].total++;
        if (perf.classification === "winner") {
          patternStats[key].wins++;
        } else if (perf.classification === "loser") {
          patternStats[key].losses++;
        }
      }
    }

    // Update pattern confidence scores
    let updatedPatterns = 0;
    for (const pattern of patterns || []) {
      const key = `${pattern.pattern_category}:${pattern.pattern_description}`;
      const stats = patternStats[key];
      
      if (stats && stats.total > 0) {
        const winRate = stats.wins / stats.total;
        const lossRate = stats.losses / stats.total;
        
        // Determine pattern type based on performance
        let newPatternType = "neutral";
        if (winRate > 0.6) {
          newPatternType = "winner";
        } else if (lossRate > 0.6) {
          newPatternType = "loser";
        }
        
        // Update confidence score (weighted by sample size)
        const sampleWeight = Math.min(stats.total / 10, 1); // Max confidence at 10 samples
        const newConfidence = (winRate - lossRate + 1) / 2 * sampleWeight;
        
        await supabase
          .from("content_patterns")
          .update({
            pattern_type: newPatternType,
            confidence_score: newConfidence,
            times_used: stats.total,
            times_successful: stats.wins
          })
          .eq("id", pattern.id);
        
        updatedPatterns++;
      }
    }

    // Generate learning report using AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let report = null;

    if (LOVABLE_API_KEY) {
      const winners = performances?.filter(p => p.classification === "winner") || [];
      const losers = performances?.filter(p => p.classification === "loser") || [];
      
      const topWinnerPatterns = patterns
        ?.filter(p => p.pattern_type === "winner")
        .sort((a, b) => b.confidence_score - a.confidence_score)
        .slice(0, 5) || [];
      
      const topLoserPatterns = patterns
        ?.filter(p => p.pattern_type === "loser")
        .sort((a, b) => b.confidence_score - a.confidence_score)
        .slice(0, 5) || [];

      const reportPrompt = `Generate a weekly content strategy report for an HVAC marketing team.

DATA:
- Total content analyzed: ${performances?.length || 0}
- Winners: ${winners.length}
- Losers: ${losers.length}

TOP WINNER PATTERNS:
${topWinnerPatterns.map(p => `- ${p.pattern_category}: ${p.pattern_description} (${Math.round(p.confidence_score * 100)}% confidence)`).join("\n") || "None yet"}

TOP PATTERNS TO AVOID:
${topLoserPatterns.map(p => `- ${p.pattern_category}: ${p.pattern_description}`).join("\n") || "None yet"}

Generate a brief, actionable report with:
1. Key insights
2. This week's winning formula
3. What to avoid
4. Specific recommendations for HVAC content`;

      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You are a content strategy advisor for HVAC marketing. Be concise and actionable." },
              { role: "user", content: reportPrompt }
            ]
          })
        });

        if (response.ok) {
          const aiData = await response.json();
          report = aiData.choices?.[0]?.message?.content;
        }
      } catch (aiError) {
        console.error("AI report generation failed:", aiError);
      }
    }

    console.log(`Learning complete: updated ${updatedPatterns} patterns`);

    return new Response(JSON.stringify({ 
      patterns_updated: updatedPatterns,
      total_performances: performances?.length || 0,
      total_patterns: patterns?.length || 0,
      report
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: unknown) {
    console.error("Content learning error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
