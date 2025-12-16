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
    const { topic, platform, style = "professional", idea_id } = await req.json();

    if (!topic) {
      return new Response(JSON.stringify({ error: "topic is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Create image prompt
    const imagePrompt = `Create a ${style} marketing image for ${platform} about: ${topic}. 
    The image should be eye-catching, professional, and suitable for social media marketing.
    Use modern design trends, clean composition, and vibrant but professional colors.
    Do not include any text in the image.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [
          { role: "user", content: imagePrompt }
        ],
        modalities: ["image", "text"]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Image API error:", response.status, errorText);
      throw new Error(`AI Image API error: ${response.status}`);
    }

    const aiData = await response.json();
    const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const textResponse = aiData.choices?.[0]?.message?.content || "";

    // Save to content table
    const { data: savedContent, error: saveError } = await supabase
      .from("content")
      .insert({
        idea_id,
        content_type: "image",
        title: `Image: ${topic.substring(0, 50)}`,
        body: textResponse,
        media_url: imageUrl,
        platform,
        status: "pending"
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving content:", saveError);
    }

    console.log(`Generated image for: ${topic}`);

    return new Response(JSON.stringify({ 
      imageUrl,
      description: textResponse,
      saved: savedContent
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Content image error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
