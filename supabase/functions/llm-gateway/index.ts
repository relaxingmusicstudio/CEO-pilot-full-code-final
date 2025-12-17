import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat, aiChatStream, parseAIError } from "../_shared/ai.ts";

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
  task_type?: string;
}

// Cost estimates per 1M tokens
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gemini-2.0-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
};

function estimateTokens(messages: Array<{ role: string; content: string }>): number {
  return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
}

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] || MODEL_COSTS['gemini-2.0-flash'];
  return (inputTokens * costs.input + outputTokens * costs.output) / 1000000;
}

async function logCost(
  supabase: any,
  agent_name: string,
  model: string,
  input_tokens: number,
  output_tokens: number,
  cost_usd: number,
  cached: boolean,
  priority: string,
  latency_ms: number,
  success: boolean,
  error_message?: string
) {
  try {
    await supabase.from('ai_cost_log').insert({
      agent_name,
      model,
      input_tokens,
      output_tokens,
      cost_usd,
      cached,
      priority,
      latency_ms,
      success,
      error_message,
    });
  } catch (err) {
    console.error('[LLM Gateway] Failed to log cost:', err);
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
      model: requestedModel, 
      stream = false, 
      max_tokens, 
      temperature,
      agent_name = 'unknown',
      priority = 'medium',
    } = requestBody;

    // Normalize model to Gemini
    const model = requestedModel?.includes('gemini') 
      ? requestedModel.replace('google/', '') 
      : 'gemini-2.0-flash';

    console.log(`[LLM Gateway] Request from ${agent_name}, model: ${model}, stream: ${stream}`);

    // Convert messages to AIMessage format
    const aiMessages = messages.map(m => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    }));

    // Handle streaming
    if (stream) {
      try {
        const streamGen = aiChatStream({
          messages: aiMessages,
          model,
          temperature,
          max_tokens,
        });

        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
          async start(controller) {
            try {
              for await (const chunk of streamGen) {
                const sseData = `data: ${JSON.stringify({
                  choices: [{
                    delta: { content: chunk },
                    index: 0,
                  }]
                })}\n\n`;
                controller.enqueue(encoder.encode(sseData));
              }
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            } catch (err) {
              console.error('[LLM Gateway] Stream error:', err);
              controller.error(err);
            }
          }
        });

        await logCost(supabase, agent_name, model, 0, 0, 0, false, priority, Date.now() - startTime, true);

        return new Response(readableStream, {
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      } catch (streamErr) {
        const aiError = parseAIError(streamErr);
        if (aiError.code === 'QUOTA_EXCEEDED') {
          return new Response(JSON.stringify({ error: 'AI quota exceeded', code: 'QUOTA_EXCEEDED' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw streamErr;
      }
    }

    // Non-streaming request
    const response = await aiChat({
      messages: aiMessages,
      model,
      temperature,
      max_tokens,
    });

    const inputTokens = estimateTokens(messages);
    const outputTokens = Math.ceil(response.text.length / 4);
    const costUsd = calculateCost(model, inputTokens, outputTokens);
    const latencyMs = Date.now() - startTime;

    await logCost(supabase, agent_name, model, inputTokens, outputTokens, costUsd, false, priority, latencyMs, true);

    // Return OpenAI-compatible format
    const openAIFormat = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: response.text,
        },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      },
    };

    console.log(`[LLM Gateway] Success for ${agent_name}, cost: $${costUsd.toFixed(6)}, latency: ${latencyMs}ms`);

    return new Response(JSON.stringify(openAIFormat), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[LLM Gateway] Error:', error);
    
    const aiError = parseAIError(error);
    
    if (aiError.code === 'QUOTA_EXCEEDED') {
      return new Response(JSON.stringify({ error: 'AI quota exceeded. Please try again later.', code: 'QUOTA_EXCEEDED' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ error: aiError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
