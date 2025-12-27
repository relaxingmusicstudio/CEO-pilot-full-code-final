import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat, parseAIError } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { prompt, content_type, platform, action, template, tone, variables } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Handle message enhancement action for AI personalization
    if (action === "enhance_message") {
      const toneGuide = {
        professional: "formal, business-like, respectful, confident",
        casual: "friendly, conversational, approachable, warm",
        urgent: "time-sensitive, compelling, action-oriented, direct"
      };

      try {
        const result = await aiChat({
          messages: [
            { 
              role: "system", 
              content: `You are an expert sales copywriter for HVAC companies. Enhance the following outreach template to be more compelling and personalized.

TONE: ${toneGuide[tone as keyof typeof toneGuide] || toneGuide.professional}

RULES:
1. Keep all personalization variables (${variables?.join(", ") || "{{first_name}}, {{company}}"}) intact
2. Add a compelling P.S. line with a relevant personal touch
3. Make the value proposition clearer
4. Keep it concise (under 150 words)
5. For HVAC: emphasize 24/7 availability, quick response times, and revenue recovery

Return ONLY the enhanced message, nothing else.`
            },
            { role: "user", content: template }
          ],
          purpose: "message_enhancement",
        });

        return new Response(JSON.stringify({ 
          enhanced: result.text,
          success: true,
          tone
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("[prompt-enhancer] AI enhancement failed:", parseAIError(error));
        return new Response(JSON.stringify({ 
          enhanced: template + "\n\nP.S. I'd love to help you capture more after-hours revenue!",
          success: true
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // Original prompt enhancement logic for content
    const { data: winnerPatterns } = await supabase
      .from("content_patterns")
      .select("*")
      .eq("content_type", content_type)
      .eq("pattern_type", "winner")
      .order("confidence_score", { ascending: false })
      .limit(10);

    const { data: loserPatterns } = await supabase
      .from("content_patterns")
      .select("*")
      .eq("content_type", content_type)
      .eq("pattern_type", "loser")
      .order("confidence_score", { ascending: false })
      .limit(5);

    const { data: inspirations } = await supabase
      .from("scraped_inspiration")
      .select("*")
      .eq("content_type", content_type)
      .order("viral_score", { ascending: false })
      .limit(5);

    const winnerContext = winnerPatterns?.map(p => 
      `✅ DO: ${p.pattern_description} (${Math.round((p.confidence_score || 0) * 100)}% confidence)`
    ).join("\n") || "No winner patterns yet.";

    const loserContext = loserPatterns?.map(p => 
      `❌ AVOID: ${p.pattern_description}`
    ).join("\n") || "No loser patterns yet.";

    const inspirationContext = inspirations?.map((i: unknown) => 
      `📌 Viral example: ${i.title} - ${i.description?.substring(0, 100)}`
    ).join("\n") || "";

    try {
      const result = await aiChat({
        messages: [
          { 
            role: "system", 
            content: `You are a content optimization expert for HVAC marketing. Your job is to enhance content prompts using proven patterns.

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
5. Return ONLY the enhanced prompt, no explanation`
          },
          { role: "user", content: `Enhance this ${content_type} prompt for ${platform || "general"} platform:\n\n${prompt}` }
        ],
        purpose: "prompt_enhancement",
      });

      console.log(`[prompt-enhancer] Enhanced for ${content_type}: applied ${winnerPatterns?.length || 0} winner patterns`);

      return new Response(JSON.stringify({ 
        enhanced_prompt: result.text,
        original_prompt: prompt,
        patterns_applied: winnerPatterns?.length || 0,
        patterns_avoided: loserPatterns?.length || 0
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (error) {
      console.error("[prompt-enhancer] AI enhancement failed:", parseAIError(error));
      return new Response(JSON.stringify({ 
        enhanced_prompt: prompt,
        original_prompt: prompt,
        patterns_applied: 0
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

  } catch (error: unknown) {
    console.error("[prompt-enhancer] error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
