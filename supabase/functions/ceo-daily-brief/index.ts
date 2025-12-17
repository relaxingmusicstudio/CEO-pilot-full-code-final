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
 * Data sources:
 * - Last 24h leads + temperature distribution
 * - Missed calls count
 * - Active clients
 * - Revenue (from client_invoices)
 * - AI/API costs (24h + 30d avg)
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
  revenue_this_month_cents: number;
  ai_cost_24h_cents: number;
  ai_cost_30d_avg_cents: number;
  top_lead_sources: Array<{ source: string; count: number }>;
  pending_actions: number;
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
    const cacheKey = `ceo_daily_brief_${tenantId || 'global'}`;
    
    console.log(`[ceo-daily-brief] Generating brief for tenant=${tenantId || 'global'}`);

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
    // AGGREGATE REAL DATA (with tenant filtering if available)
    // ─────────────────────────────────────────────────────────

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Build base queries with optional tenant filter
    const buildQuery = (table: string) => {
      let query = supabase.from(table);
      return query;
    };

    // 1. Leads in last 24h + temperature distribution (using lead_temperature, not temperature)
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

    // 2. Missed calls in last 24h
    const { count: missedCalls } = await supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yesterday.toISOString())
      .eq('status', 'missed');

    // 3. Active clients
    const { count: activeClients } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    // 4. Revenue from recent invoices (using 'amount' not 'amount_cents')
    const { data: invoices } = await supabase
      .from('client_invoices')
      .select('amount')
      .eq('status', 'paid')
      .gte('created_at', monthStart.toISOString());

    // amount is in dollars, convert to cents for consistency
    const revenueThisMonthCents = (invoices || []).reduce(
      (sum: number, inv: { amount?: number }) => sum + Math.round((inv.amount || 0) * 100), 
      0
    );

    // 5. AI costs - last 24h
    const { data: costs24h } = await supabase
      .from('agent_cost_tracking')
      .select('cost_cents')
      .gte('created_at', yesterday.toISOString());

    const aiCost24h = (costs24h || []).reduce((sum: number, c: { cost_cents?: number }) => sum + (c.cost_cents || 0), 0);

    // 6. AI costs - 30d average
    const { data: costs30d } = await supabase
      .from('agent_cost_tracking')
      .select('cost_cents')
      .gte('created_at', thirtyDaysAgo.toISOString());

    const totalCost30d = (costs30d || []).reduce((sum: number, c: { cost_cents?: number }) => sum + (c.cost_cents || 0), 0);
    const aiCost30dAvg = Math.round(totalCost30d / 30);

    // 7. Pending CEO actions
    const { count: pendingActions } = await supabase
      .from('ceo_action_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    const briefData: BriefData = {
      leads_24h: leadsCount || 0,
      lead_temperature: leadTemperature,
      missed_calls_24h: missedCalls || 0,
      active_clients: activeClients || 0,
      revenue_this_month_cents: revenueThisMonthCents,
      ai_cost_24h_cents: aiCost24h,
      ai_cost_30d_avg_cents: aiCost30dAvg,
      top_lead_sources: topSources,
      pending_actions: pendingActions || 0,
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
- Missed calls: ${briefData.missed_calls_24h}
- Active clients: ${briefData.active_clients}
- Revenue this month: $${(briefData.revenue_this_month_cents / 100).toFixed(2)}
- AI costs (24h): $${(briefData.ai_cost_24h_cents / 100).toFixed(2)}
- AI costs (30d avg/day): $${(briefData.ai_cost_30d_avg_cents / 100).toFixed(2)}
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
          `${briefData.missed_calls_24h} missed calls require follow-up`,
          `${briefData.active_clients} active clients on roster`,
          `Revenue at $${(briefData.revenue_this_month_cents / 100).toFixed(2)} this month`,
          `AI operations costing $${(briefData.ai_cost_24h_cents / 100).toFixed(2)}/day`,
        ],
        risk_alert: briefData.missed_calls_24h > 5 ? `High missed call rate (${briefData.missed_calls_24h}) may indicate staffing gap` : null,
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
