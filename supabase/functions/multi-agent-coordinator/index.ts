import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAuditContext } from '../_shared/auditLogger.ts';
import { aiChat, parseAIError } from "../_shared/ai.ts";

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

    await audit.logStart(`Multi-agent coordination: ${action}`, { action });

    switch (action) {
      case 'predict_tools':
        return await predictTools(params, audit);
      case 'multi_critic_review':
        return await multiCriticReview(params, audit);
      case 'manager_decompose':
        return await managerDecompose(params, audit);
      case 'parallel_race':
        return await parallelRace(params, audit);
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
    
    const aiError = parseAIError(error);
    if (aiError.code === 'QUOTA_EXCEEDED') {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded', code: 'QUOTA_EXCEEDED' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function predictTools(params: any, audit: any) {
  const { query, context, available_tools } = params;

  const response = await aiChat({
    messages: [
      {
        role: 'system',
        content: `You are a predictive agent that analyzes user queries and predicts which tools will be needed.
Available tools: ${JSON.stringify(available_tools)}

Analyze the query and output JSON:
{
  "predicted_tools": ["tool1", "tool2"],
  "confidence": 0.85,
  "reasoning": "brief explanation"
}`
      },
      { role: 'user', content: `Query: ${query}\nContext: ${JSON.stringify(context)}` }
    ],
  });

  try {
    let text = response.text.trim();
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);
    
    const result = JSON.parse(text.trim());
    await audit.logSuccess('Tool prediction', 'predict_tools', undefined, result);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    await audit.logSuccess('Tool prediction (fallback)', 'predict_tools', undefined, { raw: response.text });
    return new Response(JSON.stringify({ 
      predicted_tools: available_tools?.slice(0, 3) || [],
      confidence: 0.5,
      reasoning: 'Fallback prediction'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function multiCriticReview(params: any, audit: any) {
  const { content, content_type, critics = ['quality', 'clarity', 'engagement'] } = params;

  const reviewPromises = critics.map(async (critic: string) => {
    const response = await aiChat({
      messages: [
        {
          role: 'system',
          content: `You are a ${critic} critic. Review the content and provide:
{
  "critic_type": "${critic}",
  "score": 1-10,
  "strengths": ["str1", "str2"],
  "weaknesses": ["weak1"],
  "suggestions": ["suggestion1"]
}`
        },
        { role: 'user', content: `Content type: ${content_type}\n\n${content}` }
      ],
    });

    try {
      let text = response.text.trim();
      if (text.startsWith('```json')) text = text.slice(7);
      if (text.startsWith('```')) text = text.slice(3);
      if (text.endsWith('```')) text = text.slice(0, -3);
      return JSON.parse(text.trim());
    } catch {
      return { critic_type: critic, score: 7, strengths: [], weaknesses: [], suggestions: [], error: 'Parse failed' };
    }
  });

  const reviews = await Promise.all(reviewPromises);
  const avgScore = reviews.reduce((sum, r) => sum + (r.score || 0), 0) / reviews.length;

  await audit.logSuccess('Multi-critic review', 'multi_critic_review', undefined, { critics: reviews.length, avgScore });
  
  return new Response(JSON.stringify({
    reviews,
    overall_score: avgScore,
    consensus: avgScore >= 7 ? 'approved' : avgScore >= 5 ? 'needs_revision' : 'rejected'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function managerDecompose(params: any, audit: any) {
  const { task, available_agents = ['content', 'ads', 'sequences', 'inbox', 'social'] } = params;

  const response = await aiChat({
    messages: [
      {
        role: 'system',
        content: `You are a task manager. Decompose complex tasks into subtasks for specialized agents.
Available agents: ${available_agents.join(', ')}

Output JSON:
{
  "subtasks": [
    { "agent": "agent_name", "task": "specific task", "priority": 1-5, "dependencies": [] }
  ],
  "estimated_time_minutes": 30,
  "critical_path": ["subtask1", "subtask2"]
}`
      },
      { role: 'user', content: task }
    ],
  });

  try {
    let text = response.text.trim();
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);
    
    const result = JSON.parse(text.trim());
    await audit.logSuccess('Task decomposition', 'manager_decompose', undefined, { subtasks: result.subtasks?.length });
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch {
    return new Response(JSON.stringify({
      subtasks: [{ agent: 'content', task, priority: 3, dependencies: [] }],
      estimated_time_minutes: 30,
      critical_path: ['task']
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function parallelRace(params: any, audit: any) {
  const { prompt, variants = 3 } = params;

  const racePromises = Array(variants).fill(null).map(async (_, i) => {
    const response = await aiChat({
      messages: [
        {
          role: 'system',
          content: `You are variant ${i + 1}. Generate a unique, creative response. Be distinctive from other variants.`
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8 + (i * 0.1),
    });

    return {
      variant: i + 1,
      response: response.text,
      timestamp: Date.now()
    };
  });

  const results = await Promise.all(racePromises);
  results.sort((a, b) => a.timestamp - b.timestamp);

  await audit.logSuccess('Parallel race', 'parallel_race', undefined, { variants: results.length });
  
  return new Response(JSON.stringify({
    winner: results[0],
    all_results: results,
    fastest_ms: results[0]?.timestamp ? Date.now() - results[0].timestamp : 0
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
