import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat } from "../_shared/ai.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Discovery stages for progress tracking
const DISCOVERY_STAGES = [
  'industry', 'identity', 'services', 'customers', 'differentiation', 'goals', 'configuration'
];

// Industry templates with statistics
const INDUSTRY_DATA: Record<string, {
  name: string;
  market_size: string;
  missed_call_rate: string;
  avg_job_value: number;
  customer_ltv: number;
  key_stat: string;
}> = {
  hvac: {
    name: 'HVAC',
    market_size: '$156.2B',
    missed_call_rate: '27%',
    avg_job_value: 351,
    customer_ltv: 15340,
    key_stat: '110,000 technician shortage'
  },
  plumbing: {
    name: 'Plumbing',
    market_size: '$130B',
    missed_call_rate: '23%',
    avg_job_value: 290,
    customer_ltv: 12500,
    key_stat: '35% emergency rate'
  },
  solar: {
    name: 'Solar',
    market_size: '$42B',
    missed_call_rate: '18%',
    avg_job_value: 25000,
    customer_ltv: 35000,
    key_stat: '30% federal tax credit'
  },
  roofing: {
    name: 'Roofing',
    market_size: '$56B',
    missed_call_rate: '31%',
    avg_job_value: 8500,
    customer_ltv: 15000,
    key_stat: '400% storm surge volume'
  },
  electrical: {
    name: 'Electrical',
    market_size: '$180B',
    missed_call_rate: '25%',
    avg_job_value: 375,
    customer_ltv: 10000,
    key_stat: '45% EV charger growth'
  }
};

const SYSTEM_PROMPT = `You are an AI business consultant helping set up new businesses on our platform. You're warm, efficient, insightful, and use industry data to show expertise.

## YOUR GOAL
Guide the CEO through a 5-7 minute discovery conversation to fully configure their business. Extract all necessary data to populate business_dna, business_profile, and customize their AI receptionist.

## DISCOVERY STAGES
1. INDUSTRY - Identify their trade/industry, suggest matching template
2. IDENTITY - Business name, location, team size, years in business  
3. SERVICES - What they offer, pricing, specialties, emergency services
4. CUSTOMERS - Who they serve, pain points, typical customer journey
5. DIFFERENTIATION - Competitors, unique selling points, brand personality
6. GOALS - What they want to achieve, timeline, priorities
7. CONFIGURATION - Summarize and generate complete config

## CONVERSATION RULES
- One question at a time
- Offer button options when possible (provide as suggested_actions)
- Use industry statistics to create urgency and show expertise
- Always confirm understanding before moving on
- Be conversational but efficient
- At the end, present a complete preview of their configured business

## INDUSTRY STATISTICS (use these!)
- HVAC: $156B market, 27% missed calls, $351 avg repair, $15,340 LTV, 110k technician shortage
- Plumbing: $130B market, 23% missed calls, $290 avg job, $12,500 LTV, 35% emergency rate
- Solar: $42B market, 18% missed calls, $25,000 avg installation, 30% tax credit
- Roofing: $56B market, 31% missed calls, $8,500 avg job, 400% storm surge
- Electrical: $180B market, 25% missed calls, $375 avg job, 45% EV growth

## RESPONSE FORMAT
Always use the configure_business tool to structure your responses. Include:
- text: Your conversational message
- suggested_actions: Array of button options (if applicable)
- current_stage: Which discovery stage we're in
- extracted_data: Any data extracted from user responses
- configuration_complete: true only when all stages are done

When configuration_complete is true, provide the full business configuration in extracted_data including:
- business_dna (industry, target_customer, brand_voice, products_services, unique_value_proposition, competitors)
- business_profile (services, avg_job_value, service_area, business_hours)
- ai_system_prompt (customized receptionist prompt)
- suggested_template (template_key to use)`;

const responseTool = {
  type: "function",
  function: {
    name: "configure_business",
    description: "Structure your response and extract business configuration data",
    parameters: {
      type: "object",
      properties: {
        text: { 
          type: "string", 
          description: "Your conversational response to the user" 
        },
        suggested_actions: {
          type: "array",
          items: { type: "string" },
          description: "Button options for the user to choose from (max 6)"
        },
        current_stage: {
          type: "string",
          enum: DISCOVERY_STAGES,
          description: "Current stage of the discovery process"
        },
        extracted_data: {
          type: "object",
          description: "Business data extracted from conversation",
          properties: {
            industry: { type: "string" },
            template_key: { type: "string" },
            business_name: { type: "string" },
            location: { type: "string" },
            service_area: { type: "string" },
            team_size: { type: "number" },
            years_in_business: { type: "number" },
            services: { type: "array", items: { type: "string" } },
            avg_job_value: { type: "number" },
            emergency_services: { type: "boolean" },
            target_customers: { type: "string" },
            customer_pain_points: { type: "array", items: { type: "string" } },
            competitors: { type: "array", items: { type: "string" } },
            unique_selling_points: { type: "array", items: { type: "string" } },
            brand_personality: { type: "array", items: { type: "string" } },
            main_goals: { type: "array", items: { type: "string" } },
            business_dna: { type: "object" },
            business_profile: { type: "object" },
            ai_system_prompt: { type: "string" }
          }
        },
        configuration_complete: {
          type: "boolean",
          description: "True when all discovery is complete and ready to provision"
        }
      },
      required: ["text", "current_stage"]
    }
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, currentData } = await req.json();

    // Build context with any extracted data so far
    let contextPrompt = SYSTEM_PROMPT;
    if (currentData && Object.keys(currentData).length > 0) {
      contextPrompt += `\n\n## CURRENT EXTRACTED DATA\n${JSON.stringify(currentData, null, 2)}`;
      
      // Add industry-specific context if known
      if (currentData.industry && INDUSTRY_DATA[currentData.industry]) {
        const industry = INDUSTRY_DATA[currentData.industry];
        contextPrompt += `\n\n## SELECTED INDUSTRY CONTEXT\n${JSON.stringify(industry, null, 2)}`;
      }
    }

    const aiResponse = await aiChat({
      messages: [
        { role: 'system', content: contextPrompt },
        ...messages
      ],
      tools: [responseTool],
      tool_choice: { type: "function", function: { name: "configure_business" } },
      purpose: 'business_discovery',
    });

    const data = aiResponse.raw;
    console.log('AI response:', JSON.stringify(data, null, 2));

    // Extract tool call response
    let result = {
      text: "I'm here to help configure your business. What industry are you in?",
      suggested_actions: ['HVAC', 'Plumbing', 'Solar', 'Roofing', 'Electrical', 'Other'],
      current_stage: 'industry',
      extracted_data: {},
      configuration_complete: false
    };

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        result = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error('Failed to parse tool arguments:', e);
      }
    } else if (data.choices?.[0]?.message?.content) {
      // Fallback to content if no tool call
      result.text = data.choices[0].message.content;
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in business-discovery:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      text: "I apologize, but I encountered an issue. Let's try again - what industry is your business in?",
      suggested_actions: ['HVAC', 'Plumbing', 'Solar', 'Roofing', 'Electrical', 'Other'],
      current_stage: 'industry'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
