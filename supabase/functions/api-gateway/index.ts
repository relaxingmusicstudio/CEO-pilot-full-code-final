import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { service, endpoint, method = 'GET', body, headers: customHeaders } = await req.json();

    if (!service || !endpoint) {
      return new Response(
        JSON.stringify({ error: 'Service and endpoint are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[API Gateway] ${method} ${service}/${endpoint}`);

    const config = getServiceConfig(service);
    if (!config.baseUrl) {
      return new Response(
        JSON.stringify({ error: `Unknown service: ${service}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build request
    const url = `${config.baseUrl}/${endpoint}`;
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    if (config.apiKey && config.authHeader) {
      if (config.authHeader === 'Authorization') {
        requestHeaders['Authorization'] = `Bearer ${config.apiKey}`;
      } else {
        requestHeaders[config.authHeader] = config.apiKey;
      }
    }

    const requestOptions: RequestInit = {
      method,
      headers: requestHeaders,
    };

    if (body && method !== 'GET') {
      requestOptions.body = JSON.stringify(body);
    }

    // Log API call
    const startTime = Date.now();
    
    try {
      await supabase.from('api_logs').insert({
        service,
        endpoint,
        method,
        request_body: body ? JSON.stringify(body) : null,
      });
    } catch (logErr) {
      console.error('[API Gateway] Failed to log request:', logErr);
    }

    const response = await fetch(url, requestOptions);
    const responseTime = Date.now() - startTime;
    
    let responseData;
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    // Update log with response
    try {
      await supabase.from('api_logs')
        .update({
          response_status: response.status,
          response_time_ms: responseTime,
          error_message: !response.ok ? JSON.stringify(responseData).slice(0, 500) : null,
        })
        .eq('service', service)
        .eq('endpoint', endpoint)
        .order('created_at', { ascending: false })
        .limit(1);
    } catch (logErr) {
      console.error('[API Gateway] Failed to update log:', logErr);
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          error: 'Upstream API error',
          status: response.status,
          details: typeof responseData === 'string' ? responseData.slice(0, 200) : responseData
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        data: responseData,
        meta: {
          service,
          endpoint,
          response_time_ms: responseTime,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[API Gateway] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getServiceConfig(service: string): { baseUrl: string; authHeader: string; apiKey: string | undefined } {
  switch (service) {
    case 'gemini':
      return {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        authHeader: 'x-goog-api-key',
        apiKey: Deno.env.get('GEMINI_API_KEY')
      };
    case 'twilio':
      return {
        baseUrl: 'https://api.twilio.com/2010-04-01',
        authHeader: 'Authorization',
        apiKey: undefined
      };
    case 'resend':
      return {
        baseUrl: 'https://api.resend.com',
        authHeader: 'Authorization',
        apiKey: Deno.env.get('RESEND_API_KEY')
      };
    case 'stripe':
      return {
        baseUrl: 'https://api.stripe.com/v1',
        authHeader: 'Authorization',
        apiKey: Deno.env.get('STRIPE_SECRET_KEY')
      };
    case 'plaid':
      return {
        baseUrl: 'https://sandbox.plaid.com',
        authHeader: 'PLAID-CLIENT-ID',
        apiKey: Deno.env.get('PLAID_CLIENT_ID')
      };
    case 'vapi':
      return {
        baseUrl: 'https://api.vapi.ai',
        authHeader: 'Authorization',
        apiKey: Deno.env.get('VAPI_API_KEY')
      };
    case 'heygen':
      return {
        baseUrl: 'https://api.heygen.com/v2',
        authHeader: 'X-Api-Key',
        apiKey: Deno.env.get('HEYGEN_API_KEY')
      };
    case 'd-id':
      return {
        baseUrl: 'https://api.d-id.com',
        authHeader: 'Authorization',
        apiKey: Deno.env.get('DID_API_KEY')
      };
    default:
      return { baseUrl: '', authHeader: '', apiKey: undefined };
  }
}
