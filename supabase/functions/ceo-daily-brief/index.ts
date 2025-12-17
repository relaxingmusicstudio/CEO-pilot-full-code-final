import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat } from "../_shared/ai.ts";

/**
 * CEO Daily Brief Generator
 * 
 * Aggregates real business data and generates executive-level insights.
 * Uses purpose: "ceo_daily_brief" for premium AI routing.
 * 
 * Data sources:
 * - Last 24h leads + temperature distribution
 * - Missed calls count
 * - Active clients
 * - Revenue (MRR from client_invoices)
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
  mrr_cents: number;
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { tenant_id, force_refresh = false } = await req.json().catch(() => ({}));
    
    console.log(`[ceo-daily-brief] Generating brief for tenant=${tenant_id || 'all'}`);

    // Check for cached brief (TTL 24h)
    if (!force_refresh) {
      const cacheKey = `ceo_daily_brief_${tenant_id || 'global'}`;
      const { data: cached } = await supabase
        .from('agent_shared_state')
        .select('value, updated_at')
        .eq('key', cacheKey)
        .single();

      if (cached) {
        const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
        const ttlMs = 24 * 60 * 60 * 1000; // 24 hours
        
        if (cacheAge < ttlMs) {
          console.log(`[ceo-daily-brief] Returning cached brief (age=${Math.round(cacheAge / 3600000)}h)`);
          return jsonResponse({ ...cached.value, from_cache: true });
        }
      }
    }

    // ─────────────────────────────────────────────────────────
    // AGGREGATE REAL DATA
    // ─────────────────────────────────────────────────────────

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Leads in last 24h + temperature distribution
    const { data: recentLeads, count: leadsCount } = await supabase
      .from('leads')
      .select('id, status, temperature, source', { count: 'exact' })
      .gte('created_at', yesterday.toISOString());

    const leadTemperature: Record<string, number> = { hot: 0, warm: 0, cold: 0, unknown: 0 };
    const sourceCount: Record<string, number> = {};
    
    (recentLeads || []).forEach((lead: any) => {
      const temp = (lead.temperature || 'unknown').toLowerCase();
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

    // 4. MRR from recent invoices (sum of paid invoices this month)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const { data: invoices } = await supabase
      .from('client_invoices')
      .select('amount_cents')
      .eq('status', 'paid')
      .gte('created_at', monthStart.toISOString());

    const mrrCents = (invoices || []).reduce((sum: number, inv: any) => sum + (inv.amount_cents || 0), 0);

    // 5. AI costs - last 24h
    const { data: costs24h } = await supabase
      .from('agent_cost_tracking')
      .select('cost_cents')
      .gte('created_at', yesterday.toISOString());

    const aiCost24h = (costs24h || []).reduce((sum: number, c: any) => sum + (c.cost_cents || 0), 0);

    // 6. AI costs - 30d average
    const { data: costs30d } = await supabase
      .from('agent_cost_tracking')
      .select('cost_cents')
      .gte('created_at', thirtyDaysAgo.toISOString());

    const totalCost30d = (costs30d || []).reduce((sum: number, c: any) => sum + (c.cost_cents || 0), 0);
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
      mrr_cents: mrrCents,
      ai_cost_24h_cents: aiCost24h,
      ai_cost_30d_avg_cents: aiCost30dAvg,
      top_lead_sources: topSources,
      pending_actions: pendingActions || 0,
    };

    console.log(`[ceo-daily-brief] Data aggregated:`, JSON.stringify(briefData));

    // ─────────────────────────────────────────────────────────
    // GENERATE EXECUTIVE BRIEF VIA AI
    // ─────────────────────────────────────────────────────────

    const prompt = `You are the AI Chief of Staff for an HVAC service business. Generate a crisp executive daily brief.

DATA (last 24 hours unless noted):
- New leads: ${briefData.leads_24h}
- Lead temperature: Hot=${leadTemperature.hot}, Warm=${leadTemperature.warm}, Cold=${leadTemperature.cold}
- Missed calls: ${briefData.missed_calls_24h}
- Active clients: ${briefData.active_clients}
- MRR this month: $${(briefData.mrr_cents / 100).toFixed(2)}
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

    const aiResponse = await aiChat({
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
          `MRR at $${(briefData.mrr_cents / 100).toFixed(2)} this month`,
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
    // CACHE THE BRIEF (24h TTL)
    // ─────────────────────────────────────────────────────────

    const cacheKey = `ceo_daily_brief_${tenant_id || 'global'}`;
    await supabase.from('agent_shared_state').upsert({
      key: cacheKey,
      value: dailyBrief,
      category: 'ceo_brief',
      expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });

    // Log cost for this brief generation
    await supabase.from('agent_cost_tracking').insert({
      agent_type: 'ceo-daily-brief',
      purpose: 'ceo_daily_brief',
      model: aiResponse.model,
      provider: aiResponse.provider,
      api_calls: 1,
      tokens_used: 800, // Estimate
      cost_cents: aiResponse.provider === 'openai' ? 2 : 0, // Rough estimate
    });

    console.log(`[ceo-daily-brief] Brief generated and cached`);
    
    return jsonResponse(dailyBrief);

  } catch (error) {
    console.error('[ceo-daily-brief] Error:', error);
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
