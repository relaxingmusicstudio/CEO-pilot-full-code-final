import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  const url = new URL(req.url);
  
  // Handle webhook verification (GET request from Meta)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "lovable_whatsapp_verify";

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("[whatsapp-webhook] Verification successful");
      return new Response(challenge, { status: 200 });
    } else {
      console.log("[whatsapp-webhook] Verification failed");
      return new Response("Forbidden", { status: 403 });
    }
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const payload = await req.json();
    console.log("[whatsapp-webhook] Received:", JSON.stringify(payload, null, 2));

    // Parse Meta webhook payload
    const entry = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      console.log("[whatsapp-webhook] No messages in payload");
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    for (const msg of messages) {
      const from = msg.from;
      const messageId = msg.id;
      const text = msg.text?.body || msg.caption || "[Media message]";
      const timestamp = msg.timestamp;

      console.log(`[whatsapp-webhook] Message from ${from}: ${text}`);

      // Find or create contact
      let contact;
      const { data: existingContact } = await supabase
        .from("contacts_unified")
        .select("*")
        .eq("whatsapp_id", from)
        .single();

      if (existingContact) {
        contact = existingContact;
      } else {
        const { data: newContact, error: contactError } = await supabase
          .from("contacts_unified")
          .insert({
            whatsapp_id: from,
            phone: from,
            name: `WhatsApp ${from}`,
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
        .eq("channel_type", "whatsapp")
        .eq("status", "open")
        .single();

      if (existingConv) {
        conversation = existingConv;
      } else {
        const { data: newConv, error: convError } = await supabase
          .from("conversations_unified")
          .insert({
            channel_type: "whatsapp",
            contact_id: contact.id,
            external_id: messageId,
            status: "open",
            unread_count: 1,
          })
          .select()
          .single();

        if (convError) throw convError;
        conversation = newConv;
      }

      // Save message
      const { error: msgError } = await supabase
        .from("messages_unified")
        .insert({
          conversation_id: conversation.id,
          direction: "inbound",
          content: text,
          status: "delivered",
          is_mock: false,
          metadata: {
            whatsapp_id: messageId,
            from: from,
            timestamp: timestamp,
            type: msg.type,
          },
        });

      if (msgError) throw msgError;

      // Update conversation
      await supabase
        .from("conversations_unified")
        .update({
          last_message_at: new Date().toISOString(),
          unread_count: (conversation.unread_count || 0) + 1,
        })
        .eq("id", conversation.id);
    }

    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("[whatsapp-webhook] Error:", error);
    return new Response("OK", { status: 200, headers: corsHeaders });
  }
});
