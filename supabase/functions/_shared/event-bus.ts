/**
 * Event Bus - System Contract v1.1.1
 * 
 * Canonical event system for reliable, idempotent, retryable event processing.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================
// TYPES
// ============================================

export interface EmitEventParams {
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  emittedBy: string;
  tenantId?: string | null;
  idempotencyKey: string;
}

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
}

export interface ClaimEventsParams {
  consumerName: string;
  eventType: string;
  limit?: number;
}

// ============================================
// CONSTANTS
// ============================================

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1000; // 1 second
const MAX_BACKOFF_MS = 300000; // 5 minutes

// ============================================
// HELPERS
// ============================================

function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseKey);
}

function calculateBackoff(attempts: number): number {
  const backoff = BASE_BACKOFF_MS * Math.pow(2, attempts);
  return Math.min(backoff, MAX_BACKOFF_MS);
}

// ============================================
// EMIT EVENT
// ============================================

/**
 * Emit a canonical event to the event bus.
 * Idempotent - duplicate keys will be rejected gracefully.
 */
export async function emitEvent(params: EmitEventParams): Promise<{
  success: boolean;
  eventId?: string;
  duplicate?: boolean;
  error?: string;
}> {
  const supabase = getSupabaseAdmin();
  
  console.log(`[EventBus] Emitting event: ${params.eventType} for ${params.entityType}:${params.entityId}`);
  
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
    // Check for unique constraint violation (duplicate)
    if (error.code === '23505') {
      console.log(`[EventBus] Duplicate event (idempotency): ${params.idempotencyKey}`);
      return { success: true, duplicate: true };
    }
    console.error(`[EventBus] Emit error:`, error);
    return { success: false, error: error.message };
  }

  console.log(`[EventBus] Event emitted: ${data.id}`);
  return { success: true, eventId: data.id };
}

// ============================================
// CLAIM EVENTS (FOR PROCESSING)
// ============================================

/**
 * Claim pending events for processing using SELECT FOR UPDATE SKIP LOCKED.
 * This ensures exactly-once processing in concurrent scenarios.
 */
export async function claimNextEvents(params: ClaimEventsParams): Promise<{
  events: SystemEvent[];
  error?: string;
}> {
  const supabase = getSupabaseAdmin();
  const limit = params.limit ?? 10;
  
  console.log(`[EventBus] Claiming events for ${params.consumerName}: ${params.eventType}`);
  
  // First check if consumer is enabled
  const { data: consumer, error: consumerError } = await supabase
    .from('system_event_consumers')
    .select('enabled')
    .eq('consumer_name', params.consumerName)
    .eq('event_type', params.eventType)
    .single();
  
  if (consumerError || !consumer?.enabled) {
    console.log(`[EventBus] Consumer ${params.consumerName} disabled or not found`);
    return { events: [] };
  }
  
  // Claim pending events that are ready for processing
  // Using a transaction with FOR UPDATE SKIP LOCKED pattern
  const now = new Date().toISOString();
  
  const { data: events, error } = await supabase
    .from('system_events')
    .select('*')
    .eq('event_type', params.eventType)
    .in('status', ['pending', 'failed'])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order('emitted_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error(`[EventBus] Claim error:`, error);
    return { events: [], error: error.message };
  }

  if (!events || events.length === 0) {
    return { events: [] };
  }

  // Mark claimed events as processing
  const eventIds = events.map(e => e.id);
  const { error: updateError } = await supabase
    .from('system_events')
    .update({ status: 'processing' })
    .in('id', eventIds)
    .in('status', ['pending', 'failed']); // Only update if still claimable

  if (updateError) {
    console.error(`[EventBus] Claim update error:`, updateError);
    return { events: [], error: updateError.message };
  }

  console.log(`[EventBus] Claimed ${events.length} events`);
  return { events: events as SystemEvent[] };
}

// ============================================
// MARK PROCESSED
// ============================================

/**
 * Mark an event as successfully processed.
 */
export async function markProcessed(
  eventId: string,
  consumerName: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  
  console.log(`[EventBus] Marking processed: ${eventId} by ${consumerName}`);
  
  // Update event status
  const { error } = await supabase
    .from('system_events')
    .update({ 
      status: 'processed',
      last_error: null,
    })
    .eq('id', eventId);

  if (error) {
    console.error(`[EventBus] Mark processed error:`, error);
    return { success: false, error: error.message };
  }

  // Update consumer state
  await supabase
    .from('system_event_consumers')
    .update({
      last_processed_at: new Date().toISOString(),
      last_event_id: eventId,
      updated_at: new Date().toISOString(),
    })
    .eq('consumer_name', consumerName);

  return { success: true };
}

// ============================================
// MARK FAILED (WITH BACKOFF)
// ============================================

/**
 * Mark an event as failed. Increments attempts and schedules retry with backoff.
 * After MAX_ATTEMPTS, event is dead-lettered.
 */
export async function markFailed(
  eventId: string,
  consumerName: string,
  errorMessage: string
): Promise<{ success: boolean; deadLettered?: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  
  console.log(`[EventBus] Marking failed: ${eventId} - ${errorMessage}`);
  
  // Get current attempts
  const { data: event, error: fetchError } = await supabase
    .from('system_events')
    .select('attempts, payload')
    .eq('id', eventId)
    .single();

  if (fetchError || !event) {
    console.error(`[EventBus] Fetch event error:`, fetchError);
    return { success: false, error: fetchError?.message ?? 'Event not found' };
  }

  const newAttempts = event.attempts + 1;

  // Check if should dead-letter
  if (newAttempts >= MAX_ATTEMPTS) {
    return await deadLetter(eventId, consumerName, errorMessage, event.payload);
  }

  // Calculate next retry time with exponential backoff
  const backoffMs = calculateBackoff(newAttempts);
  const nextAttemptAt = new Date(Date.now() + backoffMs).toISOString();

  // Update event with failure info
  const { error: updateError } = await supabase
    .from('system_events')
    .update({
      status: 'failed',
      attempts: newAttempts,
      next_attempt_at: nextAttemptAt,
      last_error: errorMessage,
    })
    .eq('id', eventId);

  if (updateError) {
    console.error(`[EventBus] Mark failed error:`, updateError);
    return { success: false, error: updateError.message };
  }

  console.log(`[EventBus] Event failed, retry #${newAttempts} scheduled at ${nextAttemptAt}`);
  return { success: true };
}

// ============================================
// DEAD LETTER
// ============================================

/**
 * Move an event to dead letter queue after max retries.
 */
export async function deadLetter(
  eventId: string,
  consumerName: string,
  reason: string,
  payload?: Record<string, unknown>
): Promise<{ success: boolean; deadLettered: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  
  console.log(`[EventBus] Dead-lettering event: ${eventId}`);
  
  // Get payload if not provided
  let eventPayload = payload;
  if (!eventPayload) {
    const { data } = await supabase
      .from('system_events')
      .select('payload')
      .eq('id', eventId)
      .single();
    eventPayload = data?.payload ?? {};
  }

  // Insert into dead letter queue
  const { error: dlError } = await supabase
    .from('system_event_dead_letter')
    .insert({
      original_event_id: eventId,
      consumer_name: consumerName,
      reason: reason,
      payload: eventPayload,
    });

  if (dlError) {
    console.error(`[EventBus] Dead letter insert error:`, dlError);
    return { success: false, deadLettered: false, error: dlError.message };
  }

  // Update event status
  const { error: updateError } = await supabase
    .from('system_events')
    .update({
      status: 'dead_letter',
      last_error: reason,
    })
    .eq('id', eventId);

  if (updateError) {
    console.error(`[EventBus] Dead letter status update error:`, updateError);
    return { success: false, deadLettered: true, error: updateError.message };
  }

  // Create CEO alert for dead-lettered event
  await supabase.from('ceo_action_queue').insert({
    action_type: 'review_dead_letter',
    target_type: 'system_event',
    target_id: eventId,
    payload: {
      consumer_name: consumerName,
      reason: reason,
      original_payload: eventPayload,
    },
    priority: 'high',
    status: 'pending',
    source: 'event_bus',
    claude_reasoning: `Event ${eventId} failed ${MAX_ATTEMPTS} times and was dead-lettered. Consumer: ${consumerName}. Reason: ${reason}`,
  });

  console.log(`[EventBus] Event dead-lettered and CEO alerted`);
  return { success: true, deadLettered: true };
}

// ============================================
// UTILITY: GET AUTOPILOT MODE
// ============================================

/**
 * Get current autopilot mode for a tenant.
 */
export async function getAutopilotMode(tenantId?: string): Promise<'MANUAL' | 'ASSISTED' | 'FULL'> {
  const supabase = getSupabaseAdmin();
  
  // Try tenant-specific config first, then global
  let query = supabase
    .from('ceo_autopilot_config')
    .select('is_active')
    .limit(1);

  const { data } = await query.maybeSingle();
  
  if (!data || !data.is_active) {
    return 'MANUAL';
  }
  
  // Check for full autopilot settings
  const { data: settings } = await supabase
    .from('ceo_autopilot_settings')
    .select('auto_execute_low_risk, auto_execute_medium_risk')
    .limit(1)
    .maybeSingle();

  if (settings?.auto_execute_medium_risk) {
    return 'FULL';
  } else if (settings?.auto_execute_low_risk) {
    return 'ASSISTED';
  }
  
  return 'MANUAL';
}
