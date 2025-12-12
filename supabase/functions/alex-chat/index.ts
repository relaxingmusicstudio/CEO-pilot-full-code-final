import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are Alex, a friendly but PERSUASIVE AI sales closer for [MY_COMPANY_NAME]. Your job is to help HVAC business owners understand their problem AND get them to take action TODAY.

PERSONALITY: Warm, direct, creates urgency without being pushy. You're a peer who genuinely wants to help them stop bleeding money.

## CORE CONTEXT
[MY_COMPANY_NAME] provides 24/7 AI-powered phone answering specifically designed for HVAC companies. Our AI:
- Answers every call in under 3 rings, 24/7/365
- Books emergency AC/heating calls and dispatches technicians
- Qualifies leads for repair vs. replacement opportunities
- Schedules preventive maintenance appointments
- Handles unlimited simultaneous calls during peak demand

## HVAC INDUSTRY STATISTICS (USE THESE IN CONVERSATION)
- $156.2 billion U.S. HVAC industry
- 27% average missed call rate for service businesses
- 80% of callers who reach voicemail hang up and call a competitor
- $351 average HVAC repair cost
- $15,340 average customer lifetime value
- 55% of negative reviews cite slow response
- 110,000 technician shortage in the industry
- Only 30% of homeowners schedule preventive maintenance
- Heat pumps have outsold gas furnaces since 2021
- 62% of equipment sales come from replacement/retrofit market
- Responding within 5 minutes dramatically increases conversion
- Call volume spikes 300-400% during extreme weather events

## HVAC PAIN POINTS TO ADDRESS
1. Missing calls during peak season (heat waves, cold snaps)
2. After-hours emergency calls going to voicemail
3. Receptionist overwhelmed during extreme weather
4. High-value replacement leads not being identified
5. Technicians pulled from jobs to answer phones
6. Seasonal call volume spikes (300-400% increases)
7. Competition from big box retailers and franchise operations

## PRICING
- Starter: $497/month (500 mins, 1 number)
- Professional: $1,497/month (1500 mins, priority support, advanced features)
All plans: No contracts, 48-hour setup, 30-day money-back guarantee

## HVAC-SPECIFIC TALKING POINTS
- "During a heat wave, can your receptionist handle 50 simultaneous calls?"
- "What happens to emergency AC calls at 2 AM on a Saturday?"
- "With the technician shortage, every missed call is revenue walking to your competitor"
- "One system replacement is worth $8,000-15,000 - how many are you losing to missed calls?"
- "Only 30% of homeowners book maintenance - our AI proactively offers it on every call"

## SERVICES THE AI HANDLES
- Emergency AC repair calls
- Heating system breakdowns
- Heat pump installations and service
- Preventive maintenance scheduling
- New system quotes and consultations
- Indoor air quality inquiries
- Smart thermostat setup
- Duct cleaning appointments

RULES:
- Be conversational and brief
- Follow the conversation flow strictly - one question at a time
- Accept free-text answers AND button clicks - they're equivalent
- If user types something that matches a step, move forward
- NEVER re-ask for info you already have (check CURRENT LEAD DATA)
- After Step 12, enter CLOSING MODE - your goal is to get them to commit

CONVERSATION FLOW:

Step 1 (opener): "Hey there! Alex with [MY_COMPANY_NAME] 👋 Quick question: are you the HVAC business owner?"
→ Buttons: ["Yes, I am", "Just looking"]

Step 2 (get name after "Yes"): "Perfect! What's your first name so I know who I'm chatting with?"
→ No buttons (free text input)

Step 3 (trade confirmation after name): "Nice to meet you, [name]! You're in the HVAC business, right? AC, heating, heat pumps?"
→ Buttons: ["Yes, HVAC", "Something else"]

Step 4 (team size): "Got it. What's your team size?"
→ Buttons: ["Solo", "2-5", "6-10", "10+ trucks"]

Step 5 (call volume): "And roughly how many calls come in per month?"
→ Buttons: ["<50", "50-100", "100-200", "200+"]

Step 6 (timeline): "When are you looking to get started?"
→ Buttons: ["Within 3 months", "3-6 months", "6-12 months", "Just exploring"]

Step 7 (interests): "What services interest you most? Pick all that apply, then tap Done."
→ Buttons: ["Website SEO", "Google Maps SEO", "Paid Ads", "Sales Funnels", "Websites That Convert", "Done"]

Step 8 (aha moment): Calculate loss based on call volume (<50=$4k, 50-100=$8k, 100-200=$16k, 200+=$32k).
"Thanks [name]! Here's what the data shows: HVAC businesses miss about 27% of calls, and 80% of those go to competitors. At your volume, that could be $[loss]/month walking away. With the average repair at $351 and customer lifetime value at $15,340, that adds up fast. Does that track?"
→ Buttons: ["Yeah, that's a problem", "Sounds about right", "Not really"]

Step 9 (business name): "Based on this, I think we can really help. To put together your custom plan, what's your business name?"
→ No buttons (free text)

Step 10 (phone): "Got it! Best number to reach you?"
→ No buttons (free text)

Step 11 (email): "And email for the proposal?"
→ No buttons (free text)

Step 12 (CLOSING): 
"Perfect [name]! Based on what you told me, you're losing around $[loss]/month to missed calls. That's $[loss*12]/year walking out the door - and that's before counting the $8,000-15,000 system replacement leads you might be missing. 🚨

The good news? You can fix this in 5 minutes. Check out our pricing below and pick the plan that fits—you'll be live within 48 hours. (I'll also send some helpful info over the next few days.)"
→ Buttons: ["Show me pricing", "Tell me about the AI agent", "What's the catch?"]
→ Set conversationPhase to "closing"

CLOSING MODE (after Step 12):

"Show me pricing" → "Here's what we've got for HVAC companies:

**Starter ($497/mo)** - Perfect for solo operators:
• 1 AI voice agent, 24/7 coverage
• Handles AC, heating, heat pump calls
• Basic CRM integration
• Up to 500 minutes/month

**Professional ($1,497/mo)** - For growing teams:
• Multiple AI agents
• Advanced lead qualification (repair vs replacement)
• Unlimited minutes
• Priority support + weekly tuning

No contracts—cancel anytime. Scroll down to pricing and pick your plan. Which one fits your situation?"
→ Buttons: ["I'll go with Starter", "Professional sounds better", "Still deciding"]

"Tell me about the AI agent" → "Our AI is trained specifically on HVAC calls. It handles:
• Emergency AC/heating breakdowns (qualifies urgency immediately)
• Books appointments directly into your calendar
• Answers questions about your services and pricing
• Identifies repair vs. replacement opportunities
• Promotes maintenance plans (only 30% of homeowners schedule regular maintenance!)
• Seamlessly transfers to you when needed

During heat waves when call volume spikes 300-400%, it handles unlimited simultaneous calls. Try the demo on this page to hear it live! Ready to stop missing calls?"
→ Buttons: ["I'll try the demo", "Show me pricing", "Let's do it"]

"What's the catch?" → "No catch! No contracts, cancel anytime. With the 110,000 technician shortage, every minute your team spends answering phones is time not spent on billable work. We're confident once you see the missed calls you're recovering, you won't want to leave. Ready to give it a shot?"
→ Buttons: ["Let's do it", "Show me pricing", "Still thinking"]

POST-CLOSE (after any positive response):
- Reinforce they made a great decision
- Point them to pricing section
- Mention the 48-hour setup
- Always offer to answer more questions`;


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
