import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat, estimateCostCents, AIChatResponse } from "../_shared/ai.ts";

/**
 * CEO Daily Brief Generator
 *
 * HARD RULES:
 * - MUST require a valid tenant_id resolved from the user JWT (via anon client + rpc('get_user_tenant_id')).
 * - If tenant cannot be resolved, return 401 (no global mode).
 * - Service role client is allowed ONLY after tenant_id is known.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Constants
const RATE_LIMIT_ACTION = "brief_refresh";
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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
  // Lead lifecycle metrics
  booked_calls_24h: number;
  unreachable_leads_24h: number;
  conversion_rate_7d: number;
  lead_status_counts: Record<string, number>;
}

interface DailyBrief {
  generated_at: string;
  tenant_id: string;
  bullets: string[];
  risk_alert: string | null;
  opportunity: string | null;
  data_snapshot: BriefData;
}

class MissingSecretError extends Error {
  secretName: string;
  constructor(secretName: string) {
    super(`Missing required secret: ${secretName}`);
    this.secretName = secretName;
  }
}

class UnauthorizedTenantError extends Error {
  constructor() {
    super("Valid authentication with tenant association required");
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

function unauthorizedResponse(): Response {
  return jsonResponse(
    {
      error: "Unauthorized",
      message: "Valid authentication with tenant association required",
    },
    401,
  );
}

function parseBearerAuthorizationHeader(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return `Bearer ${m[1]}`;
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

/**
 * REQUIRED TENANT AUTH PATTERN:
 * - Extract JWT from Authorization: Bearer <token>
 * - Create anon "user-context" client with that Authorization header
 * - Call rpc('get_user_tenant_id') on that user-context client
 * - If null/error -> 401
 */
async function getTenantIdFromAuth(req: Request): Promise<string> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseAnonKey = requireEnv("SUPABASE_ANON_KEY");
  const authorization = parseBearerAuthorizationHeader(req);

  if (!authorization) throw new UnauthorizedTenantError();

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data, error } = await userClient.rpc("get_user_tenant_id");
  if (error || !data) throw new UnauthorizedTenantError();
  return data as string;
}

async function checkRateLimit(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ allowed: boolean; remaining: number }>
{
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

  const { count, error } = await supabase
    .from("ceo_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("action_type", RATE_LIMIT_ACTION)
    .gte("created_at", windowStart);

  if (error) {
    // Conservative behavior: if we can't check rate limits, treat as internal error.
    console.error("[ceo-daily-brief] Rate limit check failed", { tenant_id: tenantId, message: error.message });
    throw new Error("RATE_LIMIT_CHECK_FAILED");
  }

  const current = count || 0;
  if (current >= RATE_LIMIT_MAX) return { allowed: false, remaining: 0 };
  return { allowed: true, remaining: RATE_LIMIT_MAX - current };
}

async function recordRateLimitUsage(supabase: SupabaseClient, tenantId: string): Promise<void> {
  const { error } = await supabase.from("ceo_rate_limits").insert({
    tenant_id: tenantId,
    action_type: RATE_LIMIT_ACTION,
  });

  if (error) {
    console.error("[ceo-daily-brief] Failed to record rate limit usage", { tenant_id: tenantId, message: error.message });
  }
}

async function aggregateTenantData(supabase: SupabaseClient, tenantId: string): Promise<BriefData> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
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
    bookedLeadsResult,
    unreachableLeadsResult,
    converted7dResult,
    total7dLeadsResult,
    allLeadsStatusResult,
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
    // Lead lifecycle queries
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "booked")
      .gte("booked_at", yesterday.toISOString()),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "unreachable")
      .gte("updated_at", yesterday.toISOString()),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "converted")
      .gte("converted_at", sevenDaysAgo.toISOString()),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", sevenDaysAgo.toISOString()),
    supabase
      .from("leads")
      .select("status")
      .eq("tenant_id", tenantId),
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

  // mrr is numeric in DB; supabase-js often returns numeric as string
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

  // Calculate lead status counts
  const leadStatusCounts: Record<string, number> = {
    new: 0, attempted: 0, contacted: 0, booked: 0,
    completed: 0, converted: 0, disqualified: 0, unreachable: 0,
  };
  for (const lead of (allLeadsStatusResult.data || []) as Array<{ status?: string | null }>) {
    const status = (lead.status || "new").toLowerCase();
    if (leadStatusCounts[status] !== undefined) {
      leadStatusCounts[status]++;
    }
  }

  // Calculate conversion rate (7d)
  const total7d = total7dLeadsResult.count || 0;
  const converted7d = converted7dResult.count || 0;
  const conversionRate7d = total7d > 0 ? Math.round((converted7d / total7d) * 100) : 0;

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
    booked_calls_24h: bookedLeadsResult.count || 0,
    unreachable_leads_24h: unreachableLeadsResult.count || 0,
    conversion_rate_7d: conversionRate7d,
    lead_status_counts: leadStatusCounts,
  };
}

async function getBusinessIndustry(supabase: SupabaseClient, tenantId: string): Promise<string> {
  const { data, error } = await supabase
    .from("business_profile")
    .select("industry")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("[ceo-daily-brief] Failed to fetch business_profile industry", { tenant_id: tenantId, message: error.message });
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const tenantId = await getTenantIdFromAuth(req);

    // Service role client for tenant-filtered reads/writes
    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const { force_refresh = false } = await req.json().catch(() => ({}));

    const cacheKey = `ceo_daily_brief_${tenantId}`;

    // Cache check first (unless force_refresh)
    if (!force_refresh) {
      const { data: cached, error } = await supabase
        .from("agent_shared_state")
        .select("value, updated_at, expires_at")
        .eq("key", cacheKey)
        .maybeSingle();

      if (error) {
        console.error("[ceo-daily-brief] Cache lookup failed", { tenant_id: tenantId, message: error.message });
      }

      if (cached?.expires_at) {
        const expiresAt = new Date(cached.expires_at as string).getTime();
        if (Date.now() < expiresAt) {
          const cacheAgeHours = cached.updated_at
            ? (Date.now() - new Date(cached.updated_at as string).getTime()) / 3600000
            : null;

          return jsonResponse({
            ...(cached.value as Record<string, unknown>),
            from_cache: true,
            cache_age_hours: cacheAgeHours === null ? null : Math.round(cacheAgeHours * 10) / 10,
          });
        }
      }
    }

    // Rate limit only applies when force_refresh=true
    if (force_refresh) {
      const rate = await checkRateLimit(supabase, tenantId);
      if (!rate.allowed) {
        return jsonResponse(
          {
            error: "Rate limit exceeded",
            message: "Maximum 5 refreshes per hour",
            rate_limit: { max: RATE_LIMIT_MAX, remaining: 0, window_hours: 1 },
          },
          429,
        );
      }

      await recordRateLimitUsage(supabase, tenantId);
    }

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

      // For non-config AI errors, we degrade to deterministic fallback brief.
      console.error("[ceo-daily-brief] AI generation failed; using fallback", { tenant_id: tenantId, code: parsed?.code });
    }

    const briefContent = aiResponse
      ? parseBriefJsonOrFallback(aiResponse.text, briefData)
      : createFallbackBrief(briefData);

    const now = new Date();
    const dailyBrief: DailyBrief = {
      generated_at: now.toISOString(),
      tenant_id: tenantId,
      bullets: briefContent.bullets,
      risk_alert: briefContent.risk_alert,
      opportunity: briefContent.opportunity,
      data_snapshot: briefData,
    };

    // Cache with TTL
    const { error: cacheUpsertError } = await supabase.from("agent_shared_state").upsert(
      {
        key: cacheKey,
        value: dailyBrief,
        category: "ceo_brief",
        expires_at: new Date(now.getTime() + CACHE_TTL_MS).toISOString(),
      },
      { onConflict: "key" },
    );

    if (cacheUpsertError) {
      console.error("[ceo-daily-brief] Failed to cache brief", { tenant_id: tenantId, message: cacheUpsertError.message });
    }

    // Cost tracking (tenant-scoped)
    if (aiResponse) {
      const tokensUsed = aiResponse.usage?.total_tokens || 0;
      const costCents = estimateCostCents(aiResponse.provider, aiResponse.model, aiResponse.usage);

      const { error: costError } = await supabase.from("agent_cost_tracking").insert({
        agent_type: "ceo-daily-brief",
        purpose: "ceo_daily_brief",
        model: aiResponse.model,
        provider: aiResponse.provider,
        api_calls: 1,
        tokens_used: tokensUsed,
        cost_cents: costCents,
        avg_latency_ms: aiResponse.latency_ms || null,
        tenant_id: tenantId,
      });

      if (costError) {
        console.error("[ceo-daily-brief] Failed to record AI cost", { tenant_id: tenantId, message: costError.message });
      }
    }

    return jsonResponse({ ...dailyBrief, from_cache: false });
  } catch (error) {
    if (error instanceof MissingSecretError) {
      return jsonResponse({ error: `Missing required secret: ${error.secretName}` }, 500);
    }

    if (error instanceof UnauthorizedTenantError) {
      return unauthorizedResponse();
    }

    // Any other error: generic 500 without leaking details
    console.error("[ceo-daily-brief] Unhandled error", { message: error instanceof Error ? error.message : String(error) });
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
