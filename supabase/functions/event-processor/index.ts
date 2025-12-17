/**
 * Event Processor - System Contract v1.1.1
 * 
 * Processes canonical events from the event bus.
 * Currently implements: cold_agent_enroller consumer for lead_created events.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  claimEvents,
  markProcessed,
  markFailed,
  emitEvent,
  getAutopilotMode,
  type SystemEvent,
} from "../_shared/event-bus.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// SUPABASE CLIENT
// ============================================

function getSupabaseAdmin() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseKey);
}

// ============================================
// CONSUMER: COLD AGENT ENROLLER
// ============================================

async function processLeadCreatedForColdAgent(event: SystemEvent): Promise<void> {
  const supabase = getSupabaseAdmin();
  const leadId = event.entity_id;
  const payload = event.payload as {
    lead_id: string;
    source?: string;
    consent_status?: {
      call: boolean;
      sms: boolean;
      email: boolean;
    };
    lead_score?: number;
    tenant_id?: string;
  };

  console.log(`[ColdAgentEnroller] Processing lead_created: ${leadId}`);

  // 1. Check autopilot mode
  const autopilotMode = await getAutopilotMode(event.tenant_id ?? undefined);
  console.log(`[ColdAgentEnroller] Autopilot mode: ${autopilotMode}`);

  if (autopilotMode === 'MANUAL') {
    // Queue for CEO approval instead of auto-enrolling
    console.log(`[ColdAgentEnroller] MANUAL mode - queuing for CEO approval`);
    
    await supabase.from('ceo_action_queue').insert({
      action_type: 'approve_cold_enrollment',
      target_type: 'lead',
      target_id: leadId,
      tenant_id: event.tenant_id,
      payload: {
        lead_id: leadId,
        source: payload.source,
        consent_status: payload.consent_status,
        recommended_sequence: 'default_cold',
      },
      priority: 'medium',
      status: 'pending',
      source: 'cold_agent_enroller',
      claude_reasoning: `New lead ${leadId} requires CEO approval for cold sequence enrollment (MANUAL mode).`,
    });
    
    return;
  }

  // 2. ASSISTED or FULL mode - proceed with auto-enrollment
  const leadScore = payload.lead_score ?? 0;

  // Only enroll leads with score < 50 in cold sequence (per contract)
  if (leadScore >= 50) {
    console.log(`[ColdAgentEnroller] Lead score ${leadScore} >= 50, skipping cold sequence`);
    return;
  }

  // 3. Get default cold sequence
  const { data: sequence, error: seqError } = await supabase
    .from('sequences')
    .select('id, name')
    .eq('trigger_type', 'cold_outreach')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (seqError || !sequence) {
    console.log(`[ColdAgentEnroller] No active cold sequence found, creating placeholder enrollment`);
    // Still record the intent to enroll
    await supabase.from('action_history').insert({
      action_table: 'sequence_enrollments',
      action_id: crypto.randomUUID(),
      action_type: 'enrollment_skipped',
      target_type: 'lead',
      target_id: leadId,
      actor_type: 'module',
      actor_module: 'cold_agent_enroller',
      new_state: { reason: 'no_active_sequence', lead_score: leadScore },
    });
    return;
  }

  // 4. Check if already enrolled (idempotency)
  const { data: existingEnrollment } = await supabase
    .from('sequence_enrollments')
    .select('id')
    .eq('lead_id', leadId)
    .eq('sequence_id', sequence.id)
    .maybeSingle();

  if (existingEnrollment) {
    console.log(`[ColdAgentEnroller] Lead already enrolled in sequence ${sequence.id}`);
    return;
  }

  // 5. Create enrollment
  const { data: enrollment, error: enrollError } = await supabase
    .from('sequence_enrollments')
    .insert({
      lead_id: leadId,
      sequence_id: sequence.id,
      status: 'active',
      current_step: 0,
      tenant_id: event.tenant_id,
    })
    .select('id')
    .single();

  if (enrollError) {
    console.error(`[ColdAgentEnroller] Enrollment error:`, enrollError);
    throw new Error(`Failed to enroll lead: ${enrollError.message}`);
  }

  console.log(`[ColdAgentEnroller] Enrolled lead ${leadId} in sequence ${sequence.name}`);

  // 6. Audit the enrollment
  await supabase.from('action_history').insert({
    action_table: 'sequence_enrollments',
    action_id: enrollment.id,
    action_type: 'cold_enrollment',
    target_type: 'lead',
    target_id: leadId,
    actor_type: 'module',
    actor_module: 'cold_agent_enroller',
    new_state: {
      sequence_id: sequence.id,
      sequence_name: sequence.name,
      lead_score: leadScore,
      autopilot_mode: autopilotMode,
    },
  });

  // 7. Emit cold_sequence_enrolled event
  await emitEvent({
    eventType: 'cold_sequence_enrolled',
    entityType: 'sequence_enrollment',
    entityId: enrollment.id,
    payload: {
      lead_id: leadId,
      sequence_id: sequence.id,
      sequence_name: sequence.name,
      enrolled_by: 'cold_agent_enroller',
    },
    emittedBy: 'cold_agent_enroller',
    tenantId: event.tenant_id,
    idempotencyKey: `cold_sequence_enrolled:${leadId}:${sequence.id}`,
  });
}

// ============================================
// MAIN PROCESSOR
// ============================================

async function processEvents(consumerName: string, eventType: string): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  const results = { processed: 0, failed: 0, errors: [] as string[] };

  // Claim events
  const { events, error: claimError } = await claimEvents({
    consumerName,
    eventType,
    limit: 10,
  });

  if (claimError) {
    console.error(`[EventProcessor] Claim error:`, claimError);
    return results;
  }

  if (events.length === 0) {
    console.log(`[EventProcessor] No pending events for ${consumerName}:${eventType}`);
    return results;
  }

  console.log(`[EventProcessor] Processing ${events.length} events`);

  // Process each event
  for (const event of events) {
    try {
      // Route to appropriate handler
      switch (consumerName) {
        case 'cold_agent_enroller':
          await processLeadCreatedForColdAgent(event);
          break;
        default:
          console.log(`[EventProcessor] Unknown consumer: ${consumerName}`);
      }

      // Mark as processed
      await markProcessed(event.id, consumerName);
      results.processed++;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[EventProcessor] Error processing event ${event.id}:`, errorMessage);
      
      const result = await markFailed(event.id, consumerName, errorMessage);
      results.failed++;
      results.errors.push(`${event.id}: ${errorMessage}`);
      
      if (result.deadLettered) {
        console.log(`[EventProcessor] Event ${event.id} dead-lettered`);
      }
    }
  }

  return results;
}

// ============================================
// HTTP HANDLER
// ============================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const consumer = url.searchParams.get('consumer') ?? 'cold_agent_enroller';
    const eventType = url.searchParams.get('event_type') ?? 'lead_created';

    console.log(`[EventProcessor] Starting processor for ${consumer}:${eventType}`);

    const results = await processEvents(consumer, eventType);

    console.log(`[EventProcessor] Complete - Processed: ${results.processed}, Failed: ${results.failed}`);

    return new Response(
      JSON.stringify({
        success: true,
        consumer,
        eventType,
        ...results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("[EventProcessor] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
