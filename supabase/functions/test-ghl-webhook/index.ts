import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GHL_WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/R76edRoS33Lv8KfplU5i/webhook-trigger/c79b5649-d39a-4858-ba1e-7b0b558125d3";

const handler = async (req: Request): Promise<Response> => {
  console.log("Test GHL webhook function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const testPayload = {
      firstName: "Test",
      lastName: "User",
      email: "test@example.com",
      source: "Stripe Payment",
      tags: ["Stripe Customer", "Starter Plan", "Onboarding"],
      customField: {
        plan: "Starter Plan",
        amount_paid: "$497.00",
        stripe_session_id: "test_session_123",
        payment_date: new Date().toISOString(),
      },
      name: "Test User",
      timestamp: new Date().toISOString(),
    };

    console.log("Sending test payload to GHL:", JSON.stringify(testPayload));

    const ghlResponse = await fetch(GHL_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testPayload),
    });

    console.log("GHL response status:", ghlResponse.status);
    const ghlResult = await ghlResponse.text();
    console.log("GHL response:", ghlResult);

    return new Response(
      JSON.stringify({ 
        success: true, 
        ghlStatus: ghlResponse.status,
        message: "Test payload sent to GHL"
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error sending test to GHL:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
