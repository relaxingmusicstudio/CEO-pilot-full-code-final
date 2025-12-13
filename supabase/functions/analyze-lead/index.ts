import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANALYSIS_PROMPT = `You are an expert lead scoring analyst for HVAC businesses. Analyze the conversation and provide a comprehensive lead score.

SCORING CRITERIA (0-100 scale):

LEAD TEMPERATURE:
- Hot (80-100): Ready to buy, expressed urgency, timeline within 3 months
- Warm (50-79): Interested but needs nurturing, timeline 3-6 months
- Cold (20-49): Just exploring, timeline 6+ months or unclear
- Dead (0-19): Not interested, bad fit, or disengaged

QUALIFICATION FACTORS (weight each):
1. Budget Signals (25%): Team size indicates budget capacity
   - 10+ trucks = enterprise budget (25 pts)
   - 6-10 = growth budget (20 pts)
   - 2-5 = SMB budget (15 pts)
   - Solo = starter budget (10 pts)

2. Authority (20%): Is this the decision maker?
   - Business owner confirmed = 20 pts
   - Manager/partner = 15 pts
   - Employee/unknown = 5 pts

3. Need (25%): Pain points expressed
   - Acknowledged missed call problem = 25 pts
   - Mentioned lost revenue = 20 pts
   - General interest = 10 pts
   - No pain expressed = 5 pts

4. Timeline (30%): Urgency to act
   - Within 3 months = 30 pts
   - 3-6 months = 20 pts
   - 6-12 months = 10 pts
   - Just exploring = 5 pts

BUYING SIGNALS TO DETECT:
- Asked about pricing
- Asked about implementation/setup
- Mentioned specific pain points
- Compared to competitors
- Asked about ROI/results
- Requested demo

OBJECTIONS RAISED:
- Price concerns
- Need to consult partner
- Skeptical about AI
- "Just browsing"
- Timing not right

SENTIMENT JOURNEY:
Track how sentiment changed through the conversation:
- Curious → Interested → Engaged → Ready
- Skeptical → Understanding → Convinced
- Resistant → Open → Persuaded`;

const analysisTool = {
  type: "function",
  function: {
    name: "score_lead",
    description: "Provide comprehensive lead scoring and analysis",
    parameters: {
      type: "object",
      properties: {
        lead_score: {
          type: "number",
          description: "Overall lead score 0-100"
        },
        lead_temperature: {
          type: "string",
          enum: ["hot", "warm", "cold", "dead"],
          description: "Lead temperature classification"
        },
        lead_intent: {
          type: "string",
          enum: ["ready_to_buy", "evaluating", "researching", "not_interested"],
          description: "Primary intent detected"
        },
        qualification_breakdown: {
          type: "object",
          properties: {
            budget_score: { type: "number" },
            authority_score: { type: "number" },
            need_score: { type: "number" },
            timeline_score: { type: "number" }
          },
          description: "BANT qualification scores"
        },
        buying_signals: {
          type: "array",
          items: { type: "string" },
          description: "Detected buying signals"
        },
        objections_raised: {
          type: "array",
          items: { type: "string" },
          description: "Objections mentioned during conversation"
        },
        sentiment_journey: {
          type: "array",
          items: { type: "string" },
          description: "Sentiment progression through conversation"
        },
        conversation_summary: {
          type: "string",
          description: "Brief 2-3 sentence summary of the conversation"
        },
        recommended_followup: {
          type: "string",
          description: "Recommended next action for sales team"
        },
        conversion_probability: {
          type: "number",
          description: "Estimated conversion probability 0-100"
        },
        key_insights: {
          type: "array",
          items: { type: "string" },
          description: "Key insights for sales team"
        },
        urgency_level: {
          type: "string",
          enum: ["immediate", "high", "medium", "low"],
          description: "Follow-up urgency"
        }
      },
      required: [
        "lead_score",
        "lead_temperature", 
        "lead_intent",
        "qualification_breakdown",
        "buying_signals",
        "objections_raised",
        "sentiment_journey",
        "conversation_summary",
        "recommended_followup",
        "conversion_probability",
        "key_insights",
        "urgency_level"
      ]
    }
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationHistory, leadData } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Analyzing lead:", leadData?.name, "with", conversationHistory?.length, "messages");

    // Build conversation transcript
    const transcript = conversationHistory.map((msg: { role: string; content: string }) => 
      `${msg.role === 'user' ? 'PROSPECT' : 'ALEX'}: ${msg.content}`
    ).join('\n');

    const analysisRequest = `
LEAD DATA:
${JSON.stringify(leadData, null, 2)}

CONVERSATION TRANSCRIPT:
${transcript}

Analyze this lead and provide comprehensive scoring.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: ANALYSIS_PROMPT },
          { role: "user", content: analysisRequest }
        ],
        tools: [analysisTool],
        tool_choice: { type: "function", function: { name: "score_lead" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI analysis error:", response.status, errorText);
      throw new Error(`AI analysis error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall && toolCall.function?.arguments) {
      const analysis = JSON.parse(toolCall.function.arguments);
      console.log("Lead analysis complete:", {
        score: analysis.lead_score,
        temperature: analysis.lead_temperature,
        probability: analysis.conversion_probability
      });
      
      return new Response(JSON.stringify(analysis), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("No valid analysis from AI");

  } catch (error) {
    console.error("analyze-lead error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      lead_score: 50,
      lead_temperature: "warm",
      lead_intent: "evaluating",
      qualification_breakdown: { budget_score: 15, authority_score: 15, need_score: 10, timeline_score: 10 },
      buying_signals: [],
      objections_raised: [],
      sentiment_journey: ["unknown"],
      conversation_summary: "Analysis unavailable",
      recommended_followup: "Standard follow-up sequence",
      conversion_probability: 30,
      key_insights: ["Analysis failed - use default scoring"],
      urgency_level: "medium"
    }), {
      status: 200, // Return 200 with fallback data
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
