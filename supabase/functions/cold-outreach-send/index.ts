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

// AI Bypass footer for all outbound messages
const EMAIL_BYPASS_FOOTER_HTML = `
<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
  <p style="margin: 0 0 8px 0;">
    ⏸️ To pause automated messages: <strong>Reply STOP</strong>
  </p>
  <p style="margin: 0 0 8px 0;">
    👋 To speak to a human: <strong>Reply HUMAN</strong>
  </p>
  <p style="margin: 16px 0 0 0; color: #9ca3af;">
    ApexLocal360 AI Assistant
  </p>
</div>
`;

const SMS_BYPASS_FOOTER = `\n\nReply STOP to pause or HUMAN to talk to a person.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const audit = createAuditContext(supabase, 'cold-outreach-send', 'outreach');

  try {
    const { action, campaign_id, contact_data, sequence_step, skip_bypass_footer } = await req.json();

    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    await audit.logStart(`Cold outreach action: ${action}`, { action, campaign_id });

    // Check system mode before executing outreach
    if (action === 'execute_campaign') {
      // Check for user directives that might pause outreach
      try {
        const { data: pauseDirectives } = await supabase
          .from('user_directives')
          .select('*')
          .eq('action_required', true)
          .eq('action_taken', false)
          .in('intent', ['pause', 'cancel'])
          .or('content.ilike.%pause outreach%,content.ilike.%stop outreach%,content.ilike.%halt outreach%')
          .limit(1);
        
        if (pauseDirectives && pauseDirectives.length > 0) {
          const directive = pauseDirectives[0];
          console.log('[cold-outreach] Found pause directive from user:', directive.content);
          
          // Mark directive as handled
          await supabase
            .from('user_directives')
            .update({
              action_taken: true,
              handled_by: 'cold-outreach-send',
              processed_at: new Date().toISOString(),
            })
            .eq('id', directive.id);
          
          await audit.logSuccess('Paused by user directive', 'campaign', campaign_id, { directive_id: directive.id });
          
          return new Response(JSON.stringify({ 
            success: false, 
            error: `Cold outreach paused by user directive: "${directive.content}"`,
            directive_id: directive.id,
            handled: true
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (e) {
        console.log('[cold-outreach] Could not check user directives, proceeding:', e);
      }

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
            error: `Cold outreach blocked: System is in ${currentMode} mode`,
            mode: currentMode
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        if (currentMode === 'maintenance') {
          console.log('[cold-outreach] Skipping cold outreach in maintenance mode');
          await audit.logSuccess('Skipped in maintenance mode', 'campaign', campaign_id);
          return new Response(JSON.stringify({ 
            success: true, 
            message: 'Cold outreach paused in maintenance mode',
            processed: 0
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (e) {
        console.log('[cold-outreach] Could not check system mode, proceeding');
      }
    }

    if (action === 'create_campaign') {
      const { data: campaign, error } = await supabase
        .from('cold_outreach_campaigns')
        .insert(contact_data)
        .select()
        .single();

      if (error) throw error;

      await audit.logSuccess('Campaign created', 'campaign', campaign.id);

      return new Response(JSON.stringify({ success: true, campaign }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'import_contacts') {
      // Import contacts to campaign
      const contacts = contact_data.map((c: any) => ({
        ...c,
        campaign_id,
      }));

      const { data, error } = await supabase
        .from('cold_outreach_contacts')
        .insert(contacts)
        .select();

      if (error) throw error;

      // Update campaign total
      await supabase
        .from('cold_outreach_campaigns')
        .update({ total_contacts: contacts.length })
        .eq('id', campaign_id);

      await audit.logSuccess('Contacts imported', 'campaign', campaign_id, { imported: data?.length || 0 });

      return new Response(JSON.stringify({ success: true, imported: data?.length || 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'add_sequence_step') {
      const { data, error } = await supabase
        .from('cold_outreach_sequences')
        .insert({
          campaign_id,
          ...sequence_step,
        })
        .select()
        .single();

      if (error) throw error;

      await audit.logSuccess('Sequence step added', 'sequence', data.id, { campaign_id });

      return new Response(JSON.stringify({ success: true, step: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'execute_campaign') {
      // Get campaign and pending contacts
      const { data: campaign } = await supabase
        .from('cold_outreach_campaigns')
        .select('*')
        .eq('id', campaign_id)
        .single();

      if (!campaign) {
        await audit.logError('Campaign not found', new Error('Campaign not found'), { campaign_id });
        throw new Error('Campaign not found');
      }

      const { data: sequences } = await supabase
        .from('cold_outreach_sequences')
        .select('*')
        .eq('campaign_id', campaign_id)
        .eq('is_active', true)
        .order('step_number', { ascending: true });

      const { data: contacts } = await supabase
        .from('cold_outreach_contacts')
        .select('*')
        .eq('campaign_id', campaign_id)
        .eq('status', 'pending')
        .eq('do_not_contact', false)
        .limit(campaign.daily_limit);

      if (!contacts?.length || !sequences?.length) {
        await audit.logSuccess('No contacts to process', 'campaign', campaign_id, { processed: 0 });
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'No contacts or sequences to process',
          processed: 0,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let processed = 0;
      let errors = 0;
      let blocked = 0;

      for (const contact of contacts) {
        const currentStep = contact.current_step;
        const sequence = sequences.find(s => s.step_number === currentStep + 1);

        if (!sequence) {
          // No more steps, mark as contacted
          await supabase
            .from('cold_outreach_contacts')
            .update({ status: 'contacted' })
            .eq('id', contact.id);
          continue;
        }

        // ========================================
        // COMPLIANCE CHECK (System Contract v1.1.1)
        // ========================================
        const channel = (sequence.channel === 'sms' || sequence.channel === 'email' || sequence.channel === 'voice') 
          ? sequence.channel as Channel 
          : 'email' as Channel;
        
        const complianceCheck = await assertCanContact(contact.id, channel, {
          requireConsent: true,
        });

        if (!complianceCheck.allowed) {
          await recordOutboundTouch({
            contactId: contact.id,
            channel,
            templateId: sequence.id,
            status: 'blocked',
            blockReason: complianceCheck.reason ?? undefined,
          });

          await writeAudit({
            actorType: 'module',
            actorModule: 'cold-outreach-send',
            actionType: 'outbound_blocked',
            entityType: 'cold_outreach',
            entityId: contact.id,
            payload: { reason: complianceCheck.reason, campaign_id, sequence_id: sequence.id },
          });

          blocked++;
          continue;
        }

        // Personalize message
        let body = sequence.body
          .replace(/{{first_name}}/g, contact.first_name || '')
          .replace(/{{last_name}}/g, contact.last_name || '')
          .replace(/{{company}}/g, contact.company || '')
          .replace(/{{title}}/g, contact.title || '');

        let subject = (sequence.subject || '')
          .replace(/{{first_name}}/g, contact.first_name || '')
          .replace(/{{company}}/g, contact.company || '');

        // ✅ ADD AI BYPASS FOOTER TO ALL MESSAGES
        if (!skip_bypass_footer) {
          if (sequence.channel === 'email') {
            body = body + EMAIL_BYPASS_FOOTER_HTML;
          } else if (sequence.channel === 'sms') {
            body = body + SMS_BYPASS_FOOTER;
          }
        }

        // Create send record
        const { data: sendRecord } = await supabase
          .from('cold_outreach_sends')
          .insert({
            campaign_id,
            contact_id: contact.id,
            sequence_id: sequence.id,
            channel: sequence.channel,
            status: 'pending',
          })
          .select()
          .single();

        if (sequence.channel === 'email') {
          if (!resendApiKey) {
            console.log('[MOCK] Email to:', contact.email, '- Subject:', subject);
            
            await supabase
              .from('cold_outreach_sends')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                external_id: `mock_${Date.now()}`,
              })
              .eq('id', sendRecord?.id);
          } else {
            // Real email send via Resend
            try {
              const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${resendApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  from: 'outreach@yourdomain.com', // Configure this
                  to: contact.email,
                  subject,
                  html: body,
                }),
              });

              const data = await response.json();

              if (response.ok) {
                await supabase
                  .from('cold_outreach_sends')
                  .update({
                    status: 'sent',
                    sent_at: new Date().toISOString(),
                    external_id: data.id,
                  })
                  .eq('id', sendRecord?.id);
              } else {
                throw new Error(data.message);
              }
            } catch (err: any) {
              await supabase
                .from('cold_outreach_sends')
                .update({
                  status: 'failed',
                  error_message: err.message,
                })
                .eq('id', sendRecord?.id);
              errors++;
              continue;
            }
          }
        } else if (sequence.channel === 'sms') {
          // Call SMS blast function
          const { data: smsResult } = await supabase.functions.invoke('sms-blast', {
            body: {
              action: 'send_single',
              phone_number: contact.phone,
              message: body,
            },
          });

          if (smsResult?.success) {
            await supabase
              .from('cold_outreach_sends')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                external_id: smsResult.message_sid || `mock_${Date.now()}`,
              })
              .eq('id', sendRecord?.id);
          }
        }

        // Update contact step
        await supabase
          .from('cold_outreach_contacts')
          .update({
            current_step: currentStep + 1,
            last_contacted_at: new Date().toISOString(),
          })
          .eq('id', contact.id);

        // Update sequence stats
        await supabase
          .from('cold_outreach_sequences')
          .update({ sent_count: sequence.sent_count + 1 })
          .eq('id', sequence.id);

        processed++;

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Update campaign stats
      await supabase
        .from('cold_outreach_campaigns')
        .update({
          contacts_reached: campaign.contacts_reached + processed,
          status: 'active',
          started_at: campaign.started_at || new Date().toISOString(),
        })
        .eq('id', campaign_id);

      // Log to automation_logs
      await supabase.from('automation_logs').insert({
        function_name: 'cold-outreach-send',
        status: 'completed',
        items_processed: contacts.length,
        items_created: processed,
        metadata: { campaign_id, errors, bypass_footer_added: !skip_bypass_footer }
      });

      await audit.logSuccess('Campaign executed', 'campaign', campaign_id, {
        processed,
        errors,
        bypass_footer_added: !skip_bypass_footer
      });

      return new Response(JSON.stringify({
        success: true,
        processed,
        errors,
        bypass_footer_added: !skip_bypass_footer
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'get_campaigns') {
      const { data, error } = await supabase
        .from('cold_outreach_campaigns')
        .select(`
          *,
          sequences:cold_outreach_sequences(count),
          contacts:cold_outreach_contacts(count)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      await audit.logSuccess('Campaigns retrieved', 'campaigns', undefined, { count: data?.length || 0 });

      return new Response(JSON.stringify({ success: true, campaigns: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await audit.logError('Invalid action', new Error(`Unknown action: ${action}`), { action });
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Cold outreach error:', error);
    await audit.logError('Cold outreach failed', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});