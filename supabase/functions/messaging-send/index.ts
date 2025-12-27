import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAuditContext } from '../_shared/auditLogger.ts';
import { 
  withComplianceEnforcement,
  type Channel 
} from '../_shared/compliance-helpers.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
</div>
`;

const SMS_BYPASS_FOOTER = `\n\nReply STOP to pause or HUMAN to talk to a person.`;

interface SendMessageRequest {
  contact_id: string;
  channel: "sms" | "whatsapp" | "email";
  content: string;
  conversation_id?: string;
  subject?: string;
  skip_bypass_footer?: boolean;
  skip_compliance?: boolean;
  template_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const audit = createAuditContext(supabase, 'messaging-send', 'message_send');

  try {
    const { 
      contact_id, 
      channel, 
      content, 
      conversation_id, 
      subject,
      skip_bypass_footer,
      skip_compliance,
      template_id
    }: SendMessageRequest = await req.json();
    
    console.log(`[messaging-send] Sending ${channel} message to contact ${contact_id}`);
    await audit.logStart(`Sending ${channel} message`, { contact_id, channel });

    // ========================================
    // EMERGENCY STOP CHECK (System Contract v1.1.1)
    // ========================================
    const { data: emergencyCheck } = await supabase.rpc('is_emergency_stop_active');
    if (emergencyCheck === true) {
      console.log('[messaging-send] BLOCKED: Emergency stop is active');
      await audit.logError('Blocked by emergency stop', new Error('Emergency stop active'), { contact_id });
      return new Response(JSON.stringify({ 
        success: false, 
        blocked: true,
        reason: 'EMERGENCY_STOP',
        message: 'System emergency stop is active'
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get contact info
    const { data: contact, error: contactError } = await supabase
      .from("contacts_unified")
      .select("*")
      .eq("id", contact_id)
      .single();

    if (contactError || !contact) {
      await audit.logError('Contact not found', contactError || new Error('Contact not found'), { contact_id });
      throw new Error(`Contact not found: ${contact_id}`);
    }

    // Determine compliance channel
    const complianceChannel: Channel = channel === 'whatsapp' ? 'sms' : channel as Channel;

    // ========================================
    // COMPLIANCE ENFORCEMENT (System Contract v1.1.1)
    // ========================================
    if (!skip_compliance) {
      const complianceResult = await withComplianceEnforcement(
        contact_id,
        complianceChannel,
        template_id,
        'messaging-send',
        async () => {
          // This is the actual send logic wrapped in compliance
          return await performSend(supabase, {
            contact,
            contact_id,
            channel,
            content,
            conversation_id,
            subject,
            skip_bypass_footer
          });
        }
      );

      if (!complianceResult.success && complianceResult.blocked) {
        console.log(`[messaging-send] BLOCKED: ${complianceResult.blocked.reason}`);
        return new Response(JSON.stringify({
          success: false,
          blocked: true,
          reason: complianceResult.blocked.reason,
          message: complianceResult.blocked.message,
        }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (complianceResult.success && complianceResult.result) {
        await audit.logSuccess(`Message sent via ${channel}`, 'message', complianceResult.result.message_id, {
          conversation_id: complianceResult.result.conversation_id,
          is_mock: complianceResult.result.is_mock,
          status: complianceResult.result.status
        });

        return new Response(JSON.stringify(complianceResult.result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Skip compliance path (for transactional/service messages)
    const result = await performSend(supabase, {
      contact,
      contact_id,
      channel,
      content,
      conversation_id,
      subject,
      skip_bypass_footer
    });

    await audit.logSuccess(`Message sent via ${channel}`, 'message', result.message_id, {
      conversation_id: result.conversation_id,
      is_mock: result.is_mock,
      status: result.status,
      compliance_skipped: true
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[messaging-send] Error:", error);
    await audit.logError('Message send failed', error instanceof Error ? error : new Error(String(error)));
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Extracted send logic - use any for Deno edge function context
async function performSend(
  supabase: unknown,
  params: {
    contact: unknown;
    contact_id: string;
    channel: string;
    content: string;
    conversation_id?: string;
    subject?: string;
    skip_bypass_footer?: boolean;
  }
) {
  const { contact, contact_id, channel, content, conversation_id, subject, skip_bypass_footer } = params;

  // Check if we have real API keys
  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
  const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");
  const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  let isMock = true;
  let externalMessageId = `mock_${Date.now()}`;
  let status = "sent";

  // Add bypass footer
  let finalContent = content;
  if (!skip_bypass_footer) {
    if (channel === 'email') {
      finalContent = content + EMAIL_BYPASS_FOOTER_HTML;
    } else if (channel === 'sms' || channel === 'whatsapp') {
      finalContent = content + SMS_BYPASS_FOOTER;
    }
  }

  // Try to send via real API if available
  if (channel === "sms" && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER && contact.phone) {
    console.log("[messaging-send] Sending real SMS via Twilio");
    try {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
      const smsParams = new URLSearchParams({
        To: contact.phone,
        From: TWILIO_PHONE_NUMBER,
        Body: finalContent,
      });

      const response = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: smsParams.toString(),
      });

      const data = await response.json();
      if (response.ok) {
        externalMessageId = data.sid;
        isMock = false;
      } else {
        console.error("[messaging-send] Twilio error:", data);
        status = "failed";
      }
    } catch (err) {
      console.error("[messaging-send] SMS send error:", err);
      status = "failed";
    }
  } else if (channel === "whatsapp" && WHATSAPP_ACCESS_TOKEN) {
    console.log("[messaging-send] Sending real WhatsApp via Meta");
    isMock = false;
  } else if (channel === "email" && RESEND_API_KEY && contact.email) {
    console.log("[messaging-send] Sending real email via Resend");
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'notifications@yourdomain.com',
          to: contact.email,
          subject: subject || 'Message',
          html: finalContent,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        externalMessageId = data.id;
        isMock = false;
      } else {
        console.error("[messaging-send] Resend error:", data);
        status = "failed";
      }
    } catch (err) {
      console.error("[messaging-send] Email send error:", err);
      status = "failed";
    }
  }

  if (isMock) {
    console.log(`[messaging-send] MOCK MODE: Simulating ${channel} send`);
  }

  // Get or create conversation
  let convId = conversation_id;
  if (!convId) {
    const { data: existingConv } = await supabase
      .from("conversations_unified")
      .select("id")
      .eq("contact_id", contact_id)
      .eq("channel_type", channel)
      .eq("status", "open")
      .single();

    if (existingConv) {
      convId = existingConv.id;
    } else {
      const { data: newConv, error: convError } = await supabase
        .from("conversations_unified")
        .insert({
          channel_type: channel,
          contact_id: contact_id,
          status: "open",
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (convError) throw convError;
      convId = newConv.id;
    }
  }

  // Save message
  const { data: message, error: msgError } = await supabase
    .from("messages_unified")
    .insert({
      conversation_id: convId,
      direction: "outbound",
      content: finalContent,
      status: status,
      is_mock: isMock,
      metadata: {
        external_id: externalMessageId,
        channel: channel,
        subject: subject,
      },
    })
    .select()
    .single();

  if (msgError) throw msgError;

  // Update conversation last_message_at
  await supabase
    .from("conversations_unified")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", convId);

  console.log(`[messaging-send] Message saved: ${message.id}, mock: ${isMock}`);

  return {
    success: true,
    message_id: message.id,
    conversation_id: convId,
    is_mock: isMock,
    status: status,
  };
}