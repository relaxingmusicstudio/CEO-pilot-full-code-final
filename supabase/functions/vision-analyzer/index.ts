import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VisionRequest {
  action: 'analyze_screenshot' | 'analyze_layout' | 'analyze_competitor' | 'extract_text' | 'analyze_brand';
  image_url?: string;
  image_base64?: string;
  question?: string;
  context?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { action, image_url, image_base64, question, context }: VisionRequest = await req.json();

    if (!image_url && !image_base64) {
      return new Response(
        JSON.stringify({ error: 'Either image_url or image_base64 is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the image content for the API
    const imageContent = image_base64 
      ? { type: 'image_url', image_url: { url: `data:image/png;base64,${image_base64}` } }
      : { type: 'image_url', image_url: { url: image_url } };

    // Build system prompt based on action
    let systemPrompt = '';
    let userPrompt = '';

    switch (action) {
      case 'analyze_screenshot':
        systemPrompt = `You are an expert UI/UX analyst for HVAC business websites. Analyze screenshots to provide actionable insights about:
- Visual hierarchy and layout effectiveness
- Call-to-action placement and visibility
- Trust signals (reviews, certifications, guarantees)
- Mobile responsiveness indicators
- Conversion optimization opportunities
Be specific, actionable, and focus on HVAC industry best practices.`;
        userPrompt = question || 'Analyze this screenshot and provide insights on how to improve conversions for an HVAC business.';
        break;

      case 'analyze_layout':
        systemPrompt = `You are a conversion rate optimization expert. Analyze page layouts to identify:
- Above-the-fold content effectiveness
- User flow and navigation clarity
- Form placement and friction points
- Visual balance and whitespace usage
- Mobile-first design considerations
Provide specific, prioritized recommendations.`;
        userPrompt = question || 'Analyze this page layout and suggest improvements for better user engagement.';
        break;

      case 'analyze_competitor':
        systemPrompt = `You are a competitive intelligence analyst for the HVAC industry. Analyze competitor websites to identify:
- Unique value propositions
- Pricing strategies (if visible)
- Service offerings and differentiators
- Trust-building elements
- Weaknesses to exploit
- Features worth adopting
Provide strategic insights for competitive advantage.`;
        userPrompt = question || 'Analyze this competitor website and provide strategic insights.';
        break;

      case 'extract_text':
        systemPrompt = `You are an OCR and text extraction specialist. Extract all visible text from the image, maintaining structure where possible. Include:
- Headlines and subheadings
- Body text
- Button labels
- Navigation items
- Contact information
Format the output clearly with proper hierarchy.`;
        userPrompt = 'Extract all text from this image, maintaining the visual hierarchy.';
        break;

      case 'analyze_brand':
        systemPrompt = `You are a brand identity analyst. Analyze the visual elements to identify:
- Primary and secondary colors (provide hex codes if possible)
- Typography styles (font families, weights)
- Logo characteristics
- Visual tone (professional, friendly, modern, traditional)
- Brand personality traits
- Consistency recommendations
Provide actionable brand guidelines.`;
        userPrompt = question || 'Analyze the brand elements in this image and extract the visual identity.';
        break;

      default:
        systemPrompt = 'You are a helpful visual analysis assistant. Analyze the image and provide insights.';
        userPrompt = question || 'Describe what you see in this image.';
    }

    // Add context if provided
    if (context) {
      userPrompt = `${userPrompt}\n\nAdditional context: ${context}`;
    }

    console.log(`Vision analysis request: action=${action}`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: [
              { type: 'text', text: userPrompt },
              imageContent
            ]
          }
        ],
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content;

    if (!analysis) {
      throw new Error('No analysis returned from AI');
    }

    console.log(`Vision analysis completed: action=${action}, length=${analysis.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        action,
        analysis,
        model: 'google/gemini-2.5-flash',
        tokens_used: data.usage?.total_tokens || 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Vision analysis failed';
    console.error('Vision analyzer error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
