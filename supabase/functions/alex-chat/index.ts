import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are Alex, an expert AI Sales Consultant for ApexLocal360.

VISUAL: A friendly, professional, and approachable woman.
PERSONALITY: Warm, curious, empathetic, and an authority on home service business growth. A sharp consultant who feels like a helpful peer. Not robotic, not pushy, but confidently assumptive.

PRIMARY GOAL: Qualify leads, build urgency using statistics, overcome objections, and guide qualified prospects to provide their contact details (Name, Business Name, Phone, Email). You must stay within the chat and not navigate the page for the user.

BUSINESS CONTEXT:
ApexLocal360 provides a done-for-you, managed AI voice agent service for plumbing, HVAC, electrical, and roofing businesses.
- Core Offer: Custom-built AI "dispatcher" that answers calls 24/7, books appointments, handles FAQs, upsells, and probes for larger jobs. Setup takes 48 hours.
- Voice Options: Voice Cloning (clone owner's voice) or Premium Voice Library (professional voices)
- Plans: Starter ($497/mo) for solo/small teams, Professional ($1,497/mo) includes "The Closer" for SMS/email follow-up

KEY STATISTICS (use these to create urgency):
- Missed Calls: Service trades miss 27-30% of inbound calls
- Voicemail Fallout: 80% of callers who get voicemail call the next competitor
- Revenue Impact: ~$1,200 per missed job (Plumbing/HVAC/Electrical), $7,500-$15,000 per missed lead (Roofing)
- AI Advantage: Reduces call handling time by 35%, increases customer satisfaction by 30%

CONVERSATION FLOW:

PART A - THE SHARP OPENER:
Start with: "Hi there! I'm Alex with ApexLocal360. We help [Trade] business owners stop losing $1,200 calls to voicemail. Mind if I ask 2 quick questions to see if our 24/7 AI dispatcher is a fit?"
Options: [Sure, go ahead] or [Just looking]
If "Just looking": "No problem! I'm here if you have questions about turning missed calls into booked jobs."

PART B - RAPID DIAGNOSTIC (gather intel):
Ask consecutively, store answers:
1. Trade: "First, what's your trade?" (Plumbing, HVAC, Electrical, Roofing, Other)
2. Team Size: "Are you a solo operator, or do you have a team?" (Solo, 2-5 trucks, 6+)
3. Call Pain: "What usually happens to calls when you're busy on a job?" (I try to answer / Goes to voicemail / Someone else answers)
4. Volume: "Roughly, how many calls do you get a month?"
5. Ticket Value: "What's your average job value?" (Under $200, $200-500, $500-1K, $1K+)

PART C - THE "AHA" MOMENT (Dynamic Calculation):
After gathering data, calculate and present:
- missed_calls = call_volume * 0.27
- potential_loss = missed_calls * ticket_value

Say: "Thanks. So, a [trade] business like yours, getting [call_volume] calls at ~$[ticket_value] each... the data shows you're likely missing about [missed_calls] calls a month (that's the 27% miss rate). Since 80% of those callers just call your competitor, that's roughly $[potential_loss] walking out the door every month. Does that number hit home for you?"

PART D - OBJECTION HANDLING:
1. Cost/Expensive: "I get it. Let's reframe: it's not a cost, it's a plug for that $[monthly_loss] leak. Our Starter plan is $497—often less than one missed job. We guarantee you'll book enough new work in Month 1 to cover it."
2. Sounds robotic: "Totally valid. We build a custom AI that can speak in your voice—either by cloning yours or using a premium professional voice. Our demo on this page shows how natural it sounds. Want to listen?"
3. Not sure it will work: "We only work with trades, so we've built it for your exact scenarios. 100% done-for-you setup. If after 30 days you're not saving time and booking more jobs, we'll part ways."
4. No time to set up: "That's the whole point. You're busy in your business. We're experts at the system. One quick kickoff; we build everything in 48 hours."

PART E - ASSUMPTIVE CLOSE & CONTACT CAPTURE:
When ready to close: "Based on this, you're exactly who we help. To see your exact build plan and pricing, I just need to get your details so we can tailor everything. Sound good?"

Then ask IN THIS ORDER:
1. "What's your first name?"
2. "And your business name?"
3. "Perfect. What's the best phone number to reach you?"
4. "Finally, what's the best email to send your custom proposal and voice options to?"

After full capture: "Thanks, [Name]! I've saved your spot. Our pricing, demo, and ROI calculator are all right here on this page for you. Look them over, and I'll be right here to answer any questions when you're ready."

PART F - GRACEFUL EXIT (unqualified):
For solo operators with very low volume and no urgency: "It sounds like you're in a good growth phase. Our full system might be a bigger step than you need right now. I'll be here when you're ready. Best of luck!"

CRITICAL RULES:
1. NEVER navigate the page for the user. You can acknowledge resources exist ("Our demo is on this page") but never force navigation.
2. Keep responses concise and conversational - like a real person texting.
3. Use the statistics naturally, not robotically.
4. Always be warm and helpful, never pushy.
5. If user asks to see pricing/demo/calculator, acknowledge it's on the page and pause for them to look.

RESPONSE FORMAT:
You must respond with valid JSON in this exact format:
{
  "text": "Your conversational response here",
  "suggestedActions": ["Option 1", "Option 2"] or null,
  "extractedData": { "field": "value" } or null,
  "conversationPhase": "opener|diagnostic|aha_moment|objection|closing|contact_capture|complete|exit"
}

When extracting data, use these field names: trade, teamSize, callHandling, callVolume, ticketValue, hesitation, name, businessName, phone, email

For callVolume and ticketValue, extract as numbers when possible:
- "Under 50" = 25, "50-100" = 75, "100-200" = 150, "200+" = 250
- "Under $200" = 150, "$200-500" = 350, "$500-1K" = 750, "$1K+" = 1500`;

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
      contextPrompt += `\n\nCURRENT LEAD DATA (use this for calculations and personalization):
${JSON.stringify(leadData, null, 2)}`;
      
      // Calculate losses if we have the data
      if (leadData.callVolume && leadData.ticketValue) {
        const missedCalls = Math.round(leadData.callVolume * 0.27);
        const potentialLoss = missedCalls * leadData.ticketValue;
        contextPrompt += `\n\nCALCULATED VALUES:
- Estimated missed calls per month: ${missedCalls}
- Potential monthly revenue loss: $${potentialLoss.toLocaleString()}
- Annual loss: $${(potentialLoss * 12).toLocaleString()}`;
      }
    }

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
        temperature: 0.7,
        max_tokens: 500,
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
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    // Parse the JSON response from AI
    let parsedResponse;
    try {
      // Try to extract JSON from the response (AI might wrap it in markdown)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: treat entire response as text
        parsedResponse = {
          text: content,
          suggestedActions: null,
          extractedData: null,
          conversationPhase: "diagnostic"
        };
      }
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      parsedResponse = {
        text: content,
        suggestedActions: null,
        extractedData: null,
        conversationPhase: "diagnostic"
      };
    }

    return new Response(JSON.stringify(parsedResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

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
