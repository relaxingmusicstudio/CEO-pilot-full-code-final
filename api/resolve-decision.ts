import { clampConfidence as clampLegacyConfidence, nowIso, type Decision } from "../src/contracts/decision";
import { clampConfidence, type Decision as KernelDecision } from "../src/kernel/decisionContract";
import { recordDecision } from "../src/lib/decisionStore";

export const config = { runtime: "nodejs" };

type ApiRequest = AsyncIterable<Uint8Array | string> & {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

type ResolvePayload = {
  query?: unknown;
  context?: unknown;
};

const MAX_PREVIEW = 200;

const setCorsHeaders = (res: ApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
};

const sendJson = (res: ApiResponse, status: number, payload: Record<string, unknown>) => {
  res.statusCode = status;
  setCorsHeaders(res);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
};

const readJsonBody = async (req: ApiRequest) => {
  if (req?.body && typeof req.body === "object") {
    return req.body;
  }
  let raw = "";
  for await (const chunk of req) {
    if (typeof chunk === "string") {
      raw += chunk;
      continue;
    }
    raw += new TextDecoder().decode(chunk);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const stripEnvValue = (value: string | undefined) => value?.trim().replace(/^"|"$|^'|'$/g, "");

const normalizeSupabaseUrl = (url: string) => (url.endsWith("/") ? url.slice(0, -1) : url);

const parseHost = (value: string) => {
  try {
    return new URL(value).host;
  } catch {
    return "unknown";
  }
};

const isValidSupabaseUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.host);
  } catch {
    return false;
  }
};

const truncateLog = (raw: string) => (raw.length > MAX_PREVIEW ? `${raw.slice(0, MAX_PREVIEW)}...` : raw);

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

const createUuid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const buildDecisionId = () => createUuid();

const buildRecommendation = (query: string) => {
  const lower = query.toLowerCase();
  if (lower.includes("prospect") || lower.includes("lead") || lower.includes("scrape")) {
    return `Run a 10-result test search for "${query}" and refine the keywords before scaling.`;
  }
  if (lower.includes("ad") || lower.includes("ads") || lower.includes("campaign")) {
    return `Pause all but one "${query}" campaign and review the last 7 days of ROAS before reallocating budget.`;
  }
  return `Define a single measurable outcome for "${query}" and complete the first 60-minute task today.`;
};

const buildNextAction = (query: string) =>
  `Draft the first concrete task for "${query}" and schedule it within the next 24 hours.`;

const buildReasoning = (context: string) =>
  context
    ? "Used the query and provided context to pick a fast, low-risk next step."
    : "Used the query alone to pick a fast, low-risk next step.";

const buildAssumptions = (context: string) => [
  "You can execute one small action without new approvals.",
  context ? "The provided context reflects current constraints." : "No additional constraints were provided.",
];

export const buildDecision = (query: string, context: string): Decision => {
  let confidence = 55;
  if (context) confidence += 10;
  if (query.length > 32) confidence += 5;
  confidence = clampLegacyConfidence(confidence);

  const uncertainty_notes =
    confidence < 60 ? ["Limited context; validate with a small test before scaling."] : [];

  return {
    decision_id: buildDecisionId(),
    query,
    recommendation: buildRecommendation(query),
    reasoning: buildReasoning(context),
    assumptions: buildAssumptions(context),
    confidence,
    uncertainty_notes,
    next_action: buildNextAction(query),
    status: "proposed",
    created_at: nowIso(),
  };
};

const recordAnalyticsEvent = async (eventType: string, eventData: Record<string, unknown>) => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const supabaseUrl = stripEnvValue(env?.SUPABASE_URL);
  const serviceRoleKey = stripEnvValue(env?.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, error: "analytics_env_missing" };
  }
  if (!isValidSupabaseUrl(supabaseUrl)) {
    return { ok: false, error: "analytics_env_invalid" };
  }

  const targetUrl = `${normalizeSupabaseUrl(supabaseUrl)}/rest/v1/analytics_events`;
  const host = parseHost(targetUrl);

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        event_type: eventType,
        event_data: eventData,
        page_url: "/api/resolve-decision",
      }),
    });
    const raw = await response.text();
    if (!response.ok) {
      console.error("[api/resolve-decision] Analytics upstream error.", {
        host,
        status: response.status,
        bodyPreview: truncateLog(raw ?? ""),
      });
      return { ok: false, error: `upstream_error:${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "analytics_exception";
    console.error("[api/resolve-decision] Analytics exception.", {
      host,
      message,
    });
    return { ok: false, error: message };
  }
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, code: "method_not_allowed", error: "Method not allowed" });
    return;
  }

  const body = (await readJsonBody(req)) as ResolvePayload | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const context = typeof body?.context === "string" ? body.context.trim() : "";

  if (!query) {
    sendJson(res, 400, { ok: false, code: "bad_request", error: "query is required" });
    return;
  }

  const decision = buildDecision(query, context);
  const inputHash = hashString(`${query}|${context}`);
  const statusMap: Record<Decision["status"], KernelDecision["status"]> = {
    proposed: "proposed",
    acted: "acted",
    confirmed: "confirmed",
    failed: "failed",
    unknown: "acted",
  };
  const kernelDecision: KernelDecision = {
    decision_id: decision.decision_id,
    input_hash: inputHash,
    recommendation: decision.recommendation,
    reasoning: decision.reasoning,
    assumptions: decision.assumptions,
    confidence: clampConfidence(decision.confidence / 100),
    status: statusMap[decision.status],
    created_at: decision.created_at,
  };
  recordDecision(kernelDecision);

  const analyticsResult = await recordAnalyticsEvent("decision_proposed", {
    decision_id: decision.decision_id,
    confidence: decision.confidence,
  });

  const payload: Record<string, unknown> = {
    ok: true,
    decision,
    analytics_ok: analyticsResult.ok,
  };
  if (!analyticsResult.ok) {
    payload.analytics_error = analyticsResult.error ?? "analytics_failed";
  }

  sendJson(res, 200, payload);
}
