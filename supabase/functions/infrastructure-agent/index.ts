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

    const { action, agent_type, data } = await req.json();
    console.log(`Infrastructure Agent: ${action} for ${agent_type || 'system'}`);

    switch (action) {
      case 'get_system_status': {
        // Fetch system health metrics
        const [healthRes, costsRes, scalingRes] = await Promise.all([
          supabase.from('system_health').select('*').order('created_at', { ascending: false }).limit(20),
          supabase.from('agent_cost_tracking').select('*').gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
          supabase.from('system_scaling_events').select('*').order('created_at', { ascending: false }).limit(10),
        ]);

        // Calculate aggregate metrics
        const totalCosts = (costsRes.data || []).reduce((sum, c) => sum + (c.cost_cents || 0), 0);
        const totalApiCalls = (costsRes.data || []).reduce((sum, c) => sum + (c.api_calls || 0), 0);
        
        // Group costs by agent
        const costsByAgent: Record<string, { calls: number; cost: number; successRate: number }> = {};
        (costsRes.data || []).forEach((c: any) => {
          if (!costsByAgent[c.agent_type]) {
            costsByAgent[c.agent_type] = { calls: 0, cost: 0, successRate: 0 };
          }
          costsByAgent[c.agent_type].calls += c.api_calls || 0;
          costsByAgent[c.agent_type].cost += c.cost_cents || 0;
          costsByAgent[c.agent_type].successRate = c.success_rate || 100;
        });

        return new Response(JSON.stringify({
          success: true,
          systemStatus: {
            healthMetrics: healthRes.data || [],
            totalCostCents: totalCosts,
            totalApiCalls,
            costsByAgent,
            scalingEvents: scalingRes.data || [],
            overallHealth: calculateOverallHealth(healthRes.data || []),
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'track_api_call': {
        const { tokens_used, cost_cents, latency_ms, success } = data;
        const today = new Date().toISOString().split('T')[0];

        // Upsert cost tracking
        const { data: existing } = await supabase
          .from('agent_cost_tracking')
          .select('*')
          .eq('date', today)
          .eq('agent_type', agent_type)
          .single();

        if (existing) {
          const newCalls = (existing.api_calls || 0) + 1;
          const newTokens = (existing.tokens_used || 0) + (tokens_used || 0);
          const newCost = (existing.cost_cents || 0) + (cost_cents || 0);
          const successCount = success ? (existing.api_calls || 0) * (existing.success_rate || 100) / 100 + 1 : (existing.api_calls || 0) * (existing.success_rate || 100) / 100;
          const newSuccessRate = (successCount / newCalls) * 100;
          const newLatency = existing.avg_latency_ms ? Math.round((existing.avg_latency_ms + (latency_ms || 0)) / 2) : latency_ms;

          await supabase.from('agent_cost_tracking').update({
            api_calls: newCalls,
            tokens_used: newTokens,
            cost_cents: newCost,
            success_rate: newSuccessRate,
            avg_latency_ms: newLatency,
          }).eq('id', existing.id);
        } else {
          await supabase.from('agent_cost_tracking').insert({
            date: today,
            agent_type,
            api_calls: 1,
            tokens_used: tokens_used || 0,
            cost_cents: cost_cents || 0,
            success_rate: success ? 100 : 0,
            avg_latency_ms: latency_ms,
          });
        }

        // Check for anomalies
        const anomalies = await checkForAnomalies(supabase, agent_type, latency_ms, cost_cents);
        
        return new Response(JSON.stringify({ success: true, anomalies }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'log_scaling_event': {
        const { event_type, previous_instances, new_instances, trigger_reason, cost_impact } = data;
        
        await supabase.from('system_scaling_events').insert({
          event_type,
          agent_type,
          previous_instances: previous_instances || 1,
          new_instances: new_instances || 1,
          trigger_reason,
          cost_impact_estimate: cost_impact,
        });

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_cost_forecast': {
        // Get historical costs
        const { data: costs } = await supabase
          .from('agent_cost_tracking')
          .select('*')
          .order('date', { ascending: true })
          .limit(30);

        const dailyTotals = (costs || []).reduce((acc: Record<string, number>, c: any) => {
          acc[c.date] = (acc[c.date] || 0) + (c.cost_cents || 0);
          return acc;
        }, {});

        const totals = Object.values(dailyTotals);
        const avgDaily = totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
        const projectedMonthly = avgDaily * 30;

        return new Response(JSON.stringify({
          success: true,
          forecast: {
            avgDailyCents: Math.round(avgDaily),
            projectedMonthlyCents: Math.round(projectedMonthly),
            trend: totals.length > 5 ? (totals[totals.length - 1] > totals[totals.length - 5] ? 'increasing' : 'decreasing') : 'stable',
            historicalData: dailyTotals,
          }
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
    console.error('Infrastructure Agent error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function calculateOverallHealth(metrics: any[]): string {
  if (!metrics.length) return 'unknown';
  const critical = metrics.filter(m => m.status === 'critical').length;
  const warning = metrics.filter(m => m.status === 'warning').length;
  
  if (critical > 0) return 'critical';
  if (warning > 2) return 'warning';
  return 'healthy';
}

async function checkForAnomalies(supabase: any, agentType: string, latency: number, cost: number): Promise<string[]> {
  const anomalies: string[] = [];
  
  // Get historical averages
  const { data: history } = await supabase
    .from('agent_cost_tracking')
    .select('avg_latency_ms, cost_cents')
    .eq('agent_type', agentType)
    .order('date', { ascending: false })
    .limit(7);

  if (history && history.length > 3) {
    const avgLatency = history.reduce((sum: number, h: any) => sum + (h.avg_latency_ms || 0), 0) / history.length;
    const avgCost = history.reduce((sum: number, h: any) => sum + (h.cost_cents || 0), 0) / history.length;

    if (latency && latency > avgLatency * 2) {
      anomalies.push(`High latency detected: ${latency}ms (avg: ${Math.round(avgLatency)}ms)`);
    }
    if (cost && cost > avgCost * 3) {
      anomalies.push(`Unusual cost spike: ${cost} cents (daily avg: ${Math.round(avgCost)} cents)`);
    }
  }

  return anomalies;
}
