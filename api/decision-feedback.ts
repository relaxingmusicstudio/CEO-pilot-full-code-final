import type { DecisionStatus } from "../src/kernel/decisionContract";
import { recordOutcome } from "../src/lib/decisionStore";

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

type FeedbackPayload = {
  decision_id?: unknown;
  outcome?: unknown;
  notes?: unknown;
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
  const outcome = typeof body?.outcome === "string" ? body.outcome.trim() : "";
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";

  if (!decisionId) {
    sendJson(res, 400, { ok: false, code: "bad_request", error: "decision_id is required" });
    return;
  }

  if (outcome !== "worked" && outcome !== "didnt_work" && outcome !== "unknown") {
    sendJson(res, 400, {
      ok: false,
      code: "bad_request",
      error: "outcome must be worked, didnt_work, or unknown",
    });
    return;
  }

  const recorded = recordOutcome(decisionId, outcome as "worked" | "didnt_work" | "unknown", notes);
  if (!recorded) {
    sendJson(res, 404, { ok: false, code: "decision_not_found", error: "decision not found" });
    return;
  }

  const updatedStatus = recorded.outcome.status as DecisionStatus;

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
      base: recorded.outcome.confidence_base,
      delta: recorded.outcome.confidence_delta,
      current: recorded.outcome.confidence_current,
    },
    analytics_ok: analyticsResult.ok,
  };
  if (!analyticsResult.ok) {
    payload.analytics_error = analyticsResult.error ?? "analytics_failed";
  }

  sendJson(res, 200, payload);
}
