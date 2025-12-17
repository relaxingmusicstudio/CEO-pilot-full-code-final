import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, script, presenter_id = "amy-Aq6OmGZnMt", voice_id = "en-US-JennyNeural", idea_id } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const DID_API_KEY = Deno.env.get("DID_API_KEY");

    if (!DID_API_KEY) {
      const mockResponse = {
        video_id: `mock_${Date.now()}`,
        status: "pending",
        message: "D-ID API key not configured. Configure it in Settings to generate real videos.",
        mock: true
      };

      await supabase.from("content").insert({
        idea_id,
        content_type: "video",
        title: `Video: ${topic?.substring(0, 50) || "AI Avatar Video"}`,
        body: script || `Generated script for: ${topic}`,
        status: "pending"
      });

      return new Response(JSON.stringify(mockResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Generate script if not provided
    let videoScript = script;
    if (!videoScript && topic) {
      try {
        const aiResponse = await aiChat({
          messages: [
            { 
              role: "system", 
              content: "You are a video script writer. Write concise, engaging scripts for AI avatar videos. Keep scripts under 60 seconds when read aloud. Be conversational and professional." 
            },
            { 
              role: "user", 
              content: `Write a short video script about: ${topic}. Make it engaging and suitable for a professional AI avatar presentation.` 
            }
          ],
          purpose: 'video_script',
        });
        videoScript = aiResponse.text || "";
      } catch (e) {
        console.log("[did-video] AI script generation failed, using topic as script");
        videoScript = topic;
      }
    }

    console.log("Creating D-ID video with script:", videoScript?.substring(0, 100));

    // Call D-ID API to create a talk
    const didResponse = await fetch("https://api.d-id.com/talks", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${DID_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        script: {
          type: "text",
          input: videoScript,
          provider: {
            type: "microsoft",
            voice_id: voice_id
          }
        },
        source_url: "https://create-images-results.d-id.com/DefaultPresenters/Amy_f/image.jpeg",
        config: {
          stitch: true
        }
      })
    });

    if (!didResponse.ok) {
      const errorText = await didResponse.text();
      console.error("D-ID API error:", didResponse.status, errorText);
      throw new Error(`D-ID API error: ${didResponse.status} - ${errorText}`);
    }

    const didData = await didResponse.json();
    console.log("D-ID response:", JSON.stringify(didData));

    // Save to content table
    const { data: savedContent, error: saveError } = await supabase
      .from("content")
      .insert({
        idea_id,
        content_type: "video",
        title: `Video: ${topic?.substring(0, 50) || "AI Avatar Video"}`,
        body: videoScript,
        status: "processing",
        media_url: didData.id // Store the D-ID talk ID for later retrieval
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving content:", saveError);
    }

    console.log(`Created D-ID video for: ${topic}, ID: ${didData.id}`);

    return new Response(JSON.stringify({ 
      video_id: didData.id,
      status: didData.status || "created",
      script: videoScript,
      saved: savedContent
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("D-ID video error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
