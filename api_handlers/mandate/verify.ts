import { jsonErr, jsonOk } from "../../src/kernel/apiJson.js";
import { validateMandateToken } from "../../src/kernel/mandates.js";

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

const setCorsHeaders = (res: ApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    jsonOk(res, { status: 200 });
    return;
  }

  if (req.method !== "POST") {
    jsonErr(res, 405, "method_not_allowed", "method_not_allowed");
    return;
  }

  const body = await readJsonBody(req);
  if (!body || typeof body !== "object") {
    jsonErr(res, 400, "bad_json", "invalid_json");
    return;
  }

  const payload = body as Record<string, unknown>;
  const token = payload.token ?? null;
  const expectedIntent = typeof payload.expectedIntent === "string" ? payload.expectedIntent : undefined;
  const minApprovals = typeof payload.minApprovals === "number" ? payload.minApprovals : undefined;
  const minRiskLevel = typeof payload.minRiskLevel === "string" ? payload.minRiskLevel : undefined;

  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const secret = stripEnvValue(env?.SUPABASE_SERVICE_ROLE_KEY);
  if (!secret) {
    jsonErr(res, 500, "missing_env", "SUPABASE_SERVICE_ROLE_KEY is required");
    return;
  }

  const result = await validateMandateToken(token as never, {
    expectedIntent: expectedIntent as never,
    minApprovals,
    minRiskLevel: minRiskLevel as never,
    secret,
  });

  if (!result.ok) {
    jsonErr(res, 403, "mandate_invalid", "Mandate validation failed", { result });
    return;
  }

  jsonOk(res, { status: 200, result });
}
