import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    console.log("[CredentialHealthMonitor] Starting health check run...");

    // Get all credentials
    const { data: credentials, error: credError } = await supabase
      .from('service_credentials')
      .select('service_key, connection_status, consecutive_failures, last_health_check')
      .order('last_health_check', { ascending: true, nullsFirst: true });
    
    if (credError) throw credError;
    
    if (!credentials || credentials.length === 0) {
      console.log("[CredentialHealthMonitor] No credentials to check");
      return new Response(
        JSON.stringify({ success: true, message: "No credentials configured", checked: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[CredentialHealthMonitor] Checking ${credentials.length} credentials`);
    
    const results: unknown[] = [];
    const statusChanges: unknown[] = [];
    
    // Check each credential
    for (const cred of credentials) {
      try {
        const testResponse = await fetch(`${SUPABASE_URL}/functions/v1/credential-vault`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            action: 'test',
            service_key: cred.service_key,
            agent_name: 'health-monitor',
            purpose: 'scheduled_health_check',
          }),
        });
        
        const testResult = await testResponse.json();
        
        results.push({
          service_key: cred.service_key,
          previous_status: cred.connection_status,
          current_status: testResult.status || 'unknown',
          message: testResult.message,
        });
        
        // Track status changes for notifications
        if (cred.connection_status !== testResult.status) {
          statusChanges.push({
            service_key: cred.service_key,
            previous_status: cred.connection_status,
            new_status: testResult.status,
            message: testResult.message,
          });
        }
        
      } catch (testErr) {
        console.error(`[CredentialHealthMonitor] Failed to test ${cred.service_key}:`, testErr);
        results.push({
          service_key: cred.service_key,
          previous_status: cred.connection_status,
          current_status: 'error',
          message: testErr instanceof Error ? testErr.message : 'Test failed',
        });
      }
    }
    
    // If there are critical status changes, create notifications
    const criticalChanges = statusChanges.filter(
      change => change.new_status === 'expired' || change.new_status === 'revoked'
    );
    
    if (criticalChanges.length > 0) {
      console.log(`[CredentialHealthMonitor] ${criticalChanges.length} critical status changes detected`);
      
      // Try to notify via send-notification if available
      for (const change of criticalChanges) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              type: 'integration_alert',
              title: `⚠️ Integration Alert: ${change.service_key}`,
              message: `${change.service_key} credential status changed from ${change.previous_status} to ${change.new_status}. ${change.message}`,
              priority: 'high',
              channels: ['email'],
            }),
          });
        } catch (notifyErr) {
          console.error(`[CredentialHealthMonitor] Failed to send notification:`, notifyErr);
        }
      }
    }
    
    // Log to automation_logs
    await supabase.from('automation_logs').insert({
      function_name: 'credential-health-monitor',
      status: 'completed',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      items_processed: credentials.length,
      items_created: statusChanges.length,
      metadata: {
        results_summary: {
          total_checked: results.length,
          healthy: results.filter(r => r.current_status === 'healthy').length,
          degraded: results.filter(r => r.current_status === 'degraded').length,
          expired: results.filter(r => r.current_status === 'expired').length,
          unknown: results.filter(r => r.current_status === 'unknown').length,
        },
        status_changes: statusChanges,
      },
    });
    
    const duration = Date.now() - startTime;
    console.log(`[CredentialHealthMonitor] Completed in ${duration}ms. Checked: ${results.length}, Changes: ${statusChanges.length}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        checked: results.length,
        status_changes: statusChanges.length,
        critical_alerts: criticalChanges.length,
        duration_ms: duration,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("[CredentialHealthMonitor] Error:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        duration_ms: Date.now() - startTime,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
