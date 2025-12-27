import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BillingAction {
  action: string;
  [key: string]: unknown;
}

const REFUND_THRESHOLD_REQUIRES_APPROVAL = 500; // $500+ requires human approval

// Audit logging helper
async function logAudit(supabase: unknown, entry: {
  agent_name: string;
  action_type: string;
  entity_type?: string;
  entity_id?: string;
  description: string;
  success: boolean;
  request_snapshot?: unknown;
  response_snapshot?: unknown;
}) {
  try {
    await supabase.from('platform_audit_log').insert({
      timestamp: new Date().toISOString(),
      ...entry,
      request_snapshot: entry.request_snapshot ? JSON.stringify(entry.request_snapshot) : null,
      response_snapshot: entry.response_snapshot ? JSON.stringify(entry.response_snapshot) : null,
    });
  } catch (err) {
    console.error('[AuditLog] Failed to log:', err);
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');

  const supabase = createClient(supabaseUrl, supabaseKey);
  const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2023-10-16" }) : null;

  try {
    const body: BillingAction = await req.json();
    const { action } = body;

    console.log(`Billing agent action: ${action}`);

    switch (action) {
      // ==================== SLEEP MODE CHECK ====================
      case 'check_pending_work': {
        // Check if there's any work to do
        const pendingWork = [];

        // Check for failed payments needing retry
        const { data: failedPayments } = await supabase
          .from('client_invoices')
          .select('id')
          .eq('status', 'overdue')
          .limit(5);
        if (failedPayments?.length) pendingWork.push({ type: 'overdue_invoices', count: failedPayments.length });

        // Check for usage that needs syncing
        const { data: unsyncedUsage } = await supabase
          .from('usage_records')
          .select('id')
          .is('stripe_usage_record_id', null)
          .limit(10);
        if (unsyncedUsage?.length) pendingWork.push({ type: 'unsynced_usage', count: unsyncedUsage.length });

        // Check for pending human reviews
        const { data: pendingReviews } = await supabase
          .from('billing_agent_actions')
          .select('id')
          .eq('requires_human_review', true)
          .is('human_approved', null)
          .limit(5);
        if (pendingReviews?.length) pendingWork.push({ type: 'pending_reviews', count: pendingReviews.length });

        const isSleeping = pendingWork.length === 0;
        return new Response(JSON.stringify({
          status: isSleeping ? 'sleeping' : 'active',
          pending_work: pendingWork,
          message: isSleeping ? 'No billing work pending - agent sleeping' : `${pendingWork.length} work items pending`
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ==================== STRIPE PRODUCT MANAGEMENT ====================
      case 'create_stripe_product': {
        if (!stripe) throw new Error('Stripe not configured');
        const { name, description, unit_amount, pricing_type = 'recurring', billing_interval = 'month', metered_usage_type } = body as unknown;

        // Create product in Stripe
        const product = await stripe.products.create({
          name,
          description,
        });

        // Create price
        const priceParams: unknown = {
          product: product.id,
          currency: 'usd',
        };

        if (pricing_type === 'metered') {
          priceParams.recurring = {
            interval: billing_interval,
            usage_type: 'metered',
            aggregate_usage: metered_usage_type || 'sum',
          };
          priceParams.unit_amount = unit_amount; // cents per unit
        } else if (pricing_type === 'recurring') {
          priceParams.unit_amount = unit_amount;
          priceParams.recurring = { interval: billing_interval };
        } else {
          priceParams.unit_amount = unit_amount;
        }

        const price = await stripe.prices.create(priceParams);

        // Store in database
        const { data: dbProduct, error } = await supabase
          .from('stripe_products')
          .insert({
            stripe_product_id: product.id,
            stripe_price_id: price.id,
            name,
            description,
            pricing_type,
            unit_amount,
            billing_interval,
            metered_usage_type,
            created_by: 'ai_agent',
          })
          .select()
          .single();

        if (error) throw error;

        // Log action
        await supabase.from('billing_agent_actions').insert({
          action_type: 'create_price',
          target_type: 'product',
          target_id: product.id,
          reason: `Created new ${pricing_type} product: ${name}`,
          ai_confidence: 1.0,
          executed_at: new Date().toISOString(),
          result: { product_id: product.id, price_id: price.id },
        });

        // Log to CRM timeline (for audit trail)
        await supabase.from('automation_logs').insert({
          function_name: 'billing-agent',
          status: 'completed',
          items_processed: 1,
          metadata: { action: 'create_stripe_product', product_name: name, pricing_type },
          completed_at: new Date().toISOString(),
        });

        return new Response(JSON.stringify({ success: true, product: dbProduct }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'update_pricing': {
        if (!stripe) throw new Error('Stripe not configured');
        const { product_id, new_unit_amount, reason } = body as unknown;

        // Get existing product
        const { data: existingProduct } = await supabase
          .from('stripe_products')
          .select('*')
          .eq('id', product_id)
          .single();

        if (!existingProduct) throw new Error('Product not found');

        // Create new price (Stripe doesn't allow updating prices, must create new)
        const priceParams: unknown = {
          product: existingProduct.stripe_product_id,
          currency: 'usd',
          unit_amount: new_unit_amount,
        };

        if (existingProduct.pricing_type === 'recurring' || existingProduct.pricing_type === 'metered') {
          priceParams.recurring = {
            interval: existingProduct.billing_interval,
            ...(existingProduct.pricing_type === 'metered' && {
              usage_type: 'metered',
              aggregate_usage: existingProduct.metered_usage_type || 'sum',
            }),
          };
        }

        const newPrice = await stripe.prices.create(priceParams);

        // Deactivate old price
        if (existingProduct.stripe_price_id) {
          await stripe.prices.update(existingProduct.stripe_price_id, { active: false });
        }

        // Update database
        await supabase
          .from('stripe_products')
          .update({
            stripe_price_id: newPrice.id,
            unit_amount: new_unit_amount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', product_id);

        // Log action
        await supabase.from('billing_agent_actions').insert({
          action_type: 'update_price',
          target_type: 'product',
          target_id: existingProduct.stripe_product_id,
          reason: reason || `Updated price from ${existingProduct.unit_amount} to ${new_unit_amount} cents`,
          ai_confidence: 0.9,
          executed_at: new Date().toISOString(),
          result: { old_price_id: existingProduct.stripe_price_id, new_price_id: newPrice.id },
        });

        return new Response(JSON.stringify({ success: true, new_price_id: newPrice.id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'delete_product': {
        if (!stripe) throw new Error('Stripe not configured');
        const { product_id, reason } = body as unknown;

        const { data: product } = await supabase
          .from('stripe_products')
          .select('*')
          .eq('id', product_id)
          .single();

        if (!product) throw new Error('Product not found');

        // Archive in Stripe (can't delete products with prices)
        await stripe.products.update(product.stripe_product_id, { active: false });
        if (product.stripe_price_id) {
          await stripe.prices.update(product.stripe_price_id, { active: false });
        }

        // Mark as inactive in database
        await supabase
          .from('stripe_products')
          .update({ is_active: false })
          .eq('id', product_id);

        // Log action
        await supabase.from('billing_agent_actions').insert({
          action_type: 'delete_product',
          target_type: 'product',
          target_id: product.stripe_product_id,
          reason: reason || `Archived product: ${product.name}`,
          ai_confidence: 1.0,
          executed_at: new Date().toISOString(),
        });

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ==================== REFUNDS ====================
      case 'process_refund': {
        if (!stripe) throw new Error('Stripe not configured');
        const { invoice_id, amount, reason, client_id } = body as unknown;

        // Get invoice to find payment intent
        const { data: invoice } = await supabase
          .from('client_invoices')
          .select('*, clients(name, stripe_customer_id)')
          .eq('id', invoice_id)
          .single();

        if (!invoice) throw new Error('Invoice not found');

        const refundAmount = amount || invoice.amount;
        const requiresApproval = refundAmount >= REFUND_THRESHOLD_REQUIRES_APPROVAL;

        // Log the action first
        const { data: actionRecord } = await supabase
          .from('billing_agent_actions')
          .insert({
            action_type: 'refund',
            target_type: 'invoice',
            target_id: invoice_id,
            client_id: invoice.client_id,
            amount: refundAmount,
            reason: reason || 'Refund requested',
            ai_confidence: requiresApproval ? 0.7 : 0.95,
            requires_human_review: requiresApproval,
          })
          .select()
          .single();

        if (requiresApproval) {
          return new Response(JSON.stringify({
            success: false,
            requires_approval: true,
            action_id: actionRecord?.id,
            message: `Refund of $${refundAmount} requires human approval (threshold: $${REFUND_THRESHOLD_REQUIRES_APPROVAL})`
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Process the refund in Stripe
        if (invoice.stripe_payment_intent_id) {
          const refund = await stripe.refunds.create({
            payment_intent: invoice.stripe_payment_intent_id,
            amount: Math.round(refundAmount * 100), // Convert to cents
            reason: 'requested_by_customer',
          });

          // Update action record
          await supabase
            .from('billing_agent_actions')
            .update({
              executed_at: new Date().toISOString(),
              result: { refund_id: refund.id, status: refund.status },
            })
            .eq('id', actionRecord?.id);

          // Update invoice status
          await supabase
            .from('client_invoices')
            .update({ status: 'refunded' })
            .eq('id', invoice_id);

          // Log refund to CRM timeline
          await supabase.from('contact_timeline').insert({
            contact_id: invoice.client_id,
            event_type: 'billing_refund',
            title: `Refund Processed: $${refundAmount}`,
            description: `Refund issued for invoice. Reason: ${reason || 'Customer request'}`,
            metadata: { invoice_id, refund_id: refund.id, amount: refundAmount },
            source: 'billing_agent',
          });

          return new Response(JSON.stringify({
            success: true,
            refund_id: refund.id,
            amount: refundAmount,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({
          success: false,
          error: 'No Stripe payment intent found for this invoice'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // GOVERNANCE: approve_action ONLY changes status - NO execution
      // System is Propose-Only. Approved actions sit in queue until manual execution is implemented.
      case 'approve_action': {
        const { action_id, approved_by } = body as unknown;

        const { data: actionRecord } = await supabase
          .from('billing_agent_actions')
          .select('*')
          .eq('id', action_id)
          .single();

        if (!actionRecord) throw new Error('Action not found');

        // GOVERNANCE: Only update status to approved - DO NOT execute side effects
        // Execution (Stripe refunds, etc.) requires a separate human "Execute" action
        await supabase
          .from('billing_agent_actions')
          .update({
            human_approved: true,
            approved_by,
            // Note: executed_at remains null until manual execution is implemented
          })
          .eq('id', action_id);

        // Log audit: approval recorded, no execution
        await logAudit(supabase, {
          agent_name: 'billing-agent',
          action_type: 'approve_action',
          entity_type: 'billing_action',
          entity_id: action_id,
          description: `Action approved by ${approved_by}. No execution performed (Propose-Only governance).`,
          success: true,
          request_snapshot: { action_id, approved_by },
          response_snapshot: { status: 'approved_no_execution' },
        });

        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Action approved. Execution requires separate manual action (Propose-Only mode).',
          governance: 'No side effects performed. Status updated to approved only.'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'reject_action': {
        const { action_id, rejected_by, reason } = body as unknown;

        await supabase
          .from('billing_agent_actions')
          .update({
            human_approved: false,
            approved_by: rejected_by,
            error_message: reason || 'Rejected by human',
          })
          .eq('id', action_id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ==================== USAGE SYNC ====================
      case 'sync_usage_to_stripe': {
        if (!stripe) throw new Error('Stripe not configured');
        const { client_id } = body as unknown;

        // Get client's Stripe subscription
        const { data: client } = await supabase
          .from('clients')
          .select('*')
          .eq('id', client_id)
          .single();

        if (!client?.subscription_id) {
          return new Response(JSON.stringify({ success: false, error: 'Client has no active subscription' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Get unsynced usage records
        const { data: usageRecords } = await supabase
          .from('usage_records')
          .select('*')
          .eq('client_id', client_id)
          .is('stripe_usage_record_id', null);

        if (!usageRecords?.length) {
          return new Response(JSON.stringify({ success: true, message: 'No usage to sync' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Get subscription items
        const subscription = await stripe.subscriptions.retrieve(client.subscription_id);
        const meteredItems = subscription.items.data.filter((item: unknown) =>
          item.price.recurring?.usage_type === 'metered'
        );

        if (!meteredItems.length) {
          return new Response(JSON.stringify({ success: false, error: 'No metered subscription items found' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Report usage for each record
        let syncedCount = 0;
        for (const usage of usageRecords) {
          try {
            const usageRecord = await stripe.subscriptionItems.createUsageRecord(
              meteredItems[0].id,
              {
                quantity: Math.ceil(Number(usage.quantity)),
                timestamp: Math.floor(new Date(usage.recorded_at).getTime() / 1000),
                action: 'increment',
              }
            );

            await supabase
              .from('usage_records')
              .update({ stripe_usage_record_id: usageRecord.id })
              .eq('id', usage.id);

            syncedCount++;
          } catch (err) {
            console.error(`Failed to sync usage ${usage.id}:`, err);
          }
        }

        // Log action
        await supabase.from('billing_agent_actions').insert({
          action_type: 'usage_sync',
          target_type: 'usage',
          client_id,
          reason: `Synced ${syncedCount} usage records to Stripe`,
          ai_confidence: 1.0,
          executed_at: new Date().toISOString(),
          result: { synced_count: syncedCount, total_records: usageRecords.length },
        });

        return new Response(JSON.stringify({
          success: true,
          synced_count: syncedCount,
          total_records: usageRecords.length,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ==================== DUNNING & PAYMENT ISSUES ====================
      case 'auto_dunning': {
        // Find overdue invoices and send reminders
        const { data: overdueInvoices } = await supabase
          .from('client_invoices')
          .select('*, clients(name, email, phone)')
          .eq('status', 'overdue')
          .order('due_date', { ascending: true });

        if (!overdueInvoices?.length) {
          return new Response(JSON.stringify({ success: true, message: 'No overdue invoices' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const actions = [];
        for (const invoice of overdueInvoices) {
          const daysPastDue = Math.floor(
            (Date.now() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24)
          );

          // Log dunning action
          const { data: action } = await supabase
            .from('billing_agent_actions')
            .insert({
              action_type: 'dunning',
              target_type: 'invoice',
              target_id: invoice.id,
              client_id: invoice.client_id,
              amount: invoice.amount,
              reason: `Invoice ${invoice.invoice_number} is ${daysPastDue} days past due`,
              ai_confidence: 0.85,
              requires_human_review: daysPastDue > 30,
            })
            .select()
            .single();

          // Log to CRM timeline
          await supabase.from('contact_timeline').insert({
            contact_id: invoice.client_id,
            event_type: 'billing_dunning',
            title: `Payment Reminder: Invoice ${invoice.invoice_number}`,
            description: `Invoice $${invoice.amount} is ${daysPastDue} days overdue`,
            metadata: { invoice_id: invoice.id, days_past_due: daysPastDue, action_id: action?.id },
            source: 'billing_agent',
          });

          // Send dunning notifications via messaging-send
          const client = invoice.clients as unknown;
          if (client?.email) {
            try {
              await supabase.functions.invoke('messaging-send', {
                body: {
                  channel: 'email',
                  to: client.email,
                  subject: `Payment Reminder: Invoice ${invoice.invoice_number}`,
                  content: `Dear ${client.name},\n\nYour invoice ${invoice.invoice_number} for $${invoice.amount} is ${daysPastDue} days overdue.\n\nPlease process payment at your earliest convenience to avoid any service interruptions.\n\nThank you,\nBilling Team`,
                  metadata: { invoice_id: invoice.id, dunning_level: daysPastDue > 14 ? 'urgent' : 'reminder' }
                }
              });
            } catch (err) {
              console.error(`Failed to send dunning email: ${err}`);
            }
          }

          // Send SMS for urgent cases (14+ days)
          if (client?.phone && daysPastDue >= 14) {
            try {
              await supabase.functions.invoke('messaging-send', {
                body: {
                  channel: 'sms',
                  to: client.phone,
                  content: `Payment reminder: Invoice ${invoice.invoice_number} ($${invoice.amount}) is ${daysPastDue} days overdue. Please pay ASAP to avoid service interruption.`,
                  metadata: { invoice_id: invoice.id }
                }
              });
            } catch (err) {
              console.error(`Failed to send dunning SMS: ${err}`);
            }
          }

          actions.push({
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            client: client?.name,
            days_past_due: daysPastDue,
            action_id: action?.id,
            notifications_sent: { email: !!client?.email, sms: client?.phone && daysPastDue >= 14 },
          });
        }

        return new Response(JSON.stringify({
          success: true,
          processed: actions.length,
          actions,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'retry_failed_payment': {
        if (!stripe) throw new Error('Stripe not configured');
        const { invoice_id } = body as unknown;

        const { data: invoice } = await supabase
          .from('client_invoices')
          .select('*, clients(stripe_customer_id)')
          .eq('id', invoice_id)
          .single();

        if (!invoice?.stripe_invoice_id) {
          throw new Error('No Stripe invoice found');
        }

        // Retry the payment
        const stripeInvoice = await stripe.invoices.pay(invoice.stripe_invoice_id, {
          forgive: false,
        });

        // Log action
        await supabase.from('billing_agent_actions').insert({
          action_type: 'payment_retry',
          target_type: 'invoice',
          target_id: invoice_id,
          client_id: invoice.client_id,
          amount: invoice.amount,
          reason: 'Automated payment retry',
          ai_confidence: 0.9,
          executed_at: new Date().toISOString(),
          result: { stripe_status: stripeInvoice.status },
        });

        if (stripeInvoice.status === 'paid') {
          await supabase
            .from('client_invoices')
            .update({ status: 'paid', paid_at: new Date().toISOString() })
            .eq('id', invoice_id);
        }

        return new Response(JSON.stringify({
          success: stripeInvoice.status === 'paid',
          status: stripeInvoice.status,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ==================== DISPUTES ====================
      case 'handle_dispute': {
        if (!stripe) throw new Error('Stripe not configured');
        const { dispute_id, evidence } = body as unknown;

        // Submit evidence for the dispute
        const dispute = await stripe.disputes.update(dispute_id, {
          evidence: {
            customer_communication: evidence?.communication,
            service_documentation: evidence?.documentation,
            uncategorized_text: evidence?.notes,
          },
          submit: true,
        });

        // Log action
        await supabase.from('billing_agent_actions').insert({
          action_type: 'dispute_resolve',
          target_type: 'dispute',
          target_id: dispute_id,
          reason: 'Submitted dispute evidence',
          ai_confidence: 0.75,
          requires_human_review: true, // Disputes should be reviewed
          executed_at: new Date().toISOString(),
          result: { dispute_status: dispute.status },
        });

        return new Response(JSON.stringify({
          success: true,
          dispute_status: dispute.status,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ==================== CUSTOMER MANAGEMENT ====================
      case 'create_stripe_customer': {
        if (!stripe) throw new Error('Stripe not configured');
        const { client_id } = body as unknown;

        const { data: client } = await supabase
          .from('clients')
          .select('*')
          .eq('id', client_id)
          .single();

        if (!client) throw new Error('Client not found');
        if (client.stripe_customer_id) {
          return new Response(JSON.stringify({
            success: true,
            customer_id: client.stripe_customer_id,
            message: 'Customer already exists in Stripe'
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const customer = await stripe.customers.create({
          email: client.email,
          name: client.name,
          phone: client.phone || undefined,
          metadata: {
            client_id: client.id,
            plan: client.plan,
          },
        });

        await supabase
          .from('clients')
          .update({ stripe_customer_id: customer.id })
          .eq('id', client_id);

        return new Response(JSON.stringify({
          success: true,
          customer_id: customer.id,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get_customer_portal_link': {
        if (!stripe) throw new Error('Stripe not configured');
        const { client_id, return_url } = body as unknown;

        const { data: client } = await supabase
          .from('clients')
          .select('stripe_customer_id')
          .eq('id', client_id)
          .single();

        if (!client?.stripe_customer_id) {
          throw new Error('Client has no Stripe customer');
        }

        const session = await stripe.billingPortal.sessions.create({
          customer: client.stripe_customer_id,
          return_url: return_url || Deno.env.get('SUPABASE_URL') || 'https://localhost',
        });

        return new Response(JSON.stringify({
          success: true,
          portal_url: session.url,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ==================== USAGE & ANALYTICS ====================
      case 'get_usage_summary': {
        const { client_id, period_start, period_end } = body as unknown;

        let query = supabase
          .from('usage_records')
          .select('usage_type, quantity, total_cost, source')
          .eq('client_id', client_id);

        if (period_start) query = query.gte('recorded_at', period_start);
        if (period_end) query = query.lte('recorded_at', period_end);

        const { data: usageRecords, error } = await query;
        if (error) throw error;

        // Aggregate by type
        const summary: Record<string, { quantity: number; cost: number }> = {};
        for (const record of usageRecords || []) {
          const type = record.usage_type;
          if (!summary[type]) summary[type] = { quantity: 0, cost: 0 };
          summary[type].quantity += Number(record.quantity);
          summary[type].cost += Number(record.total_cost);
        }

        return new Response(JSON.stringify({
          success: true,
          summary,
          total_records: usageRecords?.length || 0,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get_agent_activity': {
        const { limit = 50, action_type, requires_review } = body as unknown;

        let query = supabase
          .from('billing_agent_actions')
          .select('*, clients(name)')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (action_type) query = query.eq('action_type', action_type);
        if (requires_review !== undefined) query = query.eq('requires_human_review', requires_review);

        const { data: actions, error } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({
          success: true,
          actions,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get_products': {
        const { data: products, error } = await supabase
          .from('stripe_products')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (error) throw error;

        return new Response(JSON.stringify({
          success: true,
          products,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error: unknown) {
    console.error('Billing agent error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
