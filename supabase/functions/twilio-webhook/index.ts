import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Parse Twilio webhook (form-urlencoded)
    const formData = await req.formData();
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;
    const body = formData.get("Body") as string;
    const messageSid = formData.get("MessageSid") as string;

    console.log(`[twilio-webhook] Received SMS from ${from}: ${body}`);

    // Normalize phone number
    const normalizedPhone = from?.replace(/\D/g, "");

    // Find or create contact
    let contact;
    const { data: existingContact } = await supabase
      .from("contacts_unified")
      .select("*")
      .eq("phone", normalizedPhone)
      .single();

    if (existingContact) {
      contact = existingContact;
    } else {
      const { data: newContact, error: contactError } = await supabase
        .from("contacts_unified")
        .insert({
          phone: normalizedPhone,
          name: `SMS ${normalizedPhone}`,
        })
        .select()
        .single();

      if (contactError) throw contactError;
      contact = newContact;
    }

    // Find or create conversation
    let conversation;
    const { data: existingConv } = await supabase
      .from("conversations_unified")
      .select("*")
      .eq("contact_id", contact.id)
      .eq("channel_type", "sms")
      .eq("status", "open")
      .single();

    if (existingConv) {
      conversation = existingConv;
    } else {
      const { data: newConv, error: convError } = await supabase
        .from("conversations_unified")
        .insert({
          channel_type: "sms",
          contact_id: contact.id,
          external_id: messageSid,
          status: "open",
          unread_count: 1,
        })
        .select()
        .single();

      if (convError) throw convError;
      conversation = newConv;
    }

    // Save message
    const { data: message, error: msgError } = await supabase
      .from("messages_unified")
      .insert({
        conversation_id: conversation.id,
        direction: "inbound",
        content: body,
        status: "delivered",
        is_mock: false,
        metadata: {
          twilio_sid: messageSid,
          from: from,
          to: to,
        },
      })
      .select()
      .single();

    if (msgError) throw msgError;

    // Update conversation
    await supabase
      .from("conversations_unified")
      .update({
        last_message_at: new Date().toISOString(),
        unread_count: (conversation.unread_count || 0) + 1,
      })
      .eq("id", conversation.id);

    console.log(`[twilio-webhook] Message saved: ${message.id}`);

    // Return TwiML response
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { ...corsHeaders, "Content-Type": "application/xml" } }
    );
  } catch (error) {
    console.error("[twilio-webhook] Error:", error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/xml" } }
    );
  }
});
