import { jsonErr, jsonOk, safeHandler, type ApiRequest, type ApiResponse } from "../src/kernel/apiJson.js";
import { ErrorCode } from "../src/kernel/errorCodes.js";
import { KERNEL_VERSION } from "../src/kernel/version.js";

export const config = { runtime: "nodejs" };

const getSha = () =>
  process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || null;

const stripEnvValue = (value: string | undefined) => value?.trim().replace(/^"|"$|^'|'$/g, "");

const normalizeSupabaseUrl = (url: string) => (url.endsWith("/") ? url.slice(0, -1) : url);

const isValidSupabaseUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.host);
  } catch {
    return false;
  }
};

const buildRestHeaders = (serviceRoleKey: string) => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
});

type DbCheck = {
  ok: boolean;
  reason: string | null;
  hint: string | null;
  statusCode: number | null;
  latencyMs: number | null;
};

const checkDb = async (supabaseUrl: string | undefined, serviceRoleKey: string | undefined): Promise<DbCheck> => {
  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      reason: "missing_env",
      hint: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      statusCode: null,
      latencyMs: null,
    };
  }
  if (!isValidSupabaseUrl(supabaseUrl)) {
    return {
      ok: false,
      reason: "invalid_env",
      hint: "SUPABASE_URL must be a valid https URL.",
      statusCode: null,
      latencyMs: null,
    };
  }
  try {
    const baseUrl = normalizeSupabaseUrl(supabaseUrl);
    const healthUrl = `${baseUrl}/rest/v1/events?select=id&limit=1`;
    const started = Date.now();
    const response = await fetch(healthUrl, {
      method: "GET",
      headers: buildRestHeaders(serviceRoleKey),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      return {
        ok: false,
        reason: `status:${response.status}`,
        hint: "Supabase returned a non-200 response.",
        statusCode: response.status,
        latencyMs,
      };
    }
    return {
      ok: true,
      reason: null,
      hint: null,
      statusCode: response.status,
      latencyMs,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "fetch_failed",
      hint: "Supabase request failed.",
      statusCode: null,
      latencyMs: null,
    };
  }
};

const buildHealthPayload = async () => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const supabaseUrl = stripEnvValue(env?.SUPABASE_URL);
  const serviceRoleKey = stripEnvValue(env?.SUPABASE_SERVICE_ROLE_KEY);
  const dbCheck = await checkDb(supabaseUrl, serviceRoleKey);

  const status = dbCheck.ok ? "ok" : "degraded";

  return {
    service: "march-project",
    serviceAlias: "ceo-pilot",
    kernelVersion: KERNEL_VERSION,
    ts: new Date().toISOString(),
    status,
    sha: getSha(),
    upstreamStatus: dbCheck.statusCode,
    latencyMs: dbCheck.latencyMs,
    reason: dbCheck.ok ? null : dbCheck.reason,
    hint: dbCheck.ok ? null : dbCheck.hint,
    db: dbCheck.ok,
    ...(dbCheck.ok ? {} : { db_error: dbCheck.reason }),
  };
};

const handler = async (req: ApiRequest, res: ApiResponse) => {
  const method = req.method?.toUpperCase() || "GET";
  if (method !== "GET" && method !== "HEAD") {
    jsonErr(res, 405, ErrorCode.METHOD_NOT_ALLOWED, "method_not_allowed");
    return;
  }

  jsonOk(res, await buildHealthPayload());
};

export default safeHandler(handler);
