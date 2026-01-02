import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";

export const config = { runtime: "nodejs" };

type ApiRequest = AsyncIterable<Uint8Array | string> & {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
type RequiredEnvKey = (typeof REQUIRED_ENV)[number];

const MAX_BODY = 1200;
const COLUMN_CHECK_TIMEOUT_MS = 8000;
const ROUTE_CHECK_TIMEOUT_MS = 8000;

const TABLES_REQUIRED = ["visitors", "analytics_events", "user_consent", "conversations", "leads"] as const;
const VISITOR_COLUMNS_REQUIRED = [
  "visitor_id",
  "created_at",
  "updated_at",
  "user_agent",
  "browser_header",
  "first_seen_at",
  "last_seen_at",
] as const;

const setCorsHeaders = (res: ApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
};

const respondOk = (res: ApiResponse, data: Record<string, unknown> = {}) => {
  setCorsHeaders(res);
  jsonOk(res, data);
};

const respondErr = (
  res: ApiResponse,
  status: number,
  errorCode: string,
  message: string,
  extra: Record<string, unknown> = {}
) => {
  setCorsHeaders(res);
  jsonErr(res, status, errorCode, message, extra);
};

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

const truncateBody = (raw: string) => (raw.length > MAX_BODY ? raw.slice(0, MAX_BODY) : raw);

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
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
});

const extractHeaderValue = (value: string | string[] | undefined) => {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
};

const normalizeCommaHeader = (value: string | null) => {
  if (!value) return null;
  const [first] = value.split(",").map((item) => item.trim());
  return first || null;
};

const resolveBaseUrl = (headers?: Record<string, string | string[] | undefined>) => {
  if (!headers) return null;
  const forwardedProto = normalizeCommaHeader(extractHeaderValue(headers["x-forwarded-proto"]));
  const forwardedHost = normalizeCommaHeader(extractHeaderValue(headers["x-forwarded-host"]));
  const host = normalizeCommaHeader(extractHeaderValue(headers.host));
  const proto = forwardedProto ?? "https";
  const baseHost = forwardedHost ?? host ?? null;
  if (!baseHost) return null;
  return `${proto}://${baseHost}`;
};

const getTimeoutSignal = (timeoutMs: number) => {
  if (!("AbortSignal" in globalThis) || !("timeout" in AbortSignal)) return undefined;
  return AbortSignal.timeout(timeoutMs);
};

const checkRoute = async (baseUrl: string, path: string, method: string) => {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method,
    redirect: "manual",
    signal: getTimeoutSignal(ROUTE_CHECK_TIMEOUT_MS),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const location = response.headers.get("location") ?? null;
  const raw = await response.text();
  const jsonBody = parseJson(raw);
  const isJson =
    contentType.toLowerCase().includes("application/json") || (jsonBody !== null && typeof jsonBody === "object");
  const redirected = response.status >= 300 && response.status < 400;
  const ok = response.status >= 200 && response.status < 300 && isJson && !redirected;
  return {
    url,
    status: response.status,
    contentType: contentType || null,
    isJson,
    redirected,
    location,
    ok,
    bodyPreview: ok ? null : truncateBody(raw),
  };
};

const checkSupabaseConnection = async (baseUrl: string, serviceRoleKey: string) => {
  const url = `${baseUrl}/rest/v1/events?select=id&limit=1`;
  const response = await fetch(url, {
    method: "GET",
    headers: buildRestHeaders(serviceRoleKey),
    signal: getTimeoutSignal(ROUTE_CHECK_TIMEOUT_MS),
  });
  const raw = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "supabase_connection_failed",
      details: truncateBody(raw),
    };
  }
  return {
    ok: true,
    status: response.status,
  };
};

const checkTableExists = async (baseUrl: string, serviceRoleKey: string, table: string) => {
  const url = `${baseUrl}/rest/v1/${table}?select=*&limit=1`;
  const response = await fetch(url, {
    method: "GET",
    headers: buildRestHeaders(serviceRoleKey),
    signal: getTimeoutSignal(COLUMN_CHECK_TIMEOUT_MS),
  });
  const raw = await response.text();
  if (!response.ok) {
    const parsed = parseJson(raw);
    const message = typeof parsed?.message === "string" ? parsed.message : raw;
    const isMissing = response.status === 404 || /does not exist/i.test(message) || /schema cache/i.test(message);
    return {
      ok: false,
      exists: !isMissing,
      status: response.status,
      error: "table_check_failed",
      message: truncateBody(message),
    };
  }
  return {
    ok: true,
    exists: true,
    status: response.status,
  };
};

const checkColumnExists = async (baseUrl: string, serviceRoleKey: string, table: string, column: string) => {
  const url = `${baseUrl}/rest/v1/${table}?select=${encodeURIComponent(column)}&limit=1`;
  const response = await fetch(url, {
    method: "GET",
    headers: buildRestHeaders(serviceRoleKey),
    signal: getTimeoutSignal(COLUMN_CHECK_TIMEOUT_MS),
  });
  const raw = await response.text();
  if (!response.ok) {
    const parsed = parseJson(raw);
    const message = typeof parsed?.message === "string" ? parsed.message : raw;
    const isMissing = /column/i.test(message) || /schema cache/i.test(message);
    return { exists: !isMissing, status: response.status, message: truncateBody(message) };
  }
  return { exists: true, status: response.status, message: null };
};

const checkVisitorsColumns = async (baseUrl: string, serviceRoleKey: string) => {
  const requiredMap: Record<string, boolean> = {};
  for (const column of VISITOR_COLUMNS_REQUIRED) {
    requiredMap[column] = false;
  }
  const missing: string[] = [];
  for (const column of VISITOR_COLUMNS_REQUIRED) {
    const result = await checkColumnExists(baseUrl, serviceRoleKey, "visitors", column);
    requiredMap[column] = result.exists;
    if (!result.exists) {
      missing.push(column);
    }
  }
  const userAgentOk = requiredMap.user_agent || requiredMap.browser_header;
  const missingAdjusted = missing.filter((col) => col !== "user_agent" && col !== "browser_header");
  if (!userAgentOk) {
    missingAdjusted.push("user_agent_or_browser_header");
  }
  return {
    required: requiredMap,
    missing: missingAdjusted,
    user_agent_or_browser_header: userAgentOk,
  };
};

const createVisitorPayload = (visitorId: string, columns: Record<string, boolean>) => {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    visitor_id: visitorId,
    first_seen_at: columns.first_seen_at ? now : undefined,
    last_seen_at: columns.last_seen_at ? now : undefined,
    created_at: columns.created_at ? now : undefined,
    updated_at: columns.updated_at ? now : undefined,
  };
  if (columns.user_agent) {
    payload.user_agent = "diag";
  } else if (columns.browser_header) {
    payload.browser_header = "diag";
  }
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
};

const writeVisitor = async (baseUrl: string, serviceRoleKey: string, payload: Record<string, unknown>) => {
  const url = `${baseUrl}/rest/v1/visitors?on_conflict=visitor_id&select=visitor_id`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildRestHeaders(serviceRoleKey),
      Prefer: "resolution=merge-duplicates, return=representation",
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "visitor_write_failed",
      details: truncateBody(raw),
    };
  }
  return {
    ok: true,
    status: response.status,
  };
};

const invokeSaveAnalytics = async (baseUrl: string, visitorId: string) => {
  const url = `${baseUrl}/api/save-analytics`;
  const payload = {
    action: "upsert_visitor",
    visitor_id: visitorId,
    user_agent: "diag",
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: getTimeoutSignal(ROUTE_CHECK_TIMEOUT_MS),
  });
  const raw = await response.text();
  const parsed = parseJson(raw);
  const ok = response.ok && parsed?.ok === true;
  return {
    ok,
    status: response.status,
    bodyPreview: ok ? null : truncateBody(raw),
  };
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === "OPTIONS") {
    respondOk(res, { status: 200 });
    return;
  }

  if (req.method !== "GET") {
    respondErr(res, 405, "method_not_allowed", "method_not_allowed");
    return;
  }

  const ts = new Date().toISOString();
  const errors: { code: string; message: string; detail?: string }[] = [];

  const { env, present, missing } = getEnvStatus();
  const rawSupabaseUrl = env?.SUPABASE_URL ?? "";
  const trimmedSupabaseUrl = rawSupabaseUrl.trim();
  const hasWhitespace = rawSupabaseUrl !== trimmedSupabaseUrl || /[\s\u00A0\u200B]/.test(rawSupabaseUrl);
  const hasTrailingSlash = trimmedSupabaseUrl.endsWith("/");
  const supabaseUrlHost = (() => {
    try {
      return new URL(trimmedSupabaseUrl).host;
    } catch {
      return null;
    }
  })();
  const hostValid = supabaseUrlHost ? /^[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrlHost) : false;
  const supabaseUrlValid =
    Boolean(trimmedSupabaseUrl) && !hasWhitespace && !hasTrailingSlash && isValidSupabaseUrl(trimmedSupabaseUrl);

  const supabaseAnonKey = env?.SUPABASE_ANON_KEY ?? "";
  const supabaseServiceRoleKey = env?.SUPABASE_SERVICE_ROLE_KEY ?? "";

  const envReport = {
    nodeVersion: process.version,
    supabaseUrl: {
      present: Boolean(rawSupabaseUrl),
      rawLength: rawSupabaseUrl.length,
      trimmedLength: trimmedSupabaseUrl.length,
      hasWhitespace,
      hasTrailingSlash,
      host: supabaseUrlHost,
      hostValid,
      ok: supabaseUrlValid && hostValid,
    },
    supabaseAnonKey: {
      present: Boolean(supabaseAnonKey),
      length: supabaseAnonKey.length,
    },
    supabaseServiceRoleKey: {
      present: Boolean(supabaseServiceRoleKey),
      length: supabaseServiceRoleKey.length,
    },
  };

  if (missing.length > 0 || !envReport.supabaseUrl.ok || !supabaseServiceRoleKey) {
    const detail = missing.length > 0 ? `missing:${missing.join(",")}` : undefined;
    errors.push({
      code: "env_invalid",
      message: "Supabase env missing or invalid",
      ...(detail ? { detail } : {}),
    });
  }

  const baseUrl = resolveBaseUrl(req.headers);
  const routesReport: Record<string, unknown> = {
    baseUrl,
    checks: {},
  };

  if (!baseUrl) {
    errors.push({
      code: "route_base_missing",
      message: "Unable to resolve base URL from request headers",
    });
  } else {
    const routeChecks: Array<[string, string]> = [
      ["/api/health", "GET"],
      ["/api/_routes", "GET"],
      ["/api/save-analytics", "OPTIONS"],
    ];
    for (const [path, method] of routeChecks) {
      try {
        const result = await checkRoute(baseUrl, path, method);
        (routesReport.checks as Record<string, unknown>)[path] = result;
        if (!result.ok) {
          const code = result.redirected ? "redirect_detected" : "route_not_json";
          errors.push({
            code,
            message: `${path} returned non-json or non-2xx`,
            detail: `status:${result.status}`,
          });
        }
      } catch (error) {
        errors.push({
          code: "route_check_failed",
          message: `${path} fetch failed`,
          detail: error instanceof Error ? error.message : "route_fetch_failed",
        });
        (routesReport.checks as Record<string, unknown>)[path] = {
          ok: false,
          error: error instanceof Error ? error.message : "route_fetch_failed",
        };
      }
    }
  }

  const supabaseReport: Record<string, unknown> = {
    ok: false,
  };

  if (envReport.supabaseUrl.ok && supabaseServiceRoleKey) {
    try {
      const connection = await checkSupabaseConnection(trimmedSupabaseUrl, supabaseServiceRoleKey);
      Object.assign(supabaseReport, connection);
      if (!connection.ok) {
        errors.push({
          code: "supabase_connection_failed",
          message: "Supabase connection failed",
          detail: `status:${connection.status ?? "unknown"}`,
        });
      }
    } catch (error) {
      supabaseReport.ok = false;
      supabaseReport.error = error instanceof Error ? error.message : "supabase_connection_failed";
      errors.push({
        code: "supabase_connection_failed",
        message: "Supabase connection threw exception",
        detail: supabaseReport.error as string,
      });
    }
  } else {
    supabaseReport.ok = false;
    supabaseReport.error = "missing_env";
  }

  const dbReport: Record<string, unknown> = {
    ok: false,
    tables: {},
  };

  let visitorColumns: Record<string, boolean> = {};
  if (envReport.supabaseUrl.ok && supabaseServiceRoleKey) {
    const tableResults: Record<string, unknown> = {};
    let tablesOk = true;
    for (const table of TABLES_REQUIRED) {
      try {
        const result = await checkTableExists(trimmedSupabaseUrl, supabaseServiceRoleKey, table);
        tableResults[table] = result;
        if (!result.ok) {
          tablesOk = false;
          errors.push({
            code: "schema_missing",
            message: `Table check failed: ${table}`,
            detail: result.message ?? `status:${result.status}`,
          });
        }
      } catch (error) {
        tablesOk = false;
        tableResults[table] = {
          ok: false,
          exists: false,
          error: error instanceof Error ? error.message : "table_check_failed",
        };
        errors.push({
          code: "schema_missing",
          message: `Table check failed: ${table}`,
          detail: error instanceof Error ? error.message : "table_check_failed",
        });
      }
    }

    if (tableResults.visitors && (tableResults.visitors as { exists?: boolean }).exists) {
      const visitorCheck = await checkVisitorsColumns(trimmedSupabaseUrl, supabaseServiceRoleKey);
      tableResults.visitors = {
        ...(tableResults.visitors as Record<string, unknown>),
        columns: visitorCheck,
      };
      visitorColumns = visitorCheck.required;
      if (visitorCheck.missing.length > 0) {
        tablesOk = false;
        errors.push({
          code: "schema_mismatch",
          message: "Visitors table missing required columns",
          detail: visitorCheck.missing.join(","),
        });
      }
    }

    dbReport.ok = tablesOk;
    dbReport.tables = tableResults;
  } else {
    dbReport.ok = false;
    dbReport.error = "missing_env";
  }

  const writesReport: Record<string, unknown> = {
    visitors: { ok: false },
    saveAnalytics: { ok: false },
  };

  if (envReport.supabaseUrl.ok && supabaseServiceRoleKey) {
    const visitorId = `diag_test_${Date.now()}`;
    const payload = createVisitorPayload(visitorId, visitorColumns);
    const visitorWrite = await writeVisitor(trimmedSupabaseUrl, supabaseServiceRoleKey, payload);
    writesReport.visitors = {
      ...visitorWrite,
      visitor_id: visitorId,
    };
    if (!visitorWrite.ok) {
      errors.push({
        code: "write_failed",
        message: "Visitor upsert failed",
        detail: visitorWrite.details ?? `status:${visitorWrite.status}`,
      });
    }

    if (baseUrl) {
      const saveAnalytics = await invokeSaveAnalytics(baseUrl, visitorId);
      writesReport.saveAnalytics = saveAnalytics;
      if (!saveAnalytics.ok) {
        errors.push({
          code: "save_analytics_failed",
          message: "POST /api/save-analytics failed",
          detail: `status:${saveAnalytics.status}`,
        });
      }
    } else {
      writesReport.saveAnalytics = { ok: false, error: "base_url_missing" };
    }
  } else {
    writesReport.visitors = { ok: false, error: "missing_env" };
    writesReport.saveAnalytics = { ok: false, error: "missing_env" };
  }

  const ok = errors.length === 0;

  respondOk(res, {
    ok,
    ts,
    env: envReport,
    routes: routesReport,
    supabase: supabaseReport,
    db: dbReport,
    writes: writesReport,
    errors,
  });
}
