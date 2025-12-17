import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * CEO Dashboard API
 * 
 * Read-only JSON endpoints for executive dashboard:
 * - GET /ceo/brief - Latest daily brief
 * - GET /ceo/decisions - Recent CEO decisions with outcomes
 * - GET /ceo/metrics - Real-time business metrics
 * 
 * No UI rendering - JSON only for frontend consumption.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { endpoint, tenant_id, limit = 20 } = await req.json();
    
    console.log(`[ceo-dashboard] endpoint=${endpoint} tenant=${tenant_id || 'global'}`);

    switch (endpoint) {
      // ─────────────────────────────────────────────────────────
      // GET /ceo/brief - Latest cached daily brief
      // ─────────────────────────────────────────────────────────
      case 'brief': {
        const cacheKey = `ceo_daily_brief_${tenant_id || 'global'}`;
        const { data: brief, error } = await supabase
          .from('agent_shared_state')
          .select('value, updated_at')
          .eq('key', cacheKey)
          .single();

        if (error || !brief) {
          return jsonResponse({ 
            brief: null, 
            message: 'No brief available. Call ceo-daily-brief to generate one.',
            last_generated: null 
          });
        }

        const ageHours = Math.round((Date.now() - new Date(brief.updated_at).getTime()) / 3600000);
        
        return jsonResponse({
          brief: brief.value,
          last_generated: brief.updated_at,
          age_hours: ageHours,
          stale: ageHours > 24,
        });
      }

      // ─────────────────────────────────────────────────────────
      // GET /ceo/decisions - Recent decisions with outcomes
      // ─────────────────────────────────────────────────────────
      case 'decisions': {
        let query = supabase
          .from('ceo_decisions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (tenant_id) {
          query = query.eq('tenant_id', tenant_id);
        }

        const { data: decisions, error } = await query;

        if (error) {
          console.error('[ceo-dashboard] decisions error:', error);
          return jsonResponse({ error: 'Failed to fetch decisions' }, 500);
        }

        // Compute decision analytics
        const total = decisions?.length || 0;
        const executed = decisions?.filter((d: any) => d.status === 'executed').length || 0;
        const avgConfidence = total > 0
          ? decisions!.reduce((sum: number, d: any) => sum + (parseFloat(d.confidence) || 0), 0) / total
          : 0;

        return jsonResponse({
          decisions: decisions || [],
          analytics: {
            total,
            executed,
            pending: decisions?.filter((d: any) => d.status === 'pending').length || 0,
            cancelled: decisions?.filter((d: any) => d.status === 'cancelled').length || 0,
            avg_confidence: Math.round(avgConfidence * 100) / 100,
          },
        });
      }

      // ─────────────────────────────────────────────────────────
      // GET /ceo/metrics - Real-time business metrics
      // ─────────────────────────────────────────────────────────
      case 'metrics': {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Parallel queries for speed
        const [
          leadsToday,
          leadsWeek,
          clientsActive,
          missedCallsToday,
          pendingActions,
          aiCostsWeek,
          recentDecisions,
        ] = await Promise.all([
          supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', yesterday.toISOString()),
          supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString()),
          supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('call_logs').select('id', { count: 'exact', head: true }).eq('status', 'missed').gte('created_at', yesterday.toISOString()),
          supabase.from('ceo_action_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('agent_cost_tracking').select('cost_cents').gte('created_at', weekAgo.toISOString()),
          supabase.from('ceo_decisions').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString()),
        ]);

        const aiCostWeekTotal = (aiCostsWeek.data || []).reduce((sum: number, c: any) => sum + (c.cost_cents || 0), 0);

        return jsonResponse({
          timestamp: now.toISOString(),
          metrics: {
            leads: {
              today: leadsToday.count || 0,
              week: leadsWeek.count || 0,
            },
            clients: {
              active: clientsActive.count || 0,
            },
            calls: {
              missed_today: missedCallsToday.count || 0,
            },
            actions: {
              pending: pendingActions.count || 0,
            },
            costs: {
              ai_week_cents: aiCostWeekTotal,
              ai_week_dollars: (aiCostWeekTotal / 100).toFixed(2),
            },
            decisions: {
              week: recentDecisions.count || 0,
            },
          },
        });
      }

      // ─────────────────────────────────────────────────────────
      // GET /ceo/cost-breakdown - AI cost by agent/purpose
      // ─────────────────────────────────────────────────────────
      case 'cost-breakdown': {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        const { data: costs, error } = await supabase
          .from('agent_cost_tracking')
          .select('agent_type, purpose, provider, model, cost_cents, tokens_used, api_calls, created_at')
          .gte('created_at', thirtyDaysAgo.toISOString())
          .order('created_at', { ascending: false });

        if (error) {
          return jsonResponse({ error: 'Failed to fetch cost data' }, 500);
        }

        // Aggregate by agent type
        const byAgent: Record<string, { cost_cents: number; api_calls: number; tokens: number }> = {};
        const byPurpose: Record<string, { cost_cents: number; count: number }> = {};
        const byProvider: Record<string, { cost_cents: number; count: number }> = {};

        (costs || []).forEach((c: any) => {
          // By agent
          if (!byAgent[c.agent_type]) {
            byAgent[c.agent_type] = { cost_cents: 0, api_calls: 0, tokens: 0 };
          }
          byAgent[c.agent_type].cost_cents += c.cost_cents || 0;
          byAgent[c.agent_type].api_calls += c.api_calls || 0;
          byAgent[c.agent_type].tokens += c.tokens_used || 0;

          // By purpose
          const purpose = c.purpose || 'unknown';
          if (!byPurpose[purpose]) {
            byPurpose[purpose] = { cost_cents: 0, count: 0 };
          }
          byPurpose[purpose].cost_cents += c.cost_cents || 0;
          byPurpose[purpose].count += 1;

          // By provider
          const provider = c.provider || 'unknown';
          if (!byProvider[provider]) {
            byProvider[provider] = { cost_cents: 0, count: 0 };
          }
          byProvider[provider].cost_cents += c.cost_cents || 0;
          byProvider[provider].count += 1;
        });

        const totalCents = Object.values(byAgent).reduce((sum, a) => sum + a.cost_cents, 0);

        return jsonResponse({
          period: '30d',
          total_cost_cents: totalCents,
          total_cost_dollars: (totalCents / 100).toFixed(2),
          by_agent: byAgent,
          by_purpose: byPurpose,
          by_provider: byProvider,
        });
      }

      default:
        return jsonResponse({ 
          error: `Unknown endpoint: ${endpoint}`,
          available: ['brief', 'decisions', 'metrics', 'cost-breakdown']
        }, 400);
    }

  } catch (error) {
    console.error('[ceo-dashboard] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
