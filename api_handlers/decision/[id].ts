import { jsonErr, jsonOk } from "../../src/kernel/apiJson.js";
import { getDecision, getOutcome } from "../../src/lib/decisionStore.js";

export const config = { runtime: "nodejs" };

type ApiRequest = AsyncIterable<Uint8Array | string> & {
  method?: string;
  url?: string;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

const setCorsHeaders = (res: ApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
};

const sendJson = (res: ApiResponse, status: number, payload: Record<string, unknown>) => {
  setCorsHeaders(res);
  const isError = payload.ok === false || status >= 400;
  if (isError) {
    const errorCode =
      (typeof payload.errorCode === "string" && payload.errorCode) ||
      (typeof payload.code === "string" && payload.code) ||
      "error";
    const message =
      (typeof payload.error === "string" && payload.error) ||
      (typeof payload.message === "string" && payload.message) ||
      "error";
    jsonErr(res, status, errorCode, message, payload);
    return;
  }
  jsonOk(res, payload);
};

const extractDecisionId = (urlValue?: string): string | null => {
  if (!urlValue) return null;
  try {
    const url = new URL(urlValue, "http://localhost");
    const segments = url.pathname.split("/").filter(Boolean);
    const id = segments[segments.length - 1];
    return id || null;
  } catch {
    return null;
  }
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, code: "method_not_allowed", error: "Method not allowed" });
    return;
  }

  const decisionId = extractDecisionId(req.url);
  if (!decisionId) {
    sendJson(res, 400, { ok: false, code: "bad_request", error: "decision id is required" });
    return;
  }

  const decision = getDecision(decisionId);
  if (!decision) {
    sendJson(res, 404, { ok: false, code: "decision_not_found", error: "decision not found" });
    return;
  }

  const outcome = getOutcome(decisionId);
  const adjustments = outcome
    ? {
        base: outcome.confidence_base,
        delta: outcome.confidence_delta,
        current: outcome.confidence_current,
      }
    : { base: decision.confidence, delta: 0, current: decision.confidence };

  sendJson(res, 200, {
    ok: true,
    decision,
    outcome,
    confidence_adjustments: adjustments,
  });
}
