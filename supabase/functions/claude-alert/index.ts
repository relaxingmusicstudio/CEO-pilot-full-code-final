import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Claude Night Watchman Alert System
// Sends notifications to CEO when Claude detects issues

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { alert_id, title, message, priority } = await req.json();
    
    console.log(`[Claude Alert] Processing ${priority} alert: ${title}`);

    // Get business profile for notification settings
    const { data: profile } = await supabase
      .from('business_profile')
      .select('email, phone, notification_settings, business_name')
      .single();

    const notificationSettings = profile?.notification_settings || { emailAlerts: true, smsAlerts: false };
    const sentVia: string[] = [];

    // Send email notification
    if (notificationSettings.emailAlerts && profile?.email && resendApiKey) {
      const priorityEmoji = priority === 'critical' ? '🚨' : priority === 'warning' ? '⚠️' : 'ℹ️';
      const priorityColor = priority === 'critical' ? '#dc2626' : priority === 'warning' ? '#f59e0b' : '#3b82f6';
      
      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`
          },
          body: JSON.stringify({
            from: 'CEO Assistant <noreply@resend.dev>',
            to: [profile.email],
            subject: `${priorityEmoji} [${priority.toUpperCase()}] ${title}`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: ${priorityColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                  <h1 style="margin: 0; font-size: 24px;">${priorityEmoji} Claude Night Watchman Alert</h1>
                  <p style="margin: 8px 0 0; opacity: 0.9;">Priority: ${priority.toUpperCase()}</p>
                </div>
                <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                  <h2 style="margin: 0 0 16px; color: #111827;">${title}</h2>
                  <p style="color: #4b5563; line-height: 1.6;">${message}</p>
                  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 14px; margin: 0;">
                      This alert was sent by Claude, your AI Night Watchman, while monitoring ${profile?.business_name || 'your business'}.
                    </p>
                    <a href="${supabaseUrl.replace('.supabase.co', '.lovable.app')}/admin/ceo" 
                       style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #111827; color: white; text-decoration: none; border-radius: 6px;">
                      View CEO Dashboard →
                    </a>
                  </div>
                </div>
              </div>
            `
          })
        });

        if (emailResponse.ok) {
          sentVia.push('email');
          console.log('[Claude Alert] Email sent successfully');
        } else {
          console.error('[Claude Alert] Email failed:', await emailResponse.text());
        }
      } catch (emailError) {
        console.error('[Claude Alert] Email error:', emailError);
      }
    }

    // Update the alert record with sent_via
    if (alert_id) {
      await supabase
        .from('ceo_alerts')
        .update({ sent_via: sentVia })
        .eq('id', alert_id);
    }

    // Log the alert activity
    await supabase.from('claude_activity_log').insert({
      activity_type: 'alert_sent',
      description: `Sent ${priority} alert via ${sentVia.join(', ') || 'no channels'}`,
      details: { alert_id, title, priority, sent_via: sentVia },
      result: sentVia.length > 0 ? 'delivered' : 'no_channels_configured'
    });

    return new Response(JSON.stringify({
      success: true,
      alert_id,
      sent_via: sentVia,
      message: sentVia.length > 0 ? `Alert sent via ${sentVia.join(', ')}` : 'No notification channels configured'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Claude Alert] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
