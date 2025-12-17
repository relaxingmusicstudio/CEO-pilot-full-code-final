/**
 * AI Provider Abstraction Layer - GEMINI ONLY
 * 
 * Environment Variables:
 * - GEMINI_API_KEY: Key for Google Gemini API (required)
 * 
 * Features:
 * - aiChat: Text chat completion
 * - aiVision: Multimodal vision analysis
 * - Quota-safe: Retry with backoff, structured error codes
 * - Simple in-memory caching for identical requests
 */

export type AIProvider = "gemini";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIChatOptions {
  messages: AIMessage[];
  model?: string;
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
}

export interface AIChatResponse {
  text: string;
  raw: any;
  provider: AIProvider;
}

export interface AIError {
  code: "QUOTA_EXCEEDED" | "RATE_LIMITED" | "API_ERROR" | "CONFIG_ERROR";
  message: string;
  retryAfter?: number;
}

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.0-flash";

// Simple in-memory cache (60s TTL)
const responseCache = new Map<string, { response: AIChatResponse; expires: number }>();
const CACHE_TTL_MS = 60000;

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
  // Clean old entries
  const now = Date.now();
  for (const [k, v] of responseCache.entries()) {
    if (v.expires < now) responseCache.delete(k);
  }
  // Limit cache size
  if (responseCache.size > 100) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
  responseCache.set(key, { response, expires: now + CACHE_TTL_MS });
}

/**
 * Sleep helper for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calls Google Gemini API with retry logic
 */
async function callGeminiWithRetry(
  requestBody: any,
  model: string,
  maxRetries: number = 2
): Promise<{ data: any; error?: AIError }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  
  if (!apiKey || apiKey.length === 0) {
    return {
      data: null,
      error: { code: "CONFIG_ERROR", message: "GEMINI_API_KEY is not configured" }
    };
  }

  const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        return { data };
      }

      const errorText = await response.text();
      
      // Handle quota/rate limit errors
      if (response.status === 429) {
        const retryAfter = Math.pow(2, attempt + 1) * 1000; // Exponential backoff
        
        if (attempt < maxRetries) {
          console.log(`[ai] Rate limited, retry ${attempt + 1}/${maxRetries} after ${retryAfter}ms`);
          await sleep(retryAfter);
          continue;
        }
        
        return {
          data: null,
          error: { 
            code: "QUOTA_EXCEEDED", 
            message: "API quota exceeded. Please try again later.",
            retryAfter: 60
          }
        };
      }

      // Other errors - don't retry
      console.error("[ai] Gemini API error:", {
        status: response.status,
        key_masked: maskKey(apiKey),
        error: errorText.slice(0, 200),
      });
      
      return {
        data: null,
        error: { 
          code: "API_ERROR", 
          message: `Gemini error: ${response.status}`
        }
      };
      
    } catch (fetchError) {
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt + 1) * 1000);
        continue;
      }
      return {
        data: null,
        error: { code: "API_ERROR", message: "Network error connecting to Gemini" }
      };
    }
  }
  
  return { data: null, error: { code: "API_ERROR", message: "Max retries exceeded" } };
}

/**
 * Main AI chat function - Gemini only with caching and retry
 */
export async function aiChat(options: AIChatOptions): Promise<AIChatResponse> {
  const model = options.model || DEFAULT_MODEL;
  
  console.log("[ai] provider=gemini, model=" + model);

  // Check cache first
  const cacheKey = generateCacheKey(options.messages, model);
  const cached = checkCache(cacheKey);
  if (cached) {
    console.log("[ai] Cache hit");
    return cached;
  }

  // Convert messages to Gemini format
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

  const { data, error } = await callGeminiWithRetry(requestBody, model);
  
  if (error) {
    throw new Error(JSON.stringify(error));
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Wrap tool responses in OpenAI-compatible format
  let responseData = data;
  if (options.tools && options.tools.length > 0) {
    try {
      let jsonText = text.trim();
      if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
      else if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
      if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
      jsonText = jsonText.trim();
      
      JSON.parse(jsonText); // Validate
      
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

  const response: AIChatResponse = { text, raw: responseData, provider: "gemini" };
  
  // Cache the response
  setCache(cacheKey, response);
  
  return response;
}

/**
 * Vision analysis - supports URL or base64 images
 */
export async function aiVision(options: AIVisionOptions): Promise<AIChatResponse> {
  const model = "gemini-2.0-flash"; // Vision-capable model
  
  console.log("[ai] provider=gemini (vision), model=" + model);

  // Build parts array
  const parts: any[] = [];
  
  // Add text prompt
  parts.push({ text: options.prompt });
  
  // Add image
  if (options.image_base64) {
    parts.push({
      inlineData: {
        mimeType: options.mime_type || "image/png",
        data: options.image_base64.replace(/^data:image\/\w+;base64,/, ""),
      }
    });
  } else if (options.image_url) {
    // Fetch image and convert to base64
    try {
      const imageResponse = await fetch(options.image_url);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status}`);
      }
      const imageBuffer = await imageResponse.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
      const contentType = imageResponse.headers.get("content-type") || "image/png";
      
      parts.push({
        inlineData: {
          mimeType: contentType,
          data: base64,
        }
      });
    } catch (fetchErr) {
      console.error("[ai] Failed to fetch image URL:", fetchErr);
      throw new Error("Failed to fetch image from URL");
    }
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

  const { data, error } = await callGeminiWithRetry(requestBody, model);
  
  if (error) {
    throw new Error(JSON.stringify(error));
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  
  return { text, raw: data, provider: "gemini" };
}

/**
 * Streaming chat - returns async iterator
 */
export async function* aiChatStream(options: AIChatOptions): AsyncGenerator<string, void, unknown> {
  const model = options.model || DEFAULT_MODEL;
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  
  console.log("[ai] provider=gemini (streaming), model=" + model);

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
      throw new Error(JSON.stringify({ code: "QUOTA_EXCEEDED", message: "API quota exceeded" }));
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
