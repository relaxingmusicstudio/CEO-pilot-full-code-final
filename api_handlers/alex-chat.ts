import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";
import { buildNoopPayload, getKernelLockState } from "../src/kernel/governanceGate.js";

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
const MAX_STACK = 2000;

const ALLOWED_FUNCTIONS = new Set([
  "alex-chat",
  "contact-form",
  "user-input-logger",
  "analyze-lead",
  "agent-memory",
  "learn-from-success",
]);
const SAFE_REPLY = "Chat is temporarily unavailable right now. Please try again later.";

type ChatIntent = "book_call" | "pricing" | "support" | "other";

const createVisitorId = () => {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through.
  }
  return `visitor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const extractEmail = (message: string) => {
  const match = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
};

const extractPhone = (message: string) => {
  const match = message.match(/(\+?\d[\d\s().-]{7,}\d)/);
  return match ? match[0].trim() : null;
};

const extractCity = (message: string) => {
  const match = message.match(/\bin\s+([A-Za-z][A-Za-z\s.-]{1,40})/i);
  return match ? match[1].trim() : null;
};

const classifyIntent = (message: string): ChatIntent => {
  const lowered = message.toLowerCase();
  if (/(book|schedule|call|demo|consultation)/.test(lowered)) return "book_call";
  if (/(price|pricing|cost|how much|rate)/.test(lowered)) return "pricing";
  if (/(support|help|issue|problem|bug|error)/.test(lowered)) return "support";
  return "other";
};

const detectUrgency = (message: string) => {
  const lowered = message.toLowerCase();
  if (/(asap|urgent|right away|immediately|today)/.test(lowered)) return "high";
  if (/(soon|this week|this month)/.test(lowered)) return "medium";
  return "low";
};

const buildReply = (intent: ChatIntent) => {
  switch (intent) {
    case "book_call":
      return "Great - I can help get that scheduled. What's the best day/time, and are you the decision maker?";
    case "pricing":
      return "Pricing depends on call volume and coverage area. About how many calls per month, and what city/area?";
    case "support":
      return "I can help. What issue are you seeing, and when did it start?";
    default:
      return "Thanks for reaching out. What do you need help with today?";
  }
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

const setCorsHeaders = (res: ApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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

const sendNoContent = (res: ApiResponse) => {
  res.statusCode = 200;
  setCorsHeaders(res);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ ok: true, status: 200 }));
};

const parseJson = (raw: string) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const normalizeSupabaseUrl = (url: string) => (url.endsWith("/") ? url.slice(0, -1) : url);

const stripEnvValue = (value: string | undefined) => value?.trim().replace(/^"|"$|^'|'$/g, "");

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

const extractVisitorId = (payloadObject: Record<string, unknown>, payload: Record<string, unknown> | null) => {
  const direct =
    (typeof payloadObject.visitorId === "string" && payloadObject.visitorId) ||
    (typeof payloadObject.visitor_id === "string" && payloadObject.visitor_id) ||
    null;
  if (direct) return direct;
  if (!payload || typeof payload !== "object") return null;
  return (
    (typeof payload.visitorId === "string" && payload.visitorId) ||
    (typeof payload.visitor_id === "string" && payload.visitor_id) ||
    null
  );
};

const extractMessageFromPayload = (payloadObject: Record<string, unknown>, payload: Record<string, unknown> | null) => {
  const direct = typeof payloadObject.message === "string" ? payloadObject.message : "";
  if (direct) return direct;
  if (payload && typeof payload.message === "string" && payload.message) return payload.message;
  const messages = payload && Array.isArray(payload.messages) ? payload.messages : null;
  if (!messages || messages.length === 0) return "";
  const last = messages[messages.length - 1] as Record<string, unknown>;
  return typeof last.content === "string" ? last.content : "";
};

const extractSource = (payloadObject: Record<string, unknown>, payload: Record<string, unknown> | null) => {
  const direct = typeof payloadObject.source === "string" ? payloadObject.source : null;
  if (direct) return direct;
  const meta = payload && typeof payload.meta === "object" && payload.meta ? payload.meta : null;
  if (meta && typeof (meta as { source?: unknown }).source === "string") {
    return (meta as { source?: string }).source ?? null;
  }
  return null;
};

const buildRestHeaders = (serviceRoleKey: string) => ({
  "Content-Type": "application/json",
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  Prefer: "return=representation",
});

const requestSupabase = async (
  url: string,
  options: { method: string; body?: unknown },
  serviceRoleKey: string
) => {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: options.method,
    headers: buildRestHeaders(serviceRoleKey),
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(url, init);
  const raw = await response.text();
  return { response, raw };
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

const isMissingSchemaResponse = (status: number, raw: string, tableName: string) => {
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
    if (combined.includes(tableName.toLowerCase())) return true;
  }
  const lowered = raw.toLowerCase();
  if (lowered.includes("pgrst205")) return true;
  if (lowered.includes("schema cache") || lowered.includes("could not find the table")) return true;
  return lowered.includes(tableName.toLowerCase());
};

const stripUndefined = (obj: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));

const upsertChatSession = async (
  baseUrl: string,
  serviceRoleKey: string,
  visitorId: string,
  source: string | null
) => {
  const payload = stripUndefined({
    visitor_id: visitorId,
    last_seen_at: new Date().toISOString(),
    source: source ?? "web",
  });
  const url = `${baseUrl}/rest/v1/chat_sessions?on_conflict=visitor_id&select=id`;
  const { response, raw } = await requestSupabase(url, { method: "POST", body: payload }, serviceRoleKey);
  if (!response.ok) {
    const missingSchema = isMissingSchemaResponse(response.status, raw, "chat_sessions");
    return {
      sessionId: null,
      error: missingSchema ? "schema_missing" : "supabase_write_failed",
    };
  }
  const parsed = parseJson(raw);
  const sessionId = Array.isArray(parsed) ? parsed[0]?.id : (parsed as { id?: string } | null)?.id ?? null;
  return { sessionId, error: null };
};

const insertChatMessage = async (
  baseUrl: string,
  serviceRoleKey: string,
  row: Record<string, unknown>
) => {
  const url = `${baseUrl}/rest/v1/chat_messages?select=id`;
  const { response, raw } = await requestSupabase(url, { method: "POST", body: row }, serviceRoleKey);
  if (!response.ok) {
    const missingSchema = isMissingSchemaResponse(response.status, raw, "chat_messages");
    return {
      id: null,
      error: missingSchema ? "schema_missing" : "supabase_write_failed",
    };
  }
  const parsed = parseJson(raw);
  const id = Array.isArray(parsed) ? parsed[0]?.id : (parsed as { id?: string } | null)?.id ?? null;
  return { id, error: null };
};

const upsertLead = async (
  baseUrl: string,
  serviceRoleKey: string,
  lead: Record<string, unknown>
) => {
  const email = typeof lead.email === "string" ? lead.email : "";
  const visitorId = typeof lead.visitor_id === "string" ? lead.visitor_id : "";
  const filter = email ? `email=eq.${encodeURIComponent(email)}` : visitorId ? `visitor_id=eq.${encodeURIComponent(visitorId)}` : "";
  if (!filter) {
    return { id: null, error: "missing_lead_keys" };
  }
  const selectUrl = `${baseUrl}/rest/v1/leads?select=id&${filter}&order=created_at.desc&limit=1`;
  const existing = await requestSupabase(selectUrl, { method: "GET" }, serviceRoleKey);
  if (!existing.response.ok) {
    const missingSchema = isMissingSchemaResponse(existing.response.status, existing.raw, "leads");
    return { id: null, error: missingSchema ? "schema_missing" : "supabase_read_failed" };
  }
  const parsed = parseJson(existing.raw);
  const existingId = Array.isArray(parsed) ? parsed[0]?.id : null;
  if (existingId) {
    const updateUrl = `${baseUrl}/rest/v1/leads?id=eq.${existingId}`;
    const updated = await requestSupabase(updateUrl, { method: "PATCH", body: lead }, serviceRoleKey);
    if (!updated.response.ok) {
      const missingSchema = isMissingSchemaResponse(updated.response.status, updated.raw, "leads");
      return { id: existingId, error: missingSchema ? "schema_missing" : "supabase_write_failed" };
    }
    return { id: existingId, error: null };
  }
  const insertUrl = `${baseUrl}/rest/v1/leads?select=id`;
  const inserted = await requestSupabase(insertUrl, { method: "POST", body: lead }, serviceRoleKey);
  if (!inserted.response.ok) {
    const missingSchema = isMissingSchemaResponse(inserted.response.status, inserted.raw, "leads");
    return { id: null, error: missingSchema ? "schema_missing" : "supabase_write_failed" };
  }
  const insertedParsed = parseJson(inserted.raw);
  const id = Array.isArray(insertedParsed)
    ? insertedParsed[0]?.id
    : (insertedParsed as { id?: string } | null)?.id ?? null;
  return { id, error: null };
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === "OPTIONS") {
    sendNoContent(res);
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, {
      ok: false,
      status: 405,
      errorCode: "method_not_allowed",
      error: "method_not_allowed",
      code: "method_not_allowed",
    });
    return;
  }

  const body = await readJsonBody(req);
  if (!body || typeof body !== "object") {
    console.error("[api/alex-chat] Invalid JSON payload.");
    sendJson(res, 200, {
      ok: false,
      status: 200,
      errorCode: "invalid_json",
      error: "invalid_json",
      code: "invalid_json",
      reply: SAFE_REPLY,
    });
    return;
  }

  const payloadObject = body as Record<string, unknown>;
  const requestedFunction = typeof payloadObject.function === "string" ? payloadObject.function : null;
  const functionName = requestedFunction ?? "alex-chat";
  const payload = requestedFunction
    ? payloadObject.body ??
      payloadObject.payload ??
      (() => {
        const { function: _fn, ...rest } = payloadObject;
        return rest;
      })()
    : payloadObject;
  const isFunctionRequest = typeof requestedFunction === "string";

  if (requestedFunction && !ALLOWED_FUNCTIONS.has(functionName)) {
    console.error("[api/alex-chat] Function not allowed:", functionName);
    sendJson(res, 403, {
      ok: false,
      status: 403,
      errorCode: "function_not_allowed",
      error: "function_not_allowed",
      code: "function_not_allowed",
    });
    return;
  }

  const payloadRecord = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const message = extractMessageFromPayload(payloadObject, payloadRecord);
  const visitorIdInput = extractVisitorId(payloadObject, payloadRecord);
  const source = extractSource(payloadObject, payloadRecord);
  const isLocalChat = !isFunctionRequest || functionName === "alex-chat";

  if (isLocalChat && !message) {
    sendJson(res, 200, {
      ok: false,
      status: 200,
      errorCode: "missing_message",
      error: "missing_message",
      code: "missing_message",
      reply: SAFE_REPLY,
    });
    return;
  }

  const { env, missing } = getEnvStatus();
  const isProduction = env?.VERCEL_ENV === "production" || env?.NODE_ENV === "production";
  const lockState = getKernelLockState({ isProduction });
  if (lockState.locked) {
    sendJson(res, 200, {
      ...buildNoopPayload(lockState, "kernel_lock"),
      reply: SAFE_REPLY,
    });
    return;
  }
  const supabaseUrl = stripEnvValue(env?.SUPABASE_URL);
  const serviceRoleKey = stripEnvValue(env?.SUPABASE_SERVICE_ROLE_KEY);

  if (missing.length > 0 || !supabaseUrl || !serviceRoleKey) {
    console.error("[api/alex-chat] Missing Supabase env.", {
      missing,
    });
    sendJson(res, 500, {
      ok: false,
      status: 500,
      errorCode: "server_env_missing",
      error: "server_env_missing",
      code: "server_env_missing",
      missing,
      reply: SAFE_REPLY,
    });
    return;
  }

  const baseUrl = normalizeSupabaseUrl(supabaseUrl);
  const targetUrl = `${baseUrl}/functions/v1/${functionName}`;
  let writeOk = true;
  let writeError: string | null = null;

  const recordWriteError = (error: string | null) => {
    if (!error) return;
    writeOk = false;
    if (!writeError) {
      writeError = error;
    }
  };

  if (isLocalChat) {
    const visitorId = visitorIdInput || createVisitorId();
    const intent = classifyIntent(message);
    const urgency = detectUrgency(message);
    const reply = buildReply(intent);
    const email = extractEmail(message);
    const phone = extractPhone(message);
    const city = extractCity(message);
    let sessionId: string | null = null;
    let leadId: string | null = null;

    try {
      const sessionResult = await upsertChatSession(baseUrl, serviceRoleKey, visitorId, source);
      sessionId = sessionResult.sessionId;
      recordWriteError(sessionResult.error);

      if (sessionId) {
        const timestamp = new Date().toISOString();
        const userRow = stripUndefined({
          session_id: sessionId,
          visitor_id: visitorId,
          role: "user",
          text: message,
          content: message,
          ts: timestamp,
        });
        const userMessage = await insertChatMessage(baseUrl, serviceRoleKey, userRow);
        recordWriteError(userMessage.error);

        const assistantRow = stripUndefined({
          session_id: sessionId,
          visitor_id: visitorId,
          role: "assistant",
          text: reply,
          content: reply,
          ts: new Date().toISOString(),
        });
        const assistantMessage = await insertChatMessage(baseUrl, serviceRoleKey, assistantRow);
        recordWriteError(assistantMessage.error);
      } else {
        recordWriteError("missing_session");
      }

      if (email || phone) {
        const leadPayload = stripUndefined({
          visitor_id: visitorId,
          email: email ?? undefined,
          phone: phone ?? undefined,
          city: city ?? undefined,
          intent,
          urgency,
          notes: "Captured from chat",
        });
        const leadResult = await upsertLead(baseUrl, serviceRoleKey, leadPayload);
        leadId = leadResult.id;
        recordWriteError(leadResult.error);
      }
    } catch (error) {
      const normalized = normalizeError(error);
      recordWriteError(normalized.errorMessage || "supabase_write_failed");
    }

    sendJson(res, 200, {
      ok: true,
      status: 200,
      reply,
      intent,
      visitor_id: visitorId,
      session_id: sessionId,
      lead_id: leadId,
      write_ok: writeOk,
      write_error: writeError,
      data: {
        text: reply,
        suggestedActions: null,
        extractedData: null,
        conversationPhase: "diagnostic",
      },
    });
    return;
  }

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(payload ?? {}),
    });

    const raw = await response.text();
    const data = parseJson(raw) ?? (raw ? { raw } : null);

    if (!response.ok) {
      console.error("[api/alex-chat] Upstream error.", {
        functionName,
        status: response.status,
      });
      sendJson(res, response.status, {
        ok: false,
        status: response.status,
        errorCode: "supabase_error",
        error: (data as { error?: string })?.error ?? "upstream_error",
        code: (data as { code?: string })?.code ?? "upstream_error",
        reply: SAFE_REPLY,
        data,
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      status: 200,
      data,
    });
  } catch (error) {
    console.error("[api/alex-chat] Upstream exception.", {
      functionName,
      message: error instanceof Error ? error.message : "unknown",
    });
    const normalized = normalizeError(error);
    sendJson(res, 500, {
      ok: false,
      status: 500,
      errorCode: "supabase_error",
      error: error instanceof Error ? error.message : "upstream_exception",
      code: "upstream_exception",
      reply: SAFE_REPLY,
      ...normalized,
    });
  }
}
