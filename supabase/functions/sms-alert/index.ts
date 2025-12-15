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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { alertType, title, message, priority = 'normal', metadata = {} } = await req.json();

    console.log(`SMS Alert: ${alertType} - ${title}`);

    // Get CEO phone from business profile
    const { data: profile } = await supabase
      .from('business_profile')
      .select('phone, email, notification_settings')
      .limit(1)
      .maybeSingle();

    const ceoPhone = profile?.phone;
    const settings = profile?.notification_settings as Record<string, any> || {};

    // Check if SMS is enabled for this priority
    const smsEnabled = settings.sms_enabled !== false;
    const urgentOnly = settings.sms_urgent_only === true;

    if (!smsEnabled || (urgentOnly && priority !== 'urgent')) {
      console.log('SMS alerts not enabled or priority too low');
      return new Response(JSON.stringify({ success: false, reason: 'SMS not enabled for this priority' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log the alert
    await supabase.from('ceo_alerts').insert({
      alert_type: alertType,
      title,
      message,
      priority,
      metadata,
      source: 'sms-alert',
      sent_via: ceoPhone ? ['sms'] : ['log'],
    });

    // Send SMS via Twilio if configured
    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (twilioSid && twilioToken && twilioPhone && ceoPhone) {
      const smsBody = `🚨 ${title}\n\n${message}\n\n- CEO Dashboard`;

      const twilioResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: ceoPhone,
            From: twilioPhone,
            Body: smsBody,
          }),
        }
      );

      if (twilioResponse.ok) {
        const smsResult = await twilioResponse.json();
        console.log('SMS sent successfully:', smsResult.sid);

        return new Response(JSON.stringify({ 
          success: true, 
          channel: 'sms',
          messageSid: smsResult.sid 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        const error = await twilioResponse.text();
        console.error('Twilio error:', error);
      }
    }

    // Fallback: send email via Resend if SMS not configured
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const ceoEmail = settings.email || profile?.email;

    if (resendKey && ceoEmail) {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'CEO Dashboard <alerts@yourdomain.com>',
          to: [ceoEmail],
          subject: `🚨 ${priority.toUpperCase()}: ${title}`,
          html: `
            <h2>${title}</h2>
            <p>${message}</p>
            <hr>
            <p style="color: #666; font-size: 12px;">
              Priority: ${priority} | Type: ${alertType}<br>
              Sent from CEO Dashboard
            </p>
          `,
        }),
      });

      if (emailResponse.ok) {
        console.log('Email alert sent as fallback');
        return new Response(JSON.stringify({ success: true, channel: 'email' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log('Alert logged but no delivery channel available');
    return new Response(JSON.stringify({ success: true, channel: 'log_only' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('SMS Alert error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
