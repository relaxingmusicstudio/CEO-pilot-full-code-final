import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting configuration
const RATE_LIMITS: Record<string, { requests: number; windowMs: number }> = {
  'lovable-ai': { requests: 60, windowMs: 60000 },
  'openai': { requests: 60, windowMs: 60000 },
  'twilio': { requests: 100, windowMs: 60000 },
  'resend': { requests: 50, windowMs: 60000 },
  'elevenlabs': { requests: 30, windowMs: 60000 },
  'default': { requests: 100, windowMs: 60000 }
};

// LLM Fallback providers (primary -> fallback)
const LLM_FALLBACK_CHAIN = ['lovable-ai', 'openai'];

// In-memory rate limit tracking (resets on cold start)
const rateLimitCache: Map<string, { count: number; resetAt: number }> = new Map();

// Track provider health
const providerHealth: Map<string, { healthy: boolean; lastCheck: number; failures: number }> = new Map();

type ServiceType = 'lovable-ai' | 'openai' | 'twilio' | 'resend' | 'elevenlabs' | 'vapi' | 'did';

interface GatewayRequest {
  service: ServiceType;
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
  skipModeCheck?: boolean; // For internal system calls
}

interface SystemMode {
  mode: 'growth' | 'maintenance' | 'vacation' | 'emergency';
  allowed_services: string[];
}

function checkRateLimit(service: string): { allowed: boolean; remaining: number; resetIn: number } {
  const config = RATE_LIMITS[service] || RATE_LIMITS['default'];
  const key = `rate:${service}`;
  const now = Date.now();
  
  let record = rateLimitCache.get(key);
  
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + config.windowMs };
    rateLimitCache.set(key, record);
  }
  
  record.count++;
  const remaining = Math.max(0, config.requests - record.count);
  const resetIn = Math.max(0, record.resetAt - now);
  
  return {
    allowed: record.count <= config.requests,
    remaining,
    resetIn
  };
}

function isProviderHealthy(service: string): boolean {
  const health = providerHealth.get(service);
  if (!health) return true; // Assume healthy if no data
  
  // Reset health after 5 minutes
  if (Date.now() - health.lastCheck > 300000) {
    providerHealth.set(service, { healthy: true, lastCheck: Date.now(), failures: 0 });
    return true;
  }
  
  return health.healthy;
}

function markProviderUnhealthy(service: string) {
  const health = providerHealth.get(service) || { healthy: true, lastCheck: Date.now(), failures: 0 };
  health.failures++;
  health.lastCheck = Date.now();
  
  // Mark unhealthy after 3 consecutive failures
  if (health.failures >= 3) {
    health.healthy = false;
    console.log(`[API Gateway] Marked ${service} as unhealthy after ${health.failures} failures`);
  }
  
  providerHealth.set(service, health);
}

function markProviderHealthy(service: string) {
  providerHealth.set(service, { healthy: true, lastCheck: Date.now(), failures: 0 });
}

async function getSystemMode(supabase: any): Promise<SystemMode> {
  try {
    const { data } = await supabase
      .from('system_config')
      .select('config_value')
      .eq('config_key', 'current_mode')
      .single();
    
    const mode = data?.config_value || 'growth';
    
    // Define what services are allowed in each mode
    const modeServices: Record<string, string[]> = {
      'growth': ['*'], // All services
      'maintenance': ['lovable-ai', 'openai', 'twilio', 'resend'], // No cold outreach
      'vacation': ['twilio', 'resend'], // Critical alerts only, no AI
      'emergency': [] // Nothing allowed
    };
    
    return {
      mode,
      allowed_services: modeServices[mode] || ['*']
    };
  } catch {
    // Default to growth mode if can't fetch
    return { mode: 'growth', allowed_services: ['*'] };
  }
}

function isServiceAllowed(service: string, systemMode: SystemMode): boolean {
  if (systemMode.allowed_services.includes('*')) return true;
  return systemMode.allowed_services.includes(service);
}

async function logApiCall(
  supabase: any,
  service: string,
  endpoint: string,
  method: string,
  startTime: number,
  status: number,
  error?: string,
  costCents?: number,
  metadata?: Record<string, unknown>
) {
  const responseTimeMs = Date.now() - startTime;
  
  try {
    await supabase.from('api_logs').insert({
      service,
      endpoint,
      method,
      response_status: status,
      response_time_ms: responseTimeMs,
      cost_cents: costCents || 0,
      error_message: error,
      request_body: metadata ? { metadata } : null
    });
  } catch (e) {
    console.error('Failed to log API call:', e);
  }
}

function getServiceConfig(service: string): { baseUrl: string; authHeader: string; apiKey: string | undefined } {
  switch (service) {
    case 'lovable-ai':
      return {
        baseUrl: 'https://ai.gateway.lovable.dev/v1',
        authHeader: 'Authorization',
        apiKey: Deno.env.get('LOVABLE_API_KEY')
      };
    case 'openai':
      return {
        baseUrl: 'https://api.openai.com/v1',
        authHeader: 'Authorization',
        apiKey: Deno.env.get('OPENAI_API_KEY')
      };
    case 'twilio':
      return {
        baseUrl: 'https://api.twilio.com/2010-04-01',
        authHeader: 'Authorization',
        apiKey: undefined // Handled separately
      };
    case 'resend':
      return {
        baseUrl: 'https://api.resend.com',
        authHeader: 'Authorization',
        apiKey: Deno.env.get('RESEND_API_KEY')
      };
    case 'elevenlabs':
      return {
        baseUrl: 'https://api.elevenlabs.io/v1',
        authHeader: 'xi-api-key',
        apiKey: Deno.env.get('ELEVENLABS_API_KEY')
      };
    case 'vapi':
      return {
        baseUrl: 'https://api.vapi.ai',
        authHeader: 'Authorization',
        apiKey: Deno.env.get('VAPI_API_KEY')
      };
    case 'did':
      return {
        baseUrl: 'https://api.d-id.com',
        authHeader: 'Authorization',
        apiKey: Deno.env.get('DID_API_KEY')
      };
    default:
      throw new Error(`Unknown service: ${service}`);
  }
}

async function makeRequest(
  service: string,
  endpoint: string,
  method: string,
  body: any,
  customHeaders?: Record<string, string>
): Promise<{ response: Response | null; error: Error | null }> {
  const config = getServiceConfig(service);
  
  if (!config.apiKey && service !== 'twilio') {
    return { response: null, error: new Error(`${service} API key not configured`) };
  }

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders
  };

  if (config.apiKey) {
    if (config.authHeader === 'Authorization') {
      requestHeaders['Authorization'] = `Bearer ${config.apiKey}`;
    } else {
      requestHeaders[config.authHeader] = config.apiKey;
    }
  }

  const url = `${config.baseUrl}${endpoint}`;

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined
    });
    return { response, error: null };
  } catch (e) {
    return { response: null, error: e instanceof Error ? e : new Error(String(e)) };
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
    const { service, endpoint, method = 'POST', body, headers: customHeaders, skipModeCheck }: GatewayRequest = await req.json();

    if (!service || !endpoint) {
      return new Response(JSON.stringify({ error: 'Missing service or endpoint' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check system mode unless explicitly skipped
    if (!skipModeCheck) {
      const systemMode = await getSystemMode(supabase);
      
      if (!isServiceAllowed(service, systemMode)) {
        console.log(`[API Gateway] Service ${service} blocked by ${systemMode.mode} mode`);
        await logApiCall(supabase, service, endpoint, method, startTime, 403, `Blocked by ${systemMode.mode} mode`);
        return new Response(JSON.stringify({ 
          error: 'Service blocked by current system mode',
          mode: systemMode.mode,
          message: `The ${service} service is not available in ${systemMode.mode} mode. Change system mode in Control Panel to enable.`
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Check rate limit
    const rateLimit = checkRateLimit(service);
    if (!rateLimit.allowed) {
      await logApiCall(supabase, service, endpoint, method, startTime, 429, 'Rate limit exceeded');
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil(rateLimit.resetIn / 1000)
      }), {
        status: 429,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          'Retry-After': Math.ceil(rateLimit.resetIn / 1000).toString()
        },
      });
    }

    console.log(`[API Gateway] ${method} ${service}${endpoint}`);

    // Make the request with retry logic and LLM fallback
    let response: Response | null = null;
    let lastError: Error | null = null;
    let usedService: ServiceType = service;
    const maxRetries = 3;

    // For LLM services, implement fallback chain
    const isLLMService = LLM_FALLBACK_CHAIN.includes(service);
    const servicesToTry: ServiceType[] = isLLMService 
      ? (LLM_FALLBACK_CHAIN.filter(s => isProviderHealthy(s)) as ServiceType[])
      : [service];

    for (const currentService of servicesToTry) {
      usedService = currentService as ServiceType;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const result = await makeRequest(currentService, endpoint, method, body, customHeaders);
        
        if (result.error) {
          lastError = result.error;
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, attempt * 1000));
          }
          continue;
        }

        response = result.response!;

        // Don't retry on client errors
        if (response.status < 500) {
          if (response.ok) {
            markProviderHealthy(currentService);
          }
          break;
        }
        
        // Retry on server errors
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, attempt * 1000));
        } else {
          // Mark as unhealthy after max retries with server errors
          markProviderUnhealthy(currentService);
        }
      }

      // If we got a successful response, break from the fallback loop
      if (response && response.ok) {
        if (currentService !== service) {
          console.log(`[API Gateway] Fallback: ${service} -> ${currentService} succeeded`);
        }
        break;
      }
    }

    if (!response) {
      await logApiCall(supabase, usedService, endpoint, method, startTime, 503, lastError?.message);
      return new Response(JSON.stringify({ 
        error: 'Service unavailable after retries',
        details: lastError?.message,
        fallback_attempted: isLLMService
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Estimate cost (simplified)
    let costCents = 0;
    if (usedService === 'lovable-ai' || usedService === 'openai') {
      costCents = 1; // ~$0.01 per AI call estimate
    } else if (usedService === 'twilio') {
      costCents = 1; // ~$0.01 per SMS
    } else if (usedService === 'elevenlabs') {
      costCents = 5; // ~$0.05 per voice generation
    }

    await logApiCall(
      supabase, 
      usedService, 
      endpoint, 
      method, 
      startTime, 
      response.status, 
      undefined, 
      costCents,
      { original_service: service, fallback_used: usedService !== service }
    );

    // Return the response
    const responseBody = await response.text();
    
    return new Response(responseBody, {
      status: response.status,
      headers: { 
        ...corsHeaders, 
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        'X-Response-Time': `${Date.now() - startTime}ms`,
        'X-Service-Used': usedService
      },
    });

  } catch (error) {
    console.error('[API Gateway] Error:', error);
    await logApiCall(supabase, 'unknown', '/error', 'POST', startTime, 500, error instanceof Error ? error.message : 'Unknown error');
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Gateway error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});