import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat, estimateCostCents, AIChatResponse } from "../_shared/ai.ts";

/**
 * CEO Scheduler - internal-only jobs
 *
 * REQUIRED INTERNAL AUTH PATTERN:
 * - Validate header X-Internal-Secret matches env INTERNAL_SCHEDULER_SECRET.
 * - If missing/invalid -> 401 { error, message } (no other details).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const DAILY_BRIEF_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const COST_ROLLUP_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface BriefData {
  leads_24h: number;
  lead_temperature: Record<string, number>;
  missed_calls_24h: number;
  total_calls_24h: number;
  active_clients: number;
  mrr_cents: number;
  revenue_invoiced_this_month_cents: number;
  ai_cost_24h_cents: number;
  ai_cost_30d_avg_cents: number;
  top_lead_sources: Array<{ source: string; count: number }>;
  pending_actions: number;
}

interface CostRollup {
  total_cents: number;
  total_tokens: number;
  by_agent: Record<string, number>;
  by_purpose: Record<string, number>;
  by_provider: Record<string, number>;
}

class MissingSecretError extends Error {
  secretName: string;
  constructor(secretName: string) {
    super(`Missing required secret: ${secretName}`);
    this.secretName = secretName;
  }
}

class UnauthorizedInternalError extends Error {
  constructor() {
    super("Invalid or missing internal authentication");
  }
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new MissingSecretError(name);
  return value;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function internalUnauthorizedResponse(): Response {
  return jsonResponse(
    { error: "Unauthorized", message: "Invalid or missing internal authentication" },
    401,
  );
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function parseAiErrorMessage(message: string): { code?: string; msg?: string } | null {
  try {
    const parsed = JSON.parse(message);
    if (parsed && typeof parsed === "object") {
      return { code: parsed.code, msg: parsed.message };
    }
    return null;
  } catch {
    return null;
  }
}

function inferMissingSecretFromAiMessage(msg: string | undefined): string | null {
  if (!msg) return null;
  if (msg.includes("GEMINI_API_KEY")) return "GEMINI_API_KEY";
  if (msg.includes("OPENAI_API_KEY")) return "OPENAI_API_KEY";
  if (msg.includes("ANTHROPIC_API_KEY")) return "ANTHROPIC_API_KEY";
  return null;
}

function requireInternalAuth(req: Request): void {
  const expected = requireEnv("INTERNAL_SCHEDULER_SECRET");
  const provided = req.headers.get("x-internal-secret") || req.headers.get("X-Internal-Secret");
  if (!provided || provided !== expected) throw new UnauthorizedInternalError();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requireInternalAuth(req);

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const { action = "run_daily_briefs", tenant_ids } = await req.json().catch(() => ({}));

    switch (action) {
      case "run_daily_briefs":
        return await runDailyBriefs(supabase, Array.isArray(tenant_ids) ? tenant_ids : undefined);
      case "run_cost_rollup":
        return await runCostRollup(supabase);
      case "check_job_status":
        return await checkJobStatus(supabase);
      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    if (error instanceof MissingSecretError) {
      return jsonResponse({ error: `Missing required secret: ${error.secretName}` }, 500);
    }
    if (error instanceof UnauthorizedInternalError) {
      return internalUnauthorizedResponse();
    }

    console.error("[ceo-scheduler] Unhandled error", { message: error instanceof Error ? error.message : String(error) });
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

async function runDailyBriefs(supabase: SupabaseClient, specificTenantIds?: string[]): Promise<Response> {
  const started = Date.now();

  // Tenants selection: canonical = status='active' (no guessing / no dual-mode)
  let tenantsQuery = supabase
    .from("tenants")
    .select("id, name")
    .eq("status", "active");

  if (specificTenantIds?.length) {
    tenantsQuery = tenantsQuery.in("id", specificTenantIds);
  }

  const { data: tenants, error: tenantsError } = await tenantsQuery;
  if (tenantsError) {
    console.error("[ceo-scheduler] Failed to fetch tenants", { message: tenantsError.message });
    return jsonResponse({ error: "Failed to fetch tenants" }, 500);
  }

  if (!tenants?.length) {
    return jsonResponse({ message: "No active tenants", processed: 0 });
  }

  const results: Array<{
    tenant_id: string;
    tenant_name: string;
    status: "success" | "failed" | "skipped";
    error?: string;
    duration_ms: number;
  }> = [];

  for (const tenant of tenants as Array<{ id: string; name: string }>) {
    const tenantStart = Date.now();

    try {
      const cacheKey = `ceo_daily_brief_${tenant.id}`;
      const { data: cached, error: cacheError } = await supabase
        .from("agent_shared_state")
        .select("expires_at")
        .eq("key", cacheKey)
        .maybeSingle();

      if (cacheError) {
        console.error("[ceo-scheduler] Cache lookup failed", { tenant_id: tenant.id, message: cacheError.message });
      }

      if (cached?.expires_at) {
        const expiresAt = new Date(cached.expires_at as string).getTime();
        if (Date.now() < expiresAt) {
          const durationMs = Date.now() - tenantStart;
          results.push({ tenant_id: tenant.id, tenant_name: tenant.name, status: "skipped", duration_ms: durationMs });
          await logJobRun(supabase, tenant.id, "daily_brief", "skipped", null, durationMs, { reason: "cache_fresh" });
          continue;
        }
      }

      const briefData = await generateTenantBriefAndCache(supabase, tenant.id);
      const durationMs = Date.now() - tenantStart;

      results.push({ tenant_id: tenant.id, tenant_name: tenant.name, status: "success", duration_ms: durationMs });
      await logJobRun(supabase, tenant.id, "daily_brief", "success", null, durationMs, {
        missed_calls_24h: briefData.missed_calls_24h,
        revenue_invoiced_this_month_cents: briefData.revenue_invoiced_this_month_cents,
      });
    } catch (e) {
      const durationMs = Date.now() - tenantStart;
      const msg = e instanceof Error ? e.message : String(e);

      results.push({ tenant_id: tenant.id, tenant_name: tenant.name, status: "failed", error: msg, duration_ms: durationMs });
      await logJobRun(supabase, tenant.id, "daily_brief", "failed", msg, durationMs);
    }
  }

  const duration = Date.now() - started;
  return jsonResponse({
    total: tenants.length,
    success: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    duration_ms: duration,
    results,
  });
}

async function aggregateTenantData(supabase: SupabaseClient, tenantId: string): Promise<BriefData> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    leadsResult,
    clientsResult,
    decisionsResult,
    actionsResult,
    callLogsResult,
    invoicesResult,
    costs24hResult,
    costs30dResult,
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("id, lead_temperature, source")
      .eq("tenant_id", tenantId)
      .gte("created_at", yesterday.toISOString()),
    supabase
      .from("clients")
      .select("mrr")
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
    supabase
      .from("ceo_decisions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending"),
    supabase
      .from("ceo_action_queue")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending"),
    supabase
      .from("call_logs")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .gte("created_at", yesterday.toISOString()),
    supabase
      .from("client_invoices")
      .select("amount_cents")
      .eq("tenant_id", tenantId)
      .eq("status", "paid")
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("agent_cost_tracking")
      .select("cost_cents")
      .eq("tenant_id", tenantId)
      .gte("created_at", yesterday.toISOString()),
    supabase
      .from("agent_cost_tracking")
      .select("cost_cents")
      .eq("tenant_id", tenantId)
      .gte("created_at", thirtyDaysAgo.toISOString()),
  ]);

  const leads = leadsResult.data || [];
  const clients = clientsResult.data || [];
  const callLogs = callLogsResult.data || [];
  const invoices = invoicesResult.data || [];
  const costs24h = costs24hResult.data || [];
  const costs30d = costs30dResult.data || [];

  const leadTemperature: Record<string, number> = { hot: 0, warm: 0, cold: 0, unknown: 0 };
  const sourceCount: Record<string, number> = {};

  for (const lead of leads as Array<{ lead_temperature?: string | null; source?: string | null }>) {
    const tempRaw = (lead.lead_temperature || "unknown").toLowerCase();
    const temp = ["hot", "warm", "cold"].includes(tempRaw) ? tempRaw : "unknown";
    leadTemperature[temp] = (leadTemperature[temp] || 0) + 1;

    const source = lead.source || "direct";
    sourceCount[source] = (sourceCount[source] || 0) + 1;
  }

  const topSources = Object.entries(sourceCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([source, count]) => ({ source, count }));

  const mrrCents = (clients as Array<{ mrr?: unknown }>).reduce((sum, c) => {
    const dollars = toNumber(c.mrr);
    return sum + Math.round(dollars * 100);
  }, 0);

  const missedCalls = (callLogs as Array<{ status?: string | null }>).filter((c) =>
    ["missed", "no_answer", "voicemail"].includes((c.status || "").toLowerCase())
  ).length;

  const revenueInvoicedCents = (invoices as Array<{ amount_cents?: unknown }>).reduce(
    (sum, inv) => sum + Math.round(toNumber(inv.amount_cents)),
    0,
  );

  const aiCost24h = (costs24h as Array<{ cost_cents?: unknown }>).reduce(
    (sum, c) => sum + Math.round(toNumber(c.cost_cents)),
    0,
  );
  const totalCost30d = (costs30d as Array<{ cost_cents?: unknown }>).reduce(
    (sum, c) => sum + Math.round(toNumber(c.cost_cents)),
    0,
  );

  return {
    leads_24h: leads.length,
    lead_temperature: leadTemperature,
    missed_calls_24h: missedCalls,
    total_calls_24h: callLogs.length,
    active_clients: clients.length,
    mrr_cents: mrrCents,
    revenue_invoiced_this_month_cents: revenueInvoicedCents,
    ai_cost_24h_cents: aiCost24h,
    ai_cost_30d_avg_cents: Math.round(totalCost30d / 30),
    top_lead_sources: topSources,
    pending_actions: (actionsResult.count || 0) + (decisionsResult.count || 0),
  };
}

async function getBusinessIndustry(supabase: SupabaseClient, tenantId: string): Promise<string> {
  const { data, error } = await supabase
    .from("business_profile")
    .select("industry")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("[ceo-scheduler] Failed to fetch business_profile industry", { tenant_id: tenantId, message: error.message });
  }

  return (data as { industry?: string | null } | null)?.industry || "service";
}

async function generateAIBrief(briefData: BriefData, industry: string): Promise<AIChatResponse> {
  const prompt = `You are the AI Chief of Staff for a ${industry} business.\n\nReturn STRICT JSON only with this exact shape:\n{\n  "bullets": ["..."],\n  "risk_alert": "...",\n  "opportunity": "..."\n}\n\nRules:\n- bullets: 5-7 items, crisp, numeric, actionable\n- risk_alert: a single sentence (or "None")\n- opportunity: a single sentence\n- No markdown, no extra keys, no prose outside JSON\n\nDATA (last 24h unless noted):\n- leads_24h: ${briefData.leads_24h}\n- lead_temperature: ${JSON.stringify(briefData.lead_temperature)}\n- total_calls_24h: ${briefData.total_calls_24h}\n- missed_calls_24h: ${briefData.missed_calls_24h}\n- active_clients: ${briefData.active_clients}\n- mrr_cents: ${briefData.mrr_cents}\n- revenue_invoiced_this_month_cents: ${briefData.revenue_invoiced_this_month_cents}\n- ai_cost_24h_cents: ${briefData.ai_cost_24h_cents}\n- ai_cost_30d_avg_cents: ${briefData.ai_cost_30d_avg_cents}\n- top_lead_sources: ${JSON.stringify(briefData.top_lead_sources)}\n- pending_actions: ${briefData.pending_actions}`;

  return await aiChat({
    messages: [{ role: "user", content: prompt }],
    purpose: "ceo_daily_brief",
    max_tokens: 900,
  });
}

function createFallbackBrief(briefData: BriefData): { bullets: string[]; risk_alert: string | null; opportunity: string | null } {
  const bullets = [
    `${briefData.leads_24h} new leads in the last 24h`,
    `${briefData.active_clients} active clients (MRR: $${(briefData.mrr_cents / 100).toFixed(2)})`,
    `${briefData.missed_calls_24h} missed calls out of ${briefData.total_calls_24h} total calls`,
    `Invoiced this month: $${(briefData.revenue_invoiced_this_month_cents / 100).toFixed(2)}`,
    `${briefData.pending_actions} items pending in action queue / decisions`,
  ];

  const risk_alert = briefData.missed_calls_24h > 5
    ? `${briefData.missed_calls_24h} missed calls may indicate revenue leakage.`
    : null;

  const opportunity = briefData.lead_temperature.hot > 0
    ? `${briefData.lead_temperature.hot} hot leads are ready for immediate follow-up.`
    : null;

  return { bullets, risk_alert, opportunity };
}

function parseBriefJsonOrFallback(
  aiText: string,
  briefData: BriefData,
): { bullets: string[]; risk_alert: string | null; opportunity: string | null }
{
  try {
    let text = aiText.trim();
    if (text.startsWith("```")) {
      text = text.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
    }
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("bad_json");

    const bullets = Array.isArray(parsed.bullets) ? parsed.bullets.map(String).slice(0, 7) : [];
    const risk_alert = parsed.risk_alert === null ? null : String(parsed.risk_alert ?? "None");
    const opportunity = parsed.opportunity === null ? null : String(parsed.opportunity ?? "None");

    if (bullets.length === 0) throw new Error("no_bullets");

    return {
      bullets,
      risk_alert: risk_alert === "None" ? null : risk_alert,
      opportunity: opportunity === "None" ? null : opportunity,
    };
  } catch {
    return createFallbackBrief(briefData);
  }
}

async function generateTenantBriefAndCache(supabase: SupabaseClient, tenantId: string): Promise<BriefData> {
  const now = new Date();
  const briefData = await aggregateTenantData(supabase, tenantId);
  const industry = await getBusinessIndustry(supabase, tenantId);

  let aiResponse: AIChatResponse | null = null;
  try {
    aiResponse = await generateAIBrief(briefData, industry);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const parsed = parseAiErrorMessage(message);

    if (parsed?.code === "CONFIG_ERROR") {
      const missing = inferMissingSecretFromAiMessage(parsed.msg);
      if (missing) throw new MissingSecretError(missing);
    }

    console.error("[ceo-scheduler] AI generation failed; using fallback", { tenant_id: tenantId, code: parsed?.code });
  }

  const briefContent = aiResponse
    ? parseBriefJsonOrFallback(aiResponse.text, briefData)
    : createFallbackBrief(briefData);

  const cacheKey = `ceo_daily_brief_${tenantId}`;
  const { error: cacheError } = await supabase.from("agent_shared_state").upsert(
    {
      key: cacheKey,
      value: {
        generated_at: now.toISOString(),
        tenant_id: tenantId,
        bullets: briefContent.bullets,
        risk_alert: briefContent.risk_alert,
        opportunity: briefContent.opportunity,
        data_snapshot: briefData,
      },
      category: "ceo_brief",
      expires_at: new Date(now.getTime() + DAILY_BRIEF_TTL_MS).toISOString(),
    },
    { onConflict: "key" },
  );

  if (cacheError) {
    console.error("[ceo-scheduler] Failed to cache daily brief", { tenant_id: tenantId, message: cacheError.message });
  }

  // Track cost (tenant-scoped) if AI ran
  if (aiResponse) {
    const tokensUsed = aiResponse.usage?.total_tokens || 0;
    const costCents = estimateCostCents(aiResponse.provider, aiResponse.model, aiResponse.usage);

    const { error: costError } = await supabase.from("agent_cost_tracking").insert({
      agent_type: "ceo-scheduler",
      purpose: "ceo_daily_brief",
      model: aiResponse.model,
      provider: aiResponse.provider,
      api_calls: 1,
      tokens_used: tokensUsed,
      cost_cents: costCents,
      tenant_id: tenantId,
    });

    if (costError) {
      console.error("[ceo-scheduler] Failed to record AI cost", { tenant_id: tenantId, message: costError.message });
    }
  }

  return briefData;
}

async function runCostRollup(supabase: SupabaseClient): Promise<Response> {
  const started = Date.now();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const { data: costs, error } = await supabase
    .from("agent_cost_tracking")
    .select("tenant_id, agent_type, purpose, provider, cost_cents, tokens_used")
    .gte("created_at", thirtyDaysAgo.toISOString());

  if (error) {
    console.error("[ceo-scheduler] Cost rollup query failed", { message: error.message });
    return jsonResponse({ error: "Failed to compute cost rollup" }, 500);
  }

  const byTenant: Record<string, CostRollup> = {};
  let unassignedRows = 0;

  for (const row of (costs || []) as Array<{ tenant_id?: string | null; agent_type?: string | null; purpose?: string | null; provider?: string | null; cost_cents?: unknown; tokens_used?: unknown }>) {
    if (!row.tenant_id) {
      unassignedRows++;
      continue;
    }

    const tid = row.tenant_id;
    if (!byTenant[tid]) {
      byTenant[tid] = { total_cents: 0, total_tokens: 0, by_agent: {}, by_purpose: {}, by_provider: {} };
    }

    const cost = Math.round(toNumber(row.cost_cents));
    const tokens = Math.round(toNumber(row.tokens_used));

    byTenant[tid].total_cents += cost;
    byTenant[tid].total_tokens += tokens;

    const agent = row.agent_type || "unknown";
    byTenant[tid].by_agent[agent] = (byTenant[tid].by_agent[agent] || 0) + cost;

    const purpose = row.purpose || "unknown";
    byTenant[tid].by_purpose[purpose] = (byTenant[tid].by_purpose[purpose] || 0) + cost;

    const provider = row.provider || "unknown";
    byTenant[tid].by_provider[provider] = (byTenant[tid].by_provider[provider] || 0) + cost;
  }

  // Cache per tenant ONLY (no global/unassigned cache keys)
  for (const [tenantId, rollup] of Object.entries(byTenant)) {
    const cacheKey = `ceo_cost_rollup_${tenantId}`;
    const { error: cacheError } = await supabase.from("agent_shared_state").upsert(
      {
        key: cacheKey,
        value: { ...rollup, tenant_id: tenantId, generated_at: new Date().toISOString() },
        category: "ceo_cost",
        expires_at: new Date(Date.now() + COST_ROLLUP_TTL_MS).toISOString(),
      },
      { onConflict: "key" },
    );

    if (cacheError) {
      console.error("[ceo-scheduler] Failed to cache cost rollup", { tenant_id: tenantId, message: cacheError.message });
    }
  }

  const duration = Date.now() - started;
  await logJobRun(supabase, null, "cost_rollup", "success", null, duration, {
    tenants_processed: Object.keys(byTenant).length,
    unassigned_rows: unassignedRows,
  });

  return jsonResponse({
    success: true,
    duration_ms: duration,
    tenants_processed: Object.keys(byTenant).length,
    unassigned_rows: unassignedRows,
  });
}

async function checkJobStatus(supabase: SupabaseClient): Promise<Response> {
  const { data: jobs, error } = await supabase
    .from("ceo_job_runs")
    .select("id, created_at, tenant_id, job_type, status, error, duration_ms")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[ceo-scheduler] Job status query failed", { message: error.message });
    return jsonResponse({ error: "Failed to fetch job status" }, 500);
  }

  const summary: Record<string, { total: number; success: number; failed: number; skipped: number }> = {};
  for (const job of (jobs || []) as Array<{ job_type: string; status: string }>) {
    const jt = job.job_type;
    if (!summary[jt]) summary[jt] = { total: 0, success: 0, failed: 0, skipped: 0 };
    summary[jt].total++;
    if (job.status === "success") summary[jt].success++;
    else if (job.status === "failed") summary[jt].failed++;
    else if (job.status === "skipped") summary[jt].skipped++;
  }

  return jsonResponse({ summary, recent_jobs: jobs?.slice(0, 10) });
}

async function logJobRun(
  supabase: SupabaseClient,
  tenantId: string | null,
  jobType: string,
  status: string,
  error: string | null,
  durationMs: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { error: insertError } = await supabase.from("ceo_job_runs").insert({
    tenant_id: tenantId,
    job_type: jobType,
    status,
    error,
    duration_ms: durationMs,
    metadata,
  });

  if (insertError) {
    console.error("[ceo-scheduler] Failed to log job run", { message: insertError.message, job_type: jobType, status });
  }
}
