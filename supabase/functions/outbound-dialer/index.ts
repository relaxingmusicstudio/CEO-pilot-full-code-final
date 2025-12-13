import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, queue_item_id, phone_number, contact_id, lead_id, disposition, notes } = await req.json();

    // Check if Twilio is configured
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    const twilioConfigured = twilioAccountSid && twilioAuthToken && twilioPhoneNumber;

    if (action === 'initiate_call') {
      // Create call log entry
      const { data: callLog, error: logError } = await supabase
        .from('call_logs')
        .insert({
          contact_id,
          lead_id,
          direction: 'outbound',
          from_number: twilioPhoneNumber || '+1PLACEHOLDER',
          to_number: phone_number,
          status: twilioConfigured ? 'initiated' : 'mock_initiated',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (logError) throw logError;

      // Update dialer queue if item provided
      if (queue_item_id) {
        await supabase
          .from('dialer_queue')
          .update({
            status: 'calling',
            attempts: supabase.rpc('increment_attempts', { row_id: queue_item_id }),
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', queue_item_id);
      }

      if (!twilioConfigured) {
        console.log('[MOCK] Twilio not configured - simulating call to:', phone_number);
        
        // Simulate call completion after mock
        await supabase
          .from('call_logs')
          .update({
            status: 'mock_completed',
            ended_at: new Date().toISOString(),
            duration_seconds: 0,
          })
          .eq('id', callLog.id);

        return new Response(JSON.stringify({
          success: true,
          mock: true,
          message: 'Twilio not configured - call simulated',
          call_log_id: callLog.id,
          phone_number,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Real Twilio call
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`;
      
      const callParams = new URLSearchParams({
        To: phone_number,
        From: twilioPhoneNumber,
        Url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/vapi-call?call_log_id=${callLog.id}`,
        StatusCallback: `${Deno.env.get('SUPABASE_URL')}/functions/v1/call-status-webhook`,
        StatusCallbackEvent: 'initiated ringing answered completed',
        Record: 'true',
      });

      const twilioResponse = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: callParams.toString(),
      });

      const twilioData = await twilioResponse.json();

      if (!twilioResponse.ok) {
        await supabase
          .from('call_logs')
          .update({ status: 'failed' })
          .eq('id', callLog.id);

        throw new Error(twilioData.message || 'Failed to initiate call');
      }

      // Update call log with Twilio SID
      await supabase
        .from('call_logs')
        .update({ external_call_id: twilioData.sid })
        .eq('id', callLog.id);

      return new Response(JSON.stringify({
        success: true,
        call_sid: twilioData.sid,
        call_log_id: callLog.id,
        status: twilioData.status,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'log_disposition') {
      // Update call log with disposition
      const { error } = await supabase
        .from('call_logs')
        .update({
          disposition,
          disposition_notes: notes,
          ended_at: new Date().toISOString(),
        })
        .eq('id', queue_item_id);

      if (error) throw error;

      // Update dialer queue status
      if (queue_item_id) {
        const finalStatus = ['answered', 'scheduled', 'converted'].includes(disposition) 
          ? 'completed' 
          : disposition === 'no_answer' ? 'pending' : 'completed';

        await supabase
          .from('dialer_queue')
          .update({ status: finalStatus })
          .eq('id', queue_item_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'get_queue') {
      // Get next items in dialer queue
      const { data: queue, error } = await supabase
        .from('dialer_queue')
        .select(`
          *,
          contact:contacts_unified(*),
          lead:leads(*)
        `)
        .eq('status', 'pending')
        .lt('attempts', 3)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(20);

      if (error) throw error;

      return new Response(JSON.stringify({ 
        success: true, 
        queue,
        twilio_configured: twilioConfigured,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'add_to_queue') {
      // Add contact/lead to dialer queue
      const { data, error } = await supabase
        .from('dialer_queue')
        .insert({
          contact_id,
          lead_id,
          phone_number,
          priority: 50,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, queue_item: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Outbound dialer error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
