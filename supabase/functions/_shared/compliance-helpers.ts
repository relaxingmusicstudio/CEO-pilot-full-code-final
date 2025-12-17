/**
 * Compliance Helpers for Edge Functions - System Contract v1.1.1
 * 
 * Server-side compliance enforcement for all outbound communications.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================
// TYPES
// ============================================

export type Channel = 'sms' | 'email' | 'voice';
export type ConsentType = 'express_written' | 'prior_express' | 'opt_in' | 'implied';
export type TouchStatus = 'sent' | 'blocked' | 'failed';

export interface ComplianceCheckResult {
  allowed: boolean;
  reason: string | null;
  message?: string;
  channelTouches?: number;
  totalTouches?: number;
}

export interface OutboundTouchParams {
  contactId: string;
  channel: Channel;
  messageId?: string;
  callId?: string;
  templateId?: string;
  status: TouchStatus;
  blockReason?: string;
}

export interface AuditLogParams {
  actorType: 'module' | 'ceo' | 'user' | 'system';
  actorModule?: string;
  actorId?: string;
  actionType: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
  override?: boolean;
}

// ============================================
// FREQUENCY CAPS (per System Contract v1.1.1)
// ============================================

const FREQUENCY_CAPS = {
  sms: { perChannel24h: 3 },
  email: { perChannel24h: 1 },
  voice: { perChannel24h: 2 },
  total24h: 5,
} as const;

// ============================================
// HELPERS
// ============================================

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Generate idempotency key for outbound touch
 */
export function generateIdempotencyKey(
  contactId: string,
  channel: Channel,
  templateId?: string,
  scheduledAt?: Date
): string {
  const timestamp = scheduledAt ?? new Date();
  const minuteKey = Math.floor(timestamp.getTime() / 60000);
  return `${contactId}:${channel}:${templateId ?? 'direct'}:${minuteKey}`;
}

// ============================================
// CORE COMPLIANCE FUNCTIONS
// ============================================

/**
 * Check if a contact is suppressed for a given channel
 */
export async function isContactSuppressed(
  contactId: string,
  channel: Channel
): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('contact_suppression')
    .select('id')
    .eq('contact_id', contactId)
    .in('channel', [channel, 'all'])
    .is('reactivated_at', null)
    .limit(1);

  if (error) {
    console.error('[Compliance] Suppression check error:', error);
    return true; // Fail safe
  }

  return (data?.length ?? 0) > 0;
}

/**
 * Check if a contact has valid consent for a channel
 */
export async function hasValidConsent(
  contactId: string,
  channel: Channel,
  consentType?: ConsentType
): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  let query = supabase
    .from('contact_consent')
    .select('id')
    .eq('contact_id', contactId)
    .eq('channel', channel)
    .is('revoked_at', null)
    .limit(1);

  if (consentType) {
    query = query.eq('consent_type', consentType);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Compliance] Consent check error:', error);
    return false; // Fail safe
  }

  return (data?.length ?? 0) > 0;
}

/**
 * Get touch count for frequency cap checks
 */
export async function getTouchCount(
  contactId: string,
  channel?: Channel,
  hours: number = 24
): Promise<number> {
  const supabase = getSupabaseClient();
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from('outbound_touch_log')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', contactId)
    .eq('status', 'sent')
    .gte('created_at', cutoff);

  if (channel) {
    query = query.eq('channel', channel);
  }

  const { count, error } = await query;

  if (error) {
    console.error('[Compliance] Touch count error:', error);
    return 999; // Fail safe
  }

  return count ?? 0;
}

/**
 * Check if emergency stop is active
 */
export async function isEmergencyStopActive(): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase.rpc('is_emergency_stop_active');
  
  if (error) {
    console.error('[Compliance] Emergency stop check error:', error);
    return true; // Fail safe
  }
  
  return data === true;
}

/**
 * Master compliance check - call before any outbound send
 */
export async function assertCanContact(
  contactId: string,
  channel: Channel,
  options: {
    consentType?: ConsentType;
    requireConsent?: boolean;
  } = {}
): Promise<ComplianceCheckResult> {
  const { consentType, requireConsent = true } = options;

  // 0. Check emergency stop FIRST (System Contract v1.1.1)
  const emergencyStop = await isEmergencyStopActive();
  if (emergencyStop) {
    return {
      allowed: false,
      reason: 'EMERGENCY_STOP',
      message: 'System emergency stop is active - all outbound blocked',
    };
  }

  // 1. Check suppression (DNC)
  const suppressed = await isContactSuppressed(contactId, channel);
  if (suppressed) {
    return {
      allowed: false,
      reason: 'SUPPRESSED',
      message: `Contact is suppressed for channel: ${channel}`,
    };
  }

  // 2. Check consent (if required)
  if (requireConsent) {
    const hasConsent = await hasValidConsent(contactId, channel, consentType);
    if (!hasConsent) {
      return {
        allowed: false,
        reason: 'NO_CONSENT',
        message: `No valid consent for channel: ${channel}`,
      };
    }
  }

  // 3. Check channel frequency cap
  const channelCap = FREQUENCY_CAPS[channel]?.perChannel24h ?? 3;
  const channelTouches = await getTouchCount(contactId, channel, 24);
  if (channelTouches >= channelCap) {
    return {
      allowed: false,
      reason: 'FREQUENCY_CAP_CHANNEL',
      message: `Channel frequency cap exceeded: ${channelTouches}/${channelCap}`,
      channelTouches,
    };
  }

  // 4. Check total frequency cap
  const totalTouches = await getTouchCount(contactId, undefined, 24);
  if (totalTouches >= FREQUENCY_CAPS.total24h) {
    return {
      allowed: false,
      reason: 'FREQUENCY_CAP_TOTAL',
      message: `Total frequency cap exceeded: ${totalTouches}/${FREQUENCY_CAPS.total24h}`,
      totalTouches,
    };
  }

  return {
    allowed: true,
    reason: null,
    channelTouches,
    totalTouches,
  };
}

/**
 * Record an outbound touch attempt
 */
export async function recordOutboundTouch(
  params: OutboundTouchParams
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  
  const idempotencyKey = generateIdempotencyKey(
    params.contactId,
    params.channel,
    params.templateId
  );

  const { error } = await supabase.from('outbound_touch_log').insert({
    contact_id: params.contactId,
    channel: params.channel,
    direction: 'outbound',
    message_id: params.messageId,
    call_id: params.callId,
    template_id: params.templateId,
    idempotency_key: idempotencyKey,
    status: params.status,
    block_reason: params.blockReason,
  });

  if (error) {
    if (error.code === '23505') {
      console.log('[Compliance] Duplicate touch (idempotency)');
      return { success: true };
    }
    console.error('[Compliance] Record touch error:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Write to audit log
 */
export async function writeAudit(params: AuditLogParams): Promise<void> {
  const supabase = getSupabaseClient();
  
  const { error } = await supabase.from('action_history').insert({
    action_table: params.entityType,
    action_id: crypto.randomUUID(),
    action_type: params.actionType,
    target_type: params.entityType,
    target_id: params.entityId,
    executed_by: params.actorId ?? params.actorModule ?? 'system',
    actor_type: params.actorType,
    actor_module: params.actorModule,
    override: params.override ?? false,
    new_state: params.payload,
  });

  if (error) {
    console.error('[Compliance] Audit write error:', error);
  }
}

/**
 * Wrapper that enforces compliance, records touch, and audits
 * Use this as the single entry point for all outbound sends
 */
export async function withComplianceEnforcement<T>(
  contactId: string,
  channel: Channel,
  templateId: string | undefined,
  actorModule: string,
  sendFn: () => Promise<T>
): Promise<{ success: boolean; result?: T; blocked?: ComplianceCheckResult }> {
  // Check compliance
  const check = await assertCanContact(contactId, channel, {
    requireConsent: true,
  });

  if (!check.allowed) {
    // Record blocked attempt
    await recordOutboundTouch({
      contactId,
      channel,
      templateId,
      status: 'blocked',
      blockReason: check.reason ?? undefined,
    });

    // Audit the block
    await writeAudit({
      actorType: 'module',
      actorModule,
      actionType: 'outbound_blocked',
      entityType: 'outbound_touch_log',
      entityId: contactId,
      payload: { channel, reason: check.reason, message: check.message },
    });

    return { success: false, blocked: check };
  }

  try {
    // Execute the send
    const result = await sendFn();

    // Record successful touch
    await recordOutboundTouch({
      contactId,
      channel,
      templateId,
      status: 'sent',
    });

    // Audit the send
    await writeAudit({
      actorType: 'module',
      actorModule,
      actionType: 'outbound_sent',
      entityType: 'outbound_touch_log',
      entityId: contactId,
      payload: { channel, templateId },
    });

    return { success: true, result };
  } catch (error) {
    // Record failed attempt
    await recordOutboundTouch({
      contactId,
      channel,
      templateId,
      status: 'failed',
      blockReason: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}
