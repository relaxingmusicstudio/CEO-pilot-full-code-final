/**
 * AI Provider Abstraction Layer - Multi-Provider with Premium Routing
 * 
 * Environment Variables:
 * - GEMINI_API_KEY: Key for Google Gemini API (required for gemini provider)
 * - OPENAI_API_KEY: Key for OpenAI API (required for openai provider)
 * - AI_PROVIDER: Default provider (default: "gemini")
 * - AI_MODEL_DEFAULT: Default model (default: "gemini-2.0-flash")
 * - AI_PROVIDER_PREMIUM: Premium provider for escalated calls (optional)
 * - AI_MODEL_PREMIUM: Premium model (optional)
 * - AI_PREMIUM_ACTIONS: CSV of purposes that escalate to premium (optional)
 * 
 * Features:
 * - aiChat: Text chat completion with purpose-based routing
 * - aiVision: Real multimodal vision analysis
 * - aiChatStream: Streaming chat for Gemini
 * - aiImage: Image generation (returns error on free tier)
 * - Quota-safe: Retry with backoff, structured error codes
 * - In-memory caching for identical requests
 * - Structured logging: provider, model, purpose, latency_ms
 * - Token usage tracking for cost estimation
 */

export type AIProvider = "gemini" | "openai" | "anthropic";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIChatOptions {
  messages: AIMessage[];
  model?: string;
  provider?: AIProvider;
  purpose?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: any[];
  tool_choice?: any;
}

export interface AIVisionOptions {
  system?: string;
  prompt: string;
  image_url?: string;
  image_base64?: string;
  mime_type?: string;
  max_tokens?: number;
  purpose?: string;
}

export interface AIImageOptions {
  prompt: string;
  style?: string;
  size?: string;
}

/**
 * Token usage info returned from API calls
 */
export interface AITokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

/**
 * Enhanced response with token usage for cost tracking
 */
export interface AIChatResponse {
  text: string;
  raw: any;
  provider: AIProvider;
  model: string;
  usage?: AITokenUsage;
  latency_ms?: number;
}

export interface AIError {
  code: "QUOTA_EXCEEDED" | "RATE_LIMITED" | "API_ERROR" | "CONFIG_ERROR" | "IMAGE_NOT_AVAILABLE";
  message: string;
  provider?: string;
  model?: string;
  retryAfter?: number;
}

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_PROVIDER: AIProvider = "gemini";
const DEFAULT_MODEL = "gemini-2.0-flash";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

// Simple in-memory cache (60s TTL)
const responseCache = new Map<string, { response: AIChatResponse; expires: number }>();
const CACHE_TTL_MS = 60000;

// Rate limiting (simple in-memory)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX = 30;

interface AIConfig {
  provider: AIProvider;
  model: string;
  premiumProvider: AIProvider | undefined;
  premiumModel: string | undefined;
  premiumActions: string[];
}

/**
 * Get configuration from environment
 */
function getConfig(): AIConfig {
  const provider = (Deno.env.get("AI_PROVIDER") || DEFAULT_PROVIDER) as AIProvider;
  const model = Deno.env.get("AI_MODEL_DEFAULT") || DEFAULT_MODEL;
  const premiumProvider = Deno.env.get("AI_PROVIDER_PREMIUM") as AIProvider | undefined;
  const premiumModel = Deno.env.get("AI_MODEL_PREMIUM");
  const premiumActions = (Deno.env.get("AI_PREMIUM_ACTIONS") || "").split(",").filter(Boolean);
  
  return { provider, model, premiumProvider, premiumModel, premiumActions };
}

/**
 * Check if purpose should use premium tier
 */
function shouldUsePremium(purpose: string | undefined, config: AIConfig): boolean {
  if (!purpose || !config.premiumProvider || !config.premiumModel) return false;
  return config.premiumActions.includes(purpose);
}

/**
 * Simple rate limiter - returns true if allowed
 */
function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  entry.count++;
  return true;
}

/**
 * Masks an API key for safe logging
 */
function maskKey(key: string | undefined): string {
  if (!key || key.length < 10) return "[empty/short]";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Generate cache key from messages
 */
function generateCacheKey(messages: AIMessage[], model: string): string {
  const content = JSON.stringify({ messages, model });
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `cache_${hash}`;
}

/**
 * Check cache for existing response
 */
function checkCache(key: string): AIChatResponse | null {
  const cached = responseCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.response;
  }
  responseCache.delete(key);
  return null;
}

/**
 * Store response in cache
 */
function setCache(key: string, response: AIChatResponse): void {
  const now = Date.now();
  for (const [k, v] of responseCache.entries()) {
    if (v.expires < now) responseCache.delete(k);
  }
  if (responseCache.size > 100) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
  responseCache.set(key, { response, expires: now + CACHE_TTL_MS });
}

/**
 * Sleep helper for retry backoff with jitter
 */
function sleep(ms: number): Promise<void> {
  const jitter = Math.random() * 500;
  return new Promise(resolve => setTimeout(resolve, ms + jitter));
}

/**
 * Safe base64 encoding for large binary data (chunked to avoid stack overflow)
 */
function safeBase64Encode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // 32KB chunks
  let result = '';
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    result += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(result);
}

/**
 * Extract token usage from Gemini response
 */
function extractGeminiUsage(data: any): AITokenUsage | undefined {
  const usageMetadata = data?.usageMetadata;
  if (usageMetadata) {
    return {
      input_tokens: usageMetadata.promptTokenCount || 0,
      output_tokens: usageMetadata.candidatesTokenCount || 0,
      total_tokens: usageMetadata.totalTokenCount || 0,
    };
  }
  return undefined;
}

/**
 * Extract token usage from OpenAI response
 */
function extractOpenAIUsage(data: any): AITokenUsage | undefined {
  const usage = data?.usage;
  if (usage) {
    return {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
    };
  }
  return undefined;
}

/**
 * Estimate cost in cents based on provider, model, and tokens
 * These are approximate rates as of Dec 2024
 */
export function estimateCostCents(
  provider: AIProvider,
  model: string,
  usage: AITokenUsage | undefined
): number {
  if (!usage) return 0;
  
  // Gemini pricing (free tier has limits, then ~$0.075/1M input, $0.30/1M output for Flash)
  if (provider === "gemini") {
    // Gemini 2.0 Flash is mostly free tier, estimate minimal cost
    const inputCost = (usage.input_tokens / 1_000_000) * 7.5; // $0.075 per 1M
    const outputCost = (usage.output_tokens / 1_000_000) * 30; // $0.30 per 1M
    return Math.round((inputCost + outputCost) * 100) / 100; // Round to 2 decimals in cents
  }
  
  // OpenAI pricing (GPT-4o-mini: $0.15/1M input, $0.60/1M output)
  if (provider === "openai") {
    if (model.includes("gpt-4o-mini")) {
      const inputCost = (usage.input_tokens / 1_000_000) * 15; // $0.15 per 1M in cents
      const outputCost = (usage.output_tokens / 1_000_000) * 60; // $0.60 per 1M in cents
      return Math.round((inputCost + outputCost) * 100) / 100;
    }
    // GPT-4o: $2.50/1M input, $10/1M output
    const inputCost = (usage.input_tokens / 1_000_000) * 250;
    const outputCost = (usage.output_tokens / 1_000_000) * 1000;
    return Math.round((inputCost + outputCost) * 100) / 100;
  }
  
  return 0;
}

/**
 * Calls Google Gemini API with retry logic
 */
async function callGeminiWithRetry(
  requestBody: any,
  model: string,
  maxRetries: number = 2
): Promise<{ data: any; error?: AIError; latency_ms?: number }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  
  if (!apiKey || apiKey.length === 0) {
    return {
      data: null,
      error: { code: "CONFIG_ERROR", message: "GEMINI_API_KEY is not configured", provider: "gemini", model }
    };
  }

  const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const startTime = Date.now();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        console.log(`[ai] success provider=gemini model=${model} latency_ms=${latencyMs}`);
        return { data, latency_ms: latencyMs };
      }

      const errorText = await response.text();
      
      if (response.status === 429) {
        const retryAfter = Math.pow(2, attempt + 1) * 1000;
        
        if (attempt < maxRetries) {
          console.log(`[ai] rate_limited provider=gemini retry=${attempt + 1}/${maxRetries} wait_ms=${retryAfter}`);
          await sleep(retryAfter);
          continue;
        }
        
        return {
          data: null,
          error: { 
            code: "QUOTA_EXCEEDED", 
            message: "API quota exceeded. Please try again later.",
            provider: "gemini",
            model,
            retryAfter: 60
          }
        };
      }

      // Retry on 5xx errors
      if (response.status >= 500 && attempt < maxRetries) {
        console.log(`[ai] server_error provider=gemini status=${response.status} retry=${attempt + 1}/${maxRetries}`);
        await sleep(Math.pow(2, attempt + 1) * 1000);
        continue;
      }

      console.error("[ai] error provider=gemini", {
        status: response.status,
        key_masked: maskKey(apiKey),
        error: errorText.slice(0, 200),
        latency_ms: latencyMs,
      });
      
      return {
        data: null,
        error: { 
          code: "API_ERROR", 
          message: `Gemini error: ${response.status}`,
          provider: "gemini",
          model
        }
      };
      
    } catch (fetchError) {
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt + 1) * 1000);
        continue;
      }
      return {
        data: null,
        error: { code: "API_ERROR", message: "Network error connecting to Gemini", provider: "gemini", model }
      };
    }
  }
  
  return { data: null, error: { code: "API_ERROR", message: "Max retries exceeded", provider: "gemini", model } };
}

/**
 * Calls OpenAI API with retry logic
 */
async function callOpenAIWithRetry(
  messages: Array<{ role: string; content: string }>,
  model: string,
  options: { temperature?: number; max_tokens?: number; tools?: any[]; tool_choice?: any } = {},
  maxRetries: number = 2
): Promise<{ data: any; error?: AIError; latency_ms?: number }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  
  if (!apiKey || apiKey.length === 0) {
    return {
      data: null,
      error: { code: "CONFIG_ERROR", message: "OPENAI_API_KEY is not configured", provider: "openai", model }
    };
  }

  const requestBody: any = {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 2048,
  };

  if (options.tools && options.tools.length > 0) {
    requestBody.tools = options.tools;
    if (options.tool_choice) {
      requestBody.tool_choice = options.tool_choice;
    }
  }
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const startTime = Date.now();
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });
      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        console.log(`[ai] success provider=openai model=${model} latency_ms=${latencyMs}`);
        return { data, latency_ms: latencyMs };
      }

      const errorText = await response.text();
      
      if (response.status === 429) {
        const retryAfter = Math.pow(2, attempt + 1) * 1000;
        
        if (attempt < maxRetries) {
          console.log(`[ai] rate_limited provider=openai retry=${attempt + 1}/${maxRetries} wait_ms=${retryAfter}`);
          await sleep(retryAfter);
          continue;
        }
        
        return {
          data: null,
          error: { 
            code: "QUOTA_EXCEEDED", 
            message: "OpenAI rate limit exceeded. Please try again later.",
            provider: "openai",
            model,
            retryAfter: 60
          }
        };
      }

      // Retry on 5xx errors
      if (response.status >= 500 && attempt < maxRetries) {
        console.log(`[ai] server_error provider=openai status=${response.status} retry=${attempt + 1}/${maxRetries}`);
        await sleep(Math.pow(2, attempt + 1) * 1000);
        continue;
      }

      console.error("[ai] error provider=openai", {
        status: response.status,
        key_masked: maskKey(apiKey),
        error: errorText.slice(0, 200),
        latency_ms: latencyMs,
      });
      
      return {
        data: null,
        error: { 
          code: "API_ERROR", 
          message: `OpenAI error: ${response.status}`,
          provider: "openai",
          model
        }
      };
      
    } catch (fetchError) {
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt + 1) * 1000);
        continue;
      }
      return {
        data: null,
        error: { code: "API_ERROR", message: "Network error connecting to OpenAI", provider: "openai", model }
      };
    }
  }
  
  return { data: null, error: { code: "API_ERROR", message: "Max retries exceeded", provider: "openai", model } };
}

/**
 * Main AI chat function with purpose-based routing
 * Returns token usage for cost tracking
 */
export async function aiChat(options: AIChatOptions): Promise<AIChatResponse> {
  const config = getConfig();
  const startTime = Date.now();
  
  // Determine provider and model based on purpose
  let provider = options.provider || config.provider;
  let model = options.model || config.model;
  
  if (shouldUsePremium(options.purpose, config)) {
    provider = config.premiumProvider!;
    model = config.premiumModel!;
    console.log(`[ai] premium_routing purpose=${options.purpose} provider=${provider} model=${model}`);
  }
  
  console.log(`[ai] request provider=${provider} model=${model} purpose=${options.purpose || 'default'}`);

  // Rate limit check
  if (!checkRateLimit(`aiChat_${provider}`)) {
    throw new Error(JSON.stringify({ 
      code: "RATE_LIMITED", 
      message: "Rate limit exceeded. Please slow down.",
      provider,
      model 
    } as AIError));
  }

  // Check cache
  const cacheKey = generateCacheKey(options.messages, model);
  const cached = checkCache(cacheKey);
  if (cached) {
    console.log(`[ai] cache_hit provider=${provider} model=${model}`);
    return cached;
  }

  let response: AIChatResponse;

  if (provider === "openai") {
    // OpenAI path
    const openAIMessages = options.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const { data, error, latency_ms } = await callOpenAIWithRetry(
      openAIMessages,
      model || DEFAULT_OPENAI_MODEL,
      {
        temperature: options.temperature,
        max_tokens: options.max_tokens,
        tools: options.tools,
        tool_choice: options.tool_choice,
      }
    );

    if (error) {
      throw new Error(JSON.stringify(error));
    }

    const text = data.choices?.[0]?.message?.content || "";
    const usage = extractOpenAIUsage(data);
    const latencyMs = latency_ms || (Date.now() - startTime);
    
    console.log(`[ai] complete provider=openai model=${model} purpose=${options.purpose || 'default'} latency_ms=${latencyMs} tokens=${usage?.total_tokens || 'unknown'}`);
    
    response = { 
      text, 
      raw: data, 
      provider: "openai", 
      model: model || DEFAULT_OPENAI_MODEL,
      usage,
      latency_ms: latencyMs,
    };

  } else if (provider === "gemini") {
    // Gemini path
    const systemMessage = options.messages.find(m => m.role === "system")?.content || "";
    const conversationMessages = options.messages.filter(m => m.role !== "system");
    
    const contents = conversationMessages.map(msg => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // Handle tools by adding instruction to return JSON
    let enhancedSystemMessage = systemMessage;
    if (options.tools && options.tools.length > 0) {
      const toolSchema = options.tools[0]?.function?.parameters;
      if (toolSchema) {
        enhancedSystemMessage += `\n\nIMPORTANT: Respond with a valid JSON object matching this schema:\n${JSON.stringify(toolSchema, null, 2)}\n\nReturn ONLY the JSON object.`;
      }
    }

    const requestBody: any = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.max_tokens ?? 2048,
      },
    };

    if (enhancedSystemMessage) {
      requestBody.systemInstruction = { parts: [{ text: enhancedSystemMessage }] };
    }

    const { data, error, latency_ms } = await callGeminiWithRetry(requestBody, model || DEFAULT_MODEL);
    
    if (error) {
      throw new Error(JSON.stringify(error));
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const usage = extractGeminiUsage(data);
    const latencyMs = latency_ms || (Date.now() - startTime);
    
    console.log(`[ai] complete provider=gemini model=${model} purpose=${options.purpose || 'default'} latency_ms=${latencyMs} tokens=${usage?.total_tokens || 'unknown'}`);

    // Wrap tool responses in OpenAI-compatible format
    let responseData = data;
    if (options.tools && options.tools.length > 0) {
      try {
        let jsonText = text.trim();
        if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
        else if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
        if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
        jsonText = jsonText.trim();
        
        JSON.parse(jsonText);
        
        responseData = {
          choices: [{
            message: {
              tool_calls: [{
                function: {
                  name: options.tools[0]?.function?.name || "response",
                  arguments: jsonText,
                }
              }]
            }
          }]
        };
      } catch {
        // Not valid JSON, return as-is
      }
    }

    response = { 
      text, 
      raw: responseData, 
      provider: "gemini", 
      model: model || DEFAULT_MODEL,
      usage,
      latency_ms: latencyMs,
    };

  } else {
    // Unknown provider - return CONFIG_ERROR
    throw new Error(JSON.stringify({
      code: "CONFIG_ERROR",
      message: `Unknown AI provider: ${provider}. Supported providers: gemini, openai`,
      provider,
      model
    } as AIError));
  }

  setCache(cacheKey, response);
  return response;
}

/**
 * Vision analysis - REAL multimodal with image support (Gemini only)
 */
export async function aiVision(options: AIVisionOptions): Promise<AIChatResponse> {
  const model = "gemini-2.0-flash";
  const startTime = Date.now();
  
  console.log(`[ai] vision_request provider=gemini model=${model} purpose=${options.purpose || 'vision'}`);

  // Rate limit check
  if (!checkRateLimit("aiVision_gemini")) {
    throw new Error(JSON.stringify({ 
      code: "RATE_LIMITED", 
      message: "Rate limit exceeded for vision.",
      provider: "gemini",
      model 
    } as AIError));
  }

  // Build parts array for multimodal
  const parts: any[] = [];
  
  // Add text prompt first
  parts.push({ text: options.prompt });
  
  // Add image
  if (options.image_base64) {
    // Clean base64 if it has data URL prefix
    let cleanBase64 = options.image_base64;
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1];
    }
    
    parts.push({
      inlineData: {
        mimeType: options.mime_type || "image/png",
        data: cleanBase64,
      }
    });
  } else if (options.image_url) {
    // Fetch image and convert to base64 using safe chunked encoding
    try {
      console.log(`[ai] fetching_image url=${options.image_url.substring(0, 50)}...`);
      const imageResponse = await fetch(options.image_url);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status}`);
      }
      const imageBuffer = await imageResponse.arrayBuffer();
      const base64 = safeBase64Encode(imageBuffer);
      const contentType = imageResponse.headers.get("content-type") || "image/png";
      
      parts.push({
        inlineData: {
          mimeType: contentType,
          data: base64,
        }
      });
    } catch (fetchErr) {
      console.error("[ai] image_fetch_error:", fetchErr);
      throw new Error("Failed to fetch image from URL");
    }
  } else {
    throw new Error("Either image_url or image_base64 is required for vision");
  }

  const requestBody: any = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: options.max_tokens ?? 2048,
    },
  };

  if (options.system) {
    requestBody.systemInstruction = { parts: [{ text: options.system }] };
  }

  const { data, error, latency_ms } = await callGeminiWithRetry(requestBody, model);
  
  if (error) {
    throw new Error(JSON.stringify(error));
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const usage = extractGeminiUsage(data);
  const latencyMs = latency_ms || (Date.now() - startTime);
  
  console.log(`[ai] vision_complete provider=gemini model=${model} latency_ms=${latencyMs} response_length=${text.length}`);
  
  return { text, raw: data, provider: "gemini", model, usage, latency_ms: latencyMs };
}

/**
 * Image generation - returns controlled error on free tier
 */
export async function aiImage(options: AIImageOptions): Promise<AIChatResponse> {
  console.log(`[ai] image_request prompt="${options.prompt.substring(0, 50)}..."`);
  
  // Image generation not reliably available on Gemini free tier
  const error: AIError = {
    code: "IMAGE_NOT_AVAILABLE",
    message: "Image generation requires premium tier. Contact support to enable.",
    provider: "gemini",
    model: "gemini-2.0-flash-image"
  };
  
  throw new Error(JSON.stringify(error));
}

/**
 * Streaming chat - returns async iterator (Gemini only)
 */
export async function* aiChatStream(options: AIChatOptions): AsyncGenerator<string, void, unknown> {
  const config = getConfig();
  const model = options.model || config.model;
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  
  if (!apiKey) {
    throw new Error(JSON.stringify({ code: "CONFIG_ERROR", message: "GEMINI_API_KEY is not configured" } as AIError));
  }
  
  console.log(`[ai] stream_request provider=gemini model=${model} purpose=${options.purpose || 'default'}`);

  const systemMessage = options.messages.find(m => m.role === "system")?.content || "";
  const conversationMessages = options.messages.filter(m => m.role !== "system");
  
  const contents = conversationMessages.map(msg => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  const requestBody: any = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.max_tokens ?? 2048,
    },
  };

  if (systemMessage) {
    requestBody.systemInstruction = { parts: [{ text: systemMessage }] };
  }

  const url = `${GEMINI_API_URL}/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) {
      throw new Error(JSON.stringify({ code: "QUOTA_EXCEEDED", message: "API quota exceeded", provider: "gemini", model } as AIError));
    }
    throw new Error(`Gemini streaming error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");
  
  const decoder = new TextDecoder();
  let buffer = "";
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) yield text;
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }
  
  console.log(`[ai] stream_complete provider=gemini model=${model}`);
}

/**
 * Parse AI error from thrown error
 */
export function parseAIError(error: unknown): AIError {
  if (error instanceof Error) {
    try {
      return JSON.parse(error.message) as AIError;
    } catch {
      return { code: "API_ERROR", message: error.message };
    }
  }
  return { code: "API_ERROR", message: String(error) };
}
