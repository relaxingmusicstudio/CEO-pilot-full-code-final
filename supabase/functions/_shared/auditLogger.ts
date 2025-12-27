// Shared Audit Logger for Edge Functions
// Usage: import { logAudit } from '../_shared/auditLogger.ts';

export interface AuditLogEntry {
  agent_name: string;
  action_type: string;
  entity_type?: string;
  entity_id?: string;
  description: string;
  success: boolean;
  user_id?: string;
  request_snapshot?: unknown;
  response_snapshot?: unknown;
  metadata?: unknown;
}

/**
 * Log an audit event to the platform_audit_log table
 * 
 * @param supabase - Supabase client instance
 * @param entry - Audit log entry details
 * @returns Promise<boolean> - true if logging succeeded, false otherwise
 */
export async function logAudit(
  supabase: unknown,
  entry: AuditLogEntry
): Promise<boolean> {
  try {
    const { error } = await supabase.from('platform_audit_log').insert({
      timestamp: new Date().toISOString(),
      agent_name: entry.agent_name,
      action_type: entry.action_type,
      entity_type: entry.entity_type || null,
      entity_id: entry.entity_id || null,
      description: entry.description,
      success: entry.success,
      user_id: entry.user_id || null,
      request_snapshot: entry.request_snapshot ? JSON.stringify(entry.request_snapshot) : null,
      response_snapshot: entry.response_snapshot ? JSON.stringify(entry.response_snapshot) : null,
    });

    if (error) {
      console.error('[AuditLogger] Failed to log audit event:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[AuditLogger] Exception logging audit event:', err);
    return false;
  }
}

/**
 * Create an audit wrapper for edge functions
 * Automatically logs the start and end of function execution
 * 
 * @param supabase - Supabase client instance
 * @param agentName - Name of the agent/function
 * @param actionType - Type of action being performed
 */
export function createAuditContext(
  supabase: unknown,
  agentName: string,
  actionType: string
) {
  const startTime = Date.now();

  return {
    logStart: async (description: string, request?: unknown) => {
      await logAudit(supabase, {
        agent_name: agentName,
        action_type: `${actionType}_started`,
        description,
        success: true,
        request_snapshot: request,
      });
    },

    logSuccess: async (description: string, entityType?: string, entityId?: string, response?: unknown) => {
      const duration = Date.now() - startTime;
      await logAudit(supabase, {
        agent_name: agentName,
        action_type: actionType,
        entity_type: entityType,
        entity_id: entityId,
        description: `${description} (${duration}ms)`,
        success: true,
        response_snapshot: response,
      });
    },

    logError: async (description: string, error: unknown, request?: unknown) => {
      const duration = Date.now() - startTime;
      await logAudit(supabase, {
        agent_name: agentName,
        action_type: `${actionType}_error`,
        description: `${description} (${duration}ms)`,
        success: false,
        request_snapshot: request,
        response_snapshot: { error: error?.message || String(error) },
      });
    },

    getDuration: () => Date.now() - startTime,
  };
}
