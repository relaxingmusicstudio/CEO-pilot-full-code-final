import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface CreateInvoicePayload {
  client_id: string;
  items: InvoiceItem[];
  due_date?: string;
  notes?: string;
}

interface RecordPaymentPayload {
  invoice_id?: string;
  client_id: string;
  amount: number;
  method: 'stripe' | 'cash' | 'bank_transfer' | 'check';
  reference_number?: string;
  notes?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, ...payload } = await req.json();
    console.log(`[client-billing] Action: ${action}`, payload);

    switch (action) {
      case 'create_invoice': {
        const { client_id, items, due_date, notes } = payload as CreateInvoicePayload;
        
        // Generate invoice number: INV-YYYYMM-XXX
        const now = new Date();
        const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        // Get count for this month
        const { count } = await supabase
          .from('client_invoices')
          .select('*', { count: 'exact', head: true })
          .like('invoice_number', `${prefix}%`);
        
        const invoiceNumber = `${prefix}-${String((count || 0) + 1).padStart(3, '0')}`;
        
        // Calculate total
        const amount = items.reduce((sum: number, item: InvoiceItem) => sum + item.total, 0);
        
        const { data: invoice, error } = await supabase
          .from('client_invoices')
          .insert({
            client_id,
            invoice_number: invoiceNumber,
            amount,
            items,
            due_date: due_date || null,
            notes: notes || null,
            status: 'draft'
          })
          .select()
          .single();

        if (error) throw error;

        console.log(`[client-billing] Created invoice ${invoiceNumber} for $${amount}`);
        return new Response(JSON.stringify({ success: true, invoice }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'send_invoice': {
        const { invoice_id } = payload;
        
        const { data: invoice, error } = await supabase
          .from('client_invoices')
          .update({ status: 'sent' })
          .eq('id', invoice_id)
          .select()
          .single();

        if (error) throw error;

        // TODO: If Stripe is configured, create Stripe invoice here
        // For now, just mark as sent

        console.log(`[client-billing] Invoice ${invoice.invoice_number} marked as sent`);
        return new Response(JSON.stringify({ success: true, invoice }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'mark_paid': {
        const { invoice_id, payment_method, reference_number } = payload;
        
        // Get invoice details
        const { data: invoice, error: fetchError } = await supabase
          .from('client_invoices')
          .select('*')
          .eq('id', invoice_id)
          .single();

        if (fetchError) throw fetchError;

        // Update invoice to paid
        const { error: updateError } = await supabase
          .from('client_invoices')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', invoice_id);

        if (updateError) throw updateError;

        // Record the payment
        const { data: payment, error: paymentError } = await supabase
          .from('client_payments')
          .insert({
            client_id: invoice.client_id,
            invoice_id,
            amount: invoice.amount,
            method: payment_method || 'cash',
            reference_number: reference_number || null,
            status: 'succeeded'
          })
          .select()
          .single();

        if (paymentError) throw paymentError;

        console.log(`[client-billing] Invoice ${invoice.invoice_number} marked as paid`);
        return new Response(JSON.stringify({ success: true, invoice, payment }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'record_payment': {
        const { invoice_id, client_id, amount, method, reference_number, notes } = payload as RecordPaymentPayload;
        
        const { data: payment, error } = await supabase
          .from('client_payments')
          .insert({
            client_id,
            invoice_id: invoice_id || null,
            amount,
            method,
            reference_number: reference_number || null,
            notes: notes || null,
            status: 'succeeded'
          })
          .select()
          .single();

        if (error) throw error;

        // If linked to invoice, update invoice status
        if (invoice_id) {
          const { data: invoice } = await supabase
            .from('client_invoices')
            .select('amount')
            .eq('id', invoice_id)
            .single();

          // Get total payments for this invoice
          const { data: payments } = await supabase
            .from('client_payments')
            .select('amount')
            .eq('invoice_id', invoice_id)
            .eq('status', 'succeeded');

          const totalPaid = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

          if (invoice && totalPaid >= Number(invoice.amount)) {
            await supabase
              .from('client_invoices')
              .update({ status: 'paid', paid_at: new Date().toISOString() })
              .eq('id', invoice_id);
          }
        }

        console.log(`[client-billing] Payment of $${amount} recorded`);
        return new Response(JSON.stringify({ success: true, payment }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_billing_summary': {
        // Get all invoices
        const { data: invoices, error: invError } = await supabase
          .from('client_invoices')
          .select('*');

        if (invError) throw invError;

        // Get all payments this month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { data: payments, error: payError } = await supabase
          .from('client_payments')
          .select('*')
          .eq('status', 'succeeded')
          .gte('created_at', startOfMonth.toISOString());

        if (payError) throw payError;

        const now = new Date();
        const summary = {
          total_outstanding: invoices
            ?.filter(i => ['sent', 'overdue'].includes(i.status))
            .reduce((sum, i) => sum + Number(i.amount), 0) || 0,
          invoices_overdue: invoices
            ?.filter(i => i.status === 'sent' && i.due_date && new Date(i.due_date) < now)
            .length || 0,
          revenue_this_month: payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0,
          payments_received: payments?.length || 0,
          draft_invoices: invoices?.filter(i => i.status === 'draft').length || 0,
          sent_invoices: invoices?.filter(i => i.status === 'sent').length || 0,
          paid_invoices: invoices?.filter(i => i.status === 'paid').length || 0,
        };

        return new Response(JSON.stringify({ success: true, summary }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'check_overdue': {
        const now = new Date();
        
        // Find sent invoices past due date
        const { data: overdueInvoices, error } = await supabase
          .from('client_invoices')
          .select('*, clients(name, email)')
          .eq('status', 'sent')
          .lt('due_date', now.toISOString().split('T')[0]);

        if (error) throw error;

        // Update them to overdue status
        if (overdueInvoices && overdueInvoices.length > 0) {
          const ids = overdueInvoices.map(i => i.id);
          await supabase
            .from('client_invoices')
            .update({ status: 'overdue' })
            .in('id', ids);

          console.log(`[client-billing] Marked ${overdueInvoices.length} invoices as overdue`);
        }

        return new Response(JSON.stringify({ 
          success: true, 
          overdue_count: overdueInvoices?.length || 0,
          overdue_invoices: overdueInvoices 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'cancel_invoice': {
        const { invoice_id } = payload;
        
        const { data: invoice, error } = await supabase
          .from('client_invoices')
          .update({ status: 'cancelled' })
          .eq('id', invoice_id)
          .select()
          .single();

        if (error) throw error;

        console.log(`[client-billing] Invoice ${invoice.invoice_number} cancelled`);
        return new Response(JSON.stringify({ success: true, invoice }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[client-billing] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
