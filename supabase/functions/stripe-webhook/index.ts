import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const GHL_WEBHOOK_URL = Deno.env.get("GHL_WEBHOOK_URL");

const handler = async (req: Request): Promise<Response> => {
  console.log("Stripe webhook function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  
  if (!stripeWebhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return new Response(
      JSON.stringify({ error: "Webhook secret not configured" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    // Get the raw body for signature verification
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      console.error("No stripe-signature header found");
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Verify the webhook signature
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Stripe event type:", event.type);

    // Handle checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log("Checkout session completed:", session.id);

      const customerEmail = session.customer_details?.email || session.customer_email;
      const customerName = session.customer_details?.name || "";
      const amountTotal = session.amount_total ? (session.amount_total / 100).toFixed(2) : "0";
      
      // Determine plan based on amount
      let planName = "Unknown Plan";
      if (session.amount_total === 49700) {
        planName = "Starter Plan";
      } else if (session.amount_total === 149700) {
        planName = "Professional Plan";
      }

      console.log("Customer details:", { customerEmail, customerName, amountTotal, planName });

      if (customerEmail && GHL_WEBHOOK_URL) {
        // Split name into firstName and lastName
        const nameParts = customerName.trim().split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const ghlPayload = {
          firstName: firstName,
          lastName: lastName,
          email: customerEmail,
          source: "Stripe Payment",
          tags: ["Stripe Customer", planName, "Onboarding"],
          customField: {
            formName: "Stripe Checkout",
            plan: planName,
            amount_paid: `$${amountTotal}`,
            stripe_session_id: session.id,
            payment_date: new Date().toISOString(),
          },
          name: customerName,
          formName: "Stripe Checkout",
          plan: planName,
          amount_paid: `$${amountTotal}`,
          timestamp: new Date().toISOString(),
        };

        console.log("Sending to GHL:", JSON.stringify(ghlPayload));

        const ghlResponse = await fetch(GHL_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(ghlPayload),
        });

        console.log("GHL webhook response status:", ghlResponse.status);
        const ghlResult = await ghlResponse.text();
        console.log("GHL response:", ghlResult);

        return new Response(
          JSON.stringify({ 
            received: true, 
            ghlStatus: ghlResponse.status,
            customer: customerEmail,
            plan: planName,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      } else if (!GHL_WEBHOOK_URL) {
        console.error("GHL_WEBHOOK_URL is not configured");
      }
    }

    // For other events, just acknowledge receipt
    console.log("Event type not handled, acknowledging receipt");
    return new Response(
      JSON.stringify({ received: true }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in stripe-webhook function:", error);
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
