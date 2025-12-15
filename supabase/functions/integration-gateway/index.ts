import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Test/sandbox endpoints for services
const SANDBOX_ENDPOINTS: Record<string, string> = {
  stripe: "https://api.stripe.com/v1", // Same URL, test key differentiates
  twilio: "https://api.twilio.com/2010-04-01", // Same URL, test credentials
};

// Get test credentials for sandbox mode
function getTestCredentials(serviceKey: string): Record<string, string> | null {
  switch (serviceKey) {
    case 'stripe':
      const stripeTestKey = Deno.env.get('STRIPE_TEST_SECRET_KEY');
      return stripeTestKey ? { api_key: stripeTestKey } : null;
    case 'twilio':
      const twilioSid = Deno.env.get('TWILIO_TEST_ACCOUNT_SID');
      const twilioToken = Deno.env.get('TWILIO_TEST_AUTH_TOKEN');
      return twilioSid && twilioToken ? { account_sid: twilioSid, auth_token: twilioToken } : null;
    default:
      return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { 
      agent_name, 
      service_key, 
      action,
      endpoint, 
      method = 'GET',
      body,
      purpose,
      tenant_id,
      use_sandbox = false // Explicit sandbox mode flag
    } = await req.json();
    
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Check tenant environment if tenant_id provided
    let tenantEnvironment = 'live';
    if (tenant_id) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('environment')
        .eq('id', tenant_id)
        .single();
      
      if (tenant?.environment) {
        tenantEnvironment = tenant.environment;
      }
    }
    
    const isMockMode = tenantEnvironment === 'mock';
    const useSandboxCredentials = use_sandbox || (isMockMode && getTestCredentials(service_key));
    
    console.log(`[IntegrationGateway] Agent: ${agent_name}, Service: ${service_key}, Action: ${action}, Env: ${tenantEnvironment}, Sandbox: ${useSandboxCredentials}`);

    // If in mock mode and no sandbox credentials, route to mock-adapters for pure fake responses
    if (isMockMode && !useSandboxCredentials) {
      console.log(`[IntegrationGateway] Routing to mock-adapters for ${service_key}/${action}`);
      
      const mockResponse = await fetch(`${SUPABASE_URL}/functions/v1/mock-adapters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          service_key,
          action,
          payload: body,
          tenant_id,
        }),
      });
      
      const mockData = await mockResponse.json();
      
      return new Response(
        JSON.stringify({
          success: true,
          mock: true,
          environment: 'mock',
          data: mockData.response,
          latency_ms: mockData.latency_ms || (Date.now() - startTime),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Validate agent permissions
    const { data: permission } = await supabase
      .from('agent_integration_permissions')
      .select('*')
      .eq('agent_name', agent_name)
      .eq('is_active', true)
      .single();
    
    if (!permission) {
      console.log(`[IntegrationGateway] No permission record for agent: ${agent_name}`);
      // Allow if no permission record exists (permissive by default for development)
    } else {
      const allowedServices = permission.allowed_services || [];
      const allowedActions = permission.allowed_actions || {};
      
      // Check service access
      if (!allowedServices.includes('*') && !allowedServices.includes(service_key)) {
        await supabase.from('integration_permission_violations').insert({
          agent_name,
          attempted_service: service_key,
          attempted_action: action,
          violation_type: 'service_denied',
          details: { allowed_services: allowedServices },
        });
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Agent ${agent_name} is not authorized to access ${service_key}` 
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Check action access
      const serviceActions = allowedActions[service_key] || allowedActions['*'] || [];
      if (action && serviceActions.length > 0 && !serviceActions.includes(action) && !serviceActions.includes('*')) {
        await supabase.from('integration_permission_violations').insert({
          agent_name,
          attempted_service: service_key,
          attempted_action: action,
          violation_type: 'action_denied',
          details: { allowed_actions: serviceActions },
        });
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Agent ${agent_name} cannot perform action '${action}' on ${service_key}` 
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 2. Get credentials - either sandbox test credentials or live from vault
    let credential: Record<string, string> | null = null;
    
    if (useSandboxCredentials) {
      credential = getTestCredentials(service_key);
      console.log(`[IntegrationGateway] Using sandbox credentials for ${service_key}`);
    }
    
    // Fall back to vault if no sandbox credentials
    if (!credential) {
      const vaultResponse = await fetch(`${SUPABASE_URL}/functions/v1/credential-vault`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: 'retrieve',
          service_key,
          agent_name,
          purpose,
        }),
      });
      
      const vaultData = await vaultResponse.json();
      
      if (!vaultResponse.ok || !vaultData.success) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: vaultData.error || 'Failed to retrieve credential',
            credential_status: 'not_configured'
          }),
          { status: vaultResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      credential = vaultData.credential;
    }

    // 3. If endpoint provided, make the external API call
    if (endpoint) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        
        // Build auth header based on credential type
        if (credential?.api_key) {
          headers['Authorization'] = `Bearer ${credential.api_key}`;
        } else if (credential?.account_sid && credential?.auth_token) {
          // Twilio-style basic auth
          const auth = btoa(`${credential.account_sid}:${credential.auth_token}`);
          headers['Authorization'] = `Basic ${auth}`;
        } else if (credential?.oauth_access_token) {
          headers['Authorization'] = `Bearer ${credential.oauth_access_token}`;
        }
        
        const externalResponse = await fetch(endpoint, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
        
        const responseData = await externalResponse.text();
        let parsedResponse;
        try {
          parsedResponse = JSON.parse(responseData);
        } catch {
          parsedResponse = responseData;
        }
        
        const latency = Date.now() - startTime;
        
        // Log to api_logs (tag as sandbox if applicable)
        await supabase.from('api_logs').insert({
          service: useSandboxCredentials ? `${service_key}_sandbox` : service_key,
          endpoint,
          method,
          request_body: body || null,
          response_status: externalResponse.status,
          response_time_ms: latency,
          error_message: externalResponse.ok ? null : responseData.slice(0, 500),
        });
        
        return new Response(
          JSON.stringify({
            success: externalResponse.ok,
            status: externalResponse.status,
            data: parsedResponse,
            latency_ms: latency,
            environment: useSandboxCredentials ? 'sandbox' : 'live',
          }),
          { 
            status: externalResponse.ok ? 200 : externalResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );
      } catch (fetchError) {
        const errorMessage = fetchError instanceof Error ? fetchError.message : 'External API call failed';
        
        await supabase.from('api_logs').insert({
          service: service_key,
          endpoint,
          method,
          request_body: body || null,
          response_status: 0,
          response_time_ms: Date.now() - startTime,
          error_message: errorMessage,
        });
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: errorMessage,
            latency_ms: Date.now() - startTime,
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    
    // 4. If no endpoint, just return the credential info (without secrets)
    return new Response(
      JSON.stringify({
        success: true,
        service_key,
        credential_type: credential?.type || 'api_key',
        environment: useSandboxCredentials ? 'sandbox' : tenantEnvironment,
        message: 'Credential validated successfully',
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("[IntegrationGateway] Error:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        latency_ms: Date.now() - startTime,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
