import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Agent Hierarchy - Memory Authority Enforcement
 * - CEO: full long-term memory write
 * - Strategy: summarized memory only
 * - Task & Micro: NO memory write access
 */
type AgentTier = 'ceo' | 'strategy' | 'task' | 'micro';

const AGENT_TIERS: Record<string, AgentTier> = {
  'ceo-agent': 'ceo',
  'funnel-agent': 'strategy',
  'ads-agent': 'strategy',
  'content-agent': 'strategy',
  'social-agent': 'strategy',
  'sequences-agent': 'strategy',
  'finance-agent': 'strategy',
  'inbox-agent': 'strategy',
  'youtube-agent': 'strategy',
  'video-coordinator': 'task',
  'video-router': 'task',
  'video-editor': 'task',
  'video-quality': 'task',
  'video-cost': 'task',
  'lead-enrichment': 'task',
  'analyze-lead': 'task',
  'outreach-agent': 'task',
  'billing-agent': 'task',
  'alex-chat': 'task',
  'content-generator': 'micro',
  'prompt-enhancer': 'micro',
  'embedding-service': 'micro',
  'llm-gateway': 'micro',
};

function getAgentTier(agentType: string): AgentTier {
  const normalized = agentType.toLowerCase().replace(/_/g, '-');
  return AGENT_TIERS[normalized] || 'micro';
}

function canWriteMemory(agentType: string): boolean {
  const tier = getAgentTier(agentType);
  return tier === 'ceo'; // Only CEO can write full memories
}

function canWriteSummary(agentType: string): boolean {
  const tier = getAgentTier(agentType);
  return tier === 'ceo' || tier === 'strategy'; // CEO and Strategy can write summaries
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, ...params } = await req.json();

    switch (action) {
      case 'save':
        return await saveMemory(supabase, params);
      case 'search':
        return await searchMemories(supabase, params);
      case 'update':
        return await updateMemory(supabase, params);
      case 'delete':
        return await deleteMemory(supabase, params);
      case 'stats':
        return await getStats(supabase, params);
      case 'increment_usage':
        return await incrementUsage(supabase, params);
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action. Use: save, search, update, delete, stats, increment_usage' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Agent memory error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Save a new memory with embedding - ENFORCES MEMORY AUTHORITY
async function saveMemory(supabase: unknown, params: unknown) {
  const { agent_type, query, response, metadata = {}, is_summary = false } = params;

  if (!agent_type || !query || !response) {
    return new Response(
      JSON.stringify({ error: 'agent_type, query, and response are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // GOVERNANCE: Enforce memory authority based on agent tier
  const tier = getAgentTier(agent_type);
  
  if (is_summary) {
    // Summary writes require at least Strategy tier
    if (!canWriteSummary(agent_type)) {
      console.log(`[GOVERNANCE] Memory write DENIED for ${agent_type} (tier: ${tier}) - summary write not permitted`);
      return new Response(
        JSON.stringify({ 
          error: 'GOVERNANCE_VIOLATION',
          message: `Agent ${agent_type} (tier: ${tier}) is not authorized to write summaries. Only CEO and Strategy agents can write summaries.`,
          tier,
          allowed: false
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } else {
    // Full memory writes require CEO tier
    if (!canWriteMemory(agent_type)) {
      console.log(`[GOVERNANCE] Memory write DENIED for ${agent_type} (tier: ${tier}) - full memory write not permitted`);
      return new Response(
        JSON.stringify({ 
          error: 'GOVERNANCE_VIOLATION',
          message: `Agent ${agent_type} (tier: ${tier}) is not authorized to write long-term memories. Only AI CEO can write full memories.`,
          tier,
          allowed: false
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  console.log(`[GOVERNANCE] Memory write APPROVED for ${agent_type} (tier: ${tier})`);

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

  // Insert the memory with tier metadata
  const { data, error } = await supabase
    .from('agent_memories')
    .insert({
      agent_type,
      query,
      query_embedding: embedding,
      response,
      metadata: { ...metadata, tier, is_summary },
      success_score: 0.5,
      usage_count: 1,
    })
    .select()
    .single();

  if (error) {
    console.error('Save memory error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Update agent performance
  await updatePerformanceMetric(supabase, agent_type, 'memories_created', 1);

  return new Response(
    JSON.stringify({ success: true, memory: data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Search for similar memories using vector similarity
async function searchMemories(supabase: unknown, params: unknown) {
  const { agent_type, query, threshold = 0.8, limit = 3 } = params;

  if (!query) {
    return new Response(
      JSON.stringify({ error: 'query is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

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
  const queryEmbedding = embeddingData.embeddings;

  // Search using vector similarity with RPC function
  // Since we may not have the RPC function, we'll do a simple query first
  let queryBuilder = supabase
    .from('agent_memories')
    .select('*')
    .gte('success_score', 0.3) // Only get reasonably successful memories
    .order('success_score', { ascending: false })
    .limit(limit * 3); // Get more to filter by similarity

  if (agent_type) {
    queryBuilder = queryBuilder.eq('agent_type', agent_type);
  }

  const { data: memories, error } = await queryBuilder;

  if (error) {
    console.error('Search memories error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Calculate similarity scores in-memory
  const memoriesWithScores = memories
    .filter((m: unknown) => m.query_embedding)
    .map((memory: unknown) => {
      const similarity = cosineSimilarity(queryEmbedding, memory.query_embedding);
      return { ...memory, similarity };
    })
    .filter((m: unknown) => m.similarity >= threshold)
    .sort((a: unknown, b: unknown) => b.similarity - a.similarity)
    .slice(0, limit);

  // Update performance metrics
  if (agent_type && memoriesWithScores.length > 0) {
    await updatePerformanceMetric(supabase, agent_type, 'cache_hits', 1);
  }

  return new Response(
    JSON.stringify({ 
      success: true, 
      memories: memoriesWithScores,
      count: memoriesWithScores.length
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Update memory score based on feedback
async function updateMemory(supabase: unknown, params: unknown) {
  const { memory_id, success_score, metadata } = params;

  if (!memory_id) {
    return new Response(
      JSON.stringify({ error: 'memory_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const updates: unknown = { updated_at: new Date().toISOString() };
  if (success_score !== undefined) updates.success_score = success_score;
  if (metadata) updates.metadata = metadata;

  const { data, error } = await supabase
    .from('agent_memories')
    .update(updates)
    .eq('id', memory_id)
    .select()
    .single();

  if (error) {
    console.error('Update memory error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, memory: data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Delete a memory
async function deleteMemory(supabase: unknown, params: unknown) {
  const { memory_id } = params;

  if (!memory_id) {
    return new Response(
      JSON.stringify({ error: 'memory_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { error } = await supabase
    .from('agent_memories')
    .delete()
    .eq('id', memory_id);

  if (error) {
    console.error('Delete memory error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Get agent stats
async function getStats(supabase: unknown, params: unknown) {
  const { agent_type } = params;

  // Get memory count and avg score
  let memoryQuery = supabase.from('agent_memories').select('*', { count: 'exact' });
  if (agent_type) {
    memoryQuery = memoryQuery.eq('agent_type', agent_type);
  }
  const { count: memoryCount, data: memories } = await memoryQuery;

  // Get performance data
  let perfQuery = supabase
    .from('agent_performance')
    .select('*')
    .order('date', { ascending: false })
    .limit(30);
  if (agent_type) {
    perfQuery = perfQuery.eq('agent_type', agent_type);
  }
  const { data: performance } = await perfQuery;

  // Calculate averages
  const avgScore = memories && memories.length > 0
    ? memories.reduce((sum: number, m: unknown) => sum + (m.success_score || 0), 0) / memories.length
    : 0;

  const totalQueries = performance?.reduce((sum: number, p: unknown) => sum + (p.total_queries || 0), 0) || 0;
  const totalCacheHits = performance?.reduce((sum: number, p: unknown) => sum + (p.cache_hits || 0), 0) || 0;
  const cacheHitRate = totalQueries > 0 ? (totalCacheHits / totalQueries) * 100 : 0;

  return new Response(
    JSON.stringify({
      success: true,
      stats: {
        memory_count: memoryCount || 0,
        avg_success_score: Math.round(avgScore * 100) / 100,
        total_queries: totalQueries,
        cache_hit_rate: Math.round(cacheHitRate * 100) / 100,
        performance_history: performance || [],
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Increment usage count for a memory
async function incrementUsage(supabase: unknown, params: unknown) {
  const { memory_id } = params;

  if (!memory_id) {
    return new Response(
      JSON.stringify({ error: 'memory_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get current memory
  const { data: memory, error: fetchError } = await supabase
    .from('agent_memories')
    .select('usage_count')
    .eq('id', memory_id)
    .single();

  if (fetchError) {
    return new Response(
      JSON.stringify({ error: fetchError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Update usage count
  const { data, error } = await supabase
    .from('agent_memories')
    .update({
      usage_count: (memory?.usage_count || 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', memory_id)
    .select()
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, memory: data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Helper: Update performance metric
async function updatePerformanceMetric(supabase: unknown, agent_type: string, metric: string, value: number) {
  const today = new Date().toISOString().split('T')[0];

  // Try to update existing record
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

// Helper: Calculate cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}
