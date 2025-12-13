import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, campaign_id, contact_data, sequence_step } = await req.json();

    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (action === 'create_campaign') {
      const { data: campaign, error } = await supabase
        .from('cold_outreach_campaigns')
        .insert(contact_data)
        .select()
        .single();

      if (error) throw error;

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

      if (!campaign) throw new Error('Campaign not found');

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

        // Personalize message
        let body = sequence.body
          .replace(/{{first_name}}/g, contact.first_name || '')
          .replace(/{{last_name}}/g, contact.last_name || '')
          .replace(/{{company}}/g, contact.company || '')
          .replace(/{{title}}/g, contact.title || '');

        let subject = (sequence.subject || '')
          .replace(/{{first_name}}/g, contact.first_name || '')
          .replace(/{{company}}/g, contact.company || '');

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

      return new Response(JSON.stringify({
        success: true,
        processed,
        errors,
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

      return new Response(JSON.stringify({ success: true, campaigns: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Cold outreach error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
