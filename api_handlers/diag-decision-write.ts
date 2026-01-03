import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";
import { buildNoopPayload, getKernelLockState } from "../src/kernel/governanceGate.js";

export const config = { runtime: "nodejs" };

type ApiRequest = AsyncIterable<Uint8Array | string> & {
  method?: string;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
type RequiredEnvKey = (typeof REQUIRED_ENV)[number];

const MAX_STACK = 2000;
const MAX_BODY_PREVIEW = 1200;

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

const normalizeSupabaseUrl = (url: string) => (url.endsWith("/") ? url.slice(0, -1) : url);

const parseHost = (value: string | undefined) => {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
};

const parseJson = (raw: string) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const truncatePreview = (raw: string) =>
  raw.length > MAX_BODY_PREVIEW ? `${raw.slice(0, MAX_BODY_PREVIEW)}...` : raw;

const getEnvStatus = () => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const present = REQUIRED_ENV.reduce<Record<RequiredEnvKey, boolean>>((acc, key) => {
    acc[key] = Boolean(env?.[key]);
    return acc;
  }, {} as Record<RequiredEnvKey, boolean>);
  const missing = REQUIRED_ENV.filter((key) => !env?.[key]);
  return { env, present, missing };
};

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    const stack = error.stack ?? "";
    const trimmedStack = stack.length > MAX_STACK ? `${stack.slice(0, MAX_STACK)}...` : stack;
    const cause =
      "cause" in error && error.cause !== undefined ? String((error as { cause?: unknown }).cause) : null;
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: trimmedStack,
      errorCause: cause,
    };
  }
  return {
    errorName: "unknown",
    errorMessage: String(error),
    errorStack: "",
    errorCause: null,
  };
};

const hasForbiddenWhitespace = (value: string) => /[\s\u00A0\u200B]/.test(value);

const isSupabaseHost = (value: string) => /^[a-z0-9-]+\.supabase\.co$/i.test(value);

const isMissingSchemaResponse = (status: number, raw: string) => {
  if (status !== 404 && status !== 400) return false;
  const parsed = parseJson(raw);
  if (parsed && typeof parsed === "object") {
    const code = typeof parsed.code === "string" ? parsed.code.toLowerCase() : "";
    const message = typeof parsed.message === "string" ? parsed.message.toLowerCase() : "";
    const hint = typeof parsed.hint === "string" ? parsed.hint.toLowerCase() : "";
    const details = typeof parsed.details === "string" ? parsed.details.toLowerCase() : "";
    const combined = `${code} ${message} ${hint} ${details}`;
    if (code === "pgrst205") return true;
    if (combined.includes("schema cache") || combined.includes("could not find the table")) return true;
    if (combined.includes("ceo_decisions")) return true;
  }
  const lowered = raw.toLowerCase();
  if (lowered.includes("pgrst205")) return true;
  if (lowered.includes("schema cache") || lowered.includes("could not find the table")) return true;
  return lowered.includes("ceo_decisions");
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const { env, present } = getEnvStatus();
  const isProduction = env?.VERCEL_ENV === "production" || env?.NODE_ENV === "production";
  const lockState = getKernelLockState({ isProduction });
  if (lockState.locked) {
    sendJson(res, 200, buildNoopPayload(lockState, "kernel_lock"));
    return;
  }
  const rawSupabaseUrl = env?.SUPABASE_URL ?? "";
  const rawLength = rawSupabaseUrl.length;
  const supabaseUrl = rawSupabaseUrl.trim();
  const trimmedLength = supabaseUrl.length;
  const serviceRoleKey = (env?.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const baseHint = "Paste Supabase Settings -> Data API -> Project URL exactly; no trailing slash/spaces";
  const urlHost = parseHost(supabaseUrl);

  if (req.method === "OPTIONS") {
    sendJson(res, 200, {
      ok: true,
      status: 200,
      urlHost,
      timingMs: 0,
      writeOk: true,
      errorCode: null,
      env_present: present,
      errorName: null,
      errorMessage: null,
      errorStack: null,
      errorCause: null,
    });
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, {
      ok: false,
      status: 405,
      urlHost,
      timingMs: 0,
      writeOk: false,
      errorCode: "method_not_allowed",
      code: "method_not_allowed",
      error: "Method not allowed",
      env_present: present,
      errorName: "method_not_allowed",
      errorMessage: "Method not allowed",
      errorStack: null,
      errorCause: null,
    });
    return;
  }

  if (!serviceRoleKey) {
    sendJson(res, 500, {
      ok: false,
      status: 500,
      urlHost,
      timingMs: 0,
      writeOk: false,
      errorCode: "missing_env",
      code: "missing_env",
      error: "Supabase env missing",
      env_present: present,
      errorName: "missing_env",
      errorMessage: "Supabase env missing",
      errorStack: null,
      errorCause: null,
    });
    return;
  }

  if (!supabaseUrl) {
    sendJson(res, 500, {
      ok: false,
      status: 500,
      errorCode: "bad_env",
      message: "Invalid SUPABASE_URL",
      rawLength,
      trimmedLength,
      urlHost: null,
      hint: baseHint,
      env_present: present,
    });
    return;
  }

  if (rawSupabaseUrl !== supabaseUrl) {
    sendJson(res, 500, {
      ok: false,
      status: 500,
      errorCode: "bad_env",
      message: "Invalid SUPABASE_URL",
      rawLength,
      trimmedLength,
      urlHost,
      hint: baseHint,
      env_present: present,
    });
    return;
  }

  if (hasForbiddenWhitespace(supabaseUrl)) {
    sendJson(res, 500, {
      ok: false,
      status: 500,
      errorCode: "bad_env",
      message: "Invalid SUPABASE_URL",
      rawLength,
      trimmedLength,
      urlHost,
      hint: baseHint,
      env_present: present,
    });
    return;
  }

  if (supabaseUrl.endsWith("/")) {
    sendJson(res, 500, {
      ok: false,
      status: 500,
      errorCode: "bad_env",
      message: "Invalid SUPABASE_URL",
      rawLength,
      trimmedLength,
      urlHost,
      hint: `Remove trailing slash. ${baseHint}`,
      env_present: present,
    });
    return;
  }

  let parsedUrl: URL | null = null;
  let parsedHost: string | null = urlHost;
  try {
    parsedUrl = new URL(supabaseUrl);
    parsedHost = parsedUrl.host;
  } catch {
    parsedUrl = null;
    parsedHost = null;
  }

  if (!parsedUrl || parsedUrl.protocol !== "https:") {
    sendJson(res, 500, {
      ok: false,
      status: 500,
      errorCode: "bad_env",
      message: "Invalid SUPABASE_URL",
      rawLength,
      trimmedLength,
      urlHost: parsedHost,
      hint: baseHint,
      env_present: present,
    });
    return;
  }

  if (!parsedHost || !isSupabaseHost(parsedHost)) {
    sendJson(res, 500, {
      ok: false,
      status: 500,
      errorCode: "bad_env",
      message: "Invalid SUPABASE_URL",
      rawLength,
      trimmedLength,
      urlHost: parsedHost,
      hint: baseHint,
      env_present: present,
    });
    return;
  }

  const baseUrl = normalizeSupabaseUrl(supabaseUrl);
  const targetUrl = `${baseUrl}/rest/v1/ceo_decisions?select=id`;
  const startedAt = Date.now();

  const payload = {
    decision: "diagnostic write check",
    reasoning: "Verify Supabase write access for decisions.",
    confidence: 0,
    purpose: "decision_diag",
    status: "cancelled",
    context_snapshot: {
      source: "diag-decision-write",
      created_at: new Date().toISOString(),
    },
  };

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const raw = await response.text();
      const missingSchema = isMissingSchemaResponse(response.status, raw);
      const status = missingSchema ? 500 : response.status;
      sendJson(res, status, {
        ok: false,
        status,
        urlHost,
        timingMs: Date.now() - startedAt,
        writeOk: false,
        errorCode: missingSchema ? "no_schema" : "upstream_error",
        code: missingSchema ? "no_schema" : "upstream_error",
        error: missingSchema ? "schema_missing" : "supabase_write_failed",
        hint: missingSchema
          ? "Apply Supabase migrations to create public.ceo_decisions."
          : `status:${response.status}`,
        bodyPreview: truncatePreview(raw ?? ""),
        env_present: present,
        errorName: missingSchema ? "no_schema" : "upstream_error",
        errorMessage: missingSchema ? "missing_table" : `status:${response.status}`,
        errorStack: null,
        errorCause: null,
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      status: 200,
      urlHost,
      timingMs: Date.now() - startedAt,
      writeOk: true,
      errorCode: null,
      env_present: present,
      errorName: null,
      errorMessage: null,
      errorStack: null,
      errorCause: null,
    });
  } catch (error) {
    const normalized = normalizeError(error);
    sendJson(res, 500, {
      ok: false,
      status: 500,
      urlHost,
      timingMs: Date.now() - startedAt,
      writeOk: false,
      errorCode: "upstream_error",
      code: "upstream_error",
      error: error instanceof Error ? error.message : "supabase_write_failed",
      env_present: present,
      ...normalized,
    });
  }
}
