// Psychological Sales Frameworks for AI Agents
// SPIN Selling, Challenger Sale, Consultative methodologies

export type SalesMethodology = 'SPIN' | 'CHALLENGER' | 'CONSULTATIVE' | 'SOLUTION';

export interface LeadProfile {
  trade?: string;
  teamSize?: string;
  callVolume?: string;
  aiTimeline?: string;
  interests?: string[];
  businessName?: string;
  painPoints?: string[];
  objections?: string[];
  engagementLevel?: 'low' | 'medium' | 'high';
  decisionMaker?: boolean;
}

export interface MethodologyConfig {
  name: SalesMethodology;
  description: string;
  approach: string;
  keyTechniques: string[];
  questionFramework: string[];
  closingStyle: string;
}

// SPIN Selling - Best for complex sales, larger teams
const SPIN_CONFIG: MethodologyConfig = {
  name: 'SPIN',
  description: 'Situation-Problem-Implication-Need-payoff questioning',
  approach: 'Ask probing questions to uncover deep pain points and let the prospect sell themselves on the solution.',
  keyTechniques: [
    'Start with Situation questions to understand their current state',
    'Move to Problem questions to identify specific challenges',
    'Use Implication questions to explore consequences of inaction',
    'End with Need-payoff questions that let them articulate the value'
  ],
  questionFramework: [
    'SITUATION: "How many calls come in during your busiest season?"',
    'PROBLEM: "What happens when you miss calls during a heat wave?"',
    'IMPLICATION: "When those callers go to competitors, what does that cost annually?"',
    'NEED-PAYOFF: "If you could capture 90% of those calls 24/7, how would that impact your revenue?"'
  ],
  closingStyle: 'Let them conclude they need the solution based on their own answers'
};

// Challenger Sale - Best for sophisticated buyers, resistant prospects
const CHALLENGER_CONFIG: MethodologyConfig = {
  name: 'CHALLENGER',
  description: 'Teach-Tailor-Take Control approach',
  approach: 'Challenge their current thinking with industry insights, then reframe their problem with a better solution.',
  keyTechniques: [
    'Lead with a provocative insight they haven\'t considered',
    'Share industry data that challenges their assumptions',
    'Reframe their problem in terms of cost/opportunity',
    'Push back respectfully on objections'
  ],
  questionFramework: [
    'TEACH: "Most HVAC owners think missed calls are just an inconvenience. The data shows it\'s a $90,000/year problem for the average business."',
    'TAILOR: "For a team your size, that translates to roughly [X] per month walking out the door."',
    'TAKE CONTROL: "Here\'s what the top 5% of HVAC companies do differently..."'
  ],
  closingStyle: 'Assertive but collaborative - guide them firmly to the decision'
};

// Consultative Selling - Best for relationship-focused, smaller operators
const CONSULTATIVE_CONFIG: MethodologyConfig = {
  name: 'CONSULTATIVE',
  description: 'Partnership-based problem solving',
  approach: 'Position yourself as a trusted advisor focused on their success, not just selling a product.',
  keyTechniques: [
    'Listen more than you talk',
    'Ask about their goals, not just their problems',
    'Offer value before asking for commitment',
    'Build rapport through genuine curiosity'
  ],
  questionFramework: [
    'DISCOVERY: "What made you start your HVAC business?"',
    'GOALS: "Where do you want the business to be in 2 years?"',
    'OBSTACLES: "What\'s the biggest thing holding you back from getting there?"',
    'BRIDGE: "Let me share how other owners in your position solved that..."'
  ],
  closingStyle: 'Soft close - "Does this sound like it could help you reach those goals?"'
};

// Solution Selling - Best for clear pain points, ready buyers
const SOLUTION_CONFIG: MethodologyConfig = {
  name: 'SOLUTION',
  description: 'Problem-Solution-Value-Proof framework',
  approach: 'Focus on the specific problem they have and present the solution as the natural answer.',
  keyTechniques: [
    'Identify the specific pain point quickly',
    'Present solution features as direct answers',
    'Quantify the value in dollars saved/earned',
    'Provide social proof from similar businesses'
  ],
  questionFramework: [
    'PROBLEM: "You mentioned missing calls is costing you business..."',
    'SOLUTION: "Our AI answers every call in under 3 rings, 24/7..."',
    'VALUE: "At your call volume, that\'s roughly $X/month recovered..."',
    'PROOF: "Smith HVAC saw a 34% increase in booked jobs within 60 days..."'
  ],
  closingStyle: 'Direct ask - "Ready to stop losing those calls?"'
};

export const METHODOLOGIES: Record<SalesMethodology, MethodologyConfig> = {
  SPIN: SPIN_CONFIG,
  CHALLENGER: CHALLENGER_CONFIG,
  CONSULTATIVE: CONSULTATIVE_CONFIG,
  SOLUTION: SOLUTION_CONFIG
};

/**
 * Select optimal sales methodology based on lead profile
 */
export function selectMethodology(lead: LeadProfile): {
  methodology: SalesMethodology;
  confidence: number;
  reasoning: string;
} {
  const scores: Record<SalesMethodology, number> = {
    SPIN: 0,
    CHALLENGER: 0,
    CONSULTATIVE: 0,
    SOLUTION: 0
  };

  // Team size factor
  if (lead.teamSize === '10+ trucks' || lead.teamSize === '6-10') {
    scores.SPIN += 30; // Larger teams = more complex decisions
    scores.CHALLENGER += 25;
  } else if (lead.teamSize === 'Solo') {
    scores.CONSULTATIVE += 35; // Solo operators value relationships
    scores.SOLUTION += 20;
  } else {
    scores.SOLUTION += 25; // 2-5 teams often have clear pain points
    scores.CONSULTATIVE += 20;
  }

  // Timeline factor
  if (lead.aiTimeline === 'Within 3 months') {
    scores.SOLUTION += 30; // Ready to buy = direct approach
    scores.CHALLENGER += 15;
  } else if (lead.aiTimeline === 'Just exploring') {
    scores.CONSULTATIVE += 30; // Not ready = build relationship
    scores.SPIN += 25;
  } else {
    scores.SPIN += 20;
    scores.CHALLENGER += 20;
  }

  // Call volume factor (higher = bigger problem)
  if (lead.callVolume === '200+' || lead.callVolume === '100-200') {
    scores.CHALLENGER += 25; // Big problem = challenge their thinking
    scores.SPIN += 20;
  } else {
    scores.CONSULTATIVE += 15;
    scores.SOLUTION += 15;
  }

  // Engagement level
  if (lead.engagementLevel === 'low') {
    scores.CHALLENGER += 20; // Low engagement = need to provoke
  } else if (lead.engagementLevel === 'high') {
    scores.SOLUTION += 25; // High engagement = close faster
  }

  // Find highest scoring methodology
  const sorted = Object.entries(scores).sort(([,a], [,b]) => b - a);
  const [bestMethod, bestScore] = sorted[0] as [SalesMethodology, number];
  const maxPossible = 100;
  const confidence = Math.min(95, Math.round((bestScore / maxPossible) * 100));

  const reasoning = generateReasoning(bestMethod, lead);

  return {
    methodology: bestMethod,
    confidence,
    reasoning
  };
}

function generateReasoning(method: SalesMethodology, lead: LeadProfile): string {
  const config = METHODOLOGIES[method];
  const factors: string[] = [];

  if (lead.teamSize) {
    factors.push(`Team size: ${lead.teamSize}`);
  }
  if (lead.aiTimeline) {
    factors.push(`Timeline: ${lead.aiTimeline}`);
  }
  if (lead.callVolume) {
    factors.push(`Volume: ${lead.callVolume} calls/month`);
  }

  return `${config.name} selected based on ${factors.join(', ')}. ${config.approach}`;
}

/**
 * Generate methodology-specific system prompt enhancement
 */
export function getMethodologyPrompt(methodology: SalesMethodology): string {
  const config = METHODOLOGIES[methodology];
  
  return `
ACTIVE SALES METHODOLOGY: ${config.name}
${config.description}

APPROACH: ${config.approach}

KEY TECHNIQUES:
${config.keyTechniques.map(t => `- ${t}`).join('\n')}

QUESTION FRAMEWORK:
${config.questionFramework.map(q => `- ${q}`).join('\n')}

CLOSING STYLE: ${config.closingStyle}

Apply this methodology naturally in your responses. Adapt the techniques to the conversation flow.
`;
}

/**
 * Track methodology effectiveness for learning
 */
export interface MethodologyOutcome {
  methodology: SalesMethodology;
  leadProfile: LeadProfile;
  conversationPhase: string;
  outcome: 'converted' | 'qualified' | 'nurture' | 'lost';
  objections: string[];
  turnsToClose: number;
}

export function calculateMethodologyScore(outcome: MethodologyOutcome): number {
  let score = 50; // Base score

  switch (outcome.outcome) {
    case 'converted':
      score += 40;
      break;
    case 'qualified':
      score += 20;
      break;
    case 'nurture':
      score += 5;
      break;
    case 'lost':
      score -= 20;
      break;
  }

  // Bonus for quick closes
  if (outcome.turnsToClose < 10 && outcome.outcome === 'converted') {
    score += 10;
  }

  // Penalty for many objections without conversion
  if (outcome.objections.length > 3 && outcome.outcome !== 'converted') {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}
