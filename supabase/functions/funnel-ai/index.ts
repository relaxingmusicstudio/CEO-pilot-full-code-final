import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, funnelData, metrics } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let systemPrompt = "";
    let userPrompt = "";

    switch (type) {
      case "analyze":
        systemPrompt = `You are an expert conversion rate optimization (CRO) specialist for HVAC businesses. Analyze funnel data and provide actionable recommendations to improve conversions. Focus on:
- Drop-off points and friction
- A/B test suggestions
- Copy and CTA improvements
- Mobile vs desktop optimization
- Trust signals and social proof placement
Be specific and actionable. Format recommendations with clear priorities.`;
        userPrompt = `Analyze this funnel performance and provide optimization recommendations:

Funnel: ${funnelData?.name || "Main Sales Funnel"}
Stages: ${JSON.stringify(funnelData?.stages || [], null, 2)}
Current Metrics:
- Visitors: ${metrics?.visitors || 0}
- Leads: ${metrics?.leads || 0}
- Conversions: ${metrics?.conversions || 0}
- Conversion Rate: ${metrics?.conversionRate || 0}%
- Avg Time on Page: ${metrics?.avgTimeOnPage || "N/A"}
- Bounce Rate: ${metrics?.bounceRate || "N/A"}%

Identify the top 3-5 opportunities to improve conversions.`;
        break;

      case "generate_ab_test":
        systemPrompt = `You are a CRO expert specializing in A/B testing for service businesses. Generate specific A/B test variants that are proven to improve conversions. Be creative but data-driven.`;
        userPrompt = `Generate A/B test variants for this funnel element:

Element: ${funnelData?.element || "CTA Button"}
Current Copy: "${funnelData?.currentCopy || ""}"
Page Context: ${funnelData?.context || "Landing page for HVAC services"}
Goal: ${funnelData?.goal || "Increase click-through rate"}

Provide 3 variant options with expected impact.`;
        break;

      case "optimize_copy":
        systemPrompt = `You are a direct-response copywriter specializing in home services. Write compelling copy that drives action using proven frameworks (PAS, AIDA, etc.). Focus on urgency, benefits, and trust.`;
        userPrompt = `Optimize this copy for better conversions:

Current: "${funnelData?.currentCopy || ""}"
Target Audience: ${funnelData?.audience || "Homeowners needing HVAC services"}
Goal: ${funnelData?.goal || "Book a service call"}
Tone: ${funnelData?.tone || "Professional but friendly"}

Provide 2-3 optimized versions with explanation.`;
        break;

      case "suggest_flow":
        systemPrompt = `You are a customer journey expert for home service businesses. Design high-converting funnels and automation flows. Focus on capturing leads at multiple touchpoints and nurturing them to conversion.`;
        userPrompt = `Design an optimized funnel flow for:

Business Type: HVAC Services
Goal: ${funnelData?.goal || "Book more service appointments"}
Current Pain Points: ${funnelData?.painPoints || "High bounce rate, low form completions"}
Traffic Sources: ${funnelData?.trafficSources || "Google Ads, Organic Search"}

Create a detailed funnel flow with stages, triggers, and automation.`;
        break;

      default:
        throw new Error("Invalid analysis type");
    }

    console.log(`Funnel AI: Processing ${type} request`);

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
          { role: "user", content: userPrompt },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content;

    console.log(`Funnel AI: Successfully generated ${type} response`);

    return new Response(JSON.stringify({ result, type }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Funnel AI error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
