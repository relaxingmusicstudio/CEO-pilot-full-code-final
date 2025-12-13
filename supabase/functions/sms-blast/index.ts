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

    const { action, campaign_id, message, recipients, phone_number } = await req.json();

    // Check if Twilio is configured
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    const twilioConfigured = twilioAccountSid && twilioAuthToken && twilioPhoneNumber;

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
          console.log('[MOCK] SMS to:', recipient.phone_number, '- Message:', campaign.message);
          
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
            Body: campaign.message,
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

      return new Response(JSON.stringify({
        success: true,
        mock: !twilioConfigured,
        sent_count: sentCount,
        failed_count: failedCount,
        opt_out_count: optOutCount,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'send_single') {
      // Send single SMS
      if (!twilioConfigured) {
        console.log('[MOCK] Single SMS to:', phone_number, '- Message:', message);
        
        return new Response(JSON.stringify({
          success: true,
          mock: true,
          message: 'Twilio not configured - SMS simulated',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
      
      const smsParams = new URLSearchParams({
        To: phone_number,
        From: twilioPhoneNumber,
        Body: message,
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
        throw new Error(data.message || 'Failed to send SMS');
      }

      return new Response(JSON.stringify({
        success: true,
        message_sid: data.sid,
        status: data.status,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'check_config') {
      return new Response(JSON.stringify({
        twilio_configured: twilioConfigured,
        phone_number: twilioPhoneNumber ? twilioPhoneNumber.slice(-4) : null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('SMS blast error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
