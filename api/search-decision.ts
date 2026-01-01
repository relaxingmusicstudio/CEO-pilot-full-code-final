import { DEFAULT_DOMAINS } from "../apps/search-pilot/src/core/domains";
import { runSearch } from "../apps/search-pilot/src/core/engine";
import { recordDecision } from "../src/lib/decisionStore";
import type { Decision } from "../src/kernel/decisionContract";

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

type SearchPayload = {
  query?: unknown;
  domains?: unknown;
  mode?: unknown;
};

const setCorsHeaders = (res: ApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
};

const sendJson = (res: ApiResponse, status: number, payload: Record<string, unknown>) => {
  res.statusCode = status;
  setCorsHeaders(res);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
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

const getEnvStatus = () => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const present = REQUIRED_ENV.reduce<Record<RequiredEnvKey, boolean>>((acc, key) => {
    acc[key] = Boolean(env?.[key]);
    return acc;
  }, {} as Record<RequiredEnvKey, boolean>);
  const missing = REQUIRED_ENV.filter((key) => !env?.[key]);
  return { env, present, missing };
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

const allowedDomains = new Set(DEFAULT_DOMAINS);

const mapDecisionStatusToDb = (status: Decision["status"]) => (status === "failed" ? "cancelled" : "pending");

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const { env, present, missing } = getEnvStatus();

  if (req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      status: "ok",
      method: "GET",
      expected_methods: ["POST"],
      message: "Use POST with { query } to resolve a decision.",
      allowed_domains: DEFAULT_DOMAINS,
      env_present: present,
    });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, code: "method_not_allowed", error: "Method not allowed" });
    return;
  }

  const body = (await readJsonBody(req)) as SearchPayload | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) {
    sendJson(res, 400, { ok: false, code: "bad_request", error: "query is required" });
    return;
  }

  const domains =
    Array.isArray(body?.domains) && body.domains.every((domain) => typeof domain === "string")
      ? (body.domains as string[])
      : undefined;
  if (domains && domains.some((domain) => !allowedDomains.has(domain as (typeof DEFAULT_DOMAINS)[number]))) {
    sendJson(res, 400, {
      ok: false,
      code: "bad_request",
      error: "domains must be one of the allowed domain ids",
      allowed_domains: DEFAULT_DOMAINS,
    });
    return;
  }

  const mode = body?.mode === "live" ? "live" : "mock";

  const response = await runSearch(query, {
    domains: domains as (typeof DEFAULT_DOMAINS)[number][] | undefined,
    mode,
    latencyMs: 0,
  });

  recordDecision(response.decision);

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
  const host = parseHost(baseUrl);
  const insertUrl = `${baseUrl}/rest/v1/ceo_decisions?on_conflict=id&select=id`;
  const recordPayload = {
    id: response.decision.decision_id,
    decision: response.decision.recommendation,
    reasoning: response.decision.reasoning,
    confidence: response.decision.confidence,
    purpose: "search_decision",
    status: mapDecisionStatusToDb(response.decision.status),
    context_snapshot: {
      query,
      input_hash: response.decision.input_hash,
      assumptions: response.decision.assumptions,
      decision_status: response.decision.status,
      created_at: response.decision.created_at,
      domains: response.domains,
      evidence_summary: response.evidence_summary,
    },
  };

  try {
    const responseWrite = await fetch(insertUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "resolution=merge-duplicates, return=representation",
      },
      body: JSON.stringify(recordPayload),
    });

    if (!responseWrite.ok) {
      sendJson(res, 500, {
        ok: false,
        code: "upstream_error",
        error: "supabase_insert_failed",
        hint: `status:${responseWrite.status}`,
      });
      return;
    }
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      code: "upstream_error",
      error: error instanceof Error ? error.message : "supabase_insert_failed",
      hint: `host:${host}`,
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    decision: response.decision,
    evidence_summary: response.evidence_summary,
    intent: response.intent,
    domains: response.domains,
    explanation: response.explanation,
    analytics: response.analytics,
  });
}
