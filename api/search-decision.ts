import { DEFAULT_DOMAINS } from "../apps/search-pilot/src/core/domains";
import { runSearch } from "../apps/search-pilot/src/core/engine";
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      status: "ok",
      method: "GET",
      expected_methods: ["POST"],
      message: "Use POST with { query } to resolve a decision.",
      allowed_domains: DEFAULT_DOMAINS,
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
