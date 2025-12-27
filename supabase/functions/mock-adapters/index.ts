import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mock response generators for each service
const mockAdapters = {
  // Twilio SMS/Voice Mock
  twilio: {
    sms: (payload: unknown) => ({
      sid: `SM_mock_${Date.now()}`,
      status: "queued",
      to: payload.to,
      from: payload.from || "+15005550006",
      body: payload.body,
      date_created: new Date().toISOString(),
      direction: "outbound-api",
      price: null,
      price_unit: "USD",
    }),
    call: (payload: unknown) => ({
      sid: `CA_mock_${Date.now()}`,
      status: "queued",
      to: payload.to,
      from: payload.from || "+15005550006",
      direction: "outbound-api",
      duration: null,
      answered_by: null,
    }),
  },

  // Stripe Payment Mock
  stripe: {
    charge: (payload: unknown) => ({
      id: `ch_mock_${Date.now()}`,
      object: "charge",
      amount: payload.amount || 1000,
      currency: payload.currency || "usd",
      status: "succeeded",
      paid: true,
      captured: true,
      customer: payload.customer || null,
      description: payload.description || "Mock charge",
      created: Math.floor(Date.now() / 1000),
      receipt_url: `https://pay.stripe.com/receipts/mock_${Date.now()}`,
    }),
    subscription: (payload: unknown) => ({
      id: `sub_mock_${Date.now()}`,
      object: "subscription",
      status: "active",
      customer: payload.customer,
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 2592000,
      plan: {
        id: payload.plan_id || "plan_mock",
        amount: payload.amount || 4900,
        interval: "month",
      },
    }),
    invoice: (payload: unknown) => ({
      id: `in_mock_${Date.now()}`,
      object: "invoice",
      status: "paid",
      total: payload.amount || 4900,
      customer: payload.customer,
      paid: true,
      hosted_invoice_url: `https://invoice.stripe.com/mock_${Date.now()}`,
    }),
  },

  // Email Mock (Resend/SendGrid)
  email: {
    send: (payload: unknown) => ({
      id: `email_mock_${Date.now()}`,
      status: "queued",
      to: Array.isArray(payload.to) ? payload.to : [payload.to],
      from: payload.from || "noreply@mock.local",
      subject: payload.subject,
      created_at: new Date().toISOString(),
    }),
  },

  // D-ID Video Mock
  did: {
    create_talk: (payload: unknown) => ({
      id: `tlk_mock_${Date.now()}`,
      status: "created",
      result_url: null,
      created_at: new Date().toISOString(),
      source_url: payload.source_url,
      script: payload.script,
    }),
    get_talk: (payload: unknown) => ({
      id: payload.talk_id || `tlk_mock_${Date.now()}`,
      status: "done",
      result_url: `https://d-id.com/mock_video_${Date.now()}.mp4`,
      duration: 30,
    }),
  },

  // Vapi Voice AI Mock
  vapi: {
    create_call: (payload: unknown) => ({
      id: `call_mock_${Date.now()}`,
      status: "queued",
      assistant_id: payload.assistant_id,
      phone_number: payload.phone_number,
      created_at: new Date().toISOString(),
    }),
    end_call: (payload: unknown) => ({
      id: payload.call_id,
      status: "ended",
      duration_seconds: Math.floor(Math.random() * 300) + 30,
      transcript: "This is a mock transcript of the AI voice call.",
    }),
  },

  // ElevenLabs TTS Mock
  elevenlabs: {
    tts: (payload: unknown) => ({
      audio_url: `https://api.elevenlabs.io/mock_audio_${Date.now()}.mp3`,
      text: payload.text,
      voice_id: payload.voice_id || "mock_voice",
      duration_ms: payload.text?.length * 50 || 5000,
    }),
  },

  // OpenAI Mock (returns plausible AI responses)
  openai: {
    chat: (payload: unknown) => {
      const mockResponses: Record<string, string> = {
        content: "This is a mock AI-generated content response for testing purposes.",
        email: "Subject: Mock Email\n\nDear Customer,\n\nThis is a mock email generated for testing.",
        analysis: "Analysis: Based on the mock data, we recommend proceeding with the current strategy.",
      };
      const type = payload.type || "content";
      return {
        id: `chatcmpl_mock_${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: payload.model || "gpt-4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: mockResponses[type] || mockResponses.content,
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 150,
          total_tokens: 250,
        },
      };
    },
  },

  // Social Media Mock
  social: {
    post: (payload: unknown) => ({
      id: `post_mock_${Date.now()}`,
      platform: payload.platform,
      status: "published",
      url: `https://${payload.platform}.com/mock_post_${Date.now()}`,
      content: payload.content,
      created_at: new Date().toISOString(),
    }),
    schedule: (payload: unknown) => ({
      id: `scheduled_mock_${Date.now()}`,
      platform: payload.platform,
      status: "scheduled",
      scheduled_for: payload.scheduled_for,
      content: payload.content,
    }),
  },

  // Google Maps / Places Mock
  google_maps: {
    search: (payload: unknown) => ({
      results: [
        {
          place_id: `place_mock_${Date.now()}_1`,
          name: "Mock Business 1",
          formatted_address: "123 Mock St, Test City, TC 12345",
          formatted_phone_number: "+1 (555) 123-4567",
          rating: 4.5,
          user_ratings_total: 150,
          website: "https://mockbusiness1.com",
          types: ["business", payload.type || "general"],
        },
        {
          place_id: `place_mock_${Date.now()}_2`,
          name: "Mock Business 2",
          formatted_address: "456 Test Ave, Mock City, MC 67890",
          formatted_phone_number: "+1 (555) 987-6543",
          rating: 4.2,
          user_ratings_total: 89,
          website: "https://mockbusiness2.com",
          types: ["business", payload.type || "general"],
        },
      ],
      status: "OK",
    }),
  },
};

// Calculate simulated latency
function getSimulatedLatency(service: string): number {
  const baseLatenices: Record<string, number> = {
    twilio: 200,
    stripe: 350,
    email: 150,
    did: 2000,
    vapi: 500,
    elevenlabs: 800,
    openai: 1200,
    social: 300,
    google_maps: 400,
  };
  const base = baseLatenices[service] || 200;
  // Add some randomness (±20%)
  return Math.floor(base * (0.8 + Math.random() * 0.4));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { service_key, action, payload, tenant_id, simulation_id, event_day } = await req.json();

    // Validate required fields
    if (!service_key || !action) {
      return new Response(
        JSON.stringify({ error: "service_key and action are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the adapter for this service
    const serviceAdapter = mockAdapters[service_key as keyof typeof mockAdapters];
    if (!serviceAdapter) {
      return new Response(
        JSON.stringify({ error: `No mock adapter found for service: ${service_key}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the action handler
    const actionHandler = (serviceAdapter as unknown)[action];
    if (!actionHandler) {
      return new Response(
        JSON.stringify({ error: `No mock handler for action: ${action} on service: ${service_key}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Simulate latency
    const latency = getSimulatedLatency(service_key);
    await new Promise((resolve) => setTimeout(resolve, latency));

    // Generate mock response
    const mockResponse = actionHandler(payload || {});

    // Log to mock_activity_log
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from("mock_activity_log").insert({
      tenant_id: tenant_id || null,
      service_key,
      action_type: action,
      simulated_result: { success: true },
      original_payload: payload,
      mock_response: mockResponse,
      latency_ms: latency,
      simulation_id: simulation_id || null,
      event_day: event_day || null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        mock: true,
        latency_ms: latency,
        response: mockResponse,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Mock adapter error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
