import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat, estimateCostCents, AIChatResponse } from "../_shared/ai.ts";

/**
 * CEO Daily Brief Generator
 * 
 * Aggregates real business data and generates executive-level insights.
 * Uses purpose: "ceo_daily_brief" for premium AI routing.
 * 
 * TENANT SAFETY: Derives tenant_id from JWT auth context, NOT from request body.
 * COST TRACKING: Uses real token usage from aiChat() response.
 * 
 * Data sources (tenant-isolated where possible):
 * - leads (HAS tenant_id) - last 24h + temperature distribution
 * - clients (HAS tenant_id) - active clients + MRR
 * - ceo_action_queue (HAS tenant_id) - pending actions
 * - call_logs (NO tenant_id) - set to 0 with warning
 * - client_invoices (NO tenant_id) - set to 0 with warning
 * - agent_cost_tracking (NO tenant_id) - global costs
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BriefData {
  leads_24h: number;
  lead_temperature: Record<string, number>;
  missed_calls_24h: number;
  active_clients: number;
  mrr_cents: number;
  revenue_invoiced_this_month_cents: number;
  ai_cost_24h_cents: number;
  ai_cost_30d_avg_cents: number;
  top_lead_sources: Array<{ source: string; count: number }>;
  pending_actions: number;
  warnings?: string[];
}

interface DailyBrief {
  generated_at: string;
  bullets: string[];
  risk_alert: string | null;
  opportunity: string | null;
  data_snapshot: BriefData;
}

/**
 * Get tenant_id from JWT via database function
 */
async function getTenantIdFromAuth(supabase: SupabaseClient, authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  
  try {
    // Create a user-context client to get tenant
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const token = authHeader.replace('Bearer ', '');
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    
    const { data, error } = await userClient.rpc('get_user_tenant_id');
    if (error) {
      console.error('[ceo-daily-brief] Failed to get tenant_id from auth:', error);
      return null;
    }
    return data as string | null;
  } catch (e) {
    console.error('[ceo-daily-brief] Auth tenant lookup error:', e);
    return null;
  }
}

/**
 * Fetch business industry from business_profile
 */
async function getBusinessIndustry(supabase: SupabaseClient, tenantId: string | null): Promise<string> {
  if (!tenantId) return 'service';
  
  const { data } = await supabase
    .from('business_profile')
    .select('industry')
    .eq('tenant_id', tenantId)
    .single();
  
  return data?.industry || 'service';
}

const RATE_LIMIT_MAX = 5; // Max refreshes per hour
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check rate limit for tenant brief refresh (max 5/hour)
 * Uses NULL for tenant_id when global (proper UUID handling)
 */
async function checkRateLimit(supabase: SupabaseClient, tenantId: string | null): Promise<{ allowed: boolean; remaining: number }> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const actionType = 'brief_refresh';
  
  // Build query with proper NULL handling for tenant_id
  let countQuery = supabase
    .from('ceo_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('action_type', actionType)
    .gte('created_at', windowStart.toISOString());
  
  // Filter by tenant_id (NULL for global)
  if (tenantId) {
    countQuery = countQuery.eq('tenant_id', tenantId);
  } else {
    countQuery = countQuery.is('tenant_id', null);
  }
  
  const { count } = await countQuery;
  const currentCount = count || 0;
  
  if (currentCount >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }
  
  // Log this request with proper tenant_id (NULL for global)
  await supabase.from('ceo_rate_limits').insert({
    tenant_id: tenantId, // Will be NULL if no tenant
    action_type: actionType,
  });
  
  return { allowed: true, remaining: RATE_LIMIT_MAX - currentCount - 1 };
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
    const { force_refresh = false } = await req.json().catch(() => ({}));
    
    // TENANT SAFETY: Get tenant_id from auth, not request body
    const tenantId = await getTenantIdFromAuth(supabase, authHeader);
    const cacheKey = tenantId ? `ceo_daily_brief_${tenantId}` : 'ceo_daily_brief_global';
    
    console.log(`[ceo-daily-brief] Generating brief for tenant=${tenantId || 'global'} force=${force_refresh}`);

    // RATE LIMITING: Check if force_refresh is within limits
    if (force_refresh) {
      const rateCheck = await checkRateLimit(supabase, tenantId);
      if (!rateCheck.allowed) {
        console.log(`[ceo-daily-brief] Rate limit exceeded for tenant=${tenantId || 'global'}`);
        return jsonResponse({ 
          error: 'Rate limit exceeded. Maximum 5 refreshes per hour.',
          rate_limit: { max: RATE_LIMIT_MAX, remaining: 0, window_hours: 1 }
        }, 429);
      }
      console.log(`[ceo-daily-brief] Rate limit OK. Remaining: ${rateCheck.remaining}`);
    }

    // Check for cached brief (TTL based on expires_at)
    if (!force_refresh) {
      const { data: cached } = await supabase
        .from('agent_shared_state')
        .select('value, updated_at, expires_at')
        .eq('key', cacheKey)
        .single();

      if (cached && cached.expires_at) {
        const expiresAt = new Date(cached.expires_at).getTime();
        
        if (Date.now() < expiresAt) {
          const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
          console.log(`[ceo-daily-brief] Returning cached brief (age=${Math.round(cacheAge / 3600000)}h)`);
          return jsonResponse({ ...cached.value, from_cache: true });
        }
      }
    }

    // ─────────────────────────────────────────────────────────
    // AGGREGATE REAL DATA (with tenant filtering where available)
    // ─────────────────────────────────────────────────────────

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const warnings: string[] = [];

    // 1. Leads - HAS tenant_id, filter by tenant if available
    let leadsQuery = supabase
      .from('leads')
      .select('id, status, lead_temperature, source', { count: 'exact' })
      .gte('created_at', yesterday.toISOString());
    
    if (tenantId) {
      leadsQuery = leadsQuery.eq('tenant_id', tenantId);
    }
    
    const { data: recentLeads, count: leadsCount } = await leadsQuery;

    const leadTemperature: Record<string, number> = { hot: 0, warm: 0, cold: 0, unknown: 0 };
    const sourceCount: Record<string, number> = {};
    
    (recentLeads || []).forEach((lead: { lead_temperature?: string; source?: string }) => {
      const temp = (lead.lead_temperature || 'unknown').toLowerCase();
      leadTemperature[temp] = (leadTemperature[temp] || 0) + 1;
      
      const source = lead.source || 'direct';
      sourceCount[source] = (sourceCount[source] || 0) + 1;
    });

    const topSources = Object.entries(sourceCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([source, count]) => ({ source, count }));

    // 2. call_logs - NO tenant_id column, cannot filter
    // Set to 0 and log warning
    const missedCalls = 0;
    if (tenantId) {
      warnings.push('call_logs: no tenant_id column, missed_calls unavailable');
      console.warn(`[ceo-daily-brief] call_logs has no tenant_id - cannot filter for tenant ${tenantId}`);
    }

    // 3. Clients - HAS tenant_id, filter by tenant if available
    let clientsQuery = supabase
      .from('clients')
      .select('mrr', { count: 'exact' })
      .eq('status', 'active');
    
    if (tenantId) {
      clientsQuery = clientsQuery.eq('tenant_id', tenantId);
    }

    const { data: clientsData, count: activeClients } = await clientsQuery;

    // Sum actual MRR from active clients (mrr is in dollars, convert to cents)
    const mrrCents = (clientsData || []).reduce(
      (sum: number, c: { mrr?: number }) => sum + Math.round((c.mrr || 0) * 100),
      0
    );

    // 4. client_invoices - NO tenant_id column
    // Set to 0 for tenant-specific requests
    let revenueInvoicedThisMonthCents = 0;
    if (tenantId) {
      warnings.push('client_invoices: no tenant_id column, revenue_invoiced unavailable');
      console.warn(`[ceo-daily-brief] client_invoices has no tenant_id - cannot filter for tenant ${tenantId}`);
    }

    // 5. agent_cost_tracking - NO tenant_id column (global costs)
    // Return global costs (not tenant-filtered)
    const { data: costs24h } = await supabase
      .from('agent_cost_tracking')
      .select('cost_cents')
      .gte('created_at', yesterday.toISOString());

    const aiCost24h = (costs24h || []).reduce((sum: number, c: { cost_cents?: number }) => sum + (c.cost_cents || 0), 0);

    const { data: costs30d } = await supabase
      .from('agent_cost_tracking')
      .select('cost_cents')
      .gte('created_at', thirtyDaysAgo.toISOString());

    const totalCost30d = (costs30d || []).reduce((sum: number, c: { cost_cents?: number }) => sum + (c.cost_cents || 0), 0);
    const aiCost30dAvg = Math.round(totalCost30d / 30);

    if (tenantId) {
      warnings.push('agent_cost_tracking: no tenant_id column, showing global AI costs');
    }

    // 6. ceo_action_queue - HAS tenant_id
    let pendingQuery = supabase
      .from('ceo_action_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    
    if (tenantId) {
      pendingQuery = pendingQuery.eq('tenant_id', tenantId);
    }

    const { count: pendingActions } = await pendingQuery;

    const briefData: BriefData = {
      leads_24h: leadsCount || 0,
      lead_temperature: leadTemperature,
      missed_calls_24h: missedCalls,
      active_clients: activeClients || 0,
      mrr_cents: mrrCents,
      revenue_invoiced_this_month_cents: revenueInvoicedThisMonthCents,
      ai_cost_24h_cents: aiCost24h,
      ai_cost_30d_avg_cents: aiCost30dAvg,
      top_lead_sources: topSources,
      pending_actions: pendingActions || 0,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    console.log(`[ceo-daily-brief] Data aggregated:`, JSON.stringify(briefData));

    // ─────────────────────────────────────────────────────────
    // GENERATE EXECUTIVE BRIEF VIA AI (industry-agnostic)
    // ─────────────────────────────────────────────────────────

    const industry = await getBusinessIndustry(supabase, tenantId);

    const prompt = `You are the AI Chief of Staff for a ${industry} business. Generate a crisp executive daily brief.

DATA (last 24 hours unless noted):
- New leads: ${briefData.leads_24h}
- Lead temperature: Hot=${leadTemperature.hot}, Warm=${leadTemperature.warm}, Cold=${leadTemperature.cold}
- Missed calls: ${briefData.missed_calls_24h}${tenantId ? ' (note: global data)' : ''}
- Active clients: ${briefData.active_clients}
- MRR (Monthly Recurring Revenue): $${(briefData.mrr_cents / 100).toFixed(2)}
- Invoiced revenue this month: $${(briefData.revenue_invoiced_this_month_cents / 100).toFixed(2)}${tenantId ? ' (note: global data)' : ''}
- AI costs (24h): $${(briefData.ai_cost_24h_cents / 100).toFixed(2)}${tenantId ? ' (global)' : ''}
- AI costs (30d avg/day): $${(briefData.ai_cost_30d_avg_cents / 100).toFixed(2)}${tenantId ? ' (global)' : ''}
- Top lead sources: ${topSources.map(s => `${s.source}(${s.count})`).join(', ') || 'none'}
- Pending CEO actions: ${briefData.pending_actions}

RULES:
1. Provide 5-7 bullet points summarizing business health
2. Include exactly 1 risk alert (or "None" if no concerns)
3. Include exactly 1 opportunity recommendation
4. Be specific with numbers, not vague
5. Focus on actionable insights

Respond in this exact JSON format:
{
  "bullets": ["...", "...", "...", "...", "..."],
  "risk_alert": "...",
  "opportunity": "..."
}`;

    const aiResponse: AIChatResponse = await aiChat({
      messages: [{ role: 'user', content: prompt }],
      purpose: 'ceo_daily_brief',
      max_tokens: 800,
    });

    let briefContent: { bullets: string[]; risk_alert: string | null; opportunity: string | null };
    
    try {
      let responseText = aiResponse.text.trim();
      // Strip markdown code blocks if present
      if (responseText.startsWith('```')) {
        responseText = responseText.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
      }
      briefContent = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('[ceo-daily-brief] Failed to parse AI response:', aiResponse.text);
      // Fallback to structured response
      briefContent = {
        bullets: [
          `${briefData.leads_24h} new leads captured in last 24h`,
          `${briefData.active_clients} active clients on roster (MRR: $${(briefData.mrr_cents / 100).toFixed(2)})`,
          `${briefData.pending_actions} pending CEO actions`,
          `AI operations costing $${(briefData.ai_cost_24h_cents / 100).toFixed(2)}/day (global)`,
        ],
        risk_alert: null,
        opportunity: leadTemperature.hot > 0 ? `${leadTemperature.hot} hot leads ready for immediate follow-up` : null,
      };
    }

    const dailyBrief: DailyBrief = {
      generated_at: now.toISOString(),
      bullets: briefContent.bullets,
      risk_alert: briefContent.risk_alert,
      opportunity: briefContent.opportunity,
      data_snapshot: briefData,
    };

    // ─────────────────────────────────────────────────────────
    // CACHE THE BRIEF (24h TTL via expires_at)
    // ─────────────────────────────────────────────────────────

    await supabase.from('agent_shared_state').upsert({
      key: cacheKey,
      value: dailyBrief,
      category: 'ceo_brief',
      expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });

    // ─────────────────────────────────────────────────────────
    // LOG COST USING REAL VALUES FROM aiChat() RESPONSE
    // ─────────────────────────────────────────────────────────
    
    const tokensUsed = aiResponse.usage?.total_tokens || 0;
    const costCents = estimateCostCents(aiResponse.provider, aiResponse.model, aiResponse.usage);

    await supabase.from('agent_cost_tracking').insert({
      agent_type: 'ceo-daily-brief',
      purpose: 'ceo_daily_brief',
      model: aiResponse.model,
      provider: aiResponse.provider,
      api_calls: 1,
      tokens_used: tokensUsed,
      cost_cents: costCents,
      avg_latency_ms: aiResponse.latency_ms || null,
    });

    console.log(`[ceo-daily-brief] Brief generated. provider=${aiResponse.provider} model=${aiResponse.model} tokens=${tokensUsed} cost_cents=${costCents}`);
    
    return jsonResponse(dailyBrief);

  } catch (error) {
    console.error('[ceo-daily-brief] Error:', error);
    // Never leak stack traces to client
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonResponse({ error: message }, 500);
  }
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
