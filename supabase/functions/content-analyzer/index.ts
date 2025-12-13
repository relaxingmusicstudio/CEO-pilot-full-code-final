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
    const { content_id, user_rating, metrics } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch the content details
    const { data: content, error: contentError } = await supabase
      .from("content")
      .select("*")
      .eq("id", content_id)
      .single();

    if (contentError || !content) {
      throw new Error("Content not found");
    }

    // Determine classification based on rating and metrics
    let classification = "neutral";
    if (user_rating >= 4 || (metrics?.conversions > 0)) {
      classification = "winner";
    } else if (user_rating <= 2) {
      classification = "loser";
    }

    // Use AI to analyze why content succeeded/failed
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let aiAnalysis = {};
    let extractedPatterns: Array<{category: string; description: string; pattern_type: string}> = [];

    if (LOVABLE_API_KEY) {
      const analysisPrompt = `Analyze this ${content.content_type} content and explain why it ${classification === "winner" ? "succeeded" : classification === "loser" ? "failed" : "performed neutrally"}.

CONTENT:
Title: ${content.title || "N/A"}
Body: ${content.body?.substring(0, 500) || "N/A"}
Platform: ${content.platform || "N/A"}
User Rating: ${user_rating}/5

METRICS:
${JSON.stringify(metrics || {}, null, 2)}

Respond in JSON format:
{
  "summary": "Brief explanation of performance",
  "strengths": ["list of what worked"],
  "weaknesses": ["list of what didn't work"],
  "patterns": [
    {"category": "headline|hook|cta|visual_style|structure|tone", "description": "specific pattern", "is_positive": true/false}
  ],
  "recommendations": ["actionable improvements"]
}`;

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
              { role: "system", content: "You are a content performance analyst. Analyze content and extract learnable patterns. Always respond in valid JSON." },
              { role: "user", content: analysisPrompt }
            ]
          })
        });

        if (response.ok) {
          const aiData = await response.json();
          const analysisText = aiData.choices?.[0]?.message?.content || "{}";
          
          // Parse AI response
          try {
            const cleanJson = analysisText.replace(/```json\n?|\n?```/g, "").trim();
            aiAnalysis = JSON.parse(cleanJson);
            
            // Extract patterns from AI analysis
            if (Array.isArray((aiAnalysis as {patterns?: Array<{category: string; description: string; is_positive: boolean}>}).patterns)) {
              extractedPatterns = (aiAnalysis as {patterns: Array<{category: string; description: string; is_positive: boolean}>}).patterns.map((p: {category: string; description: string; is_positive: boolean}) => ({
                category: p.category,
                description: p.description,
                pattern_type: p.is_positive ? "winner" : "loser"
              }));
            }
          } catch {
            console.log("Could not parse AI analysis as JSON");
          }
        }
      } catch (aiError) {
        console.error("AI analysis failed:", aiError);
      }
    }

    // Save performance record
    const { data: performance, error: perfError } = await supabase
      .from("content_performance")
      .upsert({
        content_id,
        content_type: content.content_type || "text",
        platform: content.platform,
        views: metrics?.views || 0,
        clicks: metrics?.clicks || 0,
        shares: metrics?.shares || 0,
        comments: metrics?.comments || 0,
        conversions: metrics?.conversions || 0,
        user_rating,
        ai_analysis: aiAnalysis,
        classification,
        extracted_patterns: extractedPatterns,
        original_prompt: content.body?.substring(0, 200)
      }, { onConflict: "content_id" })
      .select()
      .single();

    if (perfError) {
      console.error("Error saving performance:", perfError);
    }

    // Save extracted patterns to the patterns table
    for (const pattern of extractedPatterns) {
      const { error: patternError } = await supabase
        .from("content_patterns")
        .upsert({
          content_type: content.content_type || "text",
          pattern_type: pattern.pattern_type,
          pattern_category: pattern.category,
          pattern_description: pattern.description,
          times_used: 1,
          times_successful: pattern.pattern_type === "winner" ? 1 : 0,
          confidence_score: 0.5
        }, { 
          onConflict: "id",
          ignoreDuplicates: false 
        });

      if (patternError) {
        console.error("Error saving pattern:", patternError);
      }
    }

    console.log(`Analyzed content ${content_id}: ${classification}, extracted ${extractedPatterns.length} patterns`);

    return new Response(JSON.stringify({ 
      classification,
      ai_analysis: aiAnalysis,
      patterns_extracted: extractedPatterns.length,
      performance
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: unknown) {
    console.error("Content analyzer error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
