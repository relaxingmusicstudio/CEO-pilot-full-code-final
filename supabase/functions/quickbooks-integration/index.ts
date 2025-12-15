import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const QB_CLIENT_ID = Deno.env.get('QUICKBOOKS_CLIENT_ID') || 'placeholder';
const QB_CLIENT_SECRET = Deno.env.get('QUICKBOOKS_CLIENT_SECRET') || 'placeholder';
const QB_ENV = 'sandbox' as 'sandbox' | 'production';
const QB_BASE_URL = QB_ENV === 'production' 
  ? 'https://quickbooks.api.intuit.com' 
  : 'https://sandbox-quickbooks.api.intuit.com';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { action, ...params } = await req.json();
    console.log(`QuickBooks integration action: ${action}`);

    switch (action) {
      case 'get_auth_url': {
        const redirectUri = params.redirect_uri || `${supabaseUrl}/functions/v1/quickbooks-integration?action=callback`;
        const scopes = 'com.intuit.quickbooks.accounting';
        
        const authUrl = `https://appcenter.intuit.com/connect/oauth2?` +
          `client_id=${QB_CLIENT_ID}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_type=code&` +
          `scope=${encodeURIComponent(scopes)}&` +
          `state=${params.state || 'default'}`;

        return new Response(JSON.stringify({ auth_url: authUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'exchange_code': {
        const redirectUri = params.redirect_uri || `${supabaseUrl}/functions/v1/quickbooks-integration?action=callback`;
        
        const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`)}`,
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: params.code,
            redirect_uri: redirectUri,
          }),
        });

        const tokens = await tokenResponse.json();

        if (tokens.access_token) {
          // Store connection
          const { error } = await supabase.from('bank_connections').insert({
            provider: 'quickbooks',
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            company_id: params.realm_id,
            institution_name: 'QuickBooks Online',
            is_active: true,
            metadata: {
              expires_in: tokens.expires_in,
              token_type: tokens.token_type,
            },
          });

          if (error) {
            console.error('Error storing QB connection:', error);
          } else {
            console.log('QuickBooks connection stored successfully');

            // Log sync action
            await supabase.from('accounting_sync_log').insert({
              entity_type: 'connection',
              internal_id: params.realm_id,
              provider: 'quickbooks',
              sync_status: 'success',
              sync_direction: 'inbound',
            });
          }
        }

        return new Response(JSON.stringify({ success: true, realm_id: params.realm_id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'refresh_tokens': {
        const { data: connection } = await supabase
          .from('bank_connections')
          .select('*')
          .eq('provider', 'quickbooks')
          .eq('is_active', true)
          .single();

        if (!connection) {
          throw new Error('No active QuickBooks connection found');
        }

        const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`)}`,
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: connection.refresh_token,
          }),
        });

        const tokens = await tokenResponse.json();

        if (tokens.access_token) {
          await supabase
            .from('bank_connections')
            .update({
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              updated_at: new Date().toISOString(),
            })
            .eq('id', connection.id);

          console.log('QuickBooks tokens refreshed');
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'sync_customer': {
        // Get QB connection
        const { data: connection } = await supabase
          .from('bank_connections')
          .select('*')
          .eq('provider', 'quickbooks')
          .eq('is_active', true)
          .single();

        if (!connection) {
          throw new Error('No active QuickBooks connection');
        }

        const client = params.client;
        
        // Create/update customer in QuickBooks
        const customerData = {
          DisplayName: client.business_name || client.name,
          PrimaryEmailAddr: { Address: client.email },
          PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
        };

        const qbResponse = await fetch(
          `${QB_BASE_URL}/v3/company/${connection.company_id}/customer`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${connection.access_token}`,
              'Accept': 'application/json',
            },
            body: JSON.stringify(customerData),
          }
        );

        const result = await qbResponse.json();
        
        // Log sync
        await supabase.from('accounting_sync_log').insert({
          entity_type: 'customer',
          internal_id: client.id,
          external_id: result.Customer?.Id,
          provider: 'quickbooks',
          sync_status: result.Customer ? 'success' : 'error',
          sync_direction: 'outbound',
          error_message: result.Fault ? JSON.stringify(result.Fault) : null,
        });

        return new Response(JSON.stringify({ 
          success: !!result.Customer,
          quickbooks_id: result.Customer?.Id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'sync_payment': {
        const { data: connection } = await supabase
          .from('bank_connections')
          .select('*')
          .eq('provider', 'quickbooks')
          .eq('is_active', true)
          .single();

        if (!connection) {
          throw new Error('No active QuickBooks connection');
        }

        const payment = params.payment;

        // Check if client has QB customer ID
        const { data: syncLog } = await supabase
          .from('accounting_sync_log')
          .select('external_id')
          .eq('entity_type', 'customer')
          .eq('internal_id', payment.client_id)
          .eq('sync_status', 'success')
          .single();

        if (!syncLog?.external_id) {
          // Need to sync customer first
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Customer not synced to QuickBooks yet' 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Create payment in QuickBooks
        const paymentData = {
          TotalAmt: payment.amount,
          CustomerRef: { value: syncLog.external_id },
          TxnDate: new Date().toISOString().split('T')[0],
        };

        const qbResponse = await fetch(
          `${QB_BASE_URL}/v3/company/${connection.company_id}/payment`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${connection.access_token}`,
              'Accept': 'application/json',
            },
            body: JSON.stringify(paymentData),
          }
        );

        const result = await qbResponse.json();

        await supabase.from('accounting_sync_log').insert({
          entity_type: 'payment',
          internal_id: payment.id,
          external_id: result.Payment?.Id,
          provider: 'quickbooks',
          sync_status: result.Payment ? 'success' : 'error',
          sync_direction: 'outbound',
          error_message: result.Fault ? JSON.stringify(result.Fault) : null,
        });

        return new Response(JSON.stringify({ 
          success: !!result.Payment,
          quickbooks_id: result.Payment?.Id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_connection_status': {
        const { data: connection } = await supabase
          .from('bank_connections')
          .select('*')
          .eq('provider', 'quickbooks')
          .eq('is_active', true)
          .single();

        const { data: recentSyncs } = await supabase
          .from('accounting_sync_log')
          .select('*')
          .eq('provider', 'quickbooks')
          .order('created_at', { ascending: false })
          .limit(5);

        return new Response(JSON.stringify({
          connected: !!connection,
          company_id: connection?.company_id,
          last_sync: connection?.last_sync_at,
          recent_syncs: recentSyncs || [],
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'disconnect': {
        await supabase
          .from('bank_connections')
          .update({ is_active: false })
          .eq('provider', 'quickbooks');

        return new Response(JSON.stringify({ success: true }), {
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
    console.error('QuickBooks integration error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
