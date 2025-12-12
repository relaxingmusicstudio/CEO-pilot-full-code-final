import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  console.log("Test GHL webhook function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Allow custom target URL and payload from request body
    const { targetUrl, payload } = await req.json().catch(() => ({}));
    
    const webhookUrl = targetUrl || Deno.env.get("GHL_WEBHOOK_URL");
    
    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: "No webhook URL provided or configured" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const testPayload = payload || {
      firstName: "Test",
      lastName: "User",
      email: "test@example.com",
      phone: "555-123-4567",
      source: "Stripe Payment - Test",
      tags: ["Stripe Customer", "Starter Plan", "Onboarding", "Test"],
      customField: {
        plan: "Starter Plan",
        amount_paid: "$497.00",
        stripe_session_id: "test_session_" + Date.now(),
        payment_date: new Date().toISOString(),
      },
      name: "Test User",
      timestamp: new Date().toISOString(),
    };

    console.log("Sending to webhook URL:", webhookUrl);
    console.log("Payload:", JSON.stringify(testPayload));

    const ghlResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testPayload),
    });

    console.log("Response status:", ghlResponse.status);
    const ghlResult = await ghlResponse.text();
    console.log("Response body:", ghlResult);

    return new Response(
      JSON.stringify({ 
        success: true, 
        ghlStatus: ghlResponse.status,
        ghlResponse: ghlResult,
        message: "Test payload sent to GHL",
        webhookUrl: webhookUrl.substring(0, 50) + "..."
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
