import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, client_id, referral_code, referred_email, data } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === 'create_referral') {
      console.log(`Creating referral for client ${client_id}`);

      // Generate unique referral code if not provided
      const code = referral_code || `REF${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const { data: referral, error } = await supabase
        .from('referral_program')
        .insert({
          referrer_client_id: client_id,
          referred_email,
          referral_code: code,
          status: 'pending',
          reward_amount: 100 // Default reward
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({
        success: true,
        referral
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'validate_code') {
      console.log(`Validating referral code: ${referral_code}`);

      const { data: referral, error } = await supabase
        .from('referral_program')
        .select('*, clients!referrer_client_id(*)')
        .eq('referral_code', referral_code)
        .eq('status', 'active')
        .maybeSingle();

      if (error || !referral) {
        return new Response(JSON.stringify({
          valid: false,
          message: 'Invalid or expired referral code'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        valid: true,
        referrer_name: referral.clients?.name || 'A friend',
        reward_amount: referral.reward_amount
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'convert_referral') {
      const { new_client_id } = data;
      console.log(`Converting referral for code ${referral_code}`);

      // Find the referral
      const { data: referral, error: findError } = await supabase
        .from('referral_program')
        .select('*')
        .eq('referral_code', referral_code)
        .maybeSingle();

      if (findError || !referral) {
        throw new Error('Referral not found');
      }

      // Update referral status
      const { error: updateError } = await supabase
        .from('referral_program')
        .update({
          status: 'converted',
          referred_client_id: new_client_id,
          converted_at: new Date().toISOString()
        })
        .eq('id', referral.id);

      if (updateError) throw updateError;

      // Track expansion revenue for referrer
      const { data: referrerClient } = await supabase
        .from('clients')
        .select('mrr')
        .eq('id', referral.referrer_client_id)
        .maybeSingle();

      await supabase
        .from('expansion_revenue')
        .insert({
          client_id: referral.referrer_client_id,
          revenue_type: 'referral_bonus',
          change_amount: referral.reward_amount,
          reason: `Referral converted: ${referral_code}`
        });

      // Create work item to process reward
      await supabase
        .from('work_queue')
        .insert({
          agent_type: 'finance',
          type: 'referral_payout',
          title: `Process Referral Reward: $${referral.reward_amount}`,
          description: `Referral ${referral_code} converted. Process reward for client.`,
          priority: 'medium',
          metadata: { referral_id: referral.id, reward_amount: referral.reward_amount }
        });

      return new Response(JSON.stringify({
        success: true,
        reward_amount: referral.reward_amount
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'get_referrals') {
      const { data: referrals } = await supabase
        .from('referral_program')
        .select('*, clients!referrer_client_id(name, email), referred_clients:clients!referred_client_id(name, email, mrr)')
        .eq('referrer_client_id', client_id)
        .order('created_at', { ascending: false });

      const stats = {
        total_referrals: referrals?.length || 0,
        converted: referrals?.filter(r => r.status === 'converted').length || 0,
        pending: referrals?.filter(r => r.status === 'pending').length || 0,
        total_rewards: referrals?.filter(r => r.status === 'converted').reduce((sum, r) => sum + (r.reward_amount || 0), 0) || 0,
        rewards_paid: referrals?.filter(r => r.reward_paid_at).reduce((sum, r) => sum + (r.reward_amount || 0), 0) || 0
      };

      return new Response(JSON.stringify({
        referrals,
        stats
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'get_program_metrics') {
      const { data: referrals } = await supabase
        .from('referral_program')
        .select('*, clients!referrer_client_id(mrr)');

      const { data: clients } = await supabase
        .from('clients')
        .select('id, mrr');

      const totalClients = clients?.length || 0;
      const referredClients = referrals?.filter(r => r.referred_client_id).length || 0;
      const referredMRR = referrals?.filter(r => r.referred_client_id)
        .reduce((sum, r) => {
          const client = clients?.find(c => c.id === r.referred_client_id);
          return sum + (client?.mrr || 0);
        }, 0) || 0;

      return new Response(JSON.stringify({
        total_referrals: referrals?.length || 0,
        converted_referrals: referredClients,
        conversion_rate: referrals?.length ? Math.round((referredClients / referrals.length) * 100) : 0,
        referred_mrr: referredMRR,
        referral_percentage_of_clients: totalClients ? Math.round((referredClients / totalClients) * 100) : 0,
        total_rewards_issued: referrals?.reduce((sum, r) => sum + (r.status === 'converted' ? r.reward_amount : 0), 0) || 0,
        pending_rewards: referrals?.filter(r => r.status === 'converted' && !r.reward_paid_at).reduce((sum, r) => sum + (r.reward_amount || 0), 0) || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'process_payout') {
      const { referral_id } = data;

      const { error } = await supabase
        .from('referral_program')
        .update({
          reward_paid_at: new Date().toISOString()
        })
        .eq('id', referral_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Error in referral-tracker:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
