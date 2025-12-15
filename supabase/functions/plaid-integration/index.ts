import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID') || 'placeholder';
const PLAID_SECRET = Deno.env.get('PLAID_SECRET') || 'placeholder';
const PLAID_ENV = 'sandbox'; // Change to 'development' or 'production' as needed

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { action, ...params } = await req.json();
    console.log(`Plaid integration action: ${action}`);

    switch (action) {
      case 'create_link_token': {
        // Create Plaid Link token for client-side initialization
        const response = await fetch(`https://${PLAID_ENV}.plaid.com/link/token/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: PLAID_CLIENT_ID,
            secret: PLAID_SECRET,
            user: { client_user_id: params.user_id || 'default_user' },
            client_name: 'Finance Hub',
            products: ['transactions'],
            country_codes: ['US'],
            language: 'en',
          }),
        });

        const data = await response.json();
        console.log('Link token created:', data.link_token ? 'success' : 'failed');

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'exchange_public_token': {
        // Exchange public token for access token after user completes Link
        const response = await fetch(`https://${PLAID_ENV}.plaid.com/item/public_token/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: PLAID_CLIENT_ID,
            secret: PLAID_SECRET,
            public_token: params.public_token,
          }),
        });

        const data = await response.json();

        if (data.access_token) {
          // Store connection in database
          const { error } = await supabase.from('bank_connections').insert({
            provider: 'plaid',
            access_token: data.access_token,
            item_id: data.item_id,
            institution_name: params.institution_name || 'Unknown Bank',
            is_active: true,
            metadata: { request_id: data.request_id },
          });

          if (error) {
            console.error('Error storing connection:', error);
          } else {
            console.log('Bank connection stored successfully');
          }
        }

        return new Response(JSON.stringify({ success: true, item_id: data.item_id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'sync_transactions': {
        // Get connection
        const { data: connection, error: connError } = await supabase
          .from('bank_connections')
          .select('*')
          .eq('id', params.connection_id)
          .single();

        if (connError || !connection) {
          throw new Error('Connection not found');
        }

        // Sync transactions from Plaid
        const response = await fetch(`https://${PLAID_ENV}.plaid.com/transactions/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: PLAID_CLIENT_ID,
            secret: PLAID_SECRET,
            access_token: connection.access_token,
            cursor: connection.sync_cursor || undefined,
          }),
        });

        const data = await response.json();
        console.log(`Synced ${data.added?.length || 0} new transactions`);

        // Insert new transactions
        if (data.added && data.added.length > 0) {
          const transactions = data.added.map((tx: any) => ({
            connection_id: params.connection_id,
            plaid_transaction_id: tx.transaction_id,
            name: tx.name,
            merchant_name: tx.merchant_name,
            amount: tx.amount,
            date: tx.date,
            category: tx.category,
            transaction_type: tx.transaction_type,
            needs_review: true,
            metadata: {
              pending: tx.pending,
              account_id: tx.account_id,
            },
          }));

          const { error: insertError } = await supabase
            .from('bank_transactions')
            .upsert(transactions, { onConflict: 'plaid_transaction_id' });

          if (insertError) {
            console.error('Error inserting transactions:', insertError);
          }
        }

        // Update sync cursor
        await supabase
          .from('bank_connections')
          .update({ 
            sync_cursor: data.next_cursor,
            last_sync_at: new Date().toISOString(),
          })
          .eq('id', params.connection_id);

        return new Response(JSON.stringify({
          success: true,
          added: data.added?.length || 0,
          modified: data.modified?.length || 0,
          removed: data.removed?.length || 0,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_accounts': {
        const { data: connection } = await supabase
          .from('bank_connections')
          .select('*')
          .eq('id', params.connection_id)
          .single();

        if (!connection) {
          throw new Error('Connection not found');
        }

        const response = await fetch(`https://${PLAID_ENV}.plaid.com/accounts/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: PLAID_CLIENT_ID,
            secret: PLAID_SECRET,
            access_token: connection.access_token,
          }),
        });

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'remove_connection': {
        const { data: connection } = await supabase
          .from('bank_connections')
          .select('*')
          .eq('id', params.connection_id)
          .single();

        if (connection) {
          // Remove from Plaid
          await fetch(`https://${PLAID_ENV}.plaid.com/item/remove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: PLAID_CLIENT_ID,
              secret: PLAID_SECRET,
              access_token: connection.access_token,
            }),
          });

          // Mark as inactive
          await supabase
            .from('bank_connections')
            .update({ is_active: false })
            .eq('id', params.connection_id);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_connections': {
        const { data: connections, error } = await supabase
          .from('bank_connections')
          .select('*')
          .eq('provider', 'plaid')
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (error) throw error;

        return new Response(JSON.stringify({ connections }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: any) {
    console.error('Plaid integration error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
