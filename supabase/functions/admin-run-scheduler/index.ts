import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Admin Run Scheduler - Proxy to call ceo-scheduler with internal secret
 * 
 * This function allows authenticated admin users to trigger scheduler actions
 * without exposing INTERNAL_SCHEDULER_SECRET to the browser.
 * 
 * REQUIRES: verify_jwt = true in config.toml
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Get auth header from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    // Initialize Supabase client with user's JWT
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[admin-run-scheduler] Missing Supabase config");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error("[admin-run-scheduler] Auth failed", { error: userError?.message });
      return jsonResponse({ error: "Authentication failed" }, 401);
    }

    // Check if user is admin using user_roles table
    const { data: roleData, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError) {
      console.error("[admin-run-scheduler] Role check failed", { error: roleError.message });
      return jsonResponse({ error: "Failed to verify permissions" }, 500);
    }

    if (!roleData) {
      console.warn("[admin-run-scheduler] Non-admin access attempt", { user_id: user.id });
      return jsonResponse({ error: "Admin access required" }, 403);
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { action, tenant_ids } = body as { action?: string; tenant_ids?: string[] };

    if (!action) {
      return jsonResponse({ error: "Missing required field: action" }, 400);
    }

    // Validate action
    const allowedActions = ["run_daily_briefs", "run_cost_rollup", "run_outreach_queue", "check_job_status"];
    if (!allowedActions.includes(action)) {
      return jsonResponse({ error: `Invalid action. Allowed: ${allowedActions.join(", ")}` }, 400);
    }

    // Get internal scheduler secret
    const internalSecret = Deno.env.get("INTERNAL_SCHEDULER_SECRET");
    if (!internalSecret) {
      console.error("[admin-run-scheduler] INTERNAL_SCHEDULER_SECRET not configured");
      return jsonResponse({ error: "Server configuration error: scheduler secret not set" }, 500);
    }

    // Call ceo-scheduler with internal secret
    const schedulerUrl = `${supabaseUrl}/functions/v1/ceo-scheduler`;
    const schedulerBody: Record<string, unknown> = { action };
    if (tenant_ids && Array.isArray(tenant_ids)) {
      schedulerBody.tenant_ids = tenant_ids;
    }

    console.log("[admin-run-scheduler] Calling ceo-scheduler", { action, user_id: user.id });

    const schedulerResponse = await fetch(schedulerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": internalSecret,
      },
      body: JSON.stringify(schedulerBody),
    });

    const schedulerResult = await schedulerResponse.json();

    // Log to platform_audit_log
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { persistSession: false } },
    );

    await serviceClient.from("platform_audit_log").insert({
      user_id: user.id,
      action_type: "admin_scheduler_trigger",
      entity_type: "scheduler",
      entity_id: action,
      description: `Admin triggered scheduler action: ${action}`,
      request_snapshot: { action, tenant_ids },
      response_snapshot: { status: schedulerResponse.status, result: schedulerResult },
      success: schedulerResponse.ok,
      duration_ms: Date.now() - startTime,
    });

    if (!schedulerResponse.ok) {
      console.error("[admin-run-scheduler] Scheduler call failed", { 
        status: schedulerResponse.status, 
        result: schedulerResult 
      });
      return jsonResponse({ 
        error: "Scheduler call failed", 
        scheduler_error: schedulerResult 
      }, schedulerResponse.status);
    }

    return jsonResponse({
      success: true,
      action,
      result: schedulerResult,
      triggered_by: user.id,
      duration_ms: Date.now() - startTime,
    });

  } catch (error) {
    console.error("[admin-run-scheduler] Unhandled error", { 
      error: error instanceof Error ? error.message : String(error) 
    });
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
