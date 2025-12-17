import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Task types for automatic model selection
type TaskType = 'classification' | 'yes_no' | 'extraction' | 'summarization' | 'qa' | 'generation' | 'analysis' | 'reasoning' | 'multi_step';

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
  task_type?: TaskType; // NEW: For automatic model selection
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

// Model tiers based on complexity
const MODEL_TIERS = {
  simple: 'google/gemini-2.5-flash-lite',    // Cheapest - 75% cost reduction
  standard: 'google/gemini-2.5-flash',       // Default - balanced
  complex: 'google/gemini-2.5-pro',          // Most capable - rare use
  claude: 'claude-sonnet-4-20250514',        // Claude for deep reasoning
} as const;

// Map task types to complexity levels
type TaskComplexity = 'simple' | 'standard' | 'complex' | 'claude';
const TASK_COMPLEXITY_MAP: Record<TaskType, TaskComplexity> = {
  classification: 'simple',
  yes_no: 'simple',
  extraction: 'simple',
  summarization: 'standard',
  qa: 'standard',
  generation: 'standard',
  analysis: 'complex',
  reasoning: 'claude',  // Route to Claude for deep reasoning
  multi_step: 'claude', // Route to Claude for multi-step tasks
};

// Cost estimates per 1M tokens (in USD)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'google/gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'google/gemini-2.5-flash-lite': { input: 0.02, output: 0.08 },
  'google/gemini-2.5-pro': { input: 1.25, output: 5.00 },
  'openai/gpt-5': { input: 5.00, output: 15.00 },
  'openai/gpt-5-mini': { input: 0.15, output: 0.60 },
  'openai/gpt-5-nano': { input: 0.05, output: 0.20 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
};

// Extended cache TTL for common queries
const EXTENDED_CACHE_TTL = 86400; // 24 hours for FAQ/common responses
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
  failureThreshold: 5,
  resetTimeout: 60000,
  halfOpenRequests: 1,
};

// Fallback model priority
const FALLBACK_MODELS = [
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'openai/gpt-5-nano',
];

function selectModelForTask(taskType?: TaskType, explicitModel?: string): string {
  if (explicitModel) return explicitModel;
  if (!taskType) return MODEL_TIERS.standard;
  const complexity = TASK_COMPLEXITY_MAP[taskType] || 'standard';
  return MODEL_TIERS[complexity];
}

function checkCircuitBreaker(model: string): { allowed: boolean; fallbackModel?: string } {
  const now = Date.now();
  
  if (circuitBreaker.state === 'open') {
    if (now - circuitBreaker.lastFailure > CIRCUIT_BREAKER_CONFIG.resetTimeout) {
      console.log('[CircuitBreaker] Transitioning to half-open state');
      circuitBreaker.state = 'half-open';
    } else {
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

// GOVERNANCE: Premium models reserved for CEO agent only
const CEO_ONLY_MODELS = ['google/gemini-2.5-pro', 'openai/gpt-5', 'claude-sonnet-4-20250514'];
const MONTHLY_SPEND_CAP_USD = 100; // Default cap, can be overridden per tenant

async function checkMonthlySpendCap(supabase: any, agentName: string): Promise<{ allowed: boolean; currentSpend: number; cap: number }> {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: spendData } = await supabase
      .from('ai_cost_log')
      .select('cost_usd')
      .gte('created_at', startOfMonth.toISOString());

    const currentSpend = (spendData || []).reduce((sum: number, row: any) => sum + (row.cost_usd || 0), 0);
    
    // Check if cap exceeded
    const allowed = currentSpend < MONTHLY_SPEND_CAP_USD;
    return { allowed, currentSpend, cap: MONTHLY_SPEND_CAP_USD };
  } catch (error) {
    console.error('[SpendCap] Error checking spend:', error);
    return { allowed: true, currentSpend: 0, cap: MONTHLY_SPEND_CAP_USD };
  }
}

function enforceModelGovernance(requestedModel: string, agentName: string): { model: string; degraded: boolean } {
  // GOVERNANCE: Only CEO agent can use premium models
  if (CEO_ONLY_MODELS.includes(requestedModel) && agentName !== 'ceo-agent') {
    console.log(`[GOVERNANCE] Premium model ${requestedModel} denied for ${agentName} - CEO only`);
    return { model: MODEL_TIERS.standard, degraded: true };
  }
  return { model: requestedModel, degraded: false };
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
      model: explicitModel, 
      stream = false, 
      max_tokens, 
      temperature,
      agent_name = 'unknown',
      priority = 'medium',
      cache_ttl,
      skip_cache = false,
      task_type
    } = requestBody;

    // GOVERNANCE #8: Check monthly spend cap BEFORE processing
    const spendCheck = await checkMonthlySpendCap(supabase, agent_name);
    if (!spendCheck.allowed) {
      console.log(`[GOVERNANCE] Monthly spend cap exceeded: $${spendCheck.currentSpend.toFixed(2)} / $${spendCheck.cap}`);
      
      // Degrade to cheapest model with reduced tokens instead of blocking
      const degradedModel = MODEL_TIERS.simple;
      const degradedMaxTokens = Math.min(max_tokens || 500, 500);
      
      console.log(`[GOVERNANCE] Degrading to ${degradedModel} with max_tokens=${degradedMaxTokens}`);
      
      // Continue with degraded settings (modify the request)
      requestBody.model = degradedModel;
      requestBody.max_tokens = degradedMaxTokens;
    }

    // Smart model selection based on task type
    let selectedModel = selectModelForTask(task_type, explicitModel);
    
    // GOVERNANCE #8: Enforce premium model restriction (CEO only)
    const governanceCheck = enforceModelGovernance(selectedModel, agent_name);
    selectedModel = governanceCheck.model;
    if (governanceCheck.degraded) {
      console.log(`[GOVERNANCE] Model degraded from premium to ${selectedModel} for ${agent_name}`);
    }
    
    const effectiveCacheTtl = cache_ttl || (task_type === 'qa' ? EXTENDED_CACHE_TTL : DEFAULT_CACHE_TTL);

    console.log(`[LLM Gateway] Request from ${agent_name}, priority: ${priority}, model: ${selectedModel}, task: ${task_type || 'unspecified'}, spend: $${spendCheck.currentSpend.toFixed(2)}/$${spendCheck.cap}`);

    // Step 1: Check rate limits
    const rateLimitResult = await checkRateLimit(supabase, agent_name, priority);
    if (!rateLimitResult.allowed) {
      console.log(`[LLM Gateway] Rate limited: ${agent_name}, retry after: ${rateLimitResult.retryAfter}s`);
      await logCost(supabase, agent_name, selectedModel, 0, 0, 0, false, priority, 0, false, 'Rate limited');
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
      const cachedResponse = await checkCache(supabase, messages, selectedModel);
      if (cachedResponse) {
        console.log(`[LLM Gateway] Cache hit for ${agent_name}`);
        await incrementCacheHit(supabase, cachedResponse.id);
        await logCost(supabase, agent_name, selectedModel, cachedResponse.input_tokens || 0, cachedResponse.output_tokens || 0, cachedResponse.cost_estimate || 0, true, priority, Date.now() - startTime, true);
        return new Response(JSON.stringify(cachedResponse.response_json), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT', 'X-Model-Tier': task_type ? TASK_COMPLEXITY_MAP[task_type] : 'standard' },
        });
      }
    }

    // Step 3: Check circuit breaker
    let effectiveModel = selectedModel;
    const circuitCheck = checkCircuitBreaker(selectedModel);
    if (!circuitCheck.allowed && circuitCheck.fallbackModel) {
      console.log(`[LLM Gateway] Circuit breaker triggered, using fallback: ${circuitCheck.fallbackModel}`);
      effectiveModel = circuitCheck.fallbackModel;
      await logAudit(supabase, {
        agent_name: 'llm-gateway',
        action_type: 'circuit_breaker_triggered',
        description: `Circuit open for ${selectedModel}, falling back to ${effectiveModel}`,
        success: true,
      });
    }

// Step 4: Make actual LLM call - Route Claude vs Gemini/OpenAI separately
    const isClaudeModel = effectiveModel.startsWith('claude');
    
    if (isClaudeModel) {
      // Route Claude models to Anthropic API directly
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (!anthropicKey) {
        // Fallback to Gemini if no Anthropic key
        console.log('[LLM Gateway] No ANTHROPIC_API_KEY, falling back to Gemini for complex task');
        effectiveModel = MODEL_TIERS.complex; // Use Gemini Pro instead
      } else {
        console.log(`[LLM Gateway] Routing to Anthropic API: ${effectiveModel}`);
        
        // Convert messages to Anthropic format
        const systemMessage = messages.find(m => m.role === 'system');
        const nonSystemMessages = messages.filter(m => m.role !== 'system');
        
        const anthropicBody: Record<string, unknown> = {
          model: effectiveModel,
          max_tokens: max_tokens || 4096,
          messages: nonSystemMessages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
          })),
        };
        
        if (systemMessage) {
          anthropicBody.system = systemMessage.content;
        }
        
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(anthropicBody),
        });
        
        if (!claudeResponse.ok) {
          const errorText = await claudeResponse.text();
          console.error(`[LLM Gateway] Claude API error (${claudeResponse.status}): ${errorText}`);
          recordFailure();
          
          if (claudeResponse.status === 429) {
            await logCost(supabase, agent_name, effectiveModel, 0, 0, 0, false, priority, Date.now() - startTime, false, 'Claude rate limited');
            return new Response(JSON.stringify({ error: 'Claude rate limited' }), {
              status: 429,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          
          throw new Error(`Claude API error (${claudeResponse.status}): ${errorText}`);
        }
        
        recordSuccess();
        
        // Convert Anthropic response to OpenAI format for consistency
        const anthropicResult = await claudeResponse.json();
        const openAIFormat = {
          id: anthropicResult.id,
          object: 'chat.completion',
          created: Date.now(),
          model: effectiveModel,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: anthropicResult.content?.[0]?.text || ''
            },
            finish_reason: anthropicResult.stop_reason === 'end_turn' ? 'stop' : anthropicResult.stop_reason
          }],
          usage: {
            prompt_tokens: anthropicResult.usage?.input_tokens || 0,
            completion_tokens: anthropicResult.usage?.output_tokens || 0,
            total_tokens: (anthropicResult.usage?.input_tokens || 0) + (anthropicResult.usage?.output_tokens || 0)
          }
        };
        
        const latencyMs = Date.now() - startTime;
        const inputTokens = anthropicResult.usage?.input_tokens || estimateTokens(messages);
        const outputTokens = anthropicResult.usage?.output_tokens || 0;
        const costUsd = calculateCost(effectiveModel, inputTokens, outputTokens);
        
        if (!skip_cache) {
          await cacheResponse(supabase, messages, effectiveModel, openAIFormat, inputTokens, outputTokens, costUsd, effectiveCacheTtl);
        }
        
        await incrementUsage(supabase, agent_name);
        await logCost(supabase, agent_name, effectiveModel, inputTokens, outputTokens, costUsd, false, priority, latencyMs, true);
        
        console.log(`[LLM Gateway] Claude success for ${agent_name}, cost: $${costUsd.toFixed(6)}, latency: ${latencyMs}ms`);
        
        return new Response(JSON.stringify(openAIFormat), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS', 'X-Model': effectiveModel, 'X-Cost': costUsd.toFixed(6) },
        });
      }
    }
    
    // Route Gemini/OpenAI models to Lovable AI Gateway
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const llmRequestBody: Record<string, unknown> = {
      model: effectiveModel,
      messages,
      stream,
    };

    if (max_tokens) llmRequestBody.max_tokens = max_tokens;
    if (temperature !== undefined) llmRequestBody.temperature = temperature;

    console.log(`[LLM Gateway] Routing to Lovable AI Gateway: ${effectiveModel}`);
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(llmRequestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LLM Gateway] API error (${response.status}): ${errorText}`);
      
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
    
    recordSuccess();

    // Step 5: Handle streaming
    if (stream) {
      await incrementUsage(supabase, agent_name);
      await logCost(supabase, agent_name, effectiveModel, 0, 0, 0, false, priority, Date.now() - startTime, true);
      
      return new Response(response.body, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'X-Cache': 'MISS', 'X-Model': effectiveModel },
      });
    }

    // Step 6: Parse response and cache it
    const result = await response.json();
    const latencyMs = Date.now() - startTime;
    
    const inputTokens = estimateTokens(messages);
    const outputTokens = result.usage?.completion_tokens || estimateTokens([{ role: 'assistant', content: result.choices?.[0]?.message?.content || '' }]);
    const costUsd = calculateCost(effectiveModel, inputTokens, outputTokens);

    if (!skip_cache) {
      await cacheResponse(supabase, messages, effectiveModel, result, inputTokens, outputTokens, costUsd, effectiveCacheTtl);
    }

    await incrementUsage(supabase, agent_name);
    await logCost(supabase, agent_name, effectiveModel, inputTokens, outputTokens, costUsd, false, priority, latencyMs, true);

    console.log(`[LLM Gateway] Success for ${agent_name}, model: ${effectiveModel}, cost: $${costUsd.toFixed(6)}, latency: ${latencyMs}ms`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS', 'X-Model': effectiveModel, 'X-Cost': costUsd.toFixed(6) },
    });

  } catch (err) {
    const latencyMs = Date.now() - startTime;
    console.error('[LLM Gateway] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    
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
    const { data: config } = await supabase
      .from('ai_rate_limits')
      .select('*')
      .eq('agent_name', agentName)
      .eq('is_active', true)
      .maybeSingle();

    if (!config) return { allowed: true, retryAfter: 0 };

    const now = new Date();
    const isOffHours = checkOffHours(now, config.off_hours_start, config.off_hours_end);
    const multiplier = isOffHours ? config.off_hours_multiplier : 1;

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
      if (priority !== 'high') {
        return { allowed: false, retryAfter: 60 - now.getSeconds() };
      }
    }

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
    return { allowed: true, retryAfter: 0 };
  }
}

function checkOffHours(now: Date, startTime: string, endTime: string): boolean {
  if (!startTime || !endTime) return false;
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  if (startMinutes > endMinutes) {
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
    await supabase
      .from('ai_response_cache')
      .update({ 
        hit_count: supabase.raw('hit_count + 1'),
        last_accessed_at: new Date().toISOString()
      })
      .eq('id', cacheId);
  } catch (error) {
    console.error('[Cache] Error incrementing hit count:', error);
  }
}

function estimateTokens(messages: Array<{ role: string; content: string }>): number {
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
