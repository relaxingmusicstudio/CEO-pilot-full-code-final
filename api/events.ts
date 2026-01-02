import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";

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

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
type RequiredEnvKey = (typeof REQUIRED_ENV)[number];

const MAX_ERROR_BODY = 1200;
const MAX_LIMIT = 200;

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

const parseJson = (raw: string) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const truncateBody = (raw: string) => (raw.length > MAX_ERROR_BODY ? raw.slice(0, MAX_ERROR_BODY) : raw);

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

const toLimit = (raw: string | null) => {
  if (!raw) return 50;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, MAX_LIMIT);
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

  const { env, missing } = getEnvStatus();
  const supabaseUrl = stripEnvValue(env?.SUPABASE_URL);
  const serviceRoleKey = stripEnvValue(env?.SUPABASE_SERVICE_ROLE_KEY);

  if (missing.length > 0 || !supabaseUrl || !serviceRoleKey) {
    respondErr(res, 500, "missing_env", "Supabase env missing", { missing });
    return;
  }

  if (!isValidSupabaseUrl(supabaseUrl)) {
    respondErr(res, 500, "missing_env", "Supabase URL invalid", {
      hint: "SUPABASE_URL must be https://<project>.supabase.co",
    });
    return;
  }

  const url = new URL(req.url ?? "", "http://localhost");
  const traceId = url.searchParams.get("trace_id")?.trim() || null;
  const limit = toLimit(url.searchParams.get("limit"));

  const baseUrl = normalizeSupabaseUrl(supabaseUrl);
  const eventsUrl = new URL(`${baseUrl}/rest/v1/events`);
  eventsUrl.searchParams.set(
    "select",
    "id,ts,event_type,actor_type,actor_id,subject_type,subject_id,trace_id,prev_event_id,payload"
  );
  eventsUrl.searchParams.set("order", "ts.desc");
  eventsUrl.searchParams.set("limit", String(limit));
  if (traceId) {
    eventsUrl.searchParams.set("trace_id", `eq.${traceId}`);
  }

  try {
    const response = await fetch(eventsUrl.toString(), {
      method: "GET",
      headers: buildRestHeaders(serviceRoleKey),
    });
    const raw = await response.text();
    if (!response.ok) {
      respondErr(res, response.status, "supabase_error", "supabase_read_failed", {
        details: truncateBody(raw),
      });
      return;
    }
    const parsed = parseJson(raw);
    respondOk(res, {
      status: 200,
      trace_id: traceId,
      limit,
      count: Array.isArray(parsed) ? parsed.length : 0,
      events: Array.isArray(parsed) ? parsed : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "supabase_read_failed";
    respondErr(res, 500, "upstream_error", message);
  }
}
