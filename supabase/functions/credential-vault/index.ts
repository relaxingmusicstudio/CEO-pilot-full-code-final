import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AES-256-GCM Encryption (Production-grade)
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyString = Deno.env.get("VAULT_ENCRYPTION_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(keyString));
  return await crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encryptedBase64: string): Promise<string> {
  try {
    const key = await getEncryptionKey();
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error('[Vault] Decryption failed:', err);
    throw new Error('Failed to decrypt credential');
  }
}

// Log credential usage
async function logUsage(
  supabase: any,
  credentialId: string | null,
  serviceKey: string,
  agentName: string,
  action: string,
  success: boolean,
  errorMessage?: string,
  purpose?: string
) {
  try {
    await supabase.from('credential_usage_log').insert({
      credential_id: credentialId,
      service_key: serviceKey,
      agent_name: agentName,
      action,
      purpose,
      success,
      error_message: errorMessage,
    });
  } catch (err) {
    console.error('[CredentialVault] Failed to log usage:', err);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, service_key, agent_name, credential_data, purpose } = await req.json();
    
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    console.log(`[CredentialVault] Action: ${action}, Service: ${service_key}, Agent: ${agent_name}`);

    switch (action) {
      case "store": {
        // Store a new credential
        if (!service_key || !credential_data || !agent_name) {
          return new Response(
            JSON.stringify({ error: "Missing required fields: service_key, credential_data, agent_name" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const encryptedValue = encrypt(JSON.stringify(credential_data));
        
        // Upsert credential
        const { data, error } = await supabase
          .from('service_credentials')
          .upsert({
            service_key,
            credential_type: credential_data.type || 'api_key',
            encrypted_value: encryptedValue,
            oauth_access_token: credential_data.oauth_access_token ? encrypt(credential_data.oauth_access_token) : null,
            oauth_refresh_token: credential_data.oauth_refresh_token ? encrypt(credential_data.oauth_refresh_token) : null,
            oauth_expires_at: credential_data.oauth_expires_at || null,
            oauth_scopes: credential_data.oauth_scopes || null,
            connection_status: 'unknown',
            last_used_by_agent: agent_name,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'service_key' })
          .select()
          .single();
        
        if (error) {
          await logUsage(supabase, null, service_key, agent_name, 'create', false, error.message, purpose);
          throw error;
        }
        
        await logUsage(supabase, data.id, service_key, agent_name, 'create', true, undefined, purpose);
        
        return new Response(
          JSON.stringify({ success: true, message: `Credential for ${service_key} stored successfully` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      case "retrieve": {
        // Retrieve and decrypt a credential
        if (!service_key || !agent_name) {
          return new Response(
            JSON.stringify({ error: "Missing required fields: service_key, agent_name" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Check agent permissions first
        const { data: permission } = await supabase
          .from('agent_integration_permissions')
          .select('*')
          .eq('agent_name', agent_name)
          .eq('is_active', true)
          .single();
        
        if (permission) {
          const allowedServices = permission.allowed_services || [];
          if (!allowedServices.includes('*') && !allowedServices.includes(service_key)) {
            // Log violation
            await supabase.from('integration_permission_violations').insert({
              agent_name,
              attempted_service: service_key,
              attempted_action: 'retrieve',
              violation_type: 'service_denied',
              details: { allowed_services: allowedServices },
            });
            
            return new Response(
              JSON.stringify({ error: `Agent ${agent_name} not authorized for service ${service_key}` }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
        
        const { data: credential, error } = await supabase
          .from('service_credentials')
          .select('*')
          .eq('service_key', service_key)
          .single();
        
        if (error || !credential) {
          await logUsage(supabase, null, service_key, agent_name, 'read', false, 'Credential not found', purpose);
          return new Response(
            JSON.stringify({ error: `No credential found for ${service_key}` }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Check if OAuth token is expired and needs refresh
        if (credential.credential_type === 'oauth2' && credential.oauth_expires_at) {
          const expiresAt = new Date(credential.oauth_expires_at);
          const now = new Date();
          const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
          
          if (expiresAt < fiveMinutesFromNow && credential.oauth_refresh_token) {
            console.log(`[CredentialVault] OAuth token for ${service_key} is near expiry, refresh needed`);
            // Note: Actual refresh would happen here in production
            // For now, we flag it in the response
          }
        }
        
        // Decrypt credential
        let decryptedData;
        try {
          decryptedData = JSON.parse(await decrypt(credential.encrypted_value));
        } catch (decryptErr) {
          await logUsage(supabase, credential.id, service_key, agent_name, 'decrypt', false, 'Decryption failed', purpose);
          throw new Error('Failed to decrypt credential');
        }
        
        // Update usage stats
        await supabase
          .from('service_credentials')
          .update({
            last_used_at: new Date().toISOString(),
            last_used_by_agent: agent_name,
            total_usage_count: (credential.total_usage_count || 0) + 1,
          })
          .eq('id', credential.id);
        
        await logUsage(supabase, credential.id, service_key, agent_name, 'read', true, undefined, purpose);
        
        return new Response(
          JSON.stringify({
            success: true,
            credential: decryptedData,
            connection_status: credential.connection_status,
            last_health_check: credential.last_health_check,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      case "test": {
        // Test a credential's connectivity
        if (!service_key || !agent_name) {
          return new Response(
            JSON.stringify({ error: "Missing required fields: service_key, agent_name" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Get service registry for test endpoint
        const { data: service } = await supabase
          .from('service_registry')
          .select('test_endpoint, test_method, auth_method')
          .eq('service_key', service_key)
          .single();
        
        // Get credential
        const { data: credential } = await supabase
          .from('service_credentials')
          .select('*')
          .eq('service_key', service_key)
          .single();
        
        if (!credential) {
          await logUsage(supabase, null, service_key, agent_name, 'test', false, 'No credential found', purpose);
          return new Response(
            JSON.stringify({ success: false, status: 'not_configured', message: 'No credential configured' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        let testStatus = 'unknown';
        let testMessage = 'Test endpoint not available';
        
        if (service?.test_endpoint) {
          try {
            const decryptedData = JSON.parse(await decrypt(credential.encrypted_value));
            
            // Build auth header based on type
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (credential.credential_type === 'api_key' && decryptedData.api_key) {
              headers['Authorization'] = `Bearer ${decryptedData.api_key}`;
            }
            
            const testResponse = await fetch(service.test_endpoint, {
              method: service.test_method || 'GET',
              headers,
            });
            
            if (testResponse.ok) {
              testStatus = 'healthy';
              testMessage = 'Connection successful';
            } else if (testResponse.status === 401 || testResponse.status === 403) {
              testStatus = 'expired';
              testMessage = 'Authentication failed - credential may be expired';
            } else {
              testStatus = 'degraded';
              testMessage = `Received status ${testResponse.status}`;
            }
          } catch (testErr) {
            testStatus = 'degraded';
            testMessage = `Test failed: ${testErr instanceof Error ? testErr.message : 'Unknown error'}`;
          }
        }
        
        // Update credential status
        const consecutiveFailures = testStatus === 'healthy' ? 0 : (credential.consecutive_failures || 0) + 1;
        
        await supabase
          .from('service_credentials')
          .update({
            connection_status: testStatus,
            last_health_check: new Date().toISOString(),
            consecutive_failures: consecutiveFailures,
          })
          .eq('id', credential.id);
        
        await logUsage(supabase, credential.id, service_key, agent_name, 'test', testStatus === 'healthy', testMessage, purpose);
        
        return new Response(
          JSON.stringify({ success: true, status: testStatus, message: testMessage }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      case "list": {
        // List all credentials with their status (no decryption)
        const { data: credentials, error } = await supabase
          .from('service_credentials')
          .select('service_key, credential_type, connection_status, last_health_check, last_used_at, last_used_by_agent, total_usage_count, created_at, updated_at')
          .order('service_key');
        
        if (error) throw error;
        
        // Get service metadata
        const { data: services } = await supabase
          .from('service_registry')
          .select('service_key, display_name, category, icon_emoji');
        
        const serviceMap = new Map(services?.map((s: any) => [s.service_key, s]) || []);
        
        const enrichedCredentials = credentials?.map((c: any) => ({
          ...c,
          display_name: (serviceMap.get(c.service_key) as any)?.display_name || c.service_key,
          category: (serviceMap.get(c.service_key) as any)?.category || 'unknown',
          icon_emoji: (serviceMap.get(c.service_key) as any)?.icon_emoji || '🔌',
        }));
        
        return new Response(
          JSON.stringify({ success: true, credentials: enrichedCredentials }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      case "delete": {
        // Delete a credential
        if (!service_key || !agent_name) {
          return new Response(
            JSON.stringify({ error: "Missing required fields: service_key, agent_name" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const { data: credential } = await supabase
          .from('service_credentials')
          .select('id')
          .eq('service_key', service_key)
          .single();
        
        if (!credential) {
          return new Response(
            JSON.stringify({ error: `No credential found for ${service_key}` }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const { error } = await supabase
          .from('service_credentials')
          .delete()
          .eq('service_key', service_key);
        
        if (error) throw error;
        
        await logUsage(supabase, credential.id, service_key, agent_name, 'revoke', true, undefined, purpose);
        
        return new Response(
          JSON.stringify({ success: true, message: `Credential for ${service_key} deleted` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("[CredentialVault] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
