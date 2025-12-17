import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat, estimateCostCents, AIChatResponse } from "../_shared/ai.ts";

/**
 * CEO Scheduler - Automated daily brief generation per-tenant
 * 
 * SECURITY:
 * - Requires X-Internal-Secret header matching INTERNAL_SCHEDULER_SECRET env var
 * - Does NOT rely on client-provided tenant_id for filtering
 * - All tenant data queries are scoped by tenantId from database
 * 
 * Actions:
 * - run_daily_briefs: Loops all active tenants and generates daily briefs
 * - run_cost_rollup: Aggregates AI costs for dashboard speed
 * - check_job_status: Returns status of recent job runs
 * 
 * Triggered by: pg_cron (7 AM UTC daily) or manual invocation with valid secret
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

interface TenantInfo {
  id: string;
  name: string;
  status: string;
}

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
  warnings: string[];
}

/**
 * Validate internal scheduler secret
 */
function validateInternalAuth(req: Request): { valid: boolean; error?: string } {
  const secret = req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('INTERNAL_SCHEDULER_SECRET');
  
  if (!expectedSecret) {
    console.error('[ceo-scheduler] INTERNAL_SCHEDULER_SECRET env var not configured');
    return { valid: false, error: 'Internal auth not configured' };
  }
  
  if (!secret) {
    return { valid: false, error: 'Missing X-Internal-Secret header' };
  }
  
  if (secret !== expectedSecret) {
    return { valid: false, error: 'Invalid X-Internal-Secret' };
  }
  
  return { valid: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // SECURITY: Validate internal auth
  const authCheck = validateInternalAuth(req);
  if (!authCheck.valid) {
    console.warn(`[ceo-scheduler] Auth rejected: ${authCheck.error}`);
    return jsonResponse({ error: authCheck.error }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { action = 'run_daily_briefs', tenant_ids } = await req.json().catch(() => ({}));
    
    console.log(`[ceo-scheduler] Action: ${action}`);

    switch (action) {
      case 'run_daily_briefs':
        return await runDailyBriefs(supabase, tenant_ids);
      
      case 'run_cost_rollup':
        return await runCostRollup(supabase);
      
      case 'check_job_status':
        return await checkJobStatus(supabase);
      
      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }

  } catch (error) {
    console.error('[ceo-scheduler] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});

/**
 * Run daily briefs for all active tenants
 */
async function runDailyBriefs(
  supabase: SupabaseClient, 
  specificTenantIds?: string[]
): Promise<Response> {
  const startTime = Date.now();
  
  // Get tenants to process
  let query = supabase
    .from('tenants')
    .select('id, name, status')
    .eq('status', 'active');
  
  if (specificTenantIds && specificTenantIds.length > 0) {
    query = query.in('id', specificTenantIds);
  }
  
  const { data: tenants, error: tenantsError } = await query;
  
  if (tenantsError) {
    console.error('[ceo-scheduler] Failed to fetch tenants:', tenantsError);
    return jsonResponse({ error: 'Failed to fetch tenants' }, 500);
  }

  if (!tenants || tenants.length === 0) {
    console.log('[ceo-scheduler] No active tenants found');
    return jsonResponse({ message: 'No active tenants', processed: 0 });
  }

  console.log(`[ceo-scheduler] Processing ${tenants.length} tenants`);

  const results: Array<{
    tenant_id: string;
    tenant_name: string;
    status: 'success' | 'failed' | 'skipped';
    error?: string;
    duration_ms: number;
    warnings?: string[];
  }> = [];

  for (const tenant of tenants as TenantInfo[]) {
    const tenantStart = Date.now();
    
    try {
      // Check if brief already exists and is fresh (< 24h)
      const cacheKey = `ceo_daily_brief_${tenant.id}`;
      const { data: cached } = await supabase
        .from('agent_shared_state')
        .select('updated_at, expires_at')
        .eq('key', cacheKey)
        .single();

      if (cached?.expires_at) {
        const expiresAt = new Date(cached.expires_at).getTime();
        if (Date.now() < expiresAt) {
          // Skip - brief is still fresh
          const duration = Date.now() - tenantStart;
          results.push({
            tenant_id: tenant.id,
            tenant_name: tenant.name,
            status: 'skipped',
            duration_ms: duration,
          });
          
          await logJobRun(supabase, tenant.id, 'daily_brief', 'skipped', null, duration, {
            reason: 'brief_still_fresh',
            expires_at: cached.expires_at,
          });
          
          continue;
        }
      }

      // Generate brief for this tenant
      const brief = await generateTenantBrief(supabase, tenant.id);
      const duration = Date.now() - tenantStart;
      
      results.push({
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        status: 'success',
        duration_ms: duration,
        warnings: brief.warnings,
      });

      await logJobRun(supabase, tenant.id, 'daily_brief', 'success', null, duration, {
        brief_bullets: brief.bullets?.length || 0,
        warnings: brief.warnings,
      });

    } catch (error) {
      const duration = Date.now() - tenantStart;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      results.push({
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        status: 'failed',
        error: errorMsg,
        duration_ms: duration,
      });

      await logJobRun(supabase, tenant.id, 'daily_brief', 'failed', errorMsg, duration);
    }
  }

  const totalDuration = Date.now() - startTime;
  const successCount = results.filter(r => r.status === 'success').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const skippedCount = results.filter(r => r.status === 'skipped').length;

  console.log(`[ceo-scheduler] Completed: ${successCount} success, ${failedCount} failed, ${skippedCount} skipped in ${totalDuration}ms`);

  return jsonResponse({
    total: tenants.length,
    success: successCount,
    failed: failedCount,
    skipped: skippedCount,
    duration_ms: totalDuration,
    results,
  });
}

/**
 * Generate brief for a specific tenant (internal helper)
 * 
 * TENANT ISOLATION:
 * - Tables WITH tenant_id: leads, clients, ceo_action_queue - filtered by tenantId
 * - Tables WITHOUT tenant_id: call_logs, client_invoices, agent_cost_tracking
 *   - Set to 0 and log warning in metadata
 */
async function generateTenantBrief(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ bullets: string[]; risk_alert: string | null; opportunity: string | null; warnings: string[] }> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const warnings: string[] = [];

  // 1. Leads - HAS tenant_id, filtered
  const { data: leadsData, count: leadsCount } = await supabase
    .from('leads')
    .select('id, lead_temperature, source', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .gte('created_at', yesterday.toISOString());

  // 2. Clients - HAS tenant_id, filtered
  const { data: clientsData, count: clientsCount } = await supabase
    .from('clients')
    .select('mrr', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  // 3. ceo_action_queue - HAS tenant_id, filtered
  const { count: pendingCount } = await supabase
    .from('ceo_action_queue')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'pending');

  // 4. call_logs - NO tenant_id column, cannot filter by tenant
  // Set to 0 and log warning
  const missedCalls24h = 0;
  warnings.push('call_logs: no tenant_id column, missed_calls set to 0');
  console.warn(`[ceo-scheduler] call_logs has no tenant_id - cannot filter for tenant ${tenantId}`);

  // 5. client_invoices - NO tenant_id column (linked via client_id -> clients)
  // Would need a join to filter properly; for now set to 0
  const revenueInvoicedCents = 0;
  warnings.push('client_invoices: no tenant_id column, revenue_invoiced set to 0');
  console.warn(`[ceo-scheduler] client_invoices has no tenant_id - cannot filter for tenant ${tenantId}`);

  // 6. agent_cost_tracking - NO tenant_id column, global costs
  // Set to 0 for tenant-specific view
  const aiCost24h = 0;
  const aiCost30dAvg = 0;
  warnings.push('agent_cost_tracking: no tenant_id column, ai_costs set to 0');
  console.warn(`[ceo-scheduler] agent_cost_tracking has no tenant_id - cannot filter for tenant ${tenantId}`);

  // Process lead temperatures
  const leadTemperature: Record<string, number> = { hot: 0, warm: 0, cold: 0, unknown: 0 };
  const sourceCount: Record<string, number> = {};
  
  (leadsData || []).forEach((lead: { lead_temperature?: string; source?: string }) => {
    const temp = (lead.lead_temperature || 'unknown').toLowerCase();
    leadTemperature[temp] = (leadTemperature[temp] || 0) + 1;
    const source = lead.source || 'direct';
    sourceCount[source] = (sourceCount[source] || 0) + 1;
  });

  const topSources = Object.entries(sourceCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([source, count]) => ({ source, count }));

  const mrrCents = (clientsData || []).reduce(
    (sum: number, c: { mrr?: number }) => sum + Math.round((c.mrr || 0) * 100), 0
  );

  const briefData: BriefData = {
    leads_24h: leadsCount || 0,
    lead_temperature: leadTemperature,
    missed_calls_24h: missedCalls24h,
    active_clients: clientsCount || 0,
    mrr_cents: mrrCents,
    revenue_invoiced_this_month_cents: revenueInvoicedCents,
    ai_cost_24h_cents: aiCost24h,
    ai_cost_30d_avg_cents: aiCost30dAvg,
    top_lead_sources: topSources,
    pending_actions: pendingCount || 0,
    warnings,
  };

  // Get industry from business profile
  const { data: profile } = await supabase
    .from('business_profile')
    .select('industry')
    .eq('tenant_id', tenantId)
    .single();

  const industry = profile?.industry || 'service';

  // Generate AI brief
  const prompt = `You are the AI Chief of Staff for a ${industry} business. Generate a crisp executive daily brief.

DATA (last 24 hours unless noted):
- New leads: ${briefData.leads_24h}
- Lead temperature: Hot=${leadTemperature.hot}, Warm=${leadTemperature.warm}, Cold=${leadTemperature.cold}
- Missed calls: ${briefData.missed_calls_24h} (note: data unavailable, showing 0)
- Active clients: ${briefData.active_clients}
- MRR: $${(briefData.mrr_cents / 100).toFixed(2)}
- Invoiced this month: $${(briefData.revenue_invoiced_this_month_cents / 100).toFixed(2)} (note: data unavailable, showing 0)
- AI costs (24h): $${(briefData.ai_cost_24h_cents / 100).toFixed(2)} (note: global costs not tenant-filtered)
- Pending CEO actions: ${briefData.pending_actions}

Generate 5-7 bullets, 1 risk alert (or "None"), 1 opportunity.
Respond ONLY as JSON: {"bullets": [...], "risk_alert": "...", "opportunity": "..."}`

  const aiResponse: AIChatResponse = await aiChat({
    messages: [{ role: 'user', content: prompt }],
    purpose: 'ceo_daily_brief',
    max_tokens: 800,
  });

  let briefContent: { bullets: string[]; risk_alert: string | null; opportunity: string | null };
  
  try {
    let text = aiResponse.text.trim();
    if (text.startsWith('```')) {
      text = text.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    briefContent = JSON.parse(text);
  } catch {
    // Fallback
    briefContent = {
      bullets: [
        `${briefData.leads_24h} new leads in 24h`,
        `${briefData.active_clients} active clients (MRR: $${(briefData.mrr_cents / 100).toFixed(2)})`,
        `${briefData.pending_actions} pending CEO actions`,
      ],
      risk_alert: null,
      opportunity: leadTemperature.hot > 0 ? `${leadTemperature.hot} hot leads ready` : null,
    };
  }

  // Cache the brief
  const cacheKey = `ceo_daily_brief_${tenantId}`;
  await supabase.from('agent_shared_state').upsert({
    key: cacheKey,
    value: {
      generated_at: now.toISOString(),
      bullets: briefContent.bullets,
      risk_alert: briefContent.risk_alert,
      opportunity: briefContent.opportunity,
      data_snapshot: briefData,
    },
    category: 'ceo_brief',
    expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  });

  // Track cost
  const tokensUsed = aiResponse.usage?.total_tokens || 0;
  const costCents = estimateCostCents(aiResponse.provider, aiResponse.model, aiResponse.usage);
  
  await supabase.from('agent_cost_tracking').insert({
    agent_type: 'ceo-scheduler',
    purpose: 'ceo_daily_brief',
    model: aiResponse.model,
    provider: aiResponse.provider,
    api_calls: 1,
    tokens_used: tokensUsed,
    cost_cents: costCents,
    avg_latency_ms: aiResponse.latency_ms || null,
  });

  return { ...briefContent, warnings };
}

/**
 * Run cost rollup for dashboard performance (global, not tenant-specific)
 */
async function runCostRollup(supabase: SupabaseClient): Promise<Response> {
  const startTime = Date.now();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  try {
    // Aggregate costs by agent/purpose/provider (global - no tenant_id on this table)
    const { data: costs, error } = await supabase
      .from('agent_cost_tracking')
      .select('agent_type, purpose, provider, cost_cents, tokens_used, api_calls')
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (error) throw error;

    const byAgent: Record<string, { cost_cents: number; api_calls: number; tokens: number }> = {};
    const byPurpose: Record<string, { cost_cents: number; count: number }> = {};
    const byProvider: Record<string, { cost_cents: number; count: number }> = {};

    (costs || []).forEach((c: Record<string, unknown>) => {
      const agent = (c.agent_type as string) || 'unknown';
      const purpose = (c.purpose as string) || 'unknown';
      const provider = (c.provider as string) || 'unknown';

      if (!byAgent[agent]) byAgent[agent] = { cost_cents: 0, api_calls: 0, tokens: 0 };
      byAgent[agent].cost_cents += (c.cost_cents as number) || 0;
      byAgent[agent].api_calls += (c.api_calls as number) || 0;
      byAgent[agent].tokens += (c.tokens_used as number) || 0;

      if (!byPurpose[purpose]) byPurpose[purpose] = { cost_cents: 0, count: 0 };
      byPurpose[purpose].cost_cents += (c.cost_cents as number) || 0;
      byPurpose[purpose].count += 1;

      if (!byProvider[provider]) byProvider[provider] = { cost_cents: 0, count: 0 };
      byProvider[provider].cost_cents += (c.cost_cents as number) || 0;
      byProvider[provider].count += 1;
    });

    const rollup = { by_agent: byAgent, by_purpose: byPurpose, by_provider: byProvider };

    // Cache the rollup (global - no tenant)
    await supabase.from('agent_shared_state').upsert({
      key: 'ceo_cost_rollup_global',
      value: rollup,
      category: 'ceo_cost',
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6h TTL
    });

    const duration = Date.now() - startTime;
    await logJobRun(supabase, null, 'cost_rollup', 'success', null, duration, {
      records_processed: costs?.length || 0,
    });

    return jsonResponse({ success: true, duration_ms: duration, records_processed: costs?.length || 0 });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await logJobRun(supabase, null, 'cost_rollup', 'failed', errorMsg, duration);
    return jsonResponse({ error: errorMsg }, 500);
  }
}

/**
 * Check status of recent job runs
 */
async function checkJobStatus(supabase: SupabaseClient): Promise<Response> {
  const { data: jobs, error } = await supabase
    .from('ceo_job_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  // Summarize by job type
  const summary: Record<string, { total: number; success: number; failed: number; skipped: number; last_run?: string }> = {};
  
  (jobs || []).forEach((job: Record<string, unknown>) => {
    const jobType = job.job_type as string;
    if (!summary[jobType]) {
      summary[jobType] = { total: 0, success: 0, failed: 0, skipped: 0 };
    }
    summary[jobType].total += 1;
    if (job.status === 'success') summary[jobType].success += 1;
    if (job.status === 'failed') summary[jobType].failed += 1;
    if (job.status === 'skipped') summary[jobType].skipped += 1;
    if (!summary[jobType].last_run) summary[jobType].last_run = job.created_at as string;
  });

  return jsonResponse({ recent_jobs: jobs, summary });
}

/**
 * Log job run to ceo_job_runs table
 */
async function logJobRun(
  supabase: SupabaseClient,
  tenantId: string | null,
  jobType: string,
  status: string,
  error: string | null,
  durationMs: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  await supabase.from('ceo_job_runs').insert({
    tenant_id: tenantId,
    job_type: jobType,
    status,
    error,
    duration_ms: durationMs,
    metadata: metadata || {},
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
