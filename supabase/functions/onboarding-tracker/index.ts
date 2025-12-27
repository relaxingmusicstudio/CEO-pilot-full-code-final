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
    const { action, client_id, task_id, data } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Onboarding tracker action: ${action} for client ${client_id}`);

    if (action === 'complete_task') {
      // Mark task as complete
      const { error: taskError } = await supabase
        .from('onboarding_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', task_id);

      if (taskError) throw taskError;

      // Update onboarding progress
      const { data: tasks } = await supabase
        .from('onboarding_tasks')
        .select('status')
        .eq('client_id', client_id);

      const completedCount = tasks?.filter(t => t.status === 'completed').length || 0;
      const totalCount = tasks?.length || 1;
      const progressPercentage = Math.round((completedCount / totalCount) * 100);

      const { error: onboardingError } = await supabase
        .from('client_onboarding')
        .update({
          current_step: completedCount,
          progress_percentage: progressPercentage,
          status: progressPercentage === 100 ? 'completed' : 'in_progress',
          completed_at: progressPercentage === 100 ? new Date().toISOString() : null
        })
        .eq('client_id', client_id);

      if (onboardingError) console.error('Error updating onboarding:', onboardingError);

      return new Response(JSON.stringify({
        success: true,
        completed_count: completedCount,
        progress_percentage: progressPercentage
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'provision_deliverable') {
      const { deliverable_id } = data;

      const { error } = await supabase
        .from('client_deliverables')
        .update({
          status: 'provisioned',
          provisioned_at: new Date().toISOString()
        })
        .eq('id', deliverable_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'get_status') {
      const { data: onboarding } = await supabase
        .from('client_onboarding')
        .select('*')
        .eq('client_id', client_id)
        .maybeSingle();

      const { data: tasks } = await supabase
        .from('onboarding_tasks')
        .select('*')
        .eq('client_id', client_id)
        .order('priority');

      const { data: deliverables } = await supabase
        .from('client_deliverables')
        .select('*')
        .eq('client_id', client_id);

      const { data: training } = await supabase
        .from('client_training_sessions')
        .select('*')
        .eq('client_id', client_id)
        .order('scheduled_at');

      return new Response(JSON.stringify({
        onboarding,
        tasks,
        deliverables,
        training
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'schedule_training') {
      const { session_type, title, scheduled_at, duration_minutes } = data;

      const { data: session, error } = await supabase
        .from('client_training_sessions')
        .insert({
          client_id,
          session_type,
          title,
          scheduled_at,
          duration_minutes: duration_minutes || 30,
          status: 'scheduled'
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, session }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'complete_training') {
      const { session_id, recording_url, notes } = data;

      const { error } = await supabase
        .from('client_training_sessions')
        .update({
          status: 'completed',
          recording_url,
          notes
        })
        .eq('id', session_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'go_live_check') {
      // Check if client is ready for go-live
      const { data: tasks } = await supabase
        .from('onboarding_tasks')
        .select('*')
        .eq('client_id', client_id)
        .in('category', ['setup', 'integration', 'testing']);

      const { data: deliverables } = await supabase
        .from('client_deliverables')
        .select('*')
        .eq('client_id', client_id);

      const incompleteTasks = tasks?.filter(t => t.status !== 'completed') || [];
      const unprovisionedDeliverables = deliverables?.filter(d => d.status !== 'provisioned') || [];

      const isReady = incompleteTasks.length === 0 && unprovisionedDeliverables.length === 0;

      if (isReady) {
        // Update onboarding with go-live date
        await supabase
          .from('client_onboarding')
          .update({
            go_live_date: new Date().toISOString(),
            status: 'live'
          })
          .eq('client_id', client_id);

        // Update client status
        await supabase
          .from('clients')
          .update({ status: 'active' })
          .eq('id', client_id);
      }

      return new Response(JSON.stringify({
        ready: isReady,
        blockers: {
          incomplete_tasks: incompleteTasks.map(t => t.task_name),
          unprovisioned_deliverables: unprovisionedDeliverables.map(d => d.name)
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Error in onboarding-tracker:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
