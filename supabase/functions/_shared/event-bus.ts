/**
 * Event Bus - System Contract v1.1.1 Phase 2B
 * 
 * Canonical event system using Phase 2A RPCs for:
 * - Atomic claiming (claim_system_events with FOR UPDATE SKIP LOCKED)
 * - Reliable processing (mark_event_processed, mark_event_failed)
 * - Dead-lettering after 5 failures
 * 
 * All operations use SUPABASE_SERVICE_ROLE_KEY for security.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================
// TYPES (aligned with system_events schema)
// ============================================

export interface SystemEvent {
  id: string;
  tenant_id: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  emitted_by: string;
  emitted_at: string;
  idempotency_key: string;
  status: 'pending' | 'processing' | 'processed' | 'failed' | 'dead_letter';
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  processed_at: string | null;
  processed_by: string | null;
}

export interface EmitEventParams {
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  emittedBy: string;
  tenantId?: string | null;
  idempotencyKey: string;
}

export interface EmitResult {
  success: boolean;
  eventId?: string;
  duplicate?: boolean;
  error?: string;
}

export interface ClaimEventsParams {
  consumerName: string;
  eventType: string;
  limit?: number;
}

export interface ClaimResult {
  events: SystemEvent[];
  error?: string;
}

export interface ProcessResult {
  success: boolean;
  error?: string;
}

export interface FailResult {
  success: boolean;
  deadLettered?: boolean;
  error?: string;
}

// ============================================
// INTERNAL: SUPABASE ADMIN CLIENT
// ============================================

let _adminClient: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (_adminClient) return _adminClient;
  
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("[EventBus] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  
  _adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  
  return _adminClient;
}

// ============================================
// A) EMIT EVENT (idempotent insert)
// ============================================

/**
 * Emit a canonical event to the event bus.
 * Idempotent - duplicate idempotency_key returns {success:true, duplicate:true}
 */
export async function emitEvent(params: EmitEventParams): Promise<EmitResult> {
  const supabase = getSupabaseAdmin();
  
  console.log(`[EventBus] Emitting: ${params.eventType} | ${params.entityType}:${params.entityId}`);
  
  const { data, error } = await supabase
    .from('system_events')
    .insert({
      tenant_id: params.tenantId ?? null,
      event_type: params.eventType,
      entity_type: params.entityType,
      entity_id: params.entityId,
      payload: params.payload,
      emitted_by: params.emittedBy,
      idempotency_key: params.idempotencyKey,
      status: 'pending',
      attempts: 0,
    })
    .select('id')
    .single();

  if (error) {
    // Unique constraint violation = duplicate idempotency_key
    if (error.code === '23505') {
      console.log(`[EventBus] Duplicate (idempotent): ${params.idempotencyKey}`);
      return { success: true, duplicate: true };
    }
    console.error(`[EventBus] Emit error:`, error.message);
    return { success: false, error: error.message };
  }

  console.log(`[EventBus] Emitted: ${data.id}`);
  return { success: true, eventId: data.id };
}

// ============================================
// B) CLAIM EVENTS (atomic via RPC)
// ============================================

/**
 * Claim pending events for processing using claim_system_events RPC.
 * Uses SELECT FOR UPDATE SKIP LOCKED for atomic claiming.
 * Returns empty array if consumer is disabled or not found.
 */
export async function claimEvents(params: ClaimEventsParams): Promise<ClaimResult> {
  const supabase = getSupabaseAdmin();
  const limit = params.limit ?? 10;
  
  console.log(`[EventBus] Claiming: consumer=${params.consumerName} type=${params.eventType} limit=${limit}`);
  
  // Check if consumer is enabled
  const { data: consumer, error: consumerError } = await supabase
    .from('system_event_consumers')
    .select('enabled')
    .eq('consumer_name', params.consumerName)
    .eq('event_type', params.eventType)
    .maybeSingle();
  
  if (consumerError) {
    console.error(`[EventBus] Consumer check error:`, consumerError.message);
    return { events: [], error: consumerError.message };
  }
  
  if (!consumer) {
    console.log(`[EventBus] Consumer not registered: ${params.consumerName}/${params.eventType}`);
    return { events: [] };
  }
  
  if (!consumer.enabled) {
    console.log(`[EventBus] Consumer disabled: ${params.consumerName}`);
    return { events: [] };
  }
  
  // Call RPC for atomic claiming with FOR UPDATE SKIP LOCKED
  const { data: events, error: claimError } = await supabase
    .rpc('claim_system_events', {
      p_event_type: params.eventType,
      p_limit: limit
    });
  
  if (claimError) {
    console.error(`[EventBus] Claim RPC error:`, claimError.message);
    return { events: [], error: claimError.message };
  }
  
  const claimed = (events || []) as SystemEvent[];
  console.log(`[EventBus] Claimed: ${claimed.length} events`);
  return { events: claimed };
}

// ============================================
// C) MARK PROCESSED (via RPC)
// ============================================

/**
 * Mark an event as successfully processed.
 * Updates system_events.status='processed' and system_event_consumers tracking.
 */
export async function markProcessed(
  eventId: string,
  consumerName: string
): Promise<ProcessResult> {
  const supabase = getSupabaseAdmin();
  
  console.log(`[EventBus] Marking processed: ${eventId} by ${consumerName}`);
  
  const { error } = await supabase
    .rpc('mark_event_processed', {
      p_event_id: eventId,
      p_consumer_name: consumerName
    });
  
  if (error) {
    console.error(`[EventBus] Mark processed error:`, error.message);
    return { success: false, error: error.message };
  }
  
  console.log(`[EventBus] Processed: ${eventId}`);
  return { success: true };
}

// ============================================
// D) MARK FAILED (via RPC, with dead-lettering)
// ============================================

/**
 * Mark an event as failed with error message.
 * RPC handles:
 * - Incrementing attempts
 * - Exponential backoff (2^attempts seconds, capped at 5 min)
 * - Dead-lettering after 5 attempts
 * - CEO alert creation for dead-lettered events
 */
export async function markFailed(
  eventId: string,
  consumerName: string,
  errorMessage: string
): Promise<FailResult> {
  const supabase = getSupabaseAdmin();
  
  console.log(`[EventBus] Marking failed: ${eventId} | ${errorMessage}`);
  
  const { error } = await supabase
    .rpc('mark_event_failed', {
      p_event_id: eventId,
      p_consumer_name: consumerName,
      p_error: errorMessage
    });
  
  if (error) {
    console.error(`[EventBus] Mark failed error:`, error.message);
    return { success: false, error: error.message };
  }
  
  // Check if event was dead-lettered by re-reading status
  const { data: event } = await supabase
    .from('system_events')
    .select('status')
    .eq('id', eventId)
    .single();
  
  const deadLettered = event?.status === 'dead_letter';
  if (deadLettered) {
    console.log(`[EventBus] Dead-lettered: ${eventId}`);
  } else {
    console.log(`[EventBus] Failed (will retry): ${eventId}`);
  }
  
  return { success: true, deadLettered };
}

// ============================================
// UTILITY: GET AUTOPILOT MODE
// ============================================

export type AutopilotMode = 'MANUAL' | 'ASSISTED' | 'FULL';

/**
 * Get current autopilot mode for a tenant.
 * MANUAL = queue all for CEO approval
 * ASSISTED = auto-execute low-risk, queue high-risk
 * FULL = auto-execute all within budget
 */
export async function getAutopilotMode(tenantId?: string | null): Promise<AutopilotMode> {
  const supabase = getSupabaseAdmin();
  
  const { data: settings } = await supabase
    .from('ceo_autopilot_settings')
    .select('is_active, mode')
    .limit(1)
    .maybeSingle();
  
  if (!settings?.is_active) {
    return 'MANUAL';
  }
  
  const mode = settings.mode?.toUpperCase();
  if (mode === 'FULL') return 'FULL';
  if (mode === 'ASSISTED') return 'ASSISTED';
  
  return 'MANUAL';
}

// ============================================
// UTILITY: CHECK CONSUMER ENABLED
// ============================================

export async function isConsumerEnabled(
  consumerName: string,
  eventType: string
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  
  const { data } = await supabase
    .from('system_event_consumers')
    .select('enabled')
    .eq('consumer_name', consumerName)
    .eq('event_type', eventType)
    .maybeSingle();
  
  return data?.enabled === true;
}

// ============================================
// EXPORT ADMIN CLIENT FOR ADVANCED USE
// ============================================

export { getSupabaseAdmin };
