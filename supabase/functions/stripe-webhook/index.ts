import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const GHL_WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/R76edRoS33Lv8KfplU5i/webhook-trigger/c79b5649-d39a-4858-ba1e-7b0b558125d3";

const handler = async (req: Request): Promise<Response> => {
  console.log("Stripe webhook function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Stripe event type:", payload.type);

    // Handle checkout.session.completed event
    if (payload.type === "checkout.session.completed") {
      const session = payload.data.object;
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

      if (customerEmail) {
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
            plan: planName,
            amount_paid: `$${amountTotal}`,
            stripe_session_id: session.id,
            payment_date: new Date().toISOString(),
          },
          name: customerName,
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
