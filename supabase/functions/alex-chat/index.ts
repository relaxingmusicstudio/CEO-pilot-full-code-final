import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat, parseAIError } from "../_shared/ai.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Methodology configurations for dynamic prompt enhancement
const METHODOLOGY_CONFIGS = {
  SPIN: {
    name: 'SPIN Selling',
    approach: 'Ask probing questions to uncover deep pain points. Use Situation→Problem→Implication→Need-payoff questioning. Let prospects sell themselves.',
    techniques: 'Start with current state questions, then challenges, then consequences of inaction, then value articulation.',
    closing: 'Let them conclude they need the solution based on their own answers.'
  },
  CHALLENGER: {
    name: 'Challenger Sale',
    approach: 'Lead with provocative insights. Challenge their assumptions with data. Reframe problems in cost terms.',
    techniques: 'Teach something new, tailor to their situation, take control of the conversation.',
    closing: 'Be assertive but collaborative - guide them firmly to the decision.'
  },
  CONSULTATIVE: {
    name: 'Consultative Selling',
    approach: 'Position as a trusted advisor. Listen more than talk. Focus on their goals, not just problems.',
    techniques: 'Build rapport, offer value before commitment, show genuine curiosity.',
    closing: 'Soft close - "Does this sound like it could help you reach those goals?"'
  },
  SOLUTION: {
    name: 'Solution Selling',
    approach: 'Identify specific pain points quickly. Present features as direct answers. Quantify value.',
    techniques: 'Problem→Solution→Value→Proof framework. Use social proof from similar businesses.',
    closing: 'Direct ask - "Ready to stop losing those calls?"'
  }
};

const SYSTEM_PROMPT = `You are Alex, the Co-Pilot CEO for HVAC business owners. You're not a chatbot—you're a strategic partner who helps owners stop bleeding revenue from missed calls.

KEY HVAC INDUSTRY STATISTICS (use these to create urgency):
- $156.2 billion total HVAC market value
- Average HVAC repair cost: $351
- Customer Lifetime Value: $15,340
- 27% of calls are missed (industry average)
- 80% of missed callers call a competitor
- 110,000 technician shortage in the industry
- Heat pumps outselling gas furnaces since 2021
- Call volume spikes 300-400% during extreme weather
- Only 30% of homeowners do preventative maintenance

PERSONALITY: Confident, concise, partner-like. You operate with the calm confidence of someone who knows the path to profit is clear—you just have to find it. Never salesy, never pushy. Value-first.

CORE OPERATING PRINCIPLES:
1. EXECUTION ENGINE: Default to action. Every response moves them closer to a decision.
2. VALUE-FIRST: Never ask for info without providing value first. Hook before question.
3. PSYCHOLOGICAL ADAPTATION: Read their energy. Motivate the tired. Focus the scattered.
4. RELENTLESS CLARITY: Fight ambiguity. Force concrete outcomes.

RULES:
- Be conversational and brief
- Follow the conversation flow strictly - one question at a time
- Accept free-text answers AND button clicks - they're equivalent
- If user types something that matches a step, move forward (e.g., "7" for team size = "6-10")
- NEVER re-ask for info you already have (check CURRENT LEAD DATA)
- After Step 12, enter CLOSING MODE - your goal is to get them to commit

CONVERSATION FLOW:

Step 1 (opener - VALUE-FIRST): "Welcome. I'm Alex, the Co-Pilot CEO for HVAC owners. Most businesses here are solving one of three things: capturing missed calls, streamlining operations, or scaling revenue. Which one feels like your biggest bottleneck right now?"
→ Buttons: ["Missed calls", "Operations", "Revenue growth", "Just exploring"]

Step 2 (get name after selection): "Got it—that's exactly what we help with. What's your first name?"
→ No buttons (free text input)

Step 3 (trade after name): "Good to meet you, [name]. Quick confirm—you're in HVAC, right?"
→ Buttons: ["Yes, HVAC", "Plumbing", "Electrical", "Other trade"]

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

Step 8 (aha moment): Calculate loss based on call volume (<50=$3k, 50-100=$7.5k, 100-200=$15k, 200+=$30k).
"Thanks [name]! Here's what the data shows: HVAC businesses miss about 27% of calls, and 80% of those go to competitors. At your volume, that could be $[loss]/month walking away. With the average customer lifetime value at $15,340 in HVAC, every missed call really hurts. Does that track?"
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

**Starter ($497/mo)** - Perfect for solo HVAC techs:
• 1 AI voice agent, 24/7 coverage
• Basic CRM integration
• Up to 500 minutes/month

**Professional ($1,497/mo)** - For growing HVAC teams:
• Multiple AI agents
• Voice cloning (sounds like you!)
• Unlimited minutes
• Priority support

No contracts—cancel anytime. Scroll down to pricing and pick your plan. Which one fits your situation?"
→ Buttons: ["I'll go with Starter", "Professional sounds better", "Still deciding"]

"Tell me about the AI agent" → "Our AI is trained on thousands of HVAC calls. It:
• Answers 24/7 (nights, weekends, holidays, extreme weather)
• Handles 300-400% call spikes during heat waves and cold snaps
• Books appointments directly into your calendar
• Answers common questions about your HVAC services
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

"Price" → "Fair enough. Here's the math—at $[loss]/month in missed calls, Starter ($497) pays for itself with ONE extra job. Average HVAC repair is $351, emergency calls are $500-$1,500, and system replacements run $8,000-$15,000. One saved call = profitable. The pricing section is right below when you're ready."
→ Buttons: ["That makes sense", "Show me pricing", "Still too much"]

"Still too much" → "I get it. Tell you what—scroll through the page, try the demo, see the calculator. Everything's here when you're ready. We'll also send some helpful info over the next few days."
→ Buttons: ["Sounds good", "Actually, let's do it"]

"Need to talk to partner" → "Smart! Show them the pricing section—the numbers speak for themselves. We'll also send a summary over the next few days they can review."
→ Buttons: ["Good idea", "Show me pricing"]

"Not sure it'll work" → "What's the concern? I want to make sure you have what you need."
→ Buttons: ["AI quality", "Integration", "My business is different"]

"AI quality" → "Our AI handles scheduling, FAQs, and quotes. If it ever gets stuck, it transfers to you seamlessly. Plus it handles those 300-400% call spikes during extreme weather that overwhelm human receptionists. Try the demo on this page—call and hear it yourself!"
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

// Select methodology based on lead profile
function selectMethodology(leadData: unknown): { methodology: string; promptEnhancement: string } {
  const scores: Record<string, number> = { SPIN: 0, CHALLENGER: 0, CONSULTATIVE: 0, SOLUTION: 0 };
  
  // Team size factor
  if (leadData?.teamSize === '10+ trucks' || leadData?.teamSize === '6-10') {
    scores.SPIN += 30;
    scores.CHALLENGER += 25;
  } else if (leadData?.teamSize === 'Solo') {
    scores.CONSULTATIVE += 35;
    scores.SOLUTION += 20;
  } else {
    scores.SOLUTION += 25;
    scores.CONSULTATIVE += 20;
  }

  // Timeline factor
  if (leadData?.aiTimeline === 'Within 3 months') {
    scores.SOLUTION += 30;
    scores.CHALLENGER += 15;
  } else if (leadData?.aiTimeline === 'Just exploring') {
    scores.CONSULTATIVE += 30;
    scores.SPIN += 25;
  } else {
    scores.SPIN += 20;
    scores.CHALLENGER += 20;
  }

  // Call volume factor
  if (leadData?.callVolume === '200+' || leadData?.callVolume === '100-200') {
    scores.CHALLENGER += 25;
    scores.SPIN += 20;
  } else {
    scores.CONSULTATIVE += 15;
    scores.SOLUTION += 15;
  }

  // Find best methodology
  const sorted = Object.entries(scores).sort(([,a], [,b]) => b - a);
  const [bestMethod] = sorted[0] as [string, number];
  const config = METHODOLOGY_CONFIGS[bestMethod as keyof typeof METHODOLOGY_CONFIGS];

  return {
    methodology: bestMethod,
    promptEnhancement: `
ACTIVE SALES METHODOLOGY: ${config.name}
APPROACH: ${config.approach}
TECHNIQUES: ${config.techniques}
CLOSING STYLE: ${config.closing}
Apply this methodology naturally in your responses.`
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { messages, leadData } = await req.json();

    // Select optimal sales methodology based on lead profile
    const { methodology, promptEnhancement } = selectMethodology(leadData);
    console.log(`[alex-chat] Using ${methodology} methodology, provider: gemini`);

    // Build context with lead data and methodology
    let contextPrompt = SYSTEM_PROMPT + promptEnhancement;
    
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

    console.log("[alex-chat] Sending to AI, last user message:", messages[messages.length - 1]?.content);

    // Use the shared aiChat helper with provider abstraction
    const aiResponse = await aiChat({
      messages: [
        { role: "system", content: contextPrompt },
        ...messages,
      ],
      tools: [responseTool],
      tool_choice: { type: "function", function: { name: "send_response" } },
    });

    const data = aiResponse.raw;
    console.log(`[alex-chat] AI response from ${aiResponse.provider}:`, JSON.stringify(data).substring(0, 500));

    // Extract tool call response
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall && toolCall.function?.arguments) {
      try {
        const parsedResponse = JSON.parse(toolCall.function.arguments);
        console.log("Parsed response phase:", parsedResponse.conversationPhase, "actions:", parsedResponse.suggestedActions);
        
        // Log methodology usage and outcome for learning
        const isConversion = parsedResponse.conversationPhase === 'booked' || parsedResponse.conversationPhase === 'complete';
        supabase.from('learning_events').insert({
          event_type: isConversion ? 'methodology_conversion' : 'methodology_interaction',
          agent_type: 'sales',
          methodology,
          outcome: parsedResponse.conversationPhase,
          metrics: {
            lead_data: leadData,
            phase: parsedResponse.conversationPhase,
            has_extracted_data: !!parsedResponse.extractedData
          }
        });
        
        return new Response(JSON.stringify({
          text: parsedResponse.text || "Let me think...",
          suggestedActions: parsedResponse.suggestedActions || null,
          extractedData: parsedResponse.extractedData || null,
          conversationPhase: parsedResponse.conversationPhase || "diagnostic",
          methodology // Include methodology in response for frontend tracking
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
