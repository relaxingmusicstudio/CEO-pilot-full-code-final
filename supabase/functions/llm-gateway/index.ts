import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LLMRequest {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  agent_name?: string;
  priority?: 'high' | 'medium' | 'low';
  cache_ttl?: number;
  skip_cache?: boolean;
}

interface RateLimit {
  agent_name: string;
  priority_level: string;
  requests_per_minute: number;
  requests_per_hour: number;
  requests_per_day: number;
  off_hours_multiplier: number;
  off_hours_start: string;
  off_hours_end: string;
  is_active: boolean;
}

// Cost estimates per 1M tokens (in USD)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'google/gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'google/gemini-2.5-flash-lite': { input: 0.02, output: 0.08 },
  'google/gemini-2.5-pro': { input: 1.25, output: 5.00 },
  'openai/gpt-5': { input: 5.00, output: 15.00 },
  'openai/gpt-5-mini': { input: 0.15, output: 0.60 },
  'openai/gpt-5-nano': { input: 0.05, output: 0.20 },
};

const DEFAULT_CACHE_TTL = 3600; // 1 hour default

// Circuit breaker state
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  state: 'closed',
};

const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,        // Open circuit after 5 consecutive failures
  resetTimeout: 60000,        // Try again after 60 seconds
  halfOpenRequests: 1,        // Allow 1 request in half-open state
};

// Fallback model priority (if primary fails, try these in order)
const FALLBACK_MODELS = [
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'openai/gpt-5-nano',
];

function checkCircuitBreaker(model: string): { allowed: boolean; fallbackModel?: string } {
  const now = Date.now();
  
  // Check if we should transition from open to half-open
  if (circuitBreaker.state === 'open') {
    if (now - circuitBreaker.lastFailure > CIRCUIT_BREAKER_CONFIG.resetTimeout) {
      console.log('[CircuitBreaker] Transitioning to half-open state');
      circuitBreaker.state = 'half-open';
    } else {
      // Circuit is open, suggest fallback
      const fallback = FALLBACK_MODELS.find(m => m !== model);
      console.log(`[CircuitBreaker] Circuit open, suggesting fallback: ${fallback}`);
      return { allowed: false, fallbackModel: fallback };
    }
  }
  
  return { allowed: true };
}

function recordSuccess() {
  if (circuitBreaker.state === 'half-open') {
    console.log('[CircuitBreaker] Success in half-open, closing circuit');
  }
  circuitBreaker.failures = 0;
  circuitBreaker.state = 'closed';
}

function recordFailure() {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();
  
  if (circuitBreaker.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
    console.log(`[CircuitBreaker] Failure threshold reached (${circuitBreaker.failures}), opening circuit`);
    circuitBreaker.state = 'open';
  }
}

// Audit logging helper
async function logAudit(supabase: any, entry: {
  agent_name: string;
  action_type: string;
  entity_type?: string;
  entity_id?: string;
  description: string;
  success: boolean;
  request_snapshot?: any;
  response_snapshot?: any;
}) {
  try {
    await supabase.from('platform_audit_log').insert({
      timestamp: new Date().toISOString(),
      ...entry,
      request_snapshot: entry.request_snapshot ? JSON.stringify(entry.request_snapshot) : null,
      response_snapshot: entry.response_snapshot ? JSON.stringify(entry.response_snapshot) : null,
    });
  } catch (err) {
    console.error('[AuditLog] Failed to log:', err);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const requestBody: LLMRequest = await req.json();
    const { 
      messages, 
      model = 'google/gemini-2.5-flash', 
      stream = false, 
      max_tokens, 
      temperature,
      agent_name = 'unknown',
      priority = 'medium',
      cache_ttl = DEFAULT_CACHE_TTL,
      skip_cache = false
    } = requestBody;

    console.log(`[LLM Gateway] Request from ${agent_name}, priority: ${priority}, model: ${model}`);

    // Step 1: Check rate limits
    const rateLimitResult = await checkRateLimit(supabase, agent_name, priority);
    if (!rateLimitResult.allowed) {
      console.log(`[LLM Gateway] Rate limited: ${agent_name}, retry after: ${rateLimitResult.retryAfter}s`);
      await logCost(supabase, agent_name, model, 0, 0, 0, false, priority, 0, false, 'Rate limited');
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded', 
        retry_after: rateLimitResult.retryAfter 
      }), {
        status: 429,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimitResult.retryAfter)
        },
      });
    }

    // Step 2: Check cache (for non-streaming requests)
    if (!stream && !skip_cache) {
      const cachedResponse = await checkCache(supabase, messages, model);
      if (cachedResponse) {
        console.log(`[LLM Gateway] Cache hit for ${agent_name}`);
        await incrementCacheHit(supabase, cachedResponse.id);
        await logCost(supabase, agent_name, model, cachedResponse.input_tokens || 0, cachedResponse.output_tokens || 0, cachedResponse.cost_estimate || 0, true, priority, Date.now() - startTime, true);
        return new Response(JSON.stringify(cachedResponse.response_json), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
        });
      }
    }

    // Step 3: Check circuit breaker
    let effectiveModel = model;
    const circuitCheck = checkCircuitBreaker(model);
    if (!circuitCheck.allowed && circuitCheck.fallbackModel) {
      console.log(`[LLM Gateway] Circuit breaker triggered, using fallback: ${circuitCheck.fallbackModel}`);
      effectiveModel = circuitCheck.fallbackModel;
      await logAudit(supabase, {
        agent_name: 'llm-gateway',
        action_type: 'circuit_breaker_triggered',
        description: `Circuit open for ${model}, falling back to ${effectiveModel}`,
        success: true,
      });
    }

    // Step 4: Make actual LLM call
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const llmRequestBody: Record<string, unknown> = {
      model: effectiveModel,
      messages,
      stream,
    };

    if (max_tokens) llmRequestBody.max_tokens = max_tokens;
    if (temperature !== undefined) llmRequestBody.temperature = temperature;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(llmRequestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LLM Gateway] API error (${response.status}): ${errorText}`);
      
      // Record failure for circuit breaker
      recordFailure();
      
      if (response.status === 429) {
        await logCost(supabase, agent_name, effectiveModel, 0, 0, 0, false, priority, Date.now() - startTime, false, 'Provider rate limited');
        return new Response(JSON.stringify({ error: 'AI provider rate limited' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        await logCost(supabase, agent_name, effectiveModel, 0, 0, 0, false, priority, Date.now() - startTime, false, 'Payment required');
        return new Response(JSON.stringify({ error: 'AI credits exhausted' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`LLM API error (${response.status}): ${errorText}`);
    }
    
    // Record success for circuit breaker
    recordSuccess();

    // Step 5: Handle streaming
    if (stream) {
      // For streaming, we can't cache but we still track usage
      await incrementUsage(supabase, agent_name);
      await logCost(supabase, agent_name, effectiveModel, 0, 0, 0, false, priority, Date.now() - startTime, true);
      
      return new Response(response.body, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'X-Cache': 'MISS' },
      });
    }

    // Step 6: Parse response and cache it
    const result = await response.json();
    const latencyMs = Date.now() - startTime;
    
    // Estimate tokens and cost
    const inputTokens = estimateTokens(messages);
    const outputTokens = result.usage?.completion_tokens || estimateTokens([{ role: 'assistant', content: result.choices?.[0]?.message?.content || '' }]);
    const costUsd = calculateCost(effectiveModel, inputTokens, outputTokens);

    // Cache the response
    if (!skip_cache) {
      await cacheResponse(supabase, messages, effectiveModel, result, inputTokens, outputTokens, costUsd, cache_ttl);
    }

    // Increment usage and log cost
    await incrementUsage(supabase, agent_name);
    await logCost(supabase, agent_name, effectiveModel, inputTokens, outputTokens, costUsd, false, priority, latencyMs, true);

    console.log(`[LLM Gateway] Success for ${agent_name}, model: ${effectiveModel}, cost: $${costUsd.toFixed(6)}, latency: ${latencyMs}ms`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    });

  } catch (err) {
    const latencyMs = Date.now() - startTime;
    console.error('[LLM Gateway] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    
    // Log error to audit trail
    await logAudit(supabase, {
      agent_name: 'llm-gateway',
      action_type: 'llm_request_error',
      description: `LLM request failed: ${message} (${latencyMs}ms)`,
      success: false,
      response_snapshot: { error: message },
    });
    
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ========== Helper Functions ==========

async function checkRateLimit(supabase: any, agentName: string, priority: string): Promise<{ allowed: boolean; retryAfter: number }> {
  try {
    // Get rate limit config for this agent
    const { data: config } = await supabase
      .from('ai_rate_limits')
      .select('*')
      .eq('agent_name', agentName)
      .eq('is_active', true)
      .maybeSingle();

    if (!config) {
      // No config = no limit (allow all)
      return { allowed: true, retryAfter: 0 };
    }

    const now = new Date();
    const isOffHours = checkOffHours(now, config.off_hours_start, config.off_hours_end);
    const multiplier = isOffHours ? config.off_hours_multiplier : 1;

    // Check minute window
    const minuteStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
    const { data: minuteUsage } = await supabase
      .from('ai_rate_limit_usage')
      .select('request_count')
      .eq('agent_name', agentName)
      .eq('window_type', 'minute')
      .eq('window_start', minuteStart.toISOString())
      .maybeSingle();

    const minuteLimit = Math.floor(config.requests_per_minute * multiplier);
    if (minuteUsage && minuteUsage.request_count >= minuteLimit) {
      // High priority requests can bypass minute limits
      if (priority !== 'high') {
        return { allowed: false, retryAfter: 60 - now.getSeconds() };
      }
    }

    // Check hour window
    const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    const { data: hourUsage } = await supabase
      .from('ai_rate_limit_usage')
      .select('request_count')
      .eq('agent_name', agentName)
      .eq('window_type', 'hour')
      .eq('window_start', hourStart.toISOString())
      .maybeSingle();

    const hourLimit = Math.floor(config.requests_per_hour * multiplier);
    if (hourUsage && hourUsage.request_count >= hourLimit) {
      return { allowed: false, retryAfter: 3600 - (now.getMinutes() * 60 + now.getSeconds()) };
    }

    return { allowed: true, retryAfter: 0 };
  } catch (error) {
    console.error('[RateLimit] Error checking rate limit:', error);
    // On error, allow the request
    return { allowed: true, retryAfter: 0 };
  }
}

function checkOffHours(now: Date, startTime: string, endTime: string): boolean {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  if (startMinutes > endMinutes) {
    // Crosses midnight (e.g., 22:00 - 06:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

async function incrementUsage(supabase: any, agentName: string) {
  const now = new Date();
  const windows = [
    { type: 'minute', start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes()) },
    { type: 'hour', start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()) },
    { type: 'day', start: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
  ];

  for (const window of windows) {
    await supabase.rpc('increment_ai_usage', {
      p_agent_name: agentName,
      p_window_type: window.type,
      p_window_start: window.start.toISOString()
    }).catch(() => {
      // Fallback to upsert if RPC doesn't exist
      supabase
        .from('ai_rate_limit_usage')
        .upsert({
          agent_name: agentName,
          window_type: window.type,
          window_start: window.start.toISOString(),
          request_count: 1
        }, {
          onConflict: 'agent_name,window_type,window_start'
        });
    });
  }
}

function generateCacheKey(messages: Array<{ role: string; content: string }>, model: string): string {
  const content = JSON.stringify({ messages, model });
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `cache_${model}_${Math.abs(hash).toString(16)}`;
}

async function checkCache(supabase: any, messages: Array<{ role: string; content: string }>, model: string) {
  try {
    const cacheKey = generateCacheKey(messages, model);
    const now = new Date().toISOString();
    
    const { data } = await supabase
      .from('ai_response_cache')
      .select('*')
      .eq('cache_key', cacheKey)
      .gt('expires_at', now)
      .maybeSingle();

    return data;
  } catch (error) {
    console.error('[Cache] Error checking cache:', error);
    return null;
  }
}

async function cacheResponse(
  supabase: any, 
  messages: Array<{ role: string; content: string }>, 
  model: string, 
  response: any,
  inputTokens: number,
  outputTokens: number,
  costEstimate: number,
  ttlSeconds: number
) {
  try {
    const cacheKey = generateCacheKey(messages, model);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    
    await supabase
      .from('ai_response_cache')
      .upsert({
        cache_key: cacheKey,
        prompt_hash: cacheKey,
        messages_hash: cacheKey,
        model,
        response_json: response,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_estimate: costEstimate,
        expires_at: expiresAt,
        hit_count: 0
      }, { onConflict: 'cache_key' });
  } catch (error) {
    console.error('[Cache] Error caching response:', error);
  }
}

async function incrementCacheHit(supabase: any, cacheId: string) {
  try {
    await supabase.rpc('increment_cache_hit', { p_cache_id: cacheId }).catch(() => {
      // Fallback
      supabase
        .from('ai_response_cache')
        .update({ 
          hit_count: supabase.raw('hit_count + 1'),
          last_accessed_at: new Date().toISOString()
        })
        .eq('id', cacheId);
    });
  } catch (error) {
    console.error('[Cache] Error incrementing hit count:', error);
  }
}

function estimateTokens(messages: Array<{ role: string; content: string }>): number {
  // Rough estimate: ~4 chars per token
  const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  return Math.ceil(totalChars / 4);
}

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] || MODEL_COSTS['google/gemini-2.5-flash'];
  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;
  return inputCost + outputCost;
}

async function logCost(
  supabase: any,
  agentName: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  cached: boolean,
  priority: string,
  latencyMs: number,
  success: boolean,
  errorMessage?: string
) {
  try {
    await supabase.from('ai_cost_log').insert({
      agent_name: agentName,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      cached,
      priority,
      latency_ms: latencyMs,
      success,
      error_message: errorMessage
    });
  } catch (error) {
    console.error('[CostLog] Error logging cost:', error);
  }
}
