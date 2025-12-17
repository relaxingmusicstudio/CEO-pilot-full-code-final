import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Lead Outreach Engine
 * 
 * Manages the lead lifecycle state machine and outreach attempt logic.
 * Internal-only via X-Internal-Secret.
 * 
 * Actions:
 * - process_outreach_queue: Find leads due for outreach, execute attempts
 * - record_attempt: Record an outreach attempt and update lead state
 * - mark_booked: Mark lead as booked and create CEO action
 * - get_due_leads: Get leads ready for outreach (for external dialer integration)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

// Lead lifecycle states
const LEAD_STATES = {
  NEW: "new",
  ATTEMPTED: "attempted",
  CONTACTED: "contacted",
  BOOKED: "booked",
  COMPLETED: "completed",
  CONVERTED: "converted",
  DISQUALIFIED: "disqualified",
  UNREACHABLE: "unreachable",
} as const;

// Outcomes that stop outreach
const TERMINAL_OUTCOMES = ["booked", "converted", "disqualified", "not_interested", "wrong_number", "do_not_call"];

// Outcomes that mark as unreachable after max attempts
const UNREACHABLE_OUTCOMES = ["no_answer", "voicemail", "busy", "disconnected"];

// Default attempt spacing in hours
const ATTEMPT_SPACING_HOURS = [0, 4, 24, 48, 72, 120]; // 0h, 4h, 1d, 2d, 3d, 5d

const MAX_ATTEMPTS = 6;

interface AttemptRecord {
  lead_id: string;
  tenant_id: string;
  outcome: string;
  outcome_reason?: string;
  call_log_id?: string;
  notes?: string;
}

interface LeadForOutreach {
  id: string;
  tenant_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  total_call_attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  lead_temperature: string | null;
}

class MissingSecretError extends Error {
  secretName: string;
  constructor(secretName: string) {
    super(`Missing required secret: ${secretName}`);
    this.secretName = secretName;
  }
}

class UnauthorizedInternalError extends Error {
  constructor() {
    super("Invalid or missing internal authentication");
  }
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new MissingSecretError(name);
  return value;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireInternalAuth(req: Request): void {
  const expected = requireEnv("INTERNAL_SCHEDULER_SECRET");
  const provided = req.headers.get("x-internal-secret") || req.headers.get("X-Internal-Secret");
  if (!provided || provided !== expected) throw new UnauthorizedInternalError();
}

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Calculate next attempt time based on attempt count
 */
function calculateNextAttemptAt(attemptCount: number): Date | null {
  if (attemptCount >= MAX_ATTEMPTS) return null;
  
  const hoursDelay = ATTEMPT_SPACING_HOURS[attemptCount] ?? 120;
  return new Date(Date.now() + hoursDelay * 60 * 60 * 1000);
}

/**
 * Determine new lead status based on outcome
 */
function determineNewStatus(outcome: string, attemptCount: number, maxAttempts: number): string {
  // Terminal outcomes
  if (outcome === "booked") return LEAD_STATES.BOOKED;
  if (outcome === "converted") return LEAD_STATES.CONVERTED;
  if (TERMINAL_OUTCOMES.includes(outcome)) return LEAD_STATES.DISQUALIFIED;
  
  // Successful contact but not booked
  if (outcome === "contacted" || outcome === "callback_requested" || outcome === "interested") {
    return LEAD_STATES.CONTACTED;
  }
  
  // Unreachable after max attempts
  if (UNREACHABLE_OUTCOMES.includes(outcome) && attemptCount >= maxAttempts) {
    return LEAD_STATES.UNREACHABLE;
  }
  
  // Still attempting
  return LEAD_STATES.ATTEMPTED;
}

/**
 * Get leads due for outreach attempt
 */
async function getDueLeads(
  supabase: SupabaseClient,
  tenantId: string | null,
  limit: number = 50
): Promise<LeadForOutreach[]> {
  const now = new Date().toISOString();
  
  let query = supabase
    .from("leads")
    .select("id, tenant_id, name, phone, email, status, total_call_attempts, max_attempts, next_attempt_at, lead_temperature")
    .in("status", [LEAD_STATES.NEW, LEAD_STATES.ATTEMPTED, LEAD_STATES.CONTACTED])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .not("phone", "is", null)
    .eq("do_not_call", false)
    .order("lead_temperature", { ascending: false, nullsFirst: false }) // hot first
    .order("next_attempt_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  
  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error("[lead-outreach-engine] getDueLeads failed", { message: error.message });
    return [];
  }
  
  // Filter leads under max attempts
  return (data || []).filter((lead: LeadForOutreach) => {
    const maxAttempts = lead.max_attempts || MAX_ATTEMPTS;
    return lead.total_call_attempts < maxAttempts;
  });
}

/**
 * Record an outreach attempt and update lead state
 */
async function recordAttempt(
  supabase: SupabaseClient,
  attempt: AttemptRecord
): Promise<{ success: boolean; new_status: string; error?: string }> {
  // Get current lead state
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, tenant_id, status, total_call_attempts, max_attempts")
    .eq("id", attempt.lead_id)
    .eq("tenant_id", attempt.tenant_id)
    .maybeSingle();
  
  if (leadError || !lead) {
    return { success: false, new_status: "", error: "Lead not found or access denied" };
  }
  
  const currentAttempts = (lead.total_call_attempts || 0) + 1;
  const maxAttempts = lead.max_attempts || MAX_ATTEMPTS;
  const newStatus = determineNewStatus(attempt.outcome, currentAttempts, maxAttempts);
  const shouldScheduleNext = newStatus === LEAD_STATES.ATTEMPTED || newStatus === LEAD_STATES.CONTACTED;
  const nextAttemptAt = shouldScheduleNext ? calculateNextAttemptAt(currentAttempts) : null;
  
  // Update lead
  const updateData: Record<string, unknown> = {
    status: newStatus,
    total_call_attempts: currentAttempts,
    last_call_date: new Date().toISOString(),
    last_call_outcome: attempt.outcome,
    outcome_reason: attempt.outcome_reason || null,
    next_attempt_at: nextAttemptAt?.toISOString() || null,
    updated_at: new Date().toISOString(),
  };
  
  // Set booked_at if newly booked
  if (newStatus === LEAD_STATES.BOOKED && lead.status !== LEAD_STATES.BOOKED) {
    updateData.booked_at = new Date().toISOString();
  }
  
  const { error: updateError } = await supabase
    .from("leads")
    .update(updateData)
    .eq("id", attempt.lead_id)
    .eq("tenant_id", attempt.tenant_id);
  
  if (updateError) {
    console.error("[lead-outreach-engine] Failed to update lead", { lead_id: attempt.lead_id, message: updateError.message });
    return { success: false, new_status: newStatus, error: updateError.message };
  }
  
  // Log activity (fire and forget - don't await)
  void (async () => {
    try {
      await supabase.from("lead_activities").insert({
        lead_id: attempt.lead_id,
        activity_type: "outreach_attempt",
        description: `Outreach attempt #${currentAttempts}: ${attempt.outcome}`,
        outcome: attempt.outcome,
        metadata: {
          attempt_number: currentAttempts,
          outcome: attempt.outcome,
          outcome_reason: attempt.outcome_reason,
          new_status: newStatus,
          call_log_id: attempt.call_log_id,
        },
      });
    } catch { /* ignore activity log errors */ }
  })();
  
  console.log("[lead-outreach-engine] Recorded attempt", {
    lead_id: attempt.lead_id,
    attempt: currentAttempts,
    outcome: attempt.outcome,
    new_status: newStatus,
  });
  
  return { success: true, new_status: newStatus };
}

/**
 * Mark a lead as booked and create CEO action
 */
async function markBooked(
  supabase: SupabaseClient,
  leadId: string,
  tenantId: string,
  bookingDetails?: { scheduled_at?: string; notes?: string }
): Promise<{ success: boolean; error?: string }> {
  // Update lead to booked
  const { error: updateError } = await supabase
    .from("leads")
    .update({
      status: LEAD_STATES.BOOKED,
      booked_at: new Date().toISOString(),
      last_call_outcome: "booked",
      outcome_reason: bookingDetails?.notes || "Booking confirmed",
      next_attempt_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("tenant_id", tenantId);
  
  if (updateError) {
    return { success: false, error: updateError.message };
  }
  
  // Create CEO action for booking preparation
  const { error: actionError } = await supabase.from("ceo_action_queue").insert({
    tenant_id: tenantId,
    action_type: "booking_preparation",
    target_type: "lead",
    target_id: leadId,
    status: "pending",
    priority: 1, // high priority
    source: "outreach_engine",
    action_payload: {
      title: "Prepare for booked call",
      description: "A lead has been booked. Review their information and prepare for the appointment.",
      lead_id: leadId,
      scheduled_at: bookingDetails?.scheduled_at,
    },
    claude_reasoning: "Automated action created when lead status changed to booked",
  });
  
  if (actionError) {
    console.error("[lead-outreach-engine] Failed to create booking action", { lead_id: leadId, message: actionError.message });
  }
  
  // Log activity (fire and forget - don't await)
  void (async () => {
    try {
      await supabase.from("lead_activities").insert({
        lead_id: leadId,
        activity_type: "booking",
        description: "Lead booked for appointment",
        metadata: bookingDetails,
      });
    } catch { /* ignore */ }
  })();
  
  console.log("[lead-outreach-engine] Lead marked as booked", { lead_id: leadId, tenant_id: tenantId });
  
  return { success: true };
}

/**
 * Process outreach queue for a tenant
 */
async function processOutreachQueue(
  supabase: SupabaseClient,
  tenantId: string,
  dryRun: boolean = false
): Promise<{ processed: number; due_leads: LeadForOutreach[] }> {
  const dueLeads = await getDueLeads(supabase, tenantId, 100);
  
  if (dryRun) {
    return { processed: 0, due_leads: dueLeads };
  }
  
  // In production, this would integrate with the dialer
  // For now, just return the due leads for external processing
  return { processed: 0, due_leads: dueLeads };
}

/**
 * Get outreach statistics for a tenant
 */
async function getOutreachStats(
  supabase: SupabaseClient,
  tenantId: string
): Promise<Record<string, number>> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  // Get status counts
  const { data: statusCounts } = await supabase
    .from("leads")
    .select("status")
    .eq("tenant_id", tenantId);
  
  const counts: Record<string, number> = {
    new: 0,
    attempted: 0,
    contacted: 0,
    booked: 0,
    completed: 0,
    converted: 0,
    disqualified: 0,
    unreachable: 0,
  };
  
  for (const lead of (statusCounts || [])) {
    const status = (lead.status || "new").toLowerCase();
    if (counts[status] !== undefined) {
      counts[status]++;
    }
  }
  
  // Get booked in last 24h
  const { count: booked24h } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", LEAD_STATES.BOOKED)
    .gte("booked_at", yesterday);
  
  // Get unreachable in last 24h
  const { count: unreachable24h } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", LEAD_STATES.UNREACHABLE)
    .gte("updated_at", yesterday);
  
  // Get conversion rate (7d)
  const { count: converted7d } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", LEAD_STATES.CONVERTED)
    .gte("converted_at", sevenDaysAgo);
  
  const { count: total7d } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("created_at", sevenDaysAgo);
  
  const conversionRate7d = total7d && total7d > 0 ? Math.round((converted7d || 0) / total7d * 100) : 0;
  
  return {
    ...counts,
    booked_24h: booked24h || 0,
    unreachable_24h: unreachable24h || 0,
    converted_7d: converted7d || 0,
    total_7d: total7d || 0,
    conversion_rate_7d: conversionRate7d,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    requireInternalAuth(req);
    
    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    );
    
    const body = await req.json().catch(() => ({}));
    const { action, tenant_id, lead_id, outcome, outcome_reason, call_log_id, notes, booking_details, dry_run } = body;
    
    // Validate tenant_id for tenant-specific actions
    if (tenant_id && !isValidUUID(tenant_id)) {
      return jsonResponse({ error: "Invalid tenant_id" }, 400);
    }
    
    switch (action) {
      case "get_due_leads": {
        if (!tenant_id) {
          return jsonResponse({ error: "tenant_id required" }, 400);
        }
        const leads = await getDueLeads(supabase, tenant_id, body.limit || 50);
        return jsonResponse({ success: true, leads, count: leads.length });
      }
      
      case "record_attempt": {
        if (!lead_id || !tenant_id || !outcome) {
          return jsonResponse({ error: "lead_id, tenant_id, and outcome required" }, 400);
        }
        const result = await recordAttempt(supabase, {
          lead_id,
          tenant_id,
          outcome,
          outcome_reason,
          call_log_id,
          notes,
        });
        return jsonResponse(result, result.success ? 200 : 400);
      }
      
      case "mark_booked": {
        if (!lead_id || !tenant_id) {
          return jsonResponse({ error: "lead_id and tenant_id required" }, 400);
        }
        const result = await markBooked(supabase, lead_id, tenant_id, booking_details);
        return jsonResponse(result, result.success ? 200 : 400);
      }
      
      case "process_queue": {
        if (!tenant_id) {
          return jsonResponse({ error: "tenant_id required" }, 400);
        }
        const result = await processOutreachQueue(supabase, tenant_id, dry_run);
        return jsonResponse({ success: true, ...result });
      }
      
      case "get_stats": {
        if (!tenant_id) {
          return jsonResponse({ error: "tenant_id required" }, 400);
        }
        const stats = await getOutreachStats(supabase, tenant_id);
        return jsonResponse({ success: true, stats });
      }
      
      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    if (error instanceof MissingSecretError) {
      return jsonResponse({ error: `Missing required secret: ${error.secretName}` }, 500);
    }
    if (error instanceof UnauthorizedInternalError) {
      return jsonResponse({ error: "Unauthorized", message: "Invalid or missing internal authentication" }, 401);
    }
    
    console.error("[lead-outreach-engine] Unhandled error", { message: error instanceof Error ? error.message : String(error) });
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
