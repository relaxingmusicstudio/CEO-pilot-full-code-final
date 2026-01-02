import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";

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

const MAX_ERROR_BODY = 1200;
const MAX_STACK = 2000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const setCorsHeaders = (res: ApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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

const getEnvStatus = () => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const present = REQUIRED_ENV.reduce<Record<RequiredEnvKey, boolean>>((acc, key) => {
    acc[key] = Boolean(env?.[key]);
    return acc;
  }, {} as Record<RequiredEnvKey, boolean>);
  const missing = REQUIRED_ENV.filter((key) => !env?.[key]);
  return { env, present, missing };
};

const buildRestHeaders = (serviceRoleKey: string, prefer: string) => ({
  "Content-Type": "application/json",
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  Prefer: prefer,
});

const requestSupabase = async (url: string, payload: Record<string, unknown>, serviceRoleKey: string, prefer: string) => {
  const response = await fetch(url, {
    method: "POST",
    headers: buildRestHeaders(serviceRoleKey, prefer),
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  return { response, raw };
};

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const isUuid = (value: string) => UUID_REGEX.test(value);

const stripUndefined = (obj: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === "OPTIONS") {
    respondOk(res, { status: 200 });
    return;
  }

  if (req.method !== "POST") {
    respondErr(res, 405, "method_not_allowed", "method_not_allowed");
    return;
  }

  const body = await readJsonBody(req);
  if (!body || typeof body !== "object") {
    respondErr(res, 400, "bad_json", "invalid_json");
    return;
  }

  const payloadObject = body as Record<string, unknown>;
  const eventType = isNonEmptyString(payloadObject.event_type) ? payloadObject.event_type.trim() : "";
  const actorType = isNonEmptyString(payloadObject.actor_type) ? payloadObject.actor_type.trim() : "";
  const subjectType = isNonEmptyString(payloadObject.subject_type) ? payloadObject.subject_type.trim() : undefined;
  const traceId = isNonEmptyString(payloadObject.trace_id) ? payloadObject.trace_id.trim() : undefined;
  const eventIdInput = isNonEmptyString(payloadObject.id)
    ? payloadObject.id.trim()
    : isNonEmptyString(payloadObject.event_id)
      ? payloadObject.event_id.trim()
      : undefined;
  const prevEventId = isNonEmptyString(payloadObject.prev_event_id) ? payloadObject.prev_event_id.trim() : undefined;
  const actorId = isNonEmptyString(payloadObject.actor_id) ? payloadObject.actor_id.trim() : undefined;
  const subjectId = isNonEmptyString(payloadObject.subject_id) ? payloadObject.subject_id.trim() : undefined;

  if (!eventType) {
    respondErr(res, 400, "bad_request", "event_type is required");
    return;
  }
  if (!actorType) {
    respondErr(res, 400, "bad_request", "actor_type is required");
    return;
  }

  if (eventIdInput && !isUuid(eventIdInput)) {
    respondErr(res, 400, "bad_request", "id must be a UUID");
    return;
  }
  if (prevEventId && !isUuid(prevEventId)) {
    respondErr(res, 400, "bad_request", "prev_event_id must be a UUID");
    return;
  }
  if (actorId && !isUuid(actorId)) {
    respondErr(res, 400, "bad_request", "actor_id must be a UUID");
    return;
  }
  if (subjectId && !isUuid(subjectId)) {
    respondErr(res, 400, "bad_request", "subject_id must be a UUID");
    return;
  }

  const payload = payloadObject.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    respondErr(res, 400, "bad_request", "payload must be a JSON object");
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

  const baseUrl = normalizeSupabaseUrl(supabaseUrl);
  const prefer = eventIdInput ? "resolution=merge-duplicates, return=representation" : "return=representation";
  const insertUrl = eventIdInput
    ? `${baseUrl}/rest/v1/events?on_conflict=id&select=id,ts`
    : `${baseUrl}/rest/v1/events?select=id,ts`;
  const payloadForInsert = stripUndefined({
    id: eventIdInput,
    event_type: eventType,
    actor_type: actorType,
    actor_id: actorId,
    subject_type: subjectType,
    subject_id: subjectId,
    payload,
    trace_id: traceId,
    prev_event_id: prevEventId,
  });

  try {
    const { response, raw } = await requestSupabase(insertUrl, payloadForInsert, serviceRoleKey, prefer);
    if (!response.ok) {
      respondErr(res, response.status, "supabase_error", "supabase_insert_failed", {
        details: truncateBody(raw),
      });
      return;
    }
    const parsed = parseJson(raw);
    const row = Array.isArray(parsed) ? parsed[0] : parsed;
    const eventId = typeof row?.id === "string" ? row.id : eventIdInput ?? null;
    const ts = typeof row?.ts === "string" ? row.ts : new Date().toISOString();
    respondOk(res, { id: eventId, ts });
  } catch (error) {
    const normalized = normalizeError(error);
    respondErr(res, 500, "upstream_error", "supabase_insert_failed", normalized);
  }
}
