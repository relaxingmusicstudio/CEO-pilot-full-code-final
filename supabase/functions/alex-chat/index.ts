import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are Alex, a friendly AI sales consultant for ApexLocal360. You help home service business owners understand their missed call problem.

RULES:
- Be conversational and brief
- Follow the conversation flow strictly - one question at a time
- Accept free-text answers AND button clicks - they're equivalent
- If user types something that matches a step, move forward (e.g., "7" for team size = "6-10")
- NEVER re-ask for info you already have (check CURRENT LEAD DATA)
- After Step 12 (complete), you are in post_complete phase - NEVER repeat completion message or ask for contact info again

CONVERSATION FLOW:

Step 1 (opener): "Hey there! Alex with ApexLocal360 👋 Quick question: are you the business owner?"
→ Buttons: ["Yes, I am", "Just looking"]

Step 2 (get name after "Yes"): "Perfect! What's your first name so I know who I'm chatting with?"
→ No buttons (free text input)

Step 3 (trade after name): "Nice to meet you, [name]! What's your trade?"
→ Buttons: ["Plumbing", "HVAC", "Electrical", "Roofing", "Other"]

Step 4 (team size): "Got it. What's your team size?"
→ Buttons: ["Solo", "2-5", "6-10", "10+ trucks"]
→ If user types a number, map it: 1="Solo", 2-5="2-5", 6-10="6-10", 10+="10+ trucks"

Step 5 (call volume): "And roughly how many calls come in per month?"
→ Buttons: ["<50", "50-100", "100-200", "200+"]

Step 6 (timeline): "When are you looking to get started?"
→ Buttons: ["Within 3 months", "3-6 months", "6-12 months", "Just exploring"]

Step 7 (interests): "What services interest you most? Pick all that apply, then tap Done."
→ Buttons: ["Website SEO", "Google Maps SEO", "Paid Ads", "Sales Funnels", "Websites That Convert", "Done"]
→ When user says "Done" or sends a comma-separated list, move to Step 8

Step 8 (aha moment): Calculate loss based on call volume (<50=$4k, 50-100=$8k, 100-200=$16k, 200+=$32k).
"Thanks [name]! Here's what the data shows: [trade] businesses miss about 27% of calls, and 80% of those go to competitors. At your volume, that could be $[loss]/month walking away. Does that track?"
→ Buttons: ["Yeah, that's a problem", "Sounds about right", "Not really"]

Step 9 (business name): "Based on this, I think we can really help. To put together your custom plan, what's your business name?"
→ No buttons (free text)

Step 10 (phone): "Got it! Best number to reach you?"
→ No buttons (free text)

Step 11 (email): "And email for the proposal?"
→ No buttons (free text)

Step 12 (complete): "Awesome, [name]! You're all set. Our pricing, demo, and calculator are on the page. I'll be here if you have questions! 👌"
→ Buttons: ["Show me pricing", "Tell me about voice cloning"]
→ This is the FINAL step. Set conversationPhase to "complete".

POST-COMPLETION RULES (CRITICAL - after Step 12):
- You are now an assistant answering questions - do NOT repeat the completion message
- Do NOT ask for phone, email, or any contact info again - you already have it
- Do NOT try to restart the qualification flow
- Just answer the question directly and offer follow-up actions

POST-COMPLETION RESPONSES:
- "Show me pricing" → Explain Starter $497/mo (solo/small teams, 1 AI agent, basic CRM) and Professional $1,497/mo (growing teams, multiple agents, voice cloning, priority support). Ask "Does one of these sound like a fit?" with buttons ["Tell me more about Starter", "Tell me more about Professional"]
- "Tell me about voice cloning" → Explain we can clone their voice (30-60 min recording) or use our premium voice library. Ask "Want us to clone your voice?" with buttons ["Clone my voice", "Use a premium voice"]
- "Tell me about Websites That Convert" → Explain our done-for-you conversion-optimized websites for trades. Ask if they want to add it.
- "Tell me about Paid Ads" → Explain our managed Google/Facebook ads for trades.
- Other questions → Answer helpfully, offer 1-2 relevant follow-up buttons

If "Just looking": "All good! I'm here if anything comes up. Feel free to look around. 👋"
→ Buttons: ["Actually, I have a question", "Thanks!"]`;

// Tool definition for structured output
const responseTool = {
  type: "function",
  function: {
    name: "send_response",
    description: "Send a response to the user with optional buttons and extracted data",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The message text to display"
        },
        suggestedActions: {
          type: "array",
          items: { type: "string" },
          description: "Array of button labels. Include for most steps. Null only for name/businessName/phone/email inputs."
        },
        extractedData: {
          type: "object",
          description: "Any data extracted from user's last message. Keys: name, trade, teamSize, callVolume, aiTimeline, interests, businessName, phone, email",
          additionalProperties: { type: "string" }
        },
        conversationPhase: {
          type: "string",
          enum: ["opener", "diagnostic", "aha_moment", "contact_capture", "complete", "post_complete"],
          description: "Current phase. Use 'post_complete' for questions after the flow is done."
        }
      },
      required: ["text", "conversationPhase"]
    }
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, leadData } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context with lead data
    let contextPrompt = SYSTEM_PROMPT;
    if (leadData && Object.keys(leadData).length > 0) {
      contextPrompt += `\n\nCURRENT LEAD DATA (already collected - don't ask for this info again): ${JSON.stringify(leadData)}`;
      
      // Tell AI which phase we're in
      if (leadData.conversationPhase) {
        contextPrompt += `\n\nCURRENT PHASE: ${leadData.conversationPhase}`;
        if (leadData.conversationPhase === "complete") {
          contextPrompt += "\nIMPORTANT: The qualification flow is COMPLETE. Answer any follow-up questions naturally without repeating the completion message.";
        }
      }
    }

    console.log("Sending to AI, last user message:", messages[messages.length - 1]?.content);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: contextPrompt },
          ...messages,
        ],
        tools: [responseTool],
        tool_choice: { type: "function", function: { name: "send_response" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: "Rate limit exceeded. Please try again in a moment." 
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: "Service temporarily unavailable. Please try again later." 
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI raw response:", JSON.stringify(data).substring(0, 500));

    // Extract tool call response
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall && toolCall.function?.arguments) {
      try {
        const parsedResponse = JSON.parse(toolCall.function.arguments);
        console.log("Parsed response phase:", parsedResponse.conversationPhase, "actions:", parsedResponse.suggestedActions);
        
        return new Response(JSON.stringify({
          text: parsedResponse.text || "Let me think...",
          suggestedActions: parsedResponse.suggestedActions || null,
          extractedData: parsedResponse.extractedData || null,
          conversationPhase: parsedResponse.conversationPhase || "diagnostic"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (parseError) {
        console.error("Failed to parse tool arguments:", parseError);
      }
    }

    // Fallback: try to parse content directly
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      console.log("Falling back to content parsing:", content.substring(0, 200));
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedResponse = JSON.parse(jsonMatch[0]);
          return new Response(JSON.stringify(parsedResponse), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (e) {
        console.error("Content parse failed:", e);
      }
      
      return new Response(JSON.stringify({
        text: content,
        suggestedActions: null,
        extractedData: null,
        conversationPhase: "diagnostic"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("No valid response from AI");

  } catch (error) {
    console.error("alex-chat error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      text: "I'm having a moment—give me a sec and try again!",
      suggestedActions: ["Try again"],
      extractedData: null,
      conversationPhase: "error"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
