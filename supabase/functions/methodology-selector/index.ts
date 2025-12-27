import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SalesMethodology = 'SPIN' | 'CHALLENGER' | 'CONSULTATIVE' | 'SOLUTION';

interface LeadProfile {
  trade?: string;
  teamSize?: string;
  callVolume?: string;
  aiTimeline?: string;
  interests?: string[];
  businessName?: string;
  engagementLevel?: 'low' | 'medium' | 'high';
}

interface MethodologyResult {
  methodology: SalesMethodology;
  confidence: number;
  reasoning: string;
  promptEnhancement: string;
}

// Methodology configurations
const METHODOLOGIES = {
  SPIN: {
    description: 'Situation-Problem-Implication-Need-payoff questioning',
    approach: 'Ask probing questions to uncover deep pain points and let the prospect sell themselves on the solution.',
    techniques: [
      'Start with Situation questions to understand their current state',
      'Move to Problem questions to identify specific challenges',
      'Use Implication questions to explore consequences of inaction',
      'End with Need-payoff questions that let them articulate the value'
    ],
    closingStyle: 'Let them conclude they need the solution based on their own answers'
  },
  CHALLENGER: {
    description: 'Teach-Tailor-Take Control approach',
    approach: 'Challenge their current thinking with industry insights, then reframe their problem with a better solution.',
    techniques: [
      'Lead with a provocative insight they haven\'t considered',
      'Share industry data that challenges their assumptions',
      'Reframe their problem in terms of cost/opportunity',
      'Push back respectfully on objections'
    ],
    closingStyle: 'Assertive but collaborative - guide them firmly to the decision'
  },
  CONSULTATIVE: {
    description: 'Partnership-based problem solving',
    approach: 'Position yourself as a trusted advisor focused on their success, not just selling a product.',
    techniques: [
      'Listen more than you talk',
      'Ask about their goals, not just their problems',
      'Offer value before asking for commitment',
      'Build rapport through genuine curiosity'
    ],
    closingStyle: 'Soft close - "Does this sound like it could help you reach those goals?"'
  },
  SOLUTION: {
    description: 'Problem-Solution-Value-Proof framework',
    approach: 'Focus on the specific problem they have and present the solution as the natural answer.',
    techniques: [
      'Identify the specific pain point quickly',
      'Present solution features as direct answers',
      'Quantify the value in dollars saved/earned',
      'Provide social proof from similar businesses'
    ],
    closingStyle: 'Direct ask - "Ready to stop losing those calls?"'
  }
};

function selectMethodology(lead: LeadProfile, historicalData?: unknown[]): MethodologyResult {
  const scores: Record<SalesMethodology, number> = {
    SPIN: 0,
    CHALLENGER: 0,
    CONSULTATIVE: 0,
    SOLUTION: 0
  };

  // Team size factor
  if (lead.teamSize === '10+ trucks' || lead.teamSize === '6-10') {
    scores.SPIN += 30;
    scores.CHALLENGER += 25;
  } else if (lead.teamSize === 'Solo') {
    scores.CONSULTATIVE += 35;
    scores.SOLUTION += 20;
  } else {
    scores.SOLUTION += 25;
    scores.CONSULTATIVE += 20;
  }

  // Timeline factor
  if (lead.aiTimeline === 'Within 3 months') {
    scores.SOLUTION += 30;
    scores.CHALLENGER += 15;
  } else if (lead.aiTimeline === 'Just exploring') {
    scores.CONSULTATIVE += 30;
    scores.SPIN += 25;
  } else {
    scores.SPIN += 20;
    scores.CHALLENGER += 20;
  }

  // Call volume factor
  if (lead.callVolume === '200+' || lead.callVolume === '100-200') {
    scores.CHALLENGER += 25;
    scores.SPIN += 20;
  } else {
    scores.CONSULTATIVE += 15;
    scores.SOLUTION += 15;
  }

  // Engagement level
  if (lead.engagementLevel === 'low') {
    scores.CHALLENGER += 20;
  } else if (lead.engagementLevel === 'high') {
    scores.SOLUTION += 25;
  }

  // Apply historical effectiveness if available
  if (historicalData && historicalData.length > 0) {
    for (const record of historicalData) {
      if (record.sales_methodology && record.success_score > 0.7) {
        const method = record.sales_methodology as SalesMethodology;
        if (scores[method] !== undefined) {
          scores[method] += Math.round(record.success_score * 15);
        }
      }
    }
  }

  // Find best methodology
  const sorted = Object.entries(scores).sort(([,a], [,b]) => b - a);
  const [bestMethod, bestScore] = sorted[0] as [SalesMethodology, number];
  const confidence = Math.min(95, Math.round((bestScore / 100) * 100));

  const config = METHODOLOGIES[bestMethod];
  const factors: string[] = [];
  if (lead.teamSize) factors.push(`Team: ${lead.teamSize}`);
  if (lead.aiTimeline) factors.push(`Timeline: ${lead.aiTimeline}`);
  if (lead.callVolume) factors.push(`Volume: ${lead.callVolume}`);

  const reasoning = `${bestMethod} selected (${factors.join(', ')}). ${config.approach}`;

  const promptEnhancement = `
ACTIVE SALES METHODOLOGY: ${bestMethod}
${config.description}

APPROACH: ${config.approach}

KEY TECHNIQUES:
${config.techniques.map(t => `- ${t}`).join('\n')}

CLOSING STYLE: ${config.closingStyle}

Apply this methodology naturally. Adapt techniques to the conversation flow.
`;

  return {
    methodology: bestMethod,
    confidence,
    reasoning,
    promptEnhancement
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { leadProfile, action } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === 'select') {
      // Fetch historical effectiveness data
      const { data: historicalData } = await supabase
        .from('agent_memories')
        .select('sales_methodology, success_score, methodology_effectiveness')
        .eq('agent_type', 'sales')
        .not('sales_methodology', 'is', null)
        .order('success_score', { ascending: false })
        .limit(50);

      const result = selectMethodology(leadProfile, historicalData || []);

      // Log this selection for learning
      await supabase.from('learning_events').insert({
        event_type: 'methodology_selection',
        agent_type: 'sales',
        methodology: result.methodology,
        metrics: {
          lead_profile: leadProfile,
          confidence: result.confidence,
          reasoning: result.reasoning
        }
      });

      console.log(`Selected ${result.methodology} with ${result.confidence}% confidence`);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'log_outcome') {
      const { methodology, outcome, conversationId, objections, turnsToClose } = await req.json();
      
      // Calculate effectiveness score
      let score = 50;
      switch (outcome) {
        case 'converted': score += 40; break;
        case 'qualified': score += 20; break;
        case 'nurture': score += 5; break;
        case 'lost': score -= 20; break;
      }
      if (turnsToClose < 10 && outcome === 'converted') score += 10;
      if (objections?.length > 3 && outcome !== 'converted') score -= 10;
      score = Math.max(0, Math.min(100, score));

      // Log learning event
      await supabase.from('learning_events').insert({
        event_type: 'methodology_outcome',
        agent_type: 'sales',
        methodology,
        outcome,
        metrics: {
          score,
          objections,
          turns_to_close: turnsToClose,
          conversation_id: conversationId
        }
      });

      console.log(`Logged ${methodology} outcome: ${outcome} (score: ${score})`);

      return new Response(JSON.stringify({ success: true, score }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('methodology-selector error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
