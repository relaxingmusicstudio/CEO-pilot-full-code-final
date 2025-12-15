// Shared LLM helper functions for edge functions

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Task complexity levels for smart model tiering
export type TaskComplexity = 'simple' | 'standard' | 'complex';

// Task types that can be used for automatic model selection
export type TaskType = 
  | 'classification' 
  | 'yes_no' 
  | 'extraction' 
  | 'summarization' 
  | 'qa' 
  | 'generation' 
  | 'analysis' 
  | 'reasoning' 
  | 'multi_step';

// Model tiers based on complexity
export const MODEL_TIERS = {
  simple: 'google/gemini-2.5-flash-lite',    // Cheapest - 75% cost reduction
  standard: 'google/gemini-2.5-flash',       // Default - balanced
  complex: 'google/gemini-2.5-pro',          // Most capable - rare use
} as const;

// Cost per 1M tokens (in USD)
export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'google/gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'google/gemini-2.5-flash-lite': { input: 0.02, output: 0.08 },
  'google/gemini-2.5-pro': { input: 1.25, output: 5.00 },
  'openai/gpt-5': { input: 5.00, output: 15.00 },
  'openai/gpt-5-mini': { input: 0.15, output: 0.60 },
  'openai/gpt-5-nano': { input: 0.05, output: 0.20 },
};

// Map task types to complexity levels
export const TASK_COMPLEXITY_MAP: Record<TaskType, TaskComplexity> = {
  classification: 'simple',
  yes_no: 'simple',
  extraction: 'simple',
  summarization: 'standard',
  qa: 'standard',
  generation: 'standard',
  analysis: 'complex',
  reasoning: 'complex',
  multi_step: 'complex',
};

/**
 * Automatically select the most cost-effective model based on task type
 */
export function selectModelForTask(taskType?: TaskType, explicitModel?: string): string {
  // If explicit model is provided, use it
  if (explicitModel) {
    return explicitModel;
  }
  
  // If no task type, use standard tier
  if (!taskType) {
    return MODEL_TIERS.standard;
  }
  
  const complexity = TASK_COMPLEXITY_MAP[taskType] || 'standard';
  return MODEL_TIERS[complexity];
}

/**
 * Estimate token count from messages (rough: ~4 chars per token)
 */
export function estimateTokens(messages: Array<{ role: string; content: string }>): number {
  const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  return Math.ceil(totalChars / 4);
}

/**
 * Calculate cost for a request
 */
export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] || MODEL_COSTS['google/gemini-2.5-flash'];
  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;
  return inputCost + outputCost;
}

/**
 * Generate a cache key from messages and model
 */
export function generateCacheKey(messages: Array<{ role: string; content: string }>, model: string): string {
  const content = JSON.stringify({ messages, model });
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `cache_${model}_${Math.abs(hash).toString(16)}`;
}

/**
 * Create a standard error response
 */
export function errorResponse(message: string, status: number = 500): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Create a standard success response
 */
export function successResponse(data: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...headers },
  });
}

/**
 * Handle CORS preflight requests
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}
