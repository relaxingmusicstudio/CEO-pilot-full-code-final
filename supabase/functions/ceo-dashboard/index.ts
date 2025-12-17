import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * CEO Dashboard API
 * 
 * Read-only JSON endpoints for executive dashboard:
 * - GET /ceo/brief - Latest daily brief
 * - GET /ceo/decisions - Recent CEO decisions with outcomes
 * - GET /ceo/metrics - Real-time business metrics
 * - GET /ceo/cost-breakdown - AI cost by agent/purpose
 * 
 * TENANT SAFETY: Derives tenant_id from JWT auth context.
 * Returns data only for the caller's tenant unless caller is platform admin.
 * 
 * No UI rendering - JSON only for frontend consumption.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TenantContext {
  tenant_id: string | null;
  is_platform_admin: boolean;
}

/**
 * Get tenant context from JWT via database functions
 */
async function getTenantContext(authHeader: string | null): Promise<TenantContext> {
  if (!authHeader) {
    return { tenant_id: null, is_platform_admin: false };
  }
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const token = authHeader.replace('Bearer ', '');
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    
    // Get tenant_id and check if platform admin in parallel
    const [tenantResult, adminResult] = await Promise.all([
      userClient.rpc('get_user_tenant_id'),
      userClient.rpc('is_platform_admin'),
    ]);
    
    return {
      tenant_id: tenantResult.data as string | null,
      is_platform_admin: adminResult.data === true,
    };
  } catch (e) {
    console.error('[ceo-dashboard] Auth context lookup error:', e);
    return { tenant_id: null, is_platform_admin: false };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const authHeader = req.headers.get('authorization');
    const { endpoint, limit = 20 } = await req.json();
    
    // TENANT SAFETY: Get tenant context from auth
    const ctx = await getTenantContext(authHeader);
    const tenantId = ctx.tenant_id;
    
    console.log(`[ceo-dashboard] endpoint=${endpoint} tenant=${tenantId || 'global'} is_admin=${ctx.is_platform_admin}`);

    switch (endpoint) {
      // ─────────────────────────────────────────────────────────
      // GET /ceo/brief - Latest cached daily brief
      // ─────────────────────────────────────────────────────────
      case 'brief': {
        const cacheKey = `ceo_daily_brief_${tenantId || 'global'}`;
        const { data: brief, error } = await supabase
          .from('agent_shared_state')
          .select('value, updated_at, expires_at')
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
        const isStale = brief.expires_at ? Date.now() > new Date(brief.expires_at).getTime() : ageHours > 24;
        
        return jsonResponse({
          brief: brief.value,
          last_generated: brief.updated_at,
          age_hours: ageHours,
          stale: isStale,
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

        // Filter by tenant unless platform admin
        if (tenantId && !ctx.is_platform_admin) {
          query = query.eq('tenant_id', tenantId);
        }

        const { data: decisions, error } = await query;

        if (error) {
          console.error('[ceo-dashboard] decisions error:', error);
          return jsonResponse({ error: 'Failed to fetch decisions' }, 500);
        }

        // Compute decision analytics
        const total = decisions?.length || 0;
        const executed = decisions?.filter((d: { status?: string }) => d.status === 'executed').length || 0;
        const avgConfidence = total > 0
          ? decisions!.reduce((sum: number, d: { confidence?: number }) => sum + (d.confidence || 0), 0) / total
          : 0;

        return jsonResponse({
          decisions: decisions || [],
          analytics: {
            total,
            executed,
            pending: decisions?.filter((d: { status?: string }) => d.status === 'pending').length || 0,
            cancelled: decisions?.filter((d: { status?: string }) => d.status === 'cancelled').length || 0,
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

        const aiCostWeekTotal = (aiCostsWeek.data || []).reduce((sum: number, c: { cost_cents?: number }) => sum + (c.cost_cents || 0), 0);

        return jsonResponse({
          timestamp: now.toISOString(),
          tenant_id: tenantId,
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

        interface CostRecord {
          agent_type?: string;
          purpose?: string;
          provider?: string;
          cost_cents?: number;
          api_calls?: number;
          tokens_used?: number;
        }

        (costs || []).forEach((c: CostRecord) => {
          const agentType = c.agent_type || 'unknown';
          const purpose = c.purpose || 'unknown';
          const provider = c.provider || 'unknown';
          
          // By agent
          if (!byAgent[agentType]) {
            byAgent[agentType] = { cost_cents: 0, api_calls: 0, tokens: 0 };
          }
          byAgent[agentType].cost_cents += c.cost_cents || 0;
          byAgent[agentType].api_calls += c.api_calls || 0;
          byAgent[agentType].tokens += c.tokens_used || 0;

          // By purpose
          if (!byPurpose[purpose]) {
            byPurpose[purpose] = { cost_cents: 0, count: 0 };
          }
          byPurpose[purpose].cost_cents += c.cost_cents || 0;
          byPurpose[purpose].count += 1;

          // By provider
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

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
