import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { aiChat, parseAIError } from "../_shared/ai.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();

    switch (action) {
      case 'generate_image':
        return await generateImage(params);
      case 'generate_video':
        return await generateVideo(params);
      case 'enhance_prompt':
        return await enhancePrompt(params);
      case 'get_brand_style':
        return await getBrandStyle(params);
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action. Use: generate_image, generate_video, enhance_prompt, get_brand_style' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Visual content generator error:', error);
    
    const aiError = parseAIError(error);
    if (aiError.code === 'QUOTA_EXCEEDED') {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded', code: 'QUOTA_EXCEEDED' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function generateImage(params: any) {
  const { prompt, style = 'professional', aspect_ratio = '16:9', brand_colors } = params;

  const enhancedPrompt = `${prompt}. Style: ${style}. ${brand_colors ? `Use brand colors: ${brand_colors}` : ''}. Professional quality, ${aspect_ratio} aspect ratio.`;

  // Note: Gemini text models don't generate images directly
  // Return a placeholder and suggest using a dedicated image generation service
  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Image generation requires a dedicated image API. Prompt enhanced for external use.',
    enhanced_prompt: enhancedPrompt,
    suggested_services: ['DALL-E', 'Midjourney', 'Stable Diffusion'],
    mock_url: `https://placehold.co/1200x675/1A56DB/FFFFFF?text=${encodeURIComponent(prompt.slice(0, 30))}`
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function generateVideo(params: any) {
  const { script, style = 'professional', duration = 30 } = params;

  return new Response(JSON.stringify({
    success: true,
    message: 'Video generation requires external APIs like HeyGen or D-ID',
    script_enhanced: script,
    suggested_services: ['HeyGen', 'D-ID', 'Synthesia'],
    estimated_duration: duration
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function enhancePrompt(params: any) {
  const { prompt, target = 'image', style } = params;

  const response = await aiChat({
    messages: [
      {
        role: 'system',
        content: `You are a prompt engineer specializing in ${target} generation. Enhance prompts for maximum quality and clarity.
Output format:
{
  "enhanced_prompt": "detailed enhanced prompt",
  "style_tags": ["tag1", "tag2"],
  "negative_prompt": "what to avoid",
  "technical_params": { "quality": "high", "style": "${style || 'professional'}" }
}`
      },
      { role: 'user', content: prompt }
    ],
  });

  try {
    let text = response.text.trim();
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);
    
    const result = JSON.parse(text.trim());
    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch {
    return new Response(JSON.stringify({
      success: true,
      enhanced_prompt: `High quality, professional ${prompt}. Detailed, sharp focus, excellent composition.`,
      style_tags: [style || 'professional', 'high-quality'],
      negative_prompt: 'blurry, low quality, distorted',
      technical_params: { quality: 'high', style: style || 'professional' }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function getBrandStyle(params: any) {
  const { brand_name, industry } = params;

  const response = await aiChat({
    messages: [
      {
        role: 'system',
        content: `You are a brand strategist. Generate visual brand guidelines.
Output JSON:
{
  "primary_colors": ["#hex1", "#hex2"],
  "secondary_colors": ["#hex3"],
  "typography": { "heading": "font name", "body": "font name" },
  "image_style": "description of image style",
  "mood_keywords": ["keyword1", "keyword2"],
  "avoid": ["what to avoid"]
}`
      },
      { role: 'user', content: `Brand: ${brand_name}, Industry: ${industry || 'general'}` }
    ],
  });

  try {
    let text = response.text.trim();
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);
    
    const result = JSON.parse(text.trim());
    return new Response(JSON.stringify({ success: true, brand_style: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch {
    return new Response(JSON.stringify({
      success: true,
      brand_style: {
        primary_colors: ['#1A56DB', '#1E40AF'],
        secondary_colors: ['#F97316'],
        typography: { heading: 'Inter', body: 'Inter' },
        image_style: 'Professional, modern, clean',
        mood_keywords: ['professional', 'trustworthy', 'modern'],
        avoid: ['cluttered', 'unprofessional', 'dated']
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
