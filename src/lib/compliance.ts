/**
 * Compliance Enforcement Module - System Contract v1.1.1
 * 
 * Centralized compliance checks for all outbound communications.
 * Implements: Suppression, Consent, Frequency Caps, Audit Logging
 */

import { supabase } from "@/integrations/supabase/client";

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
// CORE COMPLIANCE FUNCTIONS
// ============================================

/**
 * Check if a contact is suppressed for a given channel
 */
export async function isContactSuppressed(
  contactId: string,
  channel: Channel
): Promise<boolean> {
  const { data, error } = await supabase
    .from('contact_suppression')
    .select('id')
    .eq('contact_id', contactId)
    .in('channel', [channel, 'all'])
    .is('reactivated_at', null)
    .limit(1);

  if (error) {
    console.error('[Compliance] Suppression check error:', error);
    // Fail safe: if we can't check, block the send
    return true;
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
    // Fail safe: if we can't check consent, assume no consent
    return false;
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
    // Fail safe: assume at cap if we can't check
    return 999;
  }

  return count ?? 0;
}

/**
 * Generate idempotency key for outbound touch
 * Format: contactId:channel:templateId:scheduledMinute
 */
export function generateIdempotencyKey(
  contactId: string,
  channel: Channel,
  templateId?: string,
  scheduledAt?: Date
): string {
  const timestamp = scheduledAt ?? new Date();
  // Truncate to minute for stability
  const minuteKey = Math.floor(timestamp.getTime() / 60000);
  return `${contactId}:${channel}:${templateId ?? 'direct'}:${minuteKey}`;
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
 * Record an outbound touch attempt (for frequency tracking + audit)
 */
export async function recordOutboundTouch(
  params: OutboundTouchParams
): Promise<{ success: boolean; error?: string }> {
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
    // Check if it's a duplicate (idempotency)
    if (error.code === '23505') {
      console.log('[Compliance] Duplicate touch (idempotency key exists)');
      return { success: true };
    }
    console.error('[Compliance] Record touch error:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Write to audit log (action_history)
 */
export async function writeAudit(params: AuditLogParams): Promise<void> {
  // Use type assertion since action_history schema was extended
  const insertData = {
    action_table: params.entityType,
    action_id: crypto.randomUUID(),
    action_type: params.actionType,
    target_type: params.entityType,
    target_id: params.entityId,
    executed_by: params.actorId ?? params.actorModule ?? 'system',
    new_state: params.payload,
  } as Record<string, unknown>;

  const { error } = await supabase
    .from('action_history')
    .insert(insertData as never);

  if (error) {
    console.error('[Compliance] Audit write error:', error);
    // Don't throw - audit failure shouldn't block operations
    // but we log for visibility
  }
}

// ============================================
// CONSENT MANAGEMENT
// ============================================

/**
 * Record new consent
 */
export async function recordConsent(params: {
  contactId: string;
  channel: Channel;
  consentType: ConsentType;
  source: string;
  consentText?: string;
  ipAddress?: string;
  formUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('contact_consent').insert({
    contact_id: params.contactId,
    channel: params.channel,
    consent_type: params.consentType,
    source: params.source,
    consent_text: params.consentText,
    ip_address: params.ipAddress,
    form_url: params.formUrl,
  });

  if (error) {
    console.error('[Compliance] Record consent error:', error);
    return { success: false, error: error.message };
  }

  await writeAudit({
    actorType: 'system',
    actionType: 'consent_captured',
    entityType: 'contact_consent',
    entityId: params.contactId,
    payload: { channel: params.channel, consentType: params.consentType },
  });

  return { success: true };
}

/**
 * Revoke consent (opt-out)
 */
export async function revokeConsent(
  contactId: string,
  channel: Channel,
  revokedChannel: string = 'user_request'
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('contact_consent')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_channel: revokedChannel,
    })
    .eq('contact_id', contactId)
    .eq('channel', channel)
    .is('revoked_at', null);

  if (error) {
    console.error('[Compliance] Revoke consent error:', error);
    return { success: false, error: error.message };
  }

  await writeAudit({
    actorType: 'system',
    actionType: 'consent_revoked',
    entityType: 'contact_consent',
    entityId: contactId,
    payload: { channel, revokedChannel },
  });

  return { success: true };
}

// ============================================
// SUPPRESSION MANAGEMENT
// ============================================

/**
 * Add contact to suppression list (DNC)
 */
export async function suppressContact(
  contactId: string,
  channel: Channel | 'all',
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('contact_suppression').insert({
    contact_id: contactId,
    channel,
    reason,
  });

  if (error) {
    // Check for duplicate
    if (error.code === '23505') {
      return { success: true };
    }
    console.error('[Compliance] Suppress contact error:', error);
    return { success: false, error: error.message };
  }

  await writeAudit({
    actorType: 'system',
    actionType: 'contact_suppressed',
    entityType: 'contact_suppression',
    entityId: contactId,
    payload: { channel, reason },
  });

  return { success: true };
}

/**
 * Reactivate suppressed contact (requires explicit re-consent)
 */
export async function reactivateContact(
  contactId: string,
  channel: Channel | 'all'
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('contact_suppression')
    .update({ reactivated_at: new Date().toISOString() })
    .eq('contact_id', contactId)
    .eq('channel', channel)
    .is('reactivated_at', null);

  if (error) {
    console.error('[Compliance] Reactivate contact error:', error);
    return { success: false, error: error.message };
  }

  await writeAudit({
    actorType: 'ceo',
    actionType: 'contact_reactivated',
    entityType: 'contact_suppression',
    entityId: contactId,
    payload: { channel },
    override: true,
  });

  return { success: true };
}
