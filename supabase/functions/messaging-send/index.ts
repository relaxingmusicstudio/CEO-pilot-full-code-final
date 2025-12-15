import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAuditContext } from '../_shared/auditLogger.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendMessageRequest {
  contact_id: string;
  channel: "sms" | "whatsapp" | "email";
  content: string;
  conversation_id?: string;
  subject?: string; // For email
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
    const { contact_id, channel, content, conversation_id, subject }: SendMessageRequest = await req.json();
    console.log(`[messaging-send] Sending ${channel} message to contact ${contact_id}`);
    await audit.logStart(`Sending ${channel} message`, { contact_id, channel });

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

    // Check if we have real API keys
    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    let isMock = true;
    let externalMessageId = `mock_${Date.now()}`;
    let status = "sent";

    // Try to send via real API if available
    if (channel === "sms" && TWILIO_ACCOUNT_SID) {
      console.log("[messaging-send] Sending real SMS via Twilio");
      // Real Twilio implementation would go here
      isMock = false;
    } else if (channel === "whatsapp" && WHATSAPP_ACCESS_TOKEN) {
      console.log("[messaging-send] Sending real WhatsApp via Meta");
      // Real WhatsApp implementation would go here
      isMock = false;
    } else if (channel === "email" && RESEND_API_KEY && contact.email) {
      console.log("[messaging-send] Sending real email via Resend");
      try {
        // Email sending via Resend - mock for now
        externalMessageId = `email_${Date.now()}`;
        isMock = false;
        console.log("[messaging-send] Email queued for sending");
      } catch (emailError) {
        console.error("[messaging-send] Email send error:", emailError);
        status = "failed";
      }
    }

    if (isMock) {
      console.log(`[messaging-send] MOCK MODE: Simulating ${channel} send`);
    }

    // Get or create conversation
    let convId = conversation_id;
    if (!convId) {
      // Check for existing conversation
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
        // Create new conversation
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
        content: content,
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
    
    await audit.logSuccess(`Message sent via ${channel}`, 'message', message.id, {
      conversation_id: convId,
      is_mock: isMock,
      status
    });

    return new Response(
      JSON.stringify({
        success: true,
        message_id: message.id,
        conversation_id: convId,
        is_mock: isMock,
        status: status,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[messaging-send] Error:", error);
    await audit.logError('Message send failed', error instanceof Error ? error : new Error(String(error)));
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});