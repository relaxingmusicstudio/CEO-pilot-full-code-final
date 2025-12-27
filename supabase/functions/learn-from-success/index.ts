import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { 
      memory_id, 
      agent_type,
      query,
      response,
      feedback_type, // 'positive', 'negative', 'rating'
      feedback_value, // 1-5 for rating, 5 for positive, 1 for negative
      feedback_source = 'user',
      metadata = {}
    } = await req.json();

    // If we have a memory_id, update existing memory
    if (memory_id) {
      return await updateExistingMemory(supabase, {
        memory_id,
        feedback_type,
        feedback_value,
        feedback_source,
        metadata
      });
    }

    // If we have query/response and positive feedback, create new memory
    if (query && response && feedback_type === 'positive') {
      return await createNewMemory(supabase, {
        agent_type,
        query,
        response,
        feedback_value,
        feedback_source,
        metadata
      });
    }

    return new Response(
      JSON.stringify({ error: 'Either memory_id or (query + response + positive feedback) is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Learn from success error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Update an existing memory's success score based on feedback
async function updateExistingMemory(supabase: unknown, params: unknown) {
  const { memory_id, feedback_type, feedback_value, feedback_source, metadata } = params;

  // Get current memory
  const { data: memory, error: fetchError } = await supabase
    .from('agent_memories')
    .select('*')
    .eq('id', memory_id)
    .single();

  if (fetchError || !memory) {
    return new Response(
      JSON.stringify({ error: 'Memory not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const oldScore = memory.success_score || 0.5;
  
  // Calculate new score based on feedback
  // Exponential moving average: new_score = old_score * 0.8 + feedback_contribution * 0.2
  let feedbackContribution = 0.5;
  if (feedback_type === 'positive') {
    feedbackContribution = 1.0;
  } else if (feedback_type === 'negative') {
    feedbackContribution = 0.0;
  } else if (feedback_type === 'rating' && feedback_value >= 1 && feedback_value <= 5) {
    feedbackContribution = (feedback_value - 1) / 4; // Normalize 1-5 to 0-1
  }

  const newScore = Math.min(1, Math.max(0, oldScore * 0.8 + feedbackContribution * 0.2));

  // Update memory
  const { error: updateError } = await supabase
    .from('agent_memories')
    .update({
      success_score: newScore,
      usage_count: (memory.usage_count || 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', memory_id);

  if (updateError) {
    console.error('Update memory error:', updateError);
    return new Response(
      JSON.stringify({ error: updateError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Log learning event
  await supabase
    .from('learning_events')
    .insert({
      memory_id,
      event_type: feedback_type === 'positive' ? 'positive_feedback' : 
                  feedback_type === 'negative' ? 'negative_feedback' : 'rating',
      feedback_value: feedback_value || (feedback_type === 'positive' ? 5 : 1),
      feedback_source,
      old_score: oldScore,
      new_score: newScore,
      metadata,
    });

  // Update agent performance
  const performanceMetric = feedback_type === 'positive' ? 'positive_feedback' : 
                           feedback_type === 'negative' ? 'negative_feedback' : 'positive_feedback';
  await updatePerformanceMetric(supabase, memory.agent_type, performanceMetric, 1);

  return new Response(
    JSON.stringify({
      success: true,
      memory_id,
      old_score: oldScore,
      new_score: newScore,
      improvement: newScore - oldScore,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Create a new memory from successful interaction
async function createNewMemory(supabase: unknown, params: unknown) {
  const { agent_type, query, response, feedback_value, feedback_source, metadata } = params;

  // Generate embedding for the query
  const embeddingResponse = await fetch(
    `${Deno.env.get('SUPABASE_URL')}/functions/v1/embedding-service`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
      },
      body: JSON.stringify({ text: query }),
    }
  );

  const embeddingData = await embeddingResponse.json();
  const embedding = embeddingData.embeddings;

  // Calculate initial score based on feedback
  const initialScore = feedback_value ? Math.min(1, Math.max(0.5, feedback_value / 5)) : 0.7;

  // Insert new memory
  const { data: memory, error: insertError } = await supabase
    .from('agent_memories')
    .insert({
      agent_type: agent_type || 'unknown',
      query,
      query_embedding: embedding,
      response,
      success_score: initialScore,
      usage_count: 1,
      metadata: {
        ...metadata,
        created_from_feedback: true,
        initial_feedback_value: feedback_value,
      },
    })
    .select()
    .single();

  if (insertError) {
    console.error('Create memory error:', insertError);
    return new Response(
      JSON.stringify({ error: insertError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Log learning event
  await supabase
    .from('learning_events')
    .insert({
      memory_id: memory.id,
      event_type: 'positive_feedback',
      feedback_value: feedback_value || 5,
      feedback_source,
      old_score: 0,
      new_score: initialScore,
      metadata: { action: 'created_new_memory' },
    });

  // Update agent performance
  await updatePerformanceMetric(supabase, agent_type || 'unknown', 'memories_created', 1);
  await updatePerformanceMetric(supabase, agent_type || 'unknown', 'positive_feedback', 1);

  return new Response(
    JSON.stringify({
      success: true,
      memory_id: memory.id,
      memory,
      message: 'New memory created from successful interaction',
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Helper: Update performance metric
async function updatePerformanceMetric(supabase: unknown, agent_type: string, metric: string, value: number) {
  const today = new Date().toISOString().split('T')[0];

  const { data: existing } = await supabase
    .from('agent_performance')
    .select('*')
    .eq('agent_type', agent_type)
    .eq('date', today)
    .single();

  if (existing) {
    const updates: unknown = {};
    updates[metric] = (existing[metric] || 0) + value;
    
    await supabase
      .from('agent_performance')
      .update(updates)
      .eq('id', existing.id);
  } else {
    const insert: unknown = {
      agent_type,
      date: today,
      [metric]: value,
    };
    
    await supabase
      .from('agent_performance')
      .insert(insert);
  }
}
