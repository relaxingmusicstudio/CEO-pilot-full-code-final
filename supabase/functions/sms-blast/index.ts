import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAuditContext } from '../_shared/auditLogger.ts';
import { 
  assertCanContact, 
  recordOutboundTouch, 
  writeAudit,
  type Channel 
} from '../_shared/compliance-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AI Bypass footer for all outbound SMS
const SMS_BYPASS_FOOTER = `\n\nReply STOP to pause or HUMAN to talk to a person.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const audit = createAuditContext(supabase, 'sms-blast', 'sms_outbound');

  try {
    const { action, campaign_id, message, recipients, phone_number, contact_id, skip_bypass_footer, skip_compliance } = await req.json();

    // Check if Twilio is configured
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    const twilioConfigured = twilioAccountSid && twilioAuthToken && twilioPhoneNumber;

    await audit.logStart(`SMS blast action: ${action}`, { action, campaign_id });

    // Check system mode before sending campaign
    if (action === 'send_campaign') {
      try {
        const { data: modeConfig } = await supabase
          .from('system_config')
          .select('config_value')
          .eq('config_key', 'current_mode')
          .single();
        
        const currentMode = modeConfig?.config_value || 'growth';
        
        if (currentMode === 'vacation' || currentMode === 'emergency') {
          await audit.logError(`Blocked by ${currentMode} mode`, new Error(`System in ${currentMode} mode`), { campaign_id });
          return new Response(JSON.stringify({ 
            success: false, 
            error: `SMS blast blocked: System is in ${currentMode} mode`,
            mode: currentMode
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (e) {
        console.log('[sms-blast] Could not check system mode, proceeding');
      }
    }

    if (action === 'create_campaign') {
      // Create SMS campaign
      const { data: campaign, error } = await supabase
        .from('sms_campaigns')
        .insert({
          name: message.name,
          message: message.body,
          campaign_type: message.type || 'blast',
          scheduled_at: message.scheduled_at,
          total_recipients: recipients?.length || 0,
        })
        .select()
        .single();

      if (error) throw error;

      // Add recipients
      if (recipients?.length > 0) {
        const recipientRows = recipients.map((r: any) => ({
          campaign_id: campaign.id,
          contact_id: r.contact_id,
          phone_number: r.phone_number,
        }));

        await supabase.from('sms_campaign_recipients').insert(recipientRows);
      }

      await audit.logSuccess('Campaign created', 'campaign', campaign.id, { recipients: recipients?.length || 0 });

      return new Response(JSON.stringify({ success: true, campaign }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'send_campaign') {
      // Get campaign and recipients
      const { data: campaign } = await supabase
        .from('sms_campaigns')
        .select('*')
        .eq('id', campaign_id)
        .single();

      if (!campaign) {
        await audit.logError('Campaign not found', new Error('Campaign not found'), { campaign_id });
        throw new Error('Campaign not found');
      }

      const { data: recipients } = await supabase
        .from('sms_campaign_recipients')
        .select('*')
        .eq('campaign_id', campaign_id)
        .eq('status', 'pending');

      // Check opt-outs
      const { data: optOuts } = await supabase
        .from('sms_opt_outs')
        .select('phone_number');

      const optOutNumbers = new Set(optOuts?.map(o => o.phone_number) || []);

      // Update campaign to sending
      await supabase
        .from('sms_campaigns')
        .update({ status: 'sending' })
        .eq('id', campaign_id);

      let sentCount = 0;
      let failedCount = 0;
      let optOutCount = 0;

      // ✅ ADD AI BYPASS FOOTER TO CAMPAIGN MESSAGE
      const messageWithFooter = skip_bypass_footer 
        ? campaign.message 
        : campaign.message + SMS_BYPASS_FOOTER;

      for (const recipient of recipients || []) {
        // Skip opt-outs
        if (optOutNumbers.has(recipient.phone_number)) {
          await supabase
            .from('sms_campaign_recipients')
            .update({ status: 'opted_out' })
            .eq('id', recipient.id);
          optOutCount++;
          continue;
        }

        if (!twilioConfigured) {
          // Mock send
          console.log('[MOCK] SMS to:', recipient.phone_number, '- Message:', messageWithFooter);
          
          await supabase
            .from('sms_campaign_recipients')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              external_message_id: `mock_${Date.now()}_${recipient.id}`,
            })
            .eq('id', recipient.id);
          
          sentCount++;
          continue;
        }

        // Real Twilio SMS
        try {
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
          
          const smsParams = new URLSearchParams({
            To: recipient.phone_number,
            From: twilioPhoneNumber,
            Body: messageWithFooter,
            StatusCallback: `${Deno.env.get('SUPABASE_URL')}/functions/v1/sms-status-webhook`,
          });

          const response = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: smsParams.toString(),
          });

          const data = await response.json();

          if (response.ok) {
            await supabase
              .from('sms_campaign_recipients')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                external_message_id: data.sid,
              })
              .eq('id', recipient.id);
            sentCount++;
          } else {
            await supabase
              .from('sms_campaign_recipients')
              .update({
                status: 'failed',
                error_message: data.message,
              })
              .eq('id', recipient.id);
            failedCount++;
          }
        } catch (err: any) {
          await supabase
            .from('sms_campaign_recipients')
            .update({
              status: 'failed',
              error_message: err.message,
            })
            .eq('id', recipient.id);
          failedCount++;
        }

        // Rate limiting - 1 message per 100ms
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Update campaign stats
      await supabase
        .from('sms_campaigns')
        .update({
          status: 'completed',
          sent_count: sentCount,
          failed_count: failedCount,
          opt_out_count: optOutCount,
        })
        .eq('id', campaign_id);

      // Log to automation_logs
      await supabase.from('automation_logs').insert({
        function_name: 'sms-blast',
        status: 'completed',
        items_processed: (recipients?.length || 0),
        items_created: sentCount,
        metadata: { campaign_id, bypass_footer_added: !skip_bypass_footer }
      });

      await audit.logSuccess('Campaign sent', 'campaign', campaign_id, {
        sent: sentCount,
        failed: failedCount,
        opted_out: optOutCount,
        mock: !twilioConfigured
      });

      return new Response(JSON.stringify({
        success: true,
        mock: !twilioConfigured,
        sent_count: sentCount,
        failed_count: failedCount,
        opt_out_count: optOutCount,
        bypass_footer_added: !skip_bypass_footer
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'send_single') {
      // ========================================
      // COMPLIANCE CHECK (System Contract v1.1.1)
      // ========================================
      if (!skip_compliance && contact_id) {
        const complianceCheck = await assertCanContact(contact_id, 'sms' as Channel, {
          requireConsent: true,
        });

        if (!complianceCheck.allowed) {
          await recordOutboundTouch({
            contactId: contact_id,
            channel: 'sms',
            status: 'blocked',
            blockReason: complianceCheck.reason ?? undefined,
          });

          await writeAudit({
            actorType: 'module',
            actorModule: 'sms-blast',
            actionType: 'outbound_blocked',
            entityType: 'sms',
            entityId: contact_id,
            payload: { reason: complianceCheck.reason, phone: phone_number?.slice(-4) },
          });

          return new Response(JSON.stringify({
            success: false,
            blocked: true,
            reason: complianceCheck.reason,
            message: complianceCheck.message,
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Send single SMS - also add footer unless skipped
      const messageWithFooter = skip_bypass_footer ? message : message + SMS_BYPASS_FOOTER;
      
      if (!twilioConfigured) {
        console.log('[MOCK] Single SMS to:', phone_number, '- Message:', messageWithFooter);
        
        if (contact_id) {
          await recordOutboundTouch({ contactId: contact_id, channel: 'sms', status: 'sent' });
        }
        
        await audit.logSuccess('Single SMS sent (mock)', 'sms', undefined, { phone: phone_number?.slice(-4), mock: true });
        
        return new Response(JSON.stringify({
          success: true,
          mock: true,
          message: 'Twilio not configured - SMS simulated',
          bypass_footer_added: !skip_bypass_footer
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
      
      const smsParams = new URLSearchParams({
        To: phone_number,
        From: twilioPhoneNumber,
        Body: messageWithFooter,
      });

      const response = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: smsParams.toString(),
      });

      const data = await response.json();

      if (!response.ok) {
        if (contact_id) {
          await recordOutboundTouch({ contactId: contact_id, channel: 'sms', status: 'failed', blockReason: data.message });
        }
        await audit.logError('SMS send failed', new Error(data.message), { phone: phone_number?.slice(-4) });
        throw new Error(data.message || 'Failed to send SMS');
      }

      if (contact_id) {
        await recordOutboundTouch({ contactId: contact_id, channel: 'sms', messageId: data.sid, status: 'sent' });
      }

      await audit.logSuccess('Single SMS sent', 'sms', data.sid, { phone: phone_number?.slice(-4) });

      return new Response(JSON.stringify({
        success: true,
        message_sid: data.sid,
        status: data.status,
        bypass_footer_added: !skip_bypass_footer
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'check_config') {
      await audit.logSuccess('Config check', 'config', undefined, { twilio_configured: twilioConfigured });
      return new Response(JSON.stringify({
        twilio_configured: twilioConfigured,
        phone_number: twilioPhoneNumber ? twilioPhoneNumber.slice(-4) : null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await audit.logError('Invalid action', new Error(`Unknown action: ${action}`), { action });
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('SMS blast error:', error);
    await audit.logError('SMS blast failed', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});