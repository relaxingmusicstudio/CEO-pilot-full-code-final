import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createAuditContext } from '../_shared/auditLogger.ts';

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
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const audit = createAuditContext(supabase, 'stripe-webhook', 'payment_event');

  if (!stripeWebhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    await audit.logError('Webhook secret not configured', new Error('Missing STRIPE_WEBHOOK_SECRET'));
    return new Response(
      JSON.stringify({ error: "Webhook secret not configured" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      console.error("No stripe-signature header found");
      await audit.logError('Missing signature header', new Error('No stripe-signature header'));
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret);
    } catch (err: unknown) {
      console.error("Webhook signature verification failed:", err.message);
      await audit.logError('Signature verification failed', err);
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Stripe event type:", event.type);
    await audit.logStart(`Processing Stripe event: ${event.type}`, { event_type: event.type, event_id: event.id });

    // Handle checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log("Checkout session completed:", session.id);

      const customerEmail = session.customer_details?.email || session.customer_email;
      const customerName = session.customer_details?.name || "";
      const customerPhone = session.customer_details?.phone || "";
      const amountTotal = session.amount_total ? (session.amount_total / 100).toFixed(2) : "0";
      
      // Determine plan based on amount
      let planName = "starter";
      let mrr = 497;
      if (session.amount_total === 49700) {
        planName = "starter";
        mrr = 497;
      } else if (session.amount_total === 149700) {
        planName = "professional";
        mrr = 1497;
      } else if (session.amount_total === 199700) {
        planName = "scale";
        mrr = 1997;
      }

      console.log("Customer details:", { customerEmail, customerName, amountTotal, planName });

      // Trigger automated provisioning
      if (customerEmail) {
        try {
          // Call product-provisioning function
          const provisioningResponse = await fetch(`${supabaseUrl}/functions/v1/product-provisioning`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              action: 'provision_new_client',
              client_data: {
                name: customerName,
                email: customerEmail,
                phone: customerPhone,
                plan: planName,
                mrr: mrr,
                metadata: {
                  stripe_session_id: session.id,
                  payment_date: new Date().toISOString(),
                  amount_paid: amountTotal,
                }
              }
            }),
          });

          const provisioningResult = await provisioningResponse.json();
          console.log("Provisioning result:", provisioningResult);

          // Trigger QuickBooks sync for new customer
          try {
            await fetch(`${supabaseUrl}/functions/v1/quickbooks-integration`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                action: 'sync_customer',
                client_id: provisioningResult.client?.id,
              }),
            });
            console.log('QuickBooks customer sync triggered');
          } catch (qbError) {
            console.error('QuickBooks sync error:', qbError);
          }

          // Also send to GHL if configured
          if (GHL_WEBHOOK_URL) {
            const nameParts = customerName.trim().split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';

            const ghlPayload = {
              firstName,
              lastName,
              email: customerEmail,
              phone: customerPhone,
              source: "Stripe Payment",
              tags: ["Stripe Customer", planName, "Onboarding", "Auto-Provisioned"],
              customField: {
                formName: "Stripe Checkout",
                plan: planName,
                amount_paid: `$${amountTotal}`,
                stripe_session_id: session.id,
                payment_date: new Date().toISOString(),
                client_id: provisioningResult.client?.id || '',
              },
            };

            console.log("Sending to GHL:", JSON.stringify(ghlPayload));
            const ghlResponse = await fetch(GHL_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(ghlPayload),
            });
            console.log("GHL webhook response status:", ghlResponse.status);
          }

          await audit.logSuccess(`Checkout completed: ${planName} plan`, 'checkout', session.id, { 
            email: customerEmail, 
            plan: planName, 
            amount: amountTotal,
            client_id: provisioningResult.client?.id 
          });

          return new Response(
            JSON.stringify({ 
              received: true, 
              provisioned: true,
              client_id: provisioningResult.client?.id,
              customer: customerEmail,
              plan: planName,
            }),
            { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        } catch (provisionError: unknown) {
          console.error("Provisioning error:", provisionError);
          await audit.logError('Provisioning failed', provisionError, { session_id: session.id });
          // Still return 200 to acknowledge Stripe, but log the error
        }
      }
    }

    // Handle subscription events
    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      console.log("Subscription updated:", subscription.id);
      
      // Update client subscription status
      await supabase
        .from('clients')
        .update({ 
          subscription_status: subscription.status,
          subscription_id: subscription.id,
        })
        .eq('stripe_customer_id', subscription.customer);

      await audit.logSuccess(`Subscription updated: ${subscription.status}`, 'subscription', subscription.id, { status: subscription.status });
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      console.log("Subscription cancelled:", subscription.id);
      
      await supabase
        .from('clients')
        .update({ 
          subscription_status: 'canceled',
          churned_at: new Date().toISOString(),
        })
        .eq('stripe_customer_id', subscription.customer);

      await audit.logSuccess('Subscription cancelled', 'subscription', subscription.id, { customer: subscription.customer });
    }

    // Handle invoice payment failed
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      console.log("Invoice payment failed:", invoice.id);
      
      await supabase
        .from('client_invoices')
        .update({ status: 'overdue' })
        .eq('stripe_invoice_id', invoice.id);
        
      // Log for billing agent to handle
      await supabase.from('billing_agent_actions').insert({
        action_type: 'dunning',
        target_type: 'invoice',
        target_id: invoice.id,
        reason: `Payment failed for invoice ${invoice.number}`,
        ai_confidence: 0.9,
      });

      await audit.logSuccess('Payment failed - dunning initiated', 'invoice', invoice.id, { invoice_number: invoice.number });
    }

    console.log("Event processed successfully");
    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in stripe-webhook function:", error);
    await audit.logError('Webhook processing failed', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);