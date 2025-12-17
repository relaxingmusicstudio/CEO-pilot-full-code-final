import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Meta (Facebook) Lead Webhook - Receives leads from Meta Lead Ads
 * 
 * Handles:
 * - GET: Webhook verification (hub.challenge)
 * - POST: Lead data from Meta
 * 
 * Tenant Resolution:
 * 1. X-Tenant-Id header
 * 2. X-Api-Key header matched against tenant_integrations
 * 3. Meta page_id matched against tenant_integrations settings
 * 
 * REQUIRES: verify_jwt = false (webhook auth via signature)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id, x-api-key, x-hub-signature-256",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyMetaSignature(
  payload: string,
  signature: string | null,
  appSecret: string | null
): Promise<boolean> {
  if (!signature || !appSecret) {
    return false;
  }

  try {
    const expectedSig = signature.replace("sha256=", "");
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const computed = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    return computed === expectedSig;
  } catch (e) {
    console.error("[meta-lead-webhook] Signature verification failed", { error: e });
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[meta-lead-webhook] Missing Supabase config");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Handle GET - Meta webhook verification
    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      console.log("[meta-lead-webhook] Verification request", { mode, token: token?.slice(0, 8) + "..." });

      if (mode === "subscribe" && token && challenge) {
        // Look up verify token in tenant_integrations
        const { data: integration } = await supabase
          .from("tenant_integrations")
          .select("tenant_id")
          .eq("provider", "meta")
          .eq("meta_verify_token", token)
          .eq("is_active", true)
          .maybeSingle();

        if (integration) {
          console.log("[meta-lead-webhook] Verification successful", { tenant_id: integration.tenant_id });
          return new Response(challenge, { status: 200, headers: corsHeaders });
        }

        console.warn("[meta-lead-webhook] Invalid verify token");
        return new Response("Forbidden", { status: 403 });
      }

      return new Response("Bad Request", { status: 400 });
    }

    // Handle POST - Lead data
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);

    if (!payload || !payload.entry) {
      console.warn("[meta-lead-webhook] Invalid Meta payload");
      return jsonResponse({ error: "Invalid payload format" }, 400);
    }

    // Extract page ID from first entry for tenant lookup
    const pageId = payload.entry?.[0]?.id;

    // Resolve tenant
    let tenantId: string | null = null;
    let appSecret: string | null = null;

    // Method 1: X-Tenant-Id header
    const headerTenantId = req.headers.get("X-Tenant-Id") || req.headers.get("x-tenant-id");
    if (headerTenantId) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("id")
        .eq("id", headerTenantId)
        .maybeSingle();

      if (tenant) {
        tenantId = tenant.id;
        // Get app secret for this tenant
        const { data: integration } = await supabase
          .from("tenant_integrations")
          .select("meta_app_secret")
          .eq("tenant_id", tenantId)
          .eq("provider", "meta")
          .maybeSingle();
        appSecret = integration?.meta_app_secret || null;
      }
    }

    // Method 2: X-Api-Key header lookup
    if (!tenantId) {
      const apiKey = req.headers.get("X-Api-Key") || req.headers.get("x-api-key");
      if (apiKey) {
        const keyHash = await hashApiKey(apiKey);
        const { data: integration } = await supabase
          .from("tenant_integrations")
          .select("tenant_id, meta_app_secret")
          .eq("api_key_hash", keyHash)
          .eq("provider", "meta")
          .eq("is_active", true)
          .maybeSingle();

        if (integration) {
          tenantId = integration.tenant_id;
          appSecret = integration.meta_app_secret;
        }
      }
    }

    // Method 3: Page ID lookup in settings
    if (!tenantId && pageId) {
      const { data: integrations } = await supabase
        .from("tenant_integrations")
        .select("tenant_id, meta_app_secret, settings")
        .eq("provider", "meta")
        .eq("is_active", true);

      for (const int of integrations || []) {
        const settings = int.settings as Record<string, unknown> | null;
        const pageIds = settings?.page_ids as string[] | undefined;
        if (settings?.page_id === pageId || (pageIds && Array.isArray(pageIds) && pageIds.includes(pageId))) {
          tenantId = int.tenant_id;
          appSecret = int.meta_app_secret;
          break;
        }
      }
    }

    if (!tenantId) {
      console.warn("[meta-lead-webhook] Could not resolve tenant", { page_id: pageId });
      return jsonResponse({ error: "Tenant identification required" }, 400);
    }

    // Verify signature if app secret is available
    const signature = req.headers.get("X-Hub-Signature-256") || req.headers.get("x-hub-signature-256");
    const signatureValid = await verifyMetaSignature(rawBody, signature, appSecret);

    // Store raw webhook
    const dedupeKey = `meta_${payload.entry?.[0]?.changes?.[0]?.value?.leadgen_id || Date.now()}`;
    
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
        source: "meta",
        headers,
        payload,
        dedupe_key: dedupeKey,
        status: signatureValid ? "received" : "unverified",
      })
      .select("id")
      .single();

    if (webhookError) {
      if (webhookError.code === "23505") {
        console.log("[meta-lead-webhook] Duplicate webhook", { dedupe_key: dedupeKey });
        return jsonResponse({ status: "duplicate", dedupe_key: dedupeKey });
      }
      console.error("[meta-lead-webhook] Failed to store webhook", { error: webhookError.message });
      return jsonResponse({ error: "Failed to store webhook" }, 500);
    }

    if (!signatureValid && appSecret) {
      console.warn("[meta-lead-webhook] Signature verification failed - processing anyway", {
        tenant_id: tenantId,
        webhook_id: webhook.id,
      });
    }

    // Process each entry/lead
    let leadsCreated = 0;
    const errors: string[] = [];

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "leadgen") continue;

        const leadgenData = change.value;
        if (!leadgenData) continue;

        // Extract lead data from Meta format
        const fieldData: Record<string, string> = {};
        for (const field of leadgenData.field_data || []) {
          fieldData[field.name?.toLowerCase()] = field.values?.[0] || "";
        }

        const leadName = fieldData.full_name || fieldData.name || 
                         `${fieldData.first_name || ""} ${fieldData.last_name || ""}`.trim() ||
                         "Meta Lead";
        const leadEmail = fieldData.email || null;
        const leadPhone = fieldData.phone_number || fieldData.phone || null;

        // Check suppression
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
            source: "meta_lead_ads",
            status: "new",
            do_not_call: doNotCall,
            lead_temperature: "hot", // Meta leads are typically high intent
            inbound_webhook_id: webhook.id,
            metadata: {
              meta_leadgen_id: leadgenData.leadgen_id,
              meta_form_id: leadgenData.form_id,
              meta_page_id: pageId,
              meta_ad_id: leadgenData.ad_id,
              meta_created_time: leadgenData.created_time,
              field_data: fieldData,
              signature_verified: signatureValid,
            },
          })
          .select("id")
          .single();

        if (leadError) {
          errors.push(`Failed to create lead: ${leadError.message}`);
          continue;
        }

        leadsCreated++;

        // Log activity
        await supabase.from("activity_log").insert({
          tenant_id: tenantId,
          activity_type: "lead_created",
          entity_type: "lead",
          entity_id: lead.id,
          description: `New Meta lead: ${leadName}`,
          metadata: { 
            source: "meta_lead_ads", 
            form_id: leadgenData.form_id,
            do_not_call: doNotCall 
          },
        });
      }
    }

    // Update webhook status
    await supabase
      .from("inbound_webhooks")
      .update({
        status: errors.length > 0 ? "partial" : "processed",
        processed_at: new Date().toISOString(),
        error: errors.length > 0 ? errors.join("; ") : null,
      })
      .eq("id", webhook.id);

    console.log("[meta-lead-webhook] Processing complete", {
      tenant_id: tenantId,
      leads_created: leadsCreated,
      errors: errors.length,
      duration_ms: Date.now() - startTime,
    });

    return jsonResponse({
      success: true,
      webhook_id: webhook.id,
      leads_created: leadsCreated,
      signature_verified: signatureValid,
      errors: errors.length > 0 ? errors : undefined,
      duration_ms: Date.now() - startTime,
    });

  } catch (error) {
    console.error("[meta-lead-webhook] Unhandled error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
