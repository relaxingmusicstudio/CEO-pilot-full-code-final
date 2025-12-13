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
    const { prompt, content_type, platform } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch winner patterns for this content type
    const { data: winnerPatterns } = await supabase
      .from("content_patterns")
      .select("*")
      .eq("content_type", content_type)
      .eq("pattern_type", "winner")
      .order("confidence_score", { ascending: false })
      .limit(10);

    // Fetch loser patterns to avoid
    const { data: loserPatterns } = await supabase
      .from("content_patterns")
      .select("*")
      .eq("content_type", content_type)
      .eq("pattern_type", "loser")
      .order("confidence_score", { ascending: false })
      .limit(5);

    // Fetch inspiration patterns
    const { data: inspirations } = await supabase
      .from("scraped_inspiration")
      .select("*")
      .eq("content_type", content_type)
      .order("viral_score", { ascending: false })
      .limit(5);

    // Build enhancement context
    const winnerContext = winnerPatterns?.map(p => 
      `✅ DO: ${p.pattern_description} (${Math.round(p.confidence_score * 100)}% confidence)`
    ).join("\n") || "No winner patterns yet.";

    const loserContext = loserPatterns?.map(p => 
      `❌ AVOID: ${p.pattern_description}`
    ).join("\n") || "No loser patterns yet.";

    const inspirationContext = inspirations?.map(i => 
      `📌 Viral example: ${i.title} - ${i.description?.substring(0, 100)}`
    ).join("\n") || "";

    // Use AI to enhance the prompt
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      // Return original prompt if no AI available
      return new Response(JSON.stringify({ 
        enhanced_prompt: prompt,
        original_prompt: prompt,
        patterns_applied: 0
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const systemPrompt = `You are a content optimization expert for HVAC marketing. Your job is to enhance content prompts using proven patterns.

LEARNED WINNER PATTERNS (use these):
${winnerContext}

LEARNED LOSER PATTERNS (avoid these):
${loserContext}

${inspirationContext ? `VIRAL INSPIRATION:\n${inspirationContext}` : ""}

RULES:
1. Keep the core message/intent of the original prompt
2. Apply winner patterns where they fit naturally
3. Actively avoid loser patterns
4. Make it specific to HVAC industry when relevant
5. Return ONLY the enhanced prompt, no explanation`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Enhance this ${content_type} prompt for ${platform || "general"} platform:\n\n${prompt}` }
        ]
      })
    });

    if (!response.ok) {
      console.error("AI enhancement failed, returning original prompt");
      return new Response(JSON.stringify({ 
        enhanced_prompt: prompt,
        original_prompt: prompt,
        patterns_applied: 0
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const aiData = await response.json();
    const enhancedPrompt = aiData.choices?.[0]?.message?.content || prompt;

    console.log(`Enhanced prompt for ${content_type}: applied ${winnerPatterns?.length || 0} winner patterns`);

    return new Response(JSON.stringify({ 
      enhanced_prompt: enhancedPrompt,
      original_prompt: prompt,
      patterns_applied: winnerPatterns?.length || 0,
      patterns_avoided: loserPatterns?.length || 0
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: unknown) {
    console.error("Prompt enhancer error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
