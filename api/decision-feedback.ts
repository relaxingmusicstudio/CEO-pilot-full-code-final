import { clampConfidence, type DecisionStatus } from "../src/kernel/decisionContract";
import {
  isValidDecisionId,
  isValidFeedbackOutcome,
  type FeedbackOutcome,
  VALID_FEEDBACK_OUTCOMES,
} from "../src/lib/decisionValidation";

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

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
type RequiredEnvKey = (typeof REQUIRED_ENV)[number];

type FeedbackPayload = {
  decision_id?: unknown;
  outcome?: unknown;
  notes?: unknown;
};

const MAX_PREVIEW = 200;

const outcomeStatusMap: Record<FeedbackOutcome, DecisionStatus> = {
  worked: "confirmed",
  didnt_work: "failed",
  unknown: "acted",
};

const outcomeDbStatusMap: Record<FeedbackOutcome, string> = {
  worked: "executed",
  didnt_work: "executed",
  unknown: "executed",
};

const outcomeConfidenceDelta: Record<FeedbackOutcome, number> = {
  worked: 0.05,
  didnt_work: -0.2,
  unknown: 0,
};

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

const parseJson = (raw: string) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const getEnvStatus = () => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const present = REQUIRED_ENV.reduce<Record<RequiredEnvKey, boolean>>((acc, key) => {
    acc[key] = Boolean(env?.[key]);
    return acc;
  }, {} as Record<RequiredEnvKey, boolean>);
  const missing = REQUIRED_ENV.filter((key) => !env?.[key]);
  return { env, present, missing };
};

const buildRestHeaders = (serviceRoleKey: string) => ({
  "Content-Type": "application/json",
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  Prefer: "return=representation",
});

const requestSupabase = async (
  url: string,
  options: { method: string; body?: unknown },
  serviceRoleKey: string
) => {
  const headers = buildRestHeaders(serviceRoleKey);
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: options.method,
    headers,
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(url, init);
  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "unknown";
  return { response, raw, contentType, host: parseHost(url) };
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
        page_url: "/api/decision-feedback",
      }),
    });
    const raw = await response.text();
    if (!response.ok) {
      console.error("[api/decision-feedback] Analytics upstream error.", {
        host,
        status: response.status,
        bodyPreview: truncateLog(raw ?? ""),
      });
      return { ok: false, error: `upstream_error:${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "analytics_exception";
    console.error("[api/decision-feedback] Analytics exception.", {
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

  const body = (await readJsonBody(req)) as FeedbackPayload | null;
  const decisionId = typeof body?.decision_id === "string" ? body.decision_id.trim() : "";
  const outcomeInput = typeof body?.outcome === "string" ? body.outcome.trim() : "";
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";

  if (!decisionId) {
    sendJson(res, 400, { ok: false, code: "bad_request", error: "decision_id is required" });
    return;
  }

  if (!isValidDecisionId(decisionId)) {
    sendJson(res, 400, {
      ok: false,
      code: "bad_request",
      error: "decision_id must be a non-zero UUID",
    });
    return;
  }

  if (!isValidFeedbackOutcome(outcomeInput)) {
    sendJson(res, 400, {
      ok: false,
      code: "bad_request",
      error: `outcome must be ${VALID_FEEDBACK_OUTCOMES.join(", ")}`,
    });
    return;
  }

  const outcome = outcomeInput as FeedbackOutcome;
  const { env, missing } = getEnvStatus();
  const supabaseUrl = stripEnvValue(env?.SUPABASE_URL);
  const serviceRoleKey = stripEnvValue(env?.SUPABASE_SERVICE_ROLE_KEY);

  if (missing.length > 0 || !supabaseUrl || !serviceRoleKey) {
    sendJson(res, 500, {
      ok: false,
      code: "missing_env",
      error: "Supabase env missing",
      hint: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    });
    return;
  }

  if (!isValidSupabaseUrl(supabaseUrl)) {
    sendJson(res, 500, {
      ok: false,
      code: "missing_env",
      error: "Supabase URL invalid",
      hint: "SUPABASE_URL must be https://<project>.supabase.co",
    });
    return;
  }

  const baseUrl = normalizeSupabaseUrl(supabaseUrl);
  const decisionQuery = encodeURIComponent(decisionId);
  const selectUrl = `${baseUrl}/rest/v1/ceo_decisions?id=eq.${decisionQuery}&select=id,confidence,status`;
  const now = new Date().toISOString();

  let baseConfidence = 0;
  try {
    const { response, raw, host } = await requestSupabase(
      selectUrl,
      { method: "GET" },
      serviceRoleKey
    );
    if (!response.ok) {
      console.error("[api/decision-feedback] Supabase read error.", {
        host,
        status: response.status,
        bodyPreview: truncateLog(raw ?? ""),
      });
      sendJson(res, 500, {
        ok: false,
        code: "upstream_error",
        error: "supabase_read_failed",
        hint: `status:${response.status}`,
      });
      return;
    }

    const parsed = parseJson(raw);
    const existing = Array.isArray(parsed) ? parsed[0] : null;
    if (!existing) {
      sendJson(res, 400, {
        ok: false,
        code: "bad_request",
        error: "decision_id not found",
        hint: "Call /api/search-decision first",
      });
      return;
    }
    baseConfidence = typeof existing.confidence === "number" ? existing.confidence : 0;
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      code: "upstream_error",
      error: error instanceof Error ? error.message : "supabase_read_failed",
      hint: "read_exception",
    });
    return;
  }

  const confidenceDelta = outcomeConfidenceDelta[outcome];
  const confidenceCurrent = clampConfidence(baseConfidence + confidenceDelta);
  const updatedStatus = outcomeStatusMap[outcome];

  const updatePayload = {
    status: outcomeDbStatusMap[outcome],
    executed_at: now,
    confidence: confidenceCurrent,
    actual_outcome: {
      outcome,
      notes: notes || null,
      updated_at: now,
      confidence_base: baseConfidence,
      confidence_delta: confidenceDelta,
      confidence_current: confidenceCurrent,
    },
  };

  try {
    const updateUrl = `${baseUrl}/rest/v1/ceo_decisions?id=eq.${decisionQuery}`;
    const { response, raw, host } = await requestSupabase(
      updateUrl,
      { method: "PATCH", body: updatePayload },
      serviceRoleKey
    );
    if (!response.ok) {
      console.error("[api/decision-feedback] Supabase update error.", {
        host,
        status: response.status,
        bodyPreview: truncateLog(raw ?? ""),
      });
      sendJson(res, 500, {
        ok: false,
        code: "upstream_error",
        error: "supabase_update_failed",
        hint: `status:${response.status}`,
      });
      return;
    }
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      code: "upstream_error",
      error: error instanceof Error ? error.message : "supabase_update_failed",
      hint: "update_exception",
    });
    return;
  }

  const analyticsResult = await recordAnalyticsEvent(
    outcome === "worked"
      ? "decision_confirmed"
      : outcome === "didnt_work"
        ? "decision_failed"
        : "decision_unknown",
    {
      decision_id: decisionId,
      notes_length: notes.length,
    }
  );

  const payload: Record<string, unknown> = {
    ok: true,
    decision_id: decisionId,
    outcome,
    updated_status: updatedStatus,
    confidence_adjustment: {
      base: baseConfidence,
      delta: confidenceDelta,
      current: confidenceCurrent,
    },
    analytics_ok: analyticsResult.ok,
  };
  if (!analyticsResult.ok) {
    payload.analytics_error = analyticsResult.error ?? "analytics_failed";
  }

  sendJson(res, 200, payload);
}
