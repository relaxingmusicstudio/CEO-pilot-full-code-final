import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { aiChat, parseAIError } from "../_shared/ai.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();

    switch (action) {
      case 'get_daily_priorities':
        return await getDailyPriorities(params);
      case 'simplify_decision':
        return await simplifyDecision(params);
      case 'check_wellness':
        return await checkWellness(params);
      case 'optimize_schedule':
        return await optimizeSchedule(params);
      case 'nurture_relationships':
        return await getNurtureActions(params);
      case 'financial_check':
        return await financialCheck(params);
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Solo optimization error:', error);
    const parsed = parseAIError(error);
    return new Response(
      JSON.stringify({ error: parsed.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Get AI-prioritized daily tasks (max 3)
async function getDailyPriorities(params: unknown) {
  const { tasks, energy_level, time_available } = params;

  try {
    const result = await aiChat({
      messages: [
        {
          role: 'system',
          content: `You are a personal productivity AI for a solo business owner. Your job is to:
1. Select the TOP 3 most impactful tasks for today
2. Consider the owner's energy level (${energy_level}/100) and available time (${time_available} hours)
3. Prioritize revenue-generating and relationship-building tasks
4. Never suggest more than 3 priorities

Output JSON: { "priorities": [{ "title": "...", "reason": "...", "timeEstimate": minutes, "impact": "high/medium/low" }] }`
        },
        {
          role: 'user',
          content: `Here are my pending tasks: ${JSON.stringify(tasks)}. 
Energy level: ${energy_level}/100. Time available: ${time_available} hours.
What are my top 3 priorities for today?`
        }
      ],
      purpose: "daily_priorities",
    });

    try {
      const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, ''));
      return new Response(
        JSON.stringify(parsed),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch {
      return new Response(
        JSON.stringify({ priorities: tasks?.slice(0, 3) || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch {
    return new Response(
      JSON.stringify({ priorities: tasks?.slice(0, 3) || [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Simplify complex decisions to 3 options max
async function simplifyDecision(params: unknown) {
  const { decision, context, constraints } = params;

  try {
    const result = await aiChat({
      messages: [
        {
          role: 'system',
          content: `You are a decision-simplifier AI. You help solo business owners make decisions quickly by:
1. Reducing complex decisions to exactly 3 clear options
2. Highlighting key pros/cons for each
3. Making a clear recommendation
4. Reducing decision fatigue

Output JSON: {
  "options": [{ "label": "...", "pros": ["..."], "cons": ["..."] }],
  "recommendation": 0,
  "reasoning": "..."
}`
        },
        {
          role: 'user',
          content: `Decision: ${decision}\nContext: ${context}\nConstraints: ${constraints}`
        }
      ],
      purpose: "decision_simplification",
    });

    try {
      const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, ''));
      return new Response(
        JSON.stringify(parsed),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch {
      return new Response(
        JSON.stringify({ error: 'Could not parse decision' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch {
    return new Response(
      JSON.stringify({ 
        options: [
          { label: "Option A", pros: ["Quick"], cons: ["Unknown risk"] },
          { label: "Option B", pros: ["Safe"], cons: ["Slower"] },
          { label: "Postpone", pros: ["More info"], cons: ["Delay"] }
        ],
        recommendation: 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Check wellness and suggest interventions
async function checkWellness(params: unknown) {
  const { work_hours_today, decisions_made, last_break, energy_trend } = params;

  const wellness = {
    score: 100,
    alerts: [] as string[],
    suggestions: [] as string[],
  };

  // Simple rule-based wellness check
  if (work_hours_today > 8) {
    wellness.score -= 20;
    wellness.alerts.push("You've worked more than 8 hours today");
    wellness.suggestions.push("Consider wrapping up for the day");
  }

  if (decisions_made > 10) {
    wellness.score -= 15;
    wellness.alerts.push("High decision count today");
    wellness.suggestions.push("Postpone non-urgent decisions to tomorrow");
  }

  if (last_break && (Date.now() - new Date(last_break).getTime()) > 90 * 60 * 1000) {
    wellness.score -= 10;
    wellness.alerts.push("It's been over 90 minutes since your last break");
    wellness.suggestions.push("Take a 10-minute walk or stretch");
  }

  if (energy_trend === 'declining') {
    wellness.score -= 15;
    wellness.suggestions.push("Consider a power nap or healthy snack");
  }

  wellness.score = Math.max(0, wellness.score);

  return new Response(
    JSON.stringify(wellness),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Optimize daily schedule based on energy patterns
async function optimizeSchedule(params: unknown) {
  const { tasks, peak_hours = [9, 10, 11], energy_level } = params;

  // Simple scheduling: high-impact tasks during peak hours
  const scheduled = {
    morning: [] as unknown[],
    afternoon: [] as unknown[],
    evening: [] as unknown[],
    suggestions: [
      "Schedule deep work during your peak hours (9-11 AM)",
      "Save admin tasks for low-energy afternoon periods",
      "End the day with planning for tomorrow"
    ]
  };

  return new Response(
    JSON.stringify(scheduled),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Get relationship nurturing actions
async function getNurtureActions(params: unknown) {
  const { relationships } = params;

  const actions = relationships?.map((rel: unknown) => {
    const daysSinceContact = Math.floor((Date.now() - new Date(rel.last_contact).getTime()) / (1000 * 60 * 60 * 24));
    
    let action = "No action needed";
    let urgency = "low";
    
    if (daysSinceContact > 30) {
      action = "Send a check-in message";
      urgency = "high";
    } else if (daysSinceContact > 14) {
      action = "Share something valuable (article, insight)";
      urgency = "medium";
    } else if (daysSinceContact > 7) {
      action = "Quick touchpoint (emoji response, like)";
      urgency = "low";
    }

    return {
      ...rel,
      days_since_contact: daysSinceContact,
      suggested_action: action,
      urgency
    };
  }) || [];

  return new Response(
    JSON.stringify({ actions }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Financial health check
async function financialCheck(params: unknown) {
  const { cash_balance, monthly_expenses, outstanding_invoices, upcoming_payments } = params;

  const runway = cash_balance / (monthly_expenses || 1);
  const overdue = outstanding_invoices?.filter((inv: unknown) => 
    new Date(inv.due_date) < new Date()
  ) || [];

  const alerts = [];
  const actions = [];

  if (runway < 3) {
    alerts.push({ type: 'critical', message: 'Cash runway is less than 3 months' });
    actions.push('Focus on closing pending deals');
  }

  if (overdue.length > 0) {
    alerts.push({ 
      type: 'warning', 
      message: `${overdue.length} invoice(s) are overdue`,
      total: overdue.reduce((sum: number, inv: unknown) => sum + inv.amount, 0)
    });
    actions.push('Send follow-up reminders for overdue invoices');
  }

  return new Response(
    JSON.stringify({
      runway_months: Math.round(runway * 10) / 10,
      overdue_invoices: overdue,
      alerts,
      suggested_actions: actions,
      health: runway >= 6 ? 'healthy' : runway >= 3 ? 'caution' : 'critical'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
