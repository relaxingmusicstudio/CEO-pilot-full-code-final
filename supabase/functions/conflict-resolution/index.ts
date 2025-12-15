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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, data } = await req.json();
    console.log(`Conflict Resolution Engine: ${action}`);

    switch (action) {
      case 'queue_action': {
        const { agent_type, action_type, target_type, target_id, payload, scheduled_at } = data;
        
        // Get priority rules
        const { data: rules } = await supabase
          .from('action_priority_rules')
          .select('*')
          .eq('is_active', true)
          .or(`agent_type.eq.${agent_type},agent_type.is.null`)
          .or(`action_type.eq.${action_type},action_type.is.null`);

        // Calculate priority
        let priority = 5;
        for (const rule of rules || []) {
          if (rule.agent_type === agent_type && rule.action_type === action_type) {
            priority = rule.base_priority;
            break;
          } else if (rule.agent_type === agent_type || rule.action_type === action_type) {
            priority = Math.max(priority, rule.base_priority);
          }
        }

        // Check for existing queued actions on same target
        const { data: existingActions } = await supabase
          .from('action_queue')
          .select('*')
          .eq('target_type', target_type)
          .eq('target_id', target_id)
          .in('status', ['queued', 'approved']);

        let conflictResolution = null;
        
        if (existingActions && existingActions.length > 0) {
          // Check for conflicts
          const conflicts = existingActions.filter(a => {
            // Same action type within 1 hour = conflict
            const timeDiff = Math.abs(new Date(a.scheduled_at).getTime() - new Date(scheduled_at || Date.now()).getTime());
            return timeDiff < 60 * 60 * 1000;
          });

          if (conflicts.length > 0) {
            const highestPriority = Math.max(...conflicts.map(c => c.priority));
            
            if (priority > highestPriority) {
              // New action wins - defer existing
              const deferredIds = conflicts.map(c => c.id);
              await supabase
                .from('action_queue')
                .update({ status: 'conflicted', conflict_resolution: 'deferred_by_higher_priority' })
                .in('id', deferredIds);

              conflictResolution = `Deferred ${deferredIds.length} lower-priority actions`;
              
              // Log conflict
              await supabase.from('conflict_log').insert({
                target_type,
                target_id,
                conflicting_actions: conflicts,
                resolution_method: 'priority_override',
                deferred_action_ids: deferredIds,
                reasoning: `New ${action_type} action (priority ${priority}) overrides existing actions (max priority ${highestPriority})`,
              });
            } else if (priority < highestPriority) {
              // New action loses - queue as conflicted
              const { data: newAction, error } = await supabase
                .from('action_queue')
                .insert({
                  agent_type,
                  action_type,
                  target_type,
                  target_id,
                  priority,
                  scheduled_at: scheduled_at || new Date().toISOString(),
                  status: 'conflicted',
                  action_payload: payload,
                  conflict_resolution: 'deferred_by_existing',
                })
                .select()
                .single();

              return new Response(JSON.stringify({
                success: true,
                action_id: newAction?.id,
                status: 'conflicted',
                message: `Action queued as conflicted - higher priority action exists`,
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }
          }
        }

        // Insert the action
        const { data: newAction, error } = await supabase
          .from('action_queue')
          .insert({
            agent_type,
            action_type,
            target_type,
            target_id,
            priority,
            scheduled_at: scheduled_at || new Date().toISOString(),
            status: 'queued',
            action_payload: payload,
            conflict_resolution: conflictResolution,
          })
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify({
          success: true,
          action_id: newAction.id,
          priority,
          conflict_resolution: conflictResolution,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_queue': {
        const { status, agent_type, target_id, limit = 100 } = data || {};
        
        let query = supabase
          .from('action_queue')
          .select('*')
          .order('priority', { ascending: false })
          .order('scheduled_at', { ascending: true })
          .limit(limit);

        if (status) query = query.eq('status', status);
        if (agent_type) query = query.eq('agent_type', agent_type);
        if (target_id) query = query.eq('target_id', target_id);

        const { data: queue, error } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({
          success: true,
          queue: queue || [],
          stats: {
            queued: (queue || []).filter(a => a.status === 'queued').length,
            conflicted: (queue || []).filter(a => a.status === 'conflicted').length,
            executing: (queue || []).filter(a => a.status === 'executing').length,
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'execute_action': {
        const { action_id } = data;
        
        const { error } = await supabase
          .from('action_queue')
          .update({
            status: 'executing',
            executed_at: new Date().toISOString(),
          })
          .eq('id', action_id);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'complete_action': {
        const { action_id, result, success } = data;
        
        const { error } = await supabase
          .from('action_queue')
          .update({
            status: success ? 'completed' : 'cancelled',
            result,
          })
          .eq('id', action_id);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_conflict_log': {
        const { target_id, limit = 50 } = data || {};
        
        let query = supabase
          .from('conflict_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (target_id) query = query.eq('target_id', target_id);

        const { data: logs, error } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({
          success: true,
          conflicts: logs || [],
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error: any) {
    console.error('Conflict Resolution error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
