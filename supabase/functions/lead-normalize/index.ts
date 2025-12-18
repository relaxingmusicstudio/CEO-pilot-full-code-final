import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Lead Normalize Edge Function (Production Hardened v3)
 * 
 * Normalizes, deduplicates, and segments incoming leads.
 * Creates/updates lead_profiles with deterministic fingerprinting.
 * 
 * Auth: Bearer JWT (admin/owner/platform_admin) OR X-Internal-Secret for system calls
 * 
 * Security Features:
 * - Rate limiting (60 req/min per key)
 * - Input validation with size limits
 * - Replay protection (timestamp + nonce) for internal calls
 * - Concurrency-safe dedupe via upsert
 * - CORS allowlist
 * - PII-safe logging
 */

// Type definitions
type Json = Record<string, unknown>;

interface NormalizeRequest {
  tenant_id: string;
  lead: {
    email?: string;
    phone?: string;
    company_name?: string;
    first_name?: string;
    last_name?: string;
    job_title?: string;
    source?: string;
    raw?: Json;
  };
}

interface NormalizeResponse {
  ok: boolean;
  status: "created" | "deduped";
  tenant_id: string;
  lead_id: string;
  lead_profile_id: string;
  fingerprint: string;
  segment: string;
  normalized: { email: string | null; phone: string | null };
  duration_ms: number;
}

interface AuditColumns {
  response_snapshot: boolean;
  user_id: boolean;
}

// ==================== RATE LIMITING ====================
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  entry.count++;
  return true;
}

// ==================== INPUT VALIDATION ====================
const MAX_EMAIL_LEN = 254;
const MAX_PHONE_LEN = 32;
const MAX_COMPANY_LEN = 200;
const MAX_NAME_LEN = 100;
const MAX_PAYLOAD_SIZE = 10240; // 10KB

interface ValidationResult {
  valid: boolean;
  error?: string;
}

function validateInput(body: NormalizeRequest, rawBody: string): ValidationResult {
  // Check payload size
  if (rawBody.length > MAX_PAYLOAD_SIZE) {
    return { valid: false, error: `Payload too large: ${rawBody.length} bytes (max ${MAX_PAYLOAD_SIZE})` };
  }
  
  if (!body.tenant_id || typeof body.tenant_id !== "string") {
    return { valid: false, error: "tenant_id is required and must be a string" };
  }
  
  const { lead } = body;
  if (!lead || typeof lead !== "object") {
    return { valid: false, error: "lead object is required" };
  }
  
  if (!lead.email && !lead.phone) {
    return { valid: false, error: "At least one of email or phone is required" };
  }
  
  if (lead.email && lead.email.length > MAX_EMAIL_LEN) {
    return { valid: false, error: `email exceeds max length (${MAX_EMAIL_LEN})` };
  }
  
  if (lead.phone && lead.phone.length > MAX_PHONE_LEN) {
    return { valid: false, error: `phone exceeds max length (${MAX_PHONE_LEN})` };
  }
  
  if (lead.company_name && lead.company_name.length > MAX_COMPANY_LEN) {
    return { valid: false, error: `company_name exceeds max length (${MAX_COMPANY_LEN})` };
  }
  
  if (lead.first_name && lead.first_name.length > MAX_NAME_LEN) {
    return { valid: false, error: `first_name exceeds max length (${MAX_NAME_LEN})` };
  }
  
  if (lead.last_name && lead.last_name.length > MAX_NAME_LEN) {
    return { valid: false, error: `last_name exceeds max length (${MAX_NAME_LEN})` };
  }
  
  if (lead.job_title && lead.job_title.length > MAX_NAME_LEN) {
    return { valid: false, error: `job_title exceeds max length (${MAX_NAME_LEN})` };
  }
  
  return { valid: true };
}

// ==================== CORS HANDLING ====================
function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOriginsStr = Deno.env.get("ALLOWED_ORIGINS") || "";
  const allowedOrigins = allowedOriginsStr
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const isDev =
    Deno.env.get("DENO_ENV") === "development" ||
    Deno.env.get("NODE_ENV") === "development";

  let allowOrigin: string | null = null;
  let varyOrigin = false;

  if (allowedOrigins.length > 0) {
    // Explicit allowlist configured
    if (
      origin &&
      (allowedOrigins.includes(origin) || allowedOrigins.includes("*"))
    ) {
      allowOrigin = origin;
      varyOrigin = true;
    }
    // else: do NOT set allow-origin (blocked)
  } else if (isDev) {
    // Development with no allowlist: echo origin for consistent behavior
    if (origin) {
      allowOrigin = origin;
      varyOrigin = true;
    } else {
      allowOrigin = "*";
    }
  } else {
    // Production with no allowlist:
    // - If Origin exists: do NOT set allow-origin (blocked)
    // - If Origin missing: do NOT set allow-origin (CORS irrelevant to server-to-server)
    allowOrigin = null;
  }

  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-internal-secret, x-request-timestamp, x-request-nonce",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
  }

  if (varyOrigin) {
    headers["Vary"] = "Origin";
  }

  return headers;
}

function jsonResponse(data: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ==================== AUDIT HELPERS ====================
let auditColumnsCache: AuditColumns | null = null;

// deno-lint-ignore no-explicit-any
async function checkAuditColumns(supabase: any): Promise<AuditColumns> {
  if (auditColumnsCache) return auditColumnsCache;
  
  try {
    const { error: respError } = await supabase
      .from("platform_audit_log")
      .select("response_snapshot")
      .limit(0);
    
    const { error: userError } = await supabase
      .from("platform_audit_log")
      .select("user_id")
      .limit(0);
    
    auditColumnsCache = {
      response_snapshot: !respError,
      user_id: !userError,
    };
    
    return auditColumnsCache;
  } catch {
    return { response_snapshot: false, user_id: false };
  }
}

// deno-lint-ignore no-explicit-any
async function safeAuditInsert(supabase: any, auditData: Json, auditColumns: AuditColumns): Promise<void> {
  try {
    const insertData: Json = {
      tenant_id: auditData.tenant_id,
      timestamp: auditData.timestamp,
      agent_name: auditData.agent_name,
      action_type: auditData.action_type,
      entity_type: auditData.entity_type,
      entity_id: auditData.entity_id,
      description: auditData.description,
      request_snapshot: auditData.request_snapshot,
      success: auditData.success,
    };
    
    if (auditColumns.response_snapshot && auditData.response_snapshot !== undefined) {
      insertData.response_snapshot = auditData.response_snapshot;
    }
    
    if (auditColumns.user_id && auditData.user_id !== undefined) {
      insertData.user_id = auditData.user_id;
    }
    
    const { error } = await supabase.from("platform_audit_log").insert(insertData);
    
    if (error) {
      console.warn("[lead-normalize] Audit insert failed (non-blocking):", error.code);
    }
  } catch (err) {
    console.warn("[lead-normalize] Audit exception (non-blocking):", err instanceof Error ? err.message : "unknown");
  }
}

// ==================== LOGGING HELPERS (PII-SAFE) ====================
function safeLog(message: string, data: Record<string, unknown>): void {
  // Never log raw email/phone - only fingerprint prefix and metadata
  const safeData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "fingerprint" && typeof value === "string") {
      safeData[key] = value.substring(0, 6) + "...";
    } else if (["email", "phone", "raw_email", "raw_phone"].includes(key)) {
      safeData[key] = "[REDACTED]";
    } else {
      safeData[key] = value;
    }
  }
  console.log(`[lead-normalize] ${message}`, safeData);
}

// ==================== MAIN HANDLER ====================
serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const internalSecret = Deno.env.get("INTERNAL_SCHEDULER_SECRET");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      console.error("[lead-normalize] Missing Supabase config");
      return jsonResponse({ error: "Server configuration error" }, 500, corsHeaders);
    }

    // ==================== AUTH ====================
    const authHeader = req.headers.get("Authorization");
    const internalSecretHeader = req.headers.get("X-Internal-Secret");
    const requestTimestamp = req.headers.get("X-Request-Timestamp");
    const requestNonce = req.headers.get("X-Request-Nonce");
    
    let isAuthorized = false;
    let userId: string | null = null;
    let isSystemCall = false;
    let rateLimitKey = "anonymous";

    // Get IP for rate limiting fallback
    const forwardedFor = req.headers.get("x-forwarded-for");
    const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";

    // Check internal secret (system-to-system calls)
    if (internalSecret && internalSecretHeader && internalSecretHeader === internalSecret) {
      // Replay protection: validate timestamp within ±5 minutes
      if (requestTimestamp) {
        const ts = parseInt(requestTimestamp, 10);
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        
        if (isNaN(ts) || Math.abs(now - ts) > fiveMinutes) {
          safeLog("Rejected: timestamp outside window", { ts, now, diff: Math.abs(now - ts) });
          return jsonResponse({ error: "Request timestamp expired or invalid" }, 400, corsHeaders);
        }
      }
      
      // Create service role client for nonce check
      const supabaseService = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
      });
      
      // Nonce replay check (if nonce provided)
      if (requestNonce) {
        const { error: nonceError } = await supabaseService
          .from("request_nonces")
          .insert({ tenant_id: "system", nonce: requestNonce });
        
        if (nonceError && nonceError.code === "23505") {
          safeLog("Rejected: nonce replay detected", { nonce: requestNonce.substring(0, 8) });
          return jsonResponse({ error: "Replay detected" }, 409, corsHeaders);
        }
      }
      
      isAuthorized = true;
      userId = "system";
      isSystemCall = true;
      rateLimitKey = "system";
      safeLog("Authorized via internal secret", {});
    }

    // Check JWT auth
    if (!isAuthorized && authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      
      const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      
      const { data: { user }, error: authError } = await supabaseAnon.auth.getUser();
      
      if (authError || !user) {
        safeLog("JWT auth failed", { error: authError?.message });
        return jsonResponse({ error: "Unauthorized", details: authError?.message }, 401, corsHeaders);
      }

      // Check roles
      const { data: roles, error: rolesError } = await supabaseAnon
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (rolesError) {
        safeLog("Role lookup failed", { error: rolesError.message });
        return jsonResponse({ error: "Failed to verify permissions" }, 500, corsHeaders);
      }

      const allowedRoles = ["admin", "owner", "platform_admin"];
      const hasRole = roles?.some((r: { role: string }) => allowedRoles.includes(r.role));
      if (!hasRole) {
        safeLog("Insufficient role", { user_id: user.id });
        return jsonResponse({ error: "Insufficient permissions", required: allowedRoles }, 403, corsHeaders);
      }

      isAuthorized = true;
      userId = user.id;
      rateLimitKey = user.id;
      safeLog("Authorized via JWT", { user_id: user.id });
    }

    if (!isAuthorized) {
      rateLimitKey = clientIp;
      return jsonResponse({ error: "Unauthorized", hint: "Provide Bearer token or X-Internal-Secret" }, 401, corsHeaders);
    }

    // ==================== RATE LIMITING ====================
    if (!checkRateLimit(rateLimitKey)) {
      safeLog("Rate limited", { key: rateLimitKey.substring(0, 8) });
      return jsonResponse({ error: "Rate limited" }, 429, corsHeaders);
    }

    // ==================== PARSE & VALIDATE INPUT ====================
    const rawBody = await req.text();
    let body: NormalizeRequest;
    
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
    }
    
    const validation = validateInput(body, rawBody);
    if (!validation.valid) {
      return jsonResponse({ error: validation.error }, 400, corsHeaders);
    }

    const { lead } = body;

    // ==================== DATABASE OPERATIONS (ATOMIC RPC) ====================
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const auditColumns = await checkAuditColumns(supabase);

    // Validate tenant first
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("id", body.tenant_id)
      .maybeSingle();

    if (tenantError || !tenant) {
      safeLog("Invalid tenant", { tenant_id: body.tenant_id });
      return jsonResponse({ error: "Invalid tenant_id" }, 400, corsHeaders);
    }

    // Call atomic normalize RPC (handles dedupe + create in one transaction)
    const { data: rpcResult, error: rpcError } = await supabase.rpc("normalize_lead_atomic", {
      p_tenant_id: body.tenant_id,
      p_email: lead.email || null,
      p_phone: lead.phone || null,
      p_company_name: lead.company_name || null,
      p_first_name: lead.first_name || null,
      p_last_name: lead.last_name || null,
      p_job_title: lead.job_title || null,
      p_source: lead.source || "lead-normalize",
    });

    if (rpcError) {
      safeLog("Atomic normalize RPC failed", { error: rpcError.message, code: rpcError.code });
      return jsonResponse({ error: "Normalization failed", details: rpcError.message }, 500, corsHeaders);
    }

    // Type the RPC result
    const result = rpcResult as {
      ok: boolean;
      status?: "created" | "deduped";
      lead_id?: string;
      lead_profile_id?: string;
      fingerprint?: string;
      segment?: string;
      normalized?: { email: string | null; phone: string | null };
      error?: string;
      error_code?: string;
    };

    if (!result.ok) {
      safeLog("Atomic normalize returned error", { 
        error: result.error, 
        fingerprint_prefix: result.fingerprint?.substring(0, 6) 
      });
      return jsonResponse({ 
        error: result.error || "Normalization failed", 
        code: result.error_code 
      }, 500, corsHeaders);
    }

    const { status, lead_id: leadId, lead_profile_id: leadProfileId, fingerprint, segment, normalized } = result;

    // Audit log
    await safeAuditInsert(supabase, {
      tenant_id: body.tenant_id,
      timestamp: new Date().toISOString(),
      agent_name: "lead-normalize",
      action_type: "lead_normalize_called",
      entity_type: "lead",
      entity_id: leadId || "",
      description: `Lead normalized (${status})`,
      request_snapshot: { fingerprint_prefix: fingerprint?.substring(0, 6), segment },
      response_snapshot: { status, lead_id: leadId, lead_profile_id: leadProfileId },
      success: true,
      user_id: isSystemCall ? null : userId,
    }, auditColumns);

    const durationMs = Date.now() - startTime;
    safeLog("Success", {
      status,
      tenant_id: body.tenant_id,
      fingerprint_prefix: fingerprint?.substring(0, 6),
      segment,
      duration_ms: durationMs,
    });

    const response: NormalizeResponse = {
      ok: true,
      status: status!,
      tenant_id: body.tenant_id,
      lead_id: leadId!,
      lead_profile_id: leadProfileId!,
      fingerprint: fingerprint!,
      segment: segment as "b2b" | "b2c" | "unknown",
      normalized: normalized || { email: null, phone: null },
      duration_ms: durationMs,
    };

    return jsonResponse(response, 200, corsHeaders);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[lead-normalize] Unhandled error:", errorMsg);
    return jsonResponse({ error: "Internal server error" }, 500, getCorsHeaders(null));
  }
});
