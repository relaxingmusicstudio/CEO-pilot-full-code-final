import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Generic Lead Webhook - Receives lead data from external sources
 * 
 * Tenant Resolution:
 * 1. X-Tenant-Id header (preferred)
 * 2. X-Api-Key header matched against tenant_integrations.api_key_hash
 * 
 * REQUIRES: verify_jwt = false (webhook auth via API key)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id, x-api-key",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateDedupeKey(payload: Record<string, unknown>): string {
  // Generate dedupe key from email, phone, or timestamp
  const email = payload.email || payload.Email || "";
  const phone = payload.phone || payload.Phone || "";
  const timestamp = new Date().toISOString().slice(0, 16); // Minute precision
  
  const raw = `${email}|${phone}|${timestamp}`;
  // Simple hash for deduplication
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[lead-webhook] Missing Supabase config");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Parse request body
    const payload = await req.json().catch(() => ({}));
    if (!payload || Object.keys(payload).length === 0) {
      return jsonResponse({ error: "Empty or invalid payload" }, 400);
    }

    // Resolve tenant
    let tenantId: string | null = null;

    // Method 1: X-Tenant-Id header
    const headerTenantId = req.headers.get("X-Tenant-Id") || req.headers.get("x-tenant-id");
    if (headerTenantId) {
      // Validate tenant exists
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .select("id")
        .eq("id", headerTenantId)
        .maybeSingle();

      if (tenantError || !tenant) {
        console.warn("[lead-webhook] Invalid tenant ID", { tenant_id: headerTenantId });
        return jsonResponse({ error: "Invalid tenant ID" }, 400);
      }
      tenantId = tenant.id;
    }

    // Method 2: X-Api-Key header lookup
    if (!tenantId) {
      const apiKey = req.headers.get("X-Api-Key") || req.headers.get("x-api-key");
      if (apiKey) {
        const keyHash = await hashApiKey(apiKey);
        const { data: integration, error: intError } = await supabase
          .from("tenant_integrations")
          .select("tenant_id")
          .eq("api_key_hash", keyHash)
          .eq("provider", "generic")
          .eq("is_active", true)
          .maybeSingle();

        if (intError) {
          console.error("[lead-webhook] Integration lookup failed", { error: intError.message });
        } else if (integration) {
          tenantId = integration.tenant_id;
        }
      }
    }

    if (!tenantId) {
      console.warn("[lead-webhook] Could not resolve tenant");
      return jsonResponse({ error: "Tenant identification required. Provide X-Tenant-Id or X-Api-Key header." }, 400);
    }

    // Generate dedupe key
    const dedupeKey = generateDedupeKey(payload);

    // Store raw webhook in inbound_webhooks
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      if (!key.toLowerCase().includes("authorization") && !key.toLowerCase().includes("api-key")) {
        headers[key] = value;
      }
    });

    const { data: webhook, error: webhookError } = await supabase
      .from("inbound_webhooks")
      .insert({
        tenant_id: tenantId,
        source: "generic",
        headers,
        payload,
        dedupe_key: dedupeKey,
        status: "received",
      })
      .select("id")
      .single();

    if (webhookError) {
      // Check if duplicate
      if (webhookError.code === "23505") {
        console.log("[lead-webhook] Duplicate webhook detected", { dedupe_key: dedupeKey });
        return jsonResponse({ 
          status: "duplicate", 
          message: "This lead has already been processed",
          dedupe_key: dedupeKey 
        });
      }
      console.error("[lead-webhook] Failed to store webhook", { error: webhookError.message });
      return jsonResponse({ error: "Failed to store webhook" }, 500);
    }

    // Normalize payload to lead
    const leadName = payload.name || payload.Name || payload.full_name || payload.fullName || 
                     `${payload.first_name || payload.firstName || ""} ${payload.last_name || payload.lastName || ""}`.trim() ||
                     "Unknown";
    const leadEmail = payload.email || payload.Email || null;
    const leadPhone = payload.phone || payload.Phone || payload.phone_number || payload.phoneNumber || null;
    const leadSource = payload.source || payload.utm_source || "webhook";

    // Check suppression list
    let doNotCall = false;
    if (leadPhone || leadEmail) {
      const { data: suppressed } = await supabase
        .from("suppression_list")
        .select("id")
        .eq("tenant_id", tenantId)
        .or(`phone.eq.${leadPhone || ""},email.eq.${leadEmail || ""}`)
        .limit(1);

      doNotCall = (suppressed?.length || 0) > 0;
    }

    // Insert lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        tenant_id: tenantId,
        name: leadName,
        email: leadEmail,
        phone: leadPhone,
        source: leadSource,
        status: "new",
        do_not_call: doNotCall,
        lead_temperature: "warm",
        inbound_webhook_id: webhook.id,
        metadata: {
          raw_payload: payload,
          received_at: new Date().toISOString(),
        },
      })
      .select("id")
      .single();

    if (leadError) {
      console.error("[lead-webhook] Failed to create lead", { error: leadError.message });
      // Update webhook status
      await supabase
        .from("inbound_webhooks")
        .update({ status: "error", error: leadError.message })
        .eq("id", webhook.id);
      return jsonResponse({ error: "Failed to create lead", details: leadError.message }, 500);
    }

    // Update webhook with success
    await supabase
      .from("inbound_webhooks")
      .update({ 
        status: "processed", 
        processed_at: new Date().toISOString() 
      })
      .eq("id", webhook.id);

    // Log activity
    await supabase.from("activity_log").insert({
      tenant_id: tenantId,
      activity_type: "lead_created",
      entity_type: "lead",
      entity_id: lead.id,
      description: `New lead from webhook: ${leadName}`,
      metadata: { source: leadSource, do_not_call: doNotCall },
    });

    console.log("[lead-webhook] Lead created successfully", { 
      tenant_id: tenantId, 
      lead_id: lead.id, 
      duration_ms: Date.now() - startTime 
    });

    return jsonResponse({
      success: true,
      lead_id: lead.id,
      webhook_id: webhook.id,
      do_not_call: doNotCall,
      duration_ms: Date.now() - startTime,
    });

  } catch (error) {
    console.error("[lead-webhook] Unhandled error", { 
      error: error instanceof Error ? error.message : String(error) 
    });
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
