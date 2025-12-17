import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat, estimateCostCents, AIChatResponse, AITokenUsage } from "../_shared/ai.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * CEO Training Mode - Capture and learn from CEO decisions
 * Uses AI for deep analysis and pattern extraction
 * 
 * TENANT SAFETY: Derives tenant_id from JWT auth context.
 * COST TRACKING: Uses real token usage from aiChat() response.
 */

interface TrainingSession {
  session_id: string;
  started_at: string;
  transcripts: TranscriptEntry[];
}

interface TranscriptEntry {
  timestamp: string;
  type: 'voice' | 'action' | 'decision';
  content: string;
  context?: Record<string, unknown>;
}

interface DecisionRecord {
  decision_type: string;
  situation: string;
  reasoning: string;
  action_taken: string;
  expected_outcome: string;
  confidence: number;
  tags: string[];
  style_notes?: string;
}

/**
 * Get tenant_id from JWT via database function
 */
async function getTenantIdFromAuth(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const token = authHeader.replace('Bearer ', '');
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    
    const { data, error } = await userClient.rpc('get_user_tenant_id');
    if (error) {
      console.error('[ceo-training] Failed to get tenant_id from auth:', error);
      return null;
    }
    return data as string | null;
  } catch (e) {
    console.error('[ceo-training] Auth tenant lookup error:', e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const authHeader = req.headers.get('authorization');
    const tenantId = await getTenantIdFromAuth(authHeader);
    
    const { action, ...params } = await req.json();
    console.log(`[CEO Training] Action: ${action} tenant=${tenantId || 'global'}`);

    switch (action) {
      case 'start_session':
        return await startSession(supabase);

      case 'add_transcript':
        return await addTranscript(supabase, params);

      case 'process_decision':
        return await processDecision(supabase, params, tenantId);

      case 'end_session':
        return await endSession(supabase, params, tenantId);

      case 'get_training_stats':
        return await getTrainingStats(supabase);

      case 'get_learned_patterns':
        return await getLearnedPatterns(supabase, params);

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    console.error('[CEO Training] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function startSession(supabase: SupabaseClient): Promise<Response> {
  const sessionId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  // Store session start in agent shared state
  await supabase.from('agent_shared_state').upsert({
    key: `ceo_training_session_${sessionId}`,
    value: { session_id: sessionId, started_at: startedAt, transcripts: [] },
    category: 'ceo_training',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hour expiry
  });

  console.log(`[CEO Training] Started session: ${sessionId}`);
  return jsonResponse({ session_id: sessionId, started_at: startedAt });
}

async function addTranscript(
  supabase: SupabaseClient, 
  params: { session_id: string; transcript: string; type?: string; context?: Record<string, unknown> }
): Promise<Response> {
  const { session_id, transcript, type = 'voice', context } = params;

  // Get current session
  const { data: sessionState } = await supabase
    .from('agent_shared_state')
    .select('value')
    .eq('key', `ceo_training_session_${session_id}`)
    .single();

  if (!sessionState) {
    return jsonResponse({ error: 'Session not found' }, 404);
  }

  const session = sessionState.value as TrainingSession;
  
  // Add new transcript entry
  const entry: TranscriptEntry = {
    timestamp: new Date().toISOString(),
    type: type as 'voice' | 'action' | 'decision',
    content: transcript,
    context
  };

  session.transcripts.push(entry);

  // Update session
  await supabase.from('agent_shared_state').update({
    value: session
  }).eq('key', `ceo_training_session_${session_id}`);

  console.log(`[CEO Training] Added transcript to session ${session_id}: ${transcript.substring(0, 50)}...`);
  return jsonResponse({ success: true, transcript_count: session.transcripts.length });
}

async function processDecision(
  supabase: SupabaseClient, 
  params: { 
    session_id?: string; 
    transcript: string; 
    context?: Record<string, unknown>;
    decision_type?: string;
  },
  tenantId: string | null
): Promise<Response> {
  const { transcript, context, decision_type } = params;

  // Use AI for decision analysis with premium routing for CEO training
  const analysisPrompt = `You are analyzing a CEO's decision-making process to help an AI learn to mimic their style.

The CEO just made this decision or statement:
"${transcript}"

Context: ${JSON.stringify(context || {})}

Extract and structure the decision in this exact JSON format:
{
  "decision_type": "${decision_type || 'general'}", 
  "situation": "Brief description of the situation that required a decision",
  "reasoning": "The CEO's reasoning process - why they made this choice",
  "action_taken": "What specific action was decided on",
  "expected_outcome": "What the CEO expects to happen as a result",
  "confidence": 0.85, // How confident the CEO seemed (0-1)
  "tags": ["relevant", "tags", "for", "categorization"],
  "style_notes": "Notes about the CEO's communication style, tone, and approach"
}

Focus on capturing:
1. The decision-making framework they use
2. What factors they prioritize
3. Their risk tolerance
4. Their communication style
5. How they balance speed vs. thoroughness

Return ONLY the JSON, no other text.`;

  console.log('[CEO Training] Using AI for decision analysis');
  
  let aiResponse: AIChatResponse;
  let analysisResult: DecisionRecord;
  
  try {
    aiResponse = await aiChat({
      messages: [{ role: 'user', content: analysisPrompt }],
      purpose: 'ceo_strategy', // Premium routing for CEO analysis
      max_tokens: 1024,
    });

    const responseText = aiResponse.text || '';
    
    try {
      // Strip markdown if present
      let jsonText = responseText.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
      }
      analysisResult = JSON.parse(jsonText);
    } catch {
      console.error('[CEO Training] Failed to parse AI response:', responseText);
      throw new Error('Failed to parse decision analysis');
    }
  } catch (e) {
    console.error('[CEO Training] AI analysis failed:', e);
    throw new Error('AI analysis failed');
  }

  // Generate embedding for the decision (non-blocking, optional)
  let embedding: number[] | null = null;
  try {
    const embeddingResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/embedding-service`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
      },
      body: JSON.stringify({ text: `${analysisResult.situation} ${analysisResult.reasoning} ${analysisResult.action_taken}` })
    });
    
    if (embeddingResponse.ok) {
      const embeddingData = await embeddingResponse.json();
      embedding = embeddingData.embeddings?.[0];
    }
  } catch (e) {
    console.error('[CEO Training] Embedding generation failed (non-fatal):', e);
  }

  // Store the decision as an agent memory
  const { data: memory, error } = await supabase.from('agent_memories').insert({
    agent_type: 'ceo-training',
    query: transcript,
    response: JSON.stringify(analysisResult),
    query_embedding: embedding ? `[${embedding.join(',')}]` : null,
    success_score: analysisResult.confidence || 0.8,
    usage_count: 1,
    metadata: {
      decision_type: analysisResult.decision_type,
      tags: analysisResult.tags,
      context,
      style_notes: analysisResult.style_notes
    }
  }).select().single();

  if (error) {
    console.error('[CEO Training] Failed to store decision:', error);
    throw error;
  }

  // ─────────────────────────────────────────────────────────
  // LOG TO ceo_decisions TABLE WITH REAL COST DATA
  // ─────────────────────────────────────────────────────────
  
  const tokensUsed = aiResponse.usage?.total_tokens || 0;
  const costCents = estimateCostCents(aiResponse.provider, aiResponse.model, aiResponse.usage);

  const { data: ceoDecision, error: decisionError } = await supabase.from('ceo_decisions').insert({
    decision: analysisResult.action_taken,
    reasoning: analysisResult.reasoning,
    confidence: analysisResult.confidence || 0.8,
    expected_impact: {
      outcome: analysisResult.expected_outcome,
      decision_type: analysisResult.decision_type,
    },
    purpose: 'ceo_strategy',
    model_used: aiResponse.model,
    provider_used: aiResponse.provider,
    tokens_estimated: tokensUsed,
    cost_estimated_cents: costCents,
    context_snapshot: {
      original_transcript: transcript,
      tags: analysisResult.tags,
      style_notes: analysisResult.style_notes,
    },
    status: 'pending',
    tenant_id: tenantId,
  }).select().single();

  if (decisionError) {
    console.error('[CEO Training] Failed to log ceo_decision (non-fatal):', decisionError);
    // Non-fatal - continue execution
  } else {
    console.log(`[CEO Training] Logged CEO decision: ${ceoDecision?.id}`);
  }

  // ─────────────────────────────────────────────────────────
  // LOG COST TO agent_cost_tracking WITH REAL VALUES
  // ─────────────────────────────────────────────────────────
  const { error: costError } = await supabase.from('agent_cost_tracking').insert({
    agent_type: 'ceo-training',
    purpose: 'ceo_strategy',
    model: aiResponse.model,
    provider: aiResponse.provider,
    api_calls: 1,
    tokens_used: tokensUsed,
    cost_cents: costCents,
    avg_latency_ms: aiResponse.latency_ms || null,
  });
  if (costError) console.error('[CEO Training] Cost tracking failed:', costError);

  console.log(`[CEO Training] Processed decision. provider=${aiResponse.provider} model=${aiResponse.model} tokens=${tokensUsed} cost_cents=${costCents}`);
  
  return jsonResponse({ 
    success: true, 
    decision: analysisResult,
    memory_id: memory?.id,
    ceo_decision_id: ceoDecision?.id,
    cost_info: {
      provider: aiResponse.provider,
      model: aiResponse.model,
      tokens_used: tokensUsed,
      cost_cents: costCents,
    },
  });
}

async function endSession(
  supabase: SupabaseClient, 
  params: { session_id: string },
  tenantId: string | null
): Promise<Response> {
  const { session_id } = params;

  // Get session data
  const { data: sessionState } = await supabase
    .from('agent_shared_state')
    .select('value')
    .eq('key', `ceo_training_session_${session_id}`)
    .single();

  if (!sessionState) {
    return jsonResponse({ error: 'Session not found' }, 404);
  }

  const session = sessionState.value as TrainingSession;
  const duration = new Date().getTime() - new Date(session.started_at).getTime();

  // Process all transcripts that haven't been processed
  const decisions: DecisionRecord[] = [];
  for (const entry of session.transcripts.filter(t => t.type === 'decision')) {
    try {
      const result = await processDecisionInternal(supabase, entry.content, entry.context, tenantId);
      if (result) decisions.push(result);
    } catch (e) {
      console.error('[CEO Training] Failed to process entry:', e);
    }
  }

  // Delete session state
  await supabase.from('agent_shared_state').delete().eq('key', `ceo_training_session_${session_id}`);

  // Log session completion
  await supabase.from('platform_audit_log').insert({
    timestamp: new Date().toISOString(),
    agent_name: 'ceo-training',
    action_type: 'training_session_completed',
    description: `Training session completed: ${session.transcripts.length} entries, ${decisions.length} decisions processed`,
    success: true,
    response_snapshot: JSON.stringify({
      session_id,
      duration_ms: duration,
      transcript_count: session.transcripts.length,
      decisions_processed: decisions.length
    })
  });

  console.log(`[CEO Training] Ended session ${session_id}: ${decisions.length} decisions processed`);
  return jsonResponse({
    success: true,
    session_id,
    duration_ms: duration,
    transcripts_count: session.transcripts.length,
    decisions_processed: decisions.length
  });
}

async function processDecisionInternal(
  supabase: SupabaseClient, 
  transcript: string, 
  context?: Record<string, unknown>,
  tenantId?: string | null
): Promise<DecisionRecord | null> {
  // Simplified internal processing
  try {
    const result = await processDecision(supabase, { transcript, context }, tenantId || null);
    const body = await result.json();
    return body.decision;
  } catch {
    return null;
  }
}

async function getTrainingStats(supabase: SupabaseClient): Promise<Response> {
  // Get training statistics
  const [memoriesResult, patternsResult, sessionsResult] = await Promise.all([
    supabase
      .from('agent_memories')
      .select('*', { count: 'exact' })
      .eq('agent_type', 'ceo-training'),
    supabase
      .from('user_patterns')
      .select('*', { count: 'exact' })
      .eq('pattern_type', 'ceo_decision'),
    supabase
      .from('platform_audit_log')
      .select('*', { count: 'exact' })
      .eq('action_type', 'training_session_completed')
  ]);

  // Get recent decisions
  const { data: recentDecisions } = await supabase
    .from('agent_memories')
    .select('*')
    .eq('agent_type', 'ceo-training')
    .order('created_at', { ascending: false })
    .limit(10);

  // Calculate average confidence
  const avgConfidence = recentDecisions 
    ? recentDecisions.reduce((sum: number, d: { success_score?: number }) => sum + (d.success_score || 0), 0) / (recentDecisions.length || 1)
    : 0;

  interface MemoryRecord {
    id: string;
    created_at: string;
    success_score?: number;
    metadata?: { decision_type?: string };
  }

  return jsonResponse({
    total_decisions: memoriesResult.count || 0,
    patterns_detected: patternsResult.count || 0,
    sessions_completed: sessionsResult.count || 0,
    average_confidence: avgConfidence,
    recent_decisions: recentDecisions?.map((d: MemoryRecord) => ({
      id: d.id,
      created_at: d.created_at,
      decision_type: d.metadata?.decision_type,
      confidence: d.success_score
    }))
  });
}

async function getLearnedPatterns(
  supabase: SupabaseClient, 
  params: { limit?: number }
): Promise<Response> {
  const limit = params.limit || 20;

  // Get high-confidence decisions grouped by type
  const { data: decisions } = await supabase
    .from('agent_memories')
    .select('*')
    .eq('agent_type', 'ceo-training')
    .gte('success_score', 0.7)
    .order('usage_count', { ascending: false })
    .limit(limit);

  interface MemoryRecord {
    id: string;
    query: string;
    response: string;
    success_score?: number;
    usage_count?: number;
    metadata?: { decision_type?: string; tags?: string[] };
  }

  // Group by decision type
  const patternsByType = (decisions || []).reduce((acc: Record<string, unknown[]>, d: MemoryRecord) => {
    const type = d.metadata?.decision_type || 'general';
    if (!acc[type]) acc[type] = [];
    acc[type].push({
      id: d.id,
      situation: d.query,
      reasoning: d.response,
      confidence: d.success_score,
      usage_count: d.usage_count,
      tags: d.metadata?.tags
    });
    return acc;
  }, {} as Record<string, unknown[]>);

  return jsonResponse({
    patterns_by_type: patternsByType,
    total_patterns: decisions?.length || 0
  });
}
