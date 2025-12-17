import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAuditContext } from '../_shared/auditLogger.ts';
import { 
  assertCanContact, 
  recordOutboundTouch, 
  writeAudit,
  isEmergencyStopActive,
  type Channel 
} from '../_shared/compliance-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TCPA Call Time Restrictions - 8am to 9pm in lead's timezone
const CALL_START_HOUR = 8;
const CALL_END_HOUR = 21;

// US Timezone mapping by area code (simplified)
const TIMEZONE_BY_AREA_CODE: Record<string, string> = {
  // Eastern
  '201': 'America/New_York', '202': 'America/New_York', '203': 'America/New_York',
  '212': 'America/New_York', '215': 'America/New_York', '216': 'America/New_York',
  '305': 'America/New_York', '404': 'America/New_York', '407': 'America/New_York',
  // Central
  '214': 'America/Chicago', '312': 'America/Chicago', '314': 'America/Chicago',
  '469': 'America/Chicago', '512': 'America/Chicago', '713': 'America/Chicago',
  // Mountain
  '303': 'America/Denver', '480': 'America/Phoenix', '602': 'America/Phoenix',
  // Pacific
  '206': 'America/Los_Angeles', '213': 'America/Los_Angeles', '310': 'America/Los_Angeles',
  '415': 'America/Los_Angeles', '503': 'America/Los_Angeles', '619': 'America/Los_Angeles',
};

function getTimezoneFromPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  const areaCode = cleaned.length >= 10 ? cleaned.slice(-10, -7) : cleaned.slice(0, 3);
  return TIMEZONE_BY_AREA_CODE[areaCode] || 'America/New_York';
}

function isWithinCallHours(timezone: string): { allowed: boolean; reason?: string } {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const hour = parseInt(formatter.format(now), 10);
    
    if (hour < CALL_START_HOUR || hour >= CALL_END_HOUR) {
      return {
        allowed: false,
        reason: `Cannot call - outside permitted hours (8am-9pm in ${timezone}). Current hour: ${hour}`,
      };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const audit = createAuditContext(supabase, 'outbound-dialer', 'voice_outbound');
    const { action, queue_item_id, phone_number, contact_id, lead_id, disposition, notes, call_type = 'human' } = await req.json();

    // Check if Twilio is configured
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    const twilioConfigured = twilioAccountSid && twilioAuthToken && twilioPhoneNumber;

    // ========================================
    // EMERGENCY STOP CHECK (System Contract v1.1.1)
    // ========================================
    if (action === 'initiate_call' || action === 'add_to_queue') {
      const emergencyStop = await isEmergencyStopActive();
      if (emergencyStop) {
        console.log('[outbound-dialer] BLOCKED: Emergency stop is active');
        await audit.logError('Blocked by emergency stop', new Error('Emergency stop active'), { action, contact_id });
        return new Response(JSON.stringify({
          success: false,
          error: 'System emergency stop is active - all outbound blocked',
          reason: 'EMERGENCY_STOP',
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (action === 'check_call_time') {
      // Check if call is within permitted TCPA hours
      const timezone = getTimezoneFromPhone(phone_number);
      const result = isWithinCallHours(timezone);
      
      return new Response(JSON.stringify({
        ...result,
        timezone,
        phone_number,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'initiate_call') {
      // TCPA COMPLIANCE: Check call time restrictions
      const timezone = getTimezoneFromPhone(phone_number);
      const callTimeCheck = isWithinCallHours(timezone);
      
      if (!callTimeCheck.allowed) {
        console.log('[BLOCKED] Call time restriction:', callTimeCheck.reason);
        await audit.logError('Call time restriction', new Error(callTimeCheck.reason || 'Call time blocked'), { phone_number, timezone });
        return new Response(JSON.stringify({
          success: false,
          error: callTimeCheck.reason,
          reason: 'call_time_restriction',
          timezone,
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ========================================
      // CENTRAL COMPLIANCE CHECK (System Contract v1.1.1)
      // ========================================
      if (contact_id) {
        const complianceCheck = await assertCanContact(contact_id, 'voice' as Channel, {
          requireConsent: call_type === 'ai', // AI calls require consent
        });

        if (!complianceCheck.allowed) {
          await recordOutboundTouch({
            contactId: contact_id,
            channel: 'voice',
            status: 'blocked',
            blockReason: complianceCheck.reason ?? undefined,
          });

          await writeAudit({
            actorType: 'module',
            actorModule: 'outbound-dialer',
            actionType: 'outbound_blocked',
            entityType: 'voice',
            entityId: contact_id,
            payload: { reason: complianceCheck.reason, phone: phone_number?.slice(-4), call_type },
          });

          console.log(`[BLOCKED] Compliance check failed: ${complianceCheck.reason}`);
          return new Response(JSON.stringify({
            success: false,
            error: complianceCheck.message,
            reason: complianceCheck.reason,
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Legacy consent checks for leads without contact_id
      let hasConsent = false;
      let consentSource = null;
      let isDNC = false;
      
      if (lead_id) {
        const { data: lead } = await supabase
          .from('leads')
          .select('consent_to_call, consent_source, do_not_call, form_submitted_at')
          .eq('id', lead_id)
          .single();
        
        if (lead) {
          hasConsent = lead.consent_to_call === true || !!lead.form_submitted_at;
          consentSource = lead.consent_source || (lead.form_submitted_at ? 'form_submission' : null);
          isDNC = lead.do_not_call === true;
        }
      }
      
      if (queue_item_id) {
        const { data: queueItem } = await supabase
          .from('dialer_queue')
          .select('consent_verified, consent_source, requires_human, lead:leads(consent_to_call, consent_source, do_not_call, form_submitted_at)')
          .eq('id', queue_item_id)
          .single();
        
        if (queueItem) {
          const linkedLead = queueItem.lead as any;
          hasConsent = queueItem.consent_verified === true || 
                       linkedLead?.consent_to_call === true || 
                       !!linkedLead?.form_submitted_at;
          consentSource = queueItem.consent_source || linkedLead?.consent_source;
          isDNC = linkedLead?.do_not_call === true;
        }
      }
      
      if (isDNC) {
        console.log('[BLOCKED] DNC - Cannot call:', phone_number);
        return new Response(JSON.stringify({
          success: false,
          error: 'Cannot call - contact is on Do Not Call list',
          reason: 'dnc',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (call_type === 'ai' && !hasConsent) {
        console.log('[BLOCKED] AI call without consent:', phone_number);
        return new Response(JSON.stringify({
          success: false,
          error: 'AI calling requires prior written consent (TCPA compliance). Lead must submit a form first.',
          reason: 'no_ai_consent',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (!hasConsent && call_type === 'human') {
        console.log('[WARNING] Human call without verified consent:', phone_number);
        try {
          await supabase.from('consent_audit_log').insert({
            lead_id,
            action: 'call_without_consent',
            channel: 'phone',
            source: 'manual_dial',
          });
        } catch (e) {
          console.log('[outbound-dialer] Could not log consent audit');
        }
      }

      // Create call log entry
      const { data: callLog, error: logError } = await supabase
        .from('call_logs')
        .insert({
          contact_id,
          lead_id,
          direction: 'outbound',
          from_number: twilioPhoneNumber || '+1PLACEHOLDER',
          to_number: phone_number,
          status: twilioConfigured ? 'initiated' : 'mock_initiated',
          started_at: new Date().toISOString(),
          ai_handled: call_type === 'ai',
        })
        .select()
        .single();

      if (logError) throw logError;

      // Record outbound touch for compliance tracking (System Contract v1.1.1)
      if (contact_id) {
        await recordOutboundTouch({
          contactId: contact_id,
          channel: 'voice',
          callId: callLog.id,
          status: 'sent',
        });

        await writeAudit({
          actorType: 'module',
          actorModule: 'outbound-dialer',
          actionType: 'call_initiated',
          entityType: 'voice',
          entityId: contact_id,
          payload: { call_log_id: callLog.id, call_type, phone: phone_number?.slice(-4) },
        });
      }
      
      // Log activity
      if (lead_id) {
        await supabase.from('lead_activities').insert({
          lead_id,
          activity_type: 'call',
          description: `Outbound ${call_type} call initiated to ${phone_number}`,
          metadata: { call_log_id: callLog.id, call_type, consent_verified: hasConsent },
        });
        
        // Update lead call stats via RPC (ownership enforcement)
        await supabase.rpc('cold_update_lead_fields', {
          p_lead_id: lead_id,
          p_last_contacted: new Date().toISOString(),
          p_increment_call_attempts: true,
        });
      }

      // Update dialer queue if item provided
      if (queue_item_id) {
        await supabase
          .from('dialer_queue')
          .update({
            status: 'calling',
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', queue_item_id);
      }

      if (!twilioConfigured) {
        console.log('[MOCK] Twilio not configured - simulating call to:', phone_number);
        
        // Simulate call completion after mock
        await supabase
          .from('call_logs')
          .update({
            status: 'mock_completed',
            ended_at: new Date().toISOString(),
            duration_seconds: 0,
          })
          .eq('id', callLog.id);

        return new Response(JSON.stringify({
          success: true,
          mock: true,
          message: 'Twilio not configured - call simulated',
          call_log_id: callLog.id,
          phone_number,
          consent_verified: hasConsent,
          consent_source: consentSource,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Real Twilio call
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`;
      
      const callParams = new URLSearchParams({
        To: phone_number,
        From: twilioPhoneNumber,
        Url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/vapi-call?call_log_id=${callLog.id}`,
        StatusCallback: `${Deno.env.get('SUPABASE_URL')}/functions/v1/call-status-webhook`,
        StatusCallbackEvent: 'initiated ringing answered completed',
        Record: 'true',
      });

      const twilioResponse = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: callParams.toString(),
      });

      const twilioData = await twilioResponse.json();

      if (!twilioResponse.ok) {
        await supabase
          .from('call_logs')
          .update({ status: 'failed' })
          .eq('id', callLog.id);

        throw new Error(twilioData.message || 'Failed to initiate call');
      }

      // Update call log with Twilio SID
      await supabase
        .from('call_logs')
        .update({ external_call_id: twilioData.sid })
        .eq('id', callLog.id);

      return new Response(JSON.stringify({
        success: true,
        call_sid: twilioData.sid,
        call_log_id: callLog.id,
        status: twilioData.status,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'log_disposition') {
      // Update call log with disposition
      const { error } = await supabase
        .from('call_logs')
        .update({
          disposition,
          disposition_notes: notes,
          ended_at: new Date().toISOString(),
        })
        .eq('id', queue_item_id);

      if (error) throw error;
      
      // Log activity if lead_id provided
      if (lead_id) {
        await supabase.from('lead_activities').insert({
          lead_id,
          activity_type: 'call',
          description: `Call completed - ${disposition}`,
          outcome: disposition,
          metadata: { notes, call_log_id: queue_item_id },
        });
        
        // Update lead with call outcome via RPC (ownership enforcement)
        await supabase.rpc('cold_update_lead_fields', {
          p_lead_id: lead_id,
          p_last_call_outcome: disposition,
          p_last_call_notes: notes,
        });
      }

      // Update dialer queue status
      if (queue_item_id) {
        const finalStatus = ['answered', 'scheduled', 'converted'].includes(disposition) 
          ? 'completed' 
          : disposition === 'no_answer' ? 'pending' : 'completed';

        await supabase
          .from('dialer_queue')
          .update({ status: finalStatus })
          .eq('id', queue_item_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'get_queue') {
      // Get next items in dialer queue
      const { data: queue, error } = await supabase
        .from('dialer_queue')
        .select(`
          *,
          contact:contacts_unified(*),
          lead:leads(*)
        `)
        .eq('status', 'pending')
        .lt('attempts', 3)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(20);

      if (error) throw error;

      return new Response(JSON.stringify({ 
        success: true, 
        queue,
        twilio_configured: twilioConfigured,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'add_to_queue') {
      // Check consent before adding to queue
      let hasConsent = false;
      let consentSource = null;
      
      if (lead_id) {
        const { data: lead } = await supabase
          .from('leads')
          .select('consent_to_call, consent_source, do_not_call, form_submitted_at')
          .eq('id', lead_id)
          .single();
        
        if (lead) {
          if (lead.do_not_call) {
            return new Response(JSON.stringify({
              success: false,
              error: 'Cannot add to queue - contact is on Do Not Call list',
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          hasConsent = lead.consent_to_call === true || !!lead.form_submitted_at;
          consentSource = lead.consent_source || (lead.form_submitted_at ? 'form_submission' : null);
        }
      }
      
      // Add contact/lead to dialer queue
      const { data, error } = await supabase
        .from('dialer_queue')
        .insert({
          contact_id,
          lead_id,
          phone_number,
          priority: hasConsent ? 75 : 50, // Consented leads get higher priority
          consent_verified: hasConsent,
          consent_source: consentSource,
          requires_human: !hasConsent, // Non-consented leads require human
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ 
        success: true, 
        queue_item: data,
        consent_verified: hasConsent,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Outbound dialer error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
