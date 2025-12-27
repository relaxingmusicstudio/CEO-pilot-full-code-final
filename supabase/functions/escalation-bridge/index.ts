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
    console.log(`Escalation Bridge: ${action}`);

    switch (action) {
      case 'check_escalation': {
        const { source_agent, context, lead_id, client_id } = data;
        
        // Get active escalation rules
        const { data: rules } = await supabase
          .from('escalation_rules')
          .select('*')
          .eq('is_active', true)
          .order('priority', { ascending: false });

        const triggeredRules: unknown[] = [];

        for (const rule of rules || []) {
          if (evaluateConditions(rule.trigger_conditions, context)) {
            triggeredRules.push(rule);
          }
        }

        if (triggeredRules.length > 0) {
          // Create escalation queue entry for highest priority rule
          const topRule = triggeredRules[0];
          const { data: escalation, error } = await supabase
            .from('escalation_queue')
            .insert({
              rule_id: topRule.id,
              lead_id,
              client_id,
              source_agent,
              trigger_data: context,
              urgency: topRule.priority >= 9 ? 'critical' : topRule.priority >= 7 ? 'high' : 'normal',
              status: 'pending',
              assigned_to: topRule.assigned_to,
            })
            .select()
            .single();

          if (error) throw error;

          // Notify via channel
          await notifyEscalation(supabase, topRule, escalation, context);

          return new Response(JSON.stringify({
            success: true,
            escalated: true,
            escalation_id: escalation.id,
            rule_name: topRule.rule_name,
            urgency: escalation.urgency,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          escalated: false,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_queue': {
        const { status, urgency, limit = 50 } = data || {};
        
        let query = supabase
          .from('escalation_queue')
          .select(`
            *,
            escalation_rules (rule_name, description, escalation_channel),
            leads (name, email, phone, lead_score, lead_temperature),
            clients (name, email, health_score, mrr)
          `)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (status) query = query.eq('status', status);
        if (urgency) query = query.eq('urgency', urgency);

        const { data: queue, error } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({
          success: true,
          queue: queue || [],
          stats: {
            pending: (queue || []).filter(q => q.status === 'pending').length,
            critical: (queue || []).filter(q => q.urgency === 'critical').length,
            avgResponseTime: calculateAvgResponseTime(queue || []),
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'resolve_escalation': {
        const { escalation_id, resolution_notes, outcome } = data;
        
        const now = new Date().toISOString();
        const { data: escalation, error: fetchError } = await supabase
          .from('escalation_queue')
          .select('created_at, assigned_at')
          .eq('id', escalation_id)
          .single();

        if (fetchError) throw fetchError;

        const responseTime = Math.round(
          (new Date(now).getTime() - new Date(escalation.assigned_at || escalation.created_at).getTime()) / 60000
        );

        const { error } = await supabase
          .from('escalation_queue')
          .update({
            status: 'resolved',
            resolved_at: now,
            resolution_notes,
            outcome,
            response_time_minutes: responseTime,
          })
          .eq('id', escalation_id);

        if (error) throw error;

        return new Response(JSON.stringify({
          success: true,
          response_time_minutes: responseTime,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'assign_escalation': {
        const { escalation_id, assigned_to } = data;
        
        const { error } = await supabase
          .from('escalation_queue')
          .update({
            status: 'assigned',
            assigned_to,
            assigned_at: new Date().toISOString(),
          })
          .eq('id', escalation_id);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_rules': {
        const { data: rules, error } = await supabase
          .from('escalation_rules')
          .select('*')
          .order('priority', { ascending: false });

        if (error) throw error;

        return new Response(JSON.stringify({
          success: true,
          rules: rules || [],
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'update_rule': {
        const { rule_id, updates } = data;
        
        const { error } = await supabase
          .from('escalation_rules')
          .update(updates)
          .eq('id', rule_id);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error: unknown) {
    console.error('Escalation Bridge error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function evaluateConditions(conditions: unknown, context: unknown): boolean {
  if (!conditions || Object.keys(conditions).length === 0) return false;

  for (const [key, value] of Object.entries(conditions)) {
    const contextValue = context[key];
    
    if (typeof value === 'object' && value !== null) {
      // Handle comparison operators
      const ops = value as Record<string, unknown>;
      if (ops.gt !== undefined && !(contextValue > ops.gt)) return false;
      if (ops.lt !== undefined && !(contextValue < ops.lt)) return false;
      if (ops.gte !== undefined && !(contextValue >= ops.gte)) return false;
      if (ops.lte !== undefined && !(contextValue <= ops.lte)) return false;
      if (ops.eq !== undefined && contextValue !== ops.eq) return false;
    } else if (Array.isArray(value)) {
      // Check if context contains any keyword
      if (key === 'keywords' && typeof contextValue === 'string') {
        const found = value.some(kw => contextValue.toLowerCase().includes(kw.toLowerCase()));
        if (!found) return false;
      }
    } else if (contextValue !== value) {
      return false;
    }
  }

  return true;
}

async function notifyEscalation(supabase: unknown, rule: unknown, escalation: unknown, context: unknown) {
  console.log(`Notifying via ${rule.escalation_channel} for escalation ${escalation.id}`);
  
  // Log the notification attempt
  await supabase.from('automation_logs').insert({
    function_name: 'escalation-notification',
    status: 'completed',
    metadata: {
      channel: rule.escalation_channel,
      escalation_id: escalation.id,
      rule_name: rule.rule_name,
      context_summary: JSON.stringify(context).substring(0, 500),
    },
  });
  
  // In production, integrate with actual notification services
  // For now, we log and the dashboard shows pending escalations
}

function calculateAvgResponseTime(queue: unknown[]): number {
  const resolved = queue.filter(q => q.response_time_minutes);
  if (resolved.length === 0) return 0;
  return Math.round(resolved.reduce((sum, q) => sum + q.response_time_minutes, 0) / resolved.length);
}
