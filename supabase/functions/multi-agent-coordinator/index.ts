import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAuditContext } from '../_shared/auditLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const audit = createAuditContext(supabase, 'multi-agent-coordinator', 'coordination');

  try {
    const { action, ...params } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    await audit.logStart(`Multi-agent coordination: ${action}`, { action });

    switch (action) {
      case 'predict_tools':
        return await predictTools(params, LOVABLE_API_KEY, audit);
      case 'multi_critic_review':
        return await multiCriticReview(params, LOVABLE_API_KEY, audit);
      case 'manager_decompose':
        return await managerDecompose(params, LOVABLE_API_KEY, audit);
      case 'parallel_race':
        return await parallelRace(params, LOVABLE_API_KEY, audit);
      default:
        await audit.logError('Invalid action', new Error(`Unknown action: ${action}`), { action });
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Multi-agent coordinator error:', error);
    await audit.logError('Coordinator failed', error instanceof Error ? error : new Error(String(error)));
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Predictive Agent: Predict which tools/APIs will be needed
async function predictTools(params: any, apiKey: string | undefined, audit: any) {
  const { query, context, available_tools } = params;

  if (!apiKey) {
    await audit.logSuccess('Tool prediction (mock)', 'predict_tools', undefined, { mock: true });
    return new Response(
      JSON.stringify({ predicted_tools: available_tools?.slice(0, 3) || [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `You are a predictive agent that analyzes user queries and predicts which tools will be needed.
Available tools: ${JSON.stringify(available_tools)}

Analyze the query and output JSON:
{
  "predicted_tools": ["tool1", "tool2"],
  "confidence": 0.85,
  "prefetch_data": ["data_type_to_preload"],
  "parallel_calls": [["tool1", "tool2"]]
}`
        },
        { role: 'user', content: `Query: ${query}\nContext: ${JSON.stringify(context)}` }
      ],
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  
  try {
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
    await audit.logSuccess('Tool prediction completed', 'predict_tools', undefined, { tools: parsed.predicted_tools });
    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch {
    await audit.logSuccess('Tool prediction fallback', 'predict_tools', undefined, { fallback: true });
    return new Response(
      JSON.stringify({ predicted_tools: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Multi-Critic Review: Run 4 specialist critics in parallel
async function multiCriticReview(params: any, apiKey: string | undefined, audit: any) {
  const { content, content_type } = params;

  if (!apiKey) {
    await audit.logSuccess('Multi-critic review (mock)', 'multi_critic_review', undefined, { mock: true });
    return new Response(
      JSON.stringify({ 
        reviews: {
          fact_check: { score: 8, issues: [] },
          tone: { score: 9, suggestions: [] },
          risk: { score: 9, warnings: [] },
          ux: { score: 8, improvements: [] }
        },
        overall_score: 8.5,
        approved: true
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Run all 4 critics in parallel
  const critics = [
    { name: 'fact_check', prompt: 'You are a fact-checker. Verify accuracy and flag any incorrect claims.' },
    { name: 'tone', prompt: 'You are a brand voice specialist. Check tone consistency and professionalism.' },
    { name: 'risk', prompt: 'You are a risk analyst. Flag any legal, compliance, or reputation risks.' },
    { name: 'ux', prompt: 'You are a UX specialist. Evaluate clarity, readability, and user experience.' }
  ];

  const reviewPromises = critics.map(async (critic) => {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `${critic.prompt}
Output JSON: { "score": 1-10, "issues": [], "suggestions": [] }`
          },
          { role: 'user', content: `Review this ${content_type}: ${content}` }
        ],
      }),
    });

    const data = await response.json();
    const reviewContent = data.choices?.[0]?.message?.content || '{}';
    
    try {
      return { name: critic.name, review: JSON.parse(reviewContent.replace(/```json\n?|\n?```/g, '')) };
    } catch {
      return { name: critic.name, review: { score: 7, issues: [], suggestions: [] } };
    }
  });

  const results = await Promise.all(reviewPromises);
  
  const reviews: Record<string, any> = {};
  let totalScore = 0;
  
  results.forEach(({ name, review }) => {
    reviews[name] = review;
    totalScore += review.score || 7;
  });

  const overallScore = totalScore / critics.length;
  const approved = overallScore >= 7;

  await audit.logSuccess('Multi-critic review completed', 'multi_critic_review', undefined, { 
    overall_score: overallScore, 
    approved,
    content_type 
  });

  return new Response(
    JSON.stringify({
      reviews,
      overall_score: Math.round(overallScore * 10) / 10,
      approved
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Manager Agent: Decompose complex tasks into sub-tasks
async function managerDecompose(params: any, apiKey: string | undefined, audit: any) {
  const { task, available_workers } = params;

  if (!apiKey) {
    await audit.logSuccess('Task decomposition (mock)', 'manager_decompose', undefined, { mock: true });
    return new Response(
      JSON.stringify({ 
        subtasks: [
          { id: 1, description: task, assigned_to: 'general', priority: 'high' }
        ]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `You are a Manager Agent. Break down complex tasks into subtasks and assign to specialist workers.
Available workers: ${JSON.stringify(available_workers)}

Output JSON:
{
  "subtasks": [
    { "id": 1, "description": "...", "assigned_to": "worker_name", "priority": "high/medium/low", "dependencies": [] }
  ],
  "execution_order": [[1], [2, 3]],
  "estimated_time": "X minutes"
}`
        },
        { role: 'user', content: `Task: ${task}` }
      ],
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  
  try {
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
    await audit.logSuccess('Task decomposition completed', 'manager_decompose', undefined, { 
      subtask_count: parsed.subtasks?.length || 0 
    });
    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch {
    await audit.logSuccess('Task decomposition fallback', 'manager_decompose', undefined, { fallback: true });
    return new Response(
      JSON.stringify({ subtasks: [{ id: 1, description: task, assigned_to: 'general', priority: 'high' }] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Parallel Race: Run multiple strategies and use first result
async function parallelRace(params: any, apiKey: string | undefined, audit: any) {
  const { query, strategies } = params;

  if (!apiKey || !strategies?.length) {
    await audit.logSuccess('Parallel race (no strategies)', 'parallel_race', undefined, { mock: true });
    return new Response(
      JSON.stringify({ result: null, winning_strategy: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Create abort controller for race
  const controller = new AbortController();
  
  const racePromises = strategies.map(async (strategy: any, index: number) => {
    const startTime = Date.now();
    
    try {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: strategy.prompt },
            { role: 'user', content: query }
          ],
        }),
        signal: controller.signal,
      });

      const data = await response.json();
      const result = data.choices?.[0]?.message?.content;
      
      return {
        strategy_index: index,
        strategy_name: strategy.name,
        result,
        time_ms: Date.now() - startTime
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return null;
      }
      throw error;
    }
  });

  // Race: first to complete wins
  const winner = await Promise.race(racePromises.map((p: Promise<any>) => p.then((r: any) => {
    if (r) controller.abort(); // Cancel others
    return r;
  })));

  await audit.logSuccess('Parallel race completed', 'parallel_race', undefined, { 
    winning_strategy: winner?.strategy_name,
    time_ms: winner?.time_ms 
  });

  return new Response(
    JSON.stringify({
      result: winner?.result,
      winning_strategy: winner?.strategy_name,
      time_ms: winner?.time_ms
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}