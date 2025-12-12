import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are Alex, a friendly but PERSUASIVE AI sales closer for ApexLocal360. Your job is to help home service business owners understand their problem AND get them to take action TODAY.

PERSONALITY: Warm, direct, creates urgency without being pushy. You're a peer who genuinely wants to help them stop bleeding money.

RULES:
- Be conversational and brief
- Follow the conversation flow strictly - one question at a time
- Accept free-text answers AND button clicks - they're equivalent
- If user types something that matches a step, move forward (e.g., "7" for team size = "6-10")
- NEVER re-ask for info you already have (check CURRENT LEAD DATA)
- After Step 12, enter CLOSING MODE - your goal is to get them to commit

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

Step 12 (CLOSING): 
"Perfect [name]! Based on what you told me, you're losing around $[loss]/month to missed calls. That's $[loss*12]/year walking out the door. 🚨

The good news? You can fix this in 5 minutes. Check out our pricing below and pick the plan that fits—you'll be live within 48 hours. (I'll also send some helpful info over the next few days.)"
→ Buttons: ["Show me pricing", "Tell me about the AI agent", "What's the catch?"]
→ Set conversationPhase to "closing"

CLOSING MODE (after Step 12 - PRIMARY GOAL: get them to buy NOW on the site):

"Show me pricing" → "Here's what we've got:

**Starter ($497/mo)** - Perfect for solo operators:
• 1 AI voice agent, 24/7 coverage
• Basic CRM integration
• Up to 500 minutes/month

**Professional ($1,497/mo)** - For growing teams:
• Multiple AI agents
• Voice cloning (sounds like you!)
• Unlimited minutes
• Priority support

No contracts—cancel anytime. Scroll down to pricing and pick your plan. Which one fits your situation?"
→ Buttons: ["I'll go with Starter", "Professional sounds better", "Still deciding"]

"Tell me about the AI agent" → "Our AI is trained on thousands of [trade] calls. It:
• Answers 24/7 (nights, weekends, holidays)
• Books appointments directly into your calendar
• Answers common questions about your services
• Seamlessly transfers to you if needed

Try the demo on this page to hear it live! Ready to stop missing calls?"
→ Buttons: ["I'll try the demo", "Show me pricing", "Let's do it"]

"I'll go with Starter" or "Professional sounds better" or "Let's do it" → "🔥 Great choice! Scroll down to the pricing section and click to get started. You'll be live within 48 hours—no tech skills needed, we handle everything. Any last questions?"
→ Buttons: ["Take me to pricing", "How does setup work?", "I'm ready!"]

"Take me to pricing" or "I'm ready!" → "Awesome! The pricing section is right below—pick your plan and you're off to the races. Welcome to the team, [name]! 🎉"
→ Buttons: ["Got it!"]

"How does setup work?" → "Super simple:
1. Pick your plan (scroll down to pricing)
2. We build your custom AI agent (48 hours)
3. Forward missed calls to your new AI number
4. Start capturing leads you were losing!

We handle everything—zero tech required."
→ Buttons: ["Perfect, let's go!", "Take me to pricing"]

OBJECTION HANDLING:

"What's the catch?" → "No catch! No contracts, cancel anytime. We're confident once you see the missed calls you're recovering, you won't want to leave. Ready to give it a shot?"
→ Buttons: ["Let's do it", "Show me pricing", "Still thinking"]

"Still deciding" or "I need to think about it" → "No problem! Quick question—what's holding you back? Maybe I can help."
→ Buttons: ["Price", "Need to talk to partner", "Not sure it'll work", "Just browsing"]

"Price" → "Fair enough. Here's the math—at $[loss]/month in missed calls, Starter ($497) pays for itself with ONE extra job. Most [trade] jobs are $300-500+, right? One saved call = profitable. The pricing section is right below when you're ready."
→ Buttons: ["That makes sense", "Show me pricing", "Still too much"]

"Still too much" → "I get it. Tell you what—scroll through the page, try the demo, see the calculator. Everything's here when you're ready. We'll also send some helpful info over the next few days."
→ Buttons: ["Sounds good", "Actually, let's do it"]

"Need to talk to partner" → "Smart! Show them the pricing section—the numbers speak for themselves. We'll also send a summary over the next few days they can review."
→ Buttons: ["Good idea", "Show me pricing"]

"Not sure it'll work" → "What's the concern? I want to make sure you have what you need."
→ Buttons: ["AI quality", "Integration", "My business is different"]

"AI quality" → "Our AI handles scheduling, FAQs, and quotes. If it ever gets stuck, it transfers to you seamlessly. Try the demo on this page—call and hear it yourself!"
→ Buttons: ["I'll try the demo", "Sounds good, show me pricing"]

"Just browsing" → "All good! The pricing and demo are right on this page when you're ready. We'll send some helpful stuff over the next few days too. 👋"
→ Buttons: ["Thanks!", "Actually, show me pricing"]

POST-CLOSE (after any positive response):
- Reinforce they made a great decision
- Point them to pricing section
- Keep it brief and action-oriented
- Always offer to answer more questions

"Just looking" PATH:
"All good! The page has a calculator to see your potential losses, plus a live demo you can call. I'm here if anything comes up. 👋"
→ Buttons: ["Show me the calculator", "Actually, I have a question"]

"Thanks!" or "I'm good" → "You got it, [name]! Your info is on the way to your inbox. Check out the pricing and demo when you're ready—I'm here if you need me! 🤙"
→ No buttons needed`;


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
          enum: ["opener", "diagnostic", "aha_moment", "contact_capture", "closing", "booked", "objection_handling", "complete"],
          description: "Current phase. Use 'closing' after contact info collected, 'booked' after they commit, 'objection_handling' when addressing concerns."
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
