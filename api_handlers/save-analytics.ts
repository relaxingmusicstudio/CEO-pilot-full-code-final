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

const ALLOWED_ACTIONS = new Set([
  "upsert_visitor",
  "track_event",
  "save_conversation",
  "save_lead",
  "update_lead_status",
  "upsert_consent",
]);

const MAX_ERROR_BODY = 1200;
const MAX_STACK = 2000;

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

const parseJson = (raw: string) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const stripUndefined = (obj: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));

const truncateBody = (raw: string) => (raw.length > MAX_ERROR_BODY ? raw.slice(0, MAX_ERROR_BODY) : raw);

const normalizeSupabaseUrl = (url: string) => (url.endsWith("/") ? url.slice(0, -1) : url);

const stripEnvValue = (value: string | undefined) => value?.trim().replace(/^"|"$|^'|'$/g, "");

const parseHost = (value: string) => {
  try {
    return new URL(value).host;
  } catch {
    return "unknown";
  }
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

const isValidSupabaseUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.host);
  } catch {
    return false;
  }
};

const buildRestHeaders = (serviceRoleKey: string) => ({
  "Content-Type": "application/json",
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  Prefer: "return=representation",
});

const requestSupabase = async (
  url: string,
  options: { method: string; headers?: Record<string, string>; body?: unknown },
  serviceRoleKey: string
) => {
  const headers = { ...buildRestHeaders(serviceRoleKey), ...(options.headers ?? {}) };
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: options.method,
    headers,
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(url, init);
  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "unknown";
  return { response, raw, contentType, host: parseHost(url) };
};

const sendUpstreamError = (res: ApiResponse, status: number, raw: string) => {
  if (status === 409) {
    sendJson(res, 200, {
      ok: true,
      status: 200,
      note: "conflict_ignored",
      ts: Date.now(),
    });
    return;
  }
  sendJson(res, status, {
    ok: false,
    status,
    errorCode: "supabase_error",
    code: "upstream_error",
    message: "Supabase upstream error",
    details: raw ? truncateBody(raw) : "",
  });
};

const sendUpstreamException = (res: ApiResponse, error: unknown) => {
  const normalized = normalizeError(error);
  sendJson(res, 500, {
    ok: false,
    status: 500,
    errorCode: "supabase_error",
    code: "upstream_error",
    message: error instanceof Error ? error.message : "upstream_exception",
    details: "supabase_request_failed",
    ...normalized,
  });
};

const logUpstreamResponse = (
  action: string,
  details: { host: string; status: number; contentType: string; raw: string }
) => {
  console.error("[api/save-analytics] Upstream response.", {
    action,
    status: details.status,
    errorCode: "supabase_error",
    message: "upstream_error",
  });
};

const logUpstreamException = (action: string, error: unknown) => {
  if (error instanceof Error) {
    console.error("[api/save-analytics] Upstream exception.", {
      action,
      message: error.message,
      errorCode: "supabase_error",
    });
    return;
  }
  console.error("[api/save-analytics] Upstream exception.", {
    action,
    message: "unknown_error",
    errorCode: "supabase_error",
  });
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true, status: 200 });
    return;
  }

  const { env, missing } = getEnvStatus();
  const isProduction = env?.VERCEL_ENV === "production" || env?.NODE_ENV === "production";
  const lockState = getKernelLockState({ isProduction });
  if (lockState.locked) {
    sendJson(res, 200, buildNoopPayload(lockState, "kernel_lock"));
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
    console.error("[api/save-analytics] Invalid JSON payload.", {
      errorCode: "bad_json",
      message: "Invalid JSON payload",
    });
    sendJson(res, 200, {
      ok: false,
      status: 200,
      errorCode: "bad_json",
      error: "bad_json",
      code: "bad_json",
    });
    return;
  }

  const payloadObject = body as Record<string, unknown>;
  const hasDataField = "data" in payloadObject;
  let action = typeof payloadObject.action === "string" ? payloadObject.action : null;
  let data = hasDataField ? payloadObject.data : payloadObject;

  if (!action) {
    action = "upsert_visitor";
    const directEvent =
      typeof payloadObject.event_name === "string" ||
      typeof payloadObject.eventName === "string" ||
      typeof payloadObject.eventType === "string";
    const directConsent =
      "consent" in payloadObject ||
      "enhanced_analytics" in payloadObject ||
      "enhancedAnalytics" in payloadObject ||
      "marketing_emails" in payloadObject ||
      "marketingEmails" in payloadObject ||
      "personalization" in payloadObject;
    if (directEvent) {
      action = "track_event";
      data = payloadObject;
    } else if (directConsent) {
      action = "upsert_consent";
      data = payloadObject;
    }
  }

  if (!ALLOWED_ACTIONS.has(action)) {
    sendJson(res, 403, {
      ok: false,
      status: 403,
      errorCode: "action_not_allowed",
      error: "action_not_allowed",
      code: "action_not_allowed",
    });
    return;
  }

  const supabaseUrl = stripEnvValue(env?.SUPABASE_URL);
  const serviceRoleKey = stripEnvValue(env?.SUPABASE_SERVICE_ROLE_KEY);

  if (missing.length > 0 || !supabaseUrl || !serviceRoleKey) {
    console.error("[api/save-analytics] Missing Supabase env.", {
      errorCode: "server_env_missing",
      message: "Supabase env missing",
    });
    sendJson(res, 500, {
      ok: false,
      status: 500,
      errorCode: "server_env_missing",
      error: "server_env_missing",
      code: "server_env_missing",
      missing,
    });
    return;
  }

  if (!isValidSupabaseUrl(supabaseUrl)) {
    console.error("[api/save-analytics] Invalid Supabase URL.", {
      errorCode: "server_env_invalid",
      message: "Supabase URL invalid",
    });
    sendJson(res, 500, {
      ok: false,
      status: 500,
      errorCode: "server_env_invalid",
      error: "server_env_invalid",
      code: "server_env_invalid",
    });
    return;
  }

  const baseUrl = normalizeSupabaseUrl(supabaseUrl);
  try {
    switch (action) {
      case "upsert_visitor": {
        const visitor = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
        const visitorIdRaw =
          (typeof visitor.visitorId === "string" && visitor.visitorId) ||
          (typeof visitor.visitor_id === "string" && visitor.visitor_id) ||
          "";
        const visitorId = visitorIdRaw || createVisitorId();
        const now = new Date().toISOString();
        const firstSeenAt =
          (typeof visitor.firstSeenAt === "string" && visitor.firstSeenAt) ||
          (typeof visitor.first_seen_at === "string" && visitor.first_seen_at) ||
          undefined;
        const lastSeenAt =
          (typeof visitor.lastSeenAt === "string" && visitor.lastSeenAt) ||
          (typeof visitor.last_seen_at === "string" && visitor.last_seen_at) ||
          now;
        const userAgent =
          (typeof visitor.userAgent === "string" && visitor.userAgent) ||
          (typeof visitor.user_agent === "string" && visitor.user_agent) ||
          undefined;
        const path =
          (typeof visitor.path === "string" && visitor.path) ||
          (typeof visitor.landingPage === "string" && visitor.landingPage) ||
          (typeof visitor.landing_page === "string" && visitor.landing_page) ||
          (typeof visitor.pageUrl === "string" && visitor.pageUrl) ||
          (typeof visitor.page_url === "string" && visitor.page_url) ||
          undefined;
        const payload = stripUndefined({
          visitor_id: visitorId,
          user_agent: userAgent,
          first_seen_at: firstSeenAt,
          last_seen_at: lastSeenAt,
          updated_at: now,
          browser: typeof visitor.browser === "string" ? visitor.browser : undefined,
          os: typeof visitor.os === "string" ? visitor.os : undefined,
          device: typeof visitor.device === "string" ? visitor.device : undefined,
          path,
          referrer: typeof visitor.referrer === "string" ? visitor.referrer : undefined,
          locale: typeof visitor.locale === "string" ? visitor.locale : undefined,
          timezone: typeof visitor.timezone === "string" ? visitor.timezone : undefined,
          screen:
            typeof visitor.screen === "string" || typeof visitor.screen === "object"
              ? visitor.screen
              : undefined,
          meta: typeof visitor.meta === "object" && visitor.meta ? visitor.meta : undefined,
        });
        const url = `${baseUrl}/rest/v1/visitors?on_conflict=visitor_id`;
        const { response, raw, contentType, host } = await requestSupabase(
          url,
          { method: "POST", body: payload },
          serviceRoleKey
        );
        if (!response.ok) {
          logUpstreamResponse(action, {
            host,
            status: response.status,
            contentType,
            raw,
          });
          sendUpstreamError(res, response.status, raw);
          return;
        }
        const parsed = parseJson(raw) ?? (raw ? { raw } : null);
        sendJson(res, 200, {
          ok: true,
          status: 200,
          id: visitorId,
          ts: Date.now(),
          data: parsed,
        });
        return;
      }
      case "track_event": {
        const eventData = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
        const eventName =
          (typeof eventData.eventName === "string" && eventData.eventName) ||
          (typeof eventData.event_name === "string" && eventData.event_name) ||
          (typeof eventData.eventType === "string" && eventData.eventType) ||
          (typeof eventData.event_type === "string" && eventData.event_type) ||
          "";

        if (!eventName) {
          sendJson(res, 400, {
            ok: false,
            status: 400,
            errorCode: "bad_request",
            error: "event_name_required",
            code: "bad_request",
          });
          return;
        }

        const payload = stripUndefined({
          visitor_id: eventData.visitorId ?? eventData.visitor_id,
          session_id: eventData.sessionId ?? eventData.session_id,
          event_name: eventName,
          event_type: eventName,
          event_data: eventData.eventData ?? eventData.event_data,
          page_url: eventData.pageUrl ?? eventData.page_url,
          utm_source: eventData.utmSource ?? eventData.utm_source,
          utm_medium: eventData.utmMedium ?? eventData.utm_medium,
          utm_campaign: eventData.utmCampaign ?? eventData.utm_campaign,
        });
        const url = `${baseUrl}/rest/v1/analytics_events?select=id`;
        const { response, raw, contentType, host } = await requestSupabase(
          url,
          { method: "POST", body: payload },
          serviceRoleKey
        );
        if (!response.ok) {
          logUpstreamResponse(action, {
            host,
            status: response.status,
            contentType,
            raw,
          });
          sendUpstreamError(res, response.status, raw);
          return;
        }
        const parsed = parseJson(raw) ?? (raw ? { raw } : null);
        const id = Array.isArray(parsed) ? parsed[0]?.id : (parsed as { id?: string } | null)?.id;
        sendJson(res, 200, { ok: true, status: 200, id: id ?? null, ts: Date.now(), data: parsed });
        return;
      }
      case "upsert_consent": {
        const consentData = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
        const visitorId =
          (typeof consentData.visitorId === "string" && consentData.visitorId) ||
          (typeof consentData.visitor_id === "string" && consentData.visitor_id) ||
          "";
        if (!visitorId) {
          sendJson(res, 400, {
            ok: false,
            status: 400,
            errorCode: "bad_request",
            error: "visitor_id_required",
            code: "bad_request",
          });
          return;
        }

        const enhancedAnalytics =
          typeof consentData.enhanced_analytics === "boolean"
            ? consentData.enhanced_analytics
            : typeof consentData.enhancedAnalytics === "boolean"
              ? consentData.enhancedAnalytics
              : undefined;
        const marketingEmails =
          typeof consentData.marketing_emails === "boolean"
            ? consentData.marketing_emails
            : typeof consentData.marketingEmails === "boolean"
              ? consentData.marketingEmails
              : undefined;
        const personalization =
          typeof consentData.personalization === "boolean" ? consentData.personalization : undefined;
        const consentValue =
          typeof consentData.consent === "boolean"
            ? consentData.consent
            : Boolean(enhancedAnalytics || marketingEmails || personalization);
        const consentVersion =
          typeof consentData.consentVersion === "string"
            ? consentData.consentVersion
            : typeof consentData.consent_version === "string"
              ? consentData.consent_version
              : undefined;
        const consentedAt =
          typeof consentData.consentedAt === "string"
            ? consentData.consentedAt
            : typeof consentData.consented_at === "string"
              ? consentData.consented_at
              : undefined;
        const userAgent =
          typeof consentData.userAgent === "string"
            ? consentData.userAgent
            : typeof consentData.user_agent === "string"
              ? consentData.user_agent
              : undefined;

        const payload = stripUndefined({
          visitor_id: visitorId,
          consent: consentValue,
          enhanced_analytics: enhancedAnalytics,
          marketing_emails: marketingEmails,
          personalization,
          consent_version: consentVersion,
          consented_at: consentedAt ?? new Date().toISOString(),
          user_agent: userAgent,
          updated_at: new Date().toISOString(),
        });

        const url = `${baseUrl}/rest/v1/user_consent?on_conflict=visitor_id&select=visitor_id`;
        const { response, raw, contentType, host } = await requestSupabase(
          url,
          { method: "POST", body: payload },
          serviceRoleKey
        );
        if (!response.ok) {
          logUpstreamResponse(action, {
            host,
            status: response.status,
            contentType,
            raw,
          });
          sendUpstreamError(res, response.status, raw);
          return;
        }
        const parsed = parseJson(raw) ?? (raw ? { raw } : null);
        sendJson(res, 200, {
          ok: true,
          status: 200,
          id: visitorId,
          ts: Date.now(),
          data: parsed,
        });
        return;
      }
      case "save_conversation": {
        const convData = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
        const visitorId = typeof convData.visitorId === "string" ? convData.visitorId : undefined;
        const sessionId = typeof convData.sessionId === "string" ? convData.sessionId : undefined;
        const payload = stripUndefined({
          visitor_id: visitorId,
          session_id: sessionId,
          messages: convData.messages,
          lead_data: convData.leadData,
          ai_analysis: convData.aiAnalysis,
          conversation_phase: convData.conversationPhase,
          outcome: convData.outcome,
          duration_seconds: convData.durationSeconds,
          message_count: convData.messageCount,
        });

        if (visitorId && sessionId) {
          const query = `select=id&visitor_id=eq.${encodeURIComponent(visitorId)}&session_id=eq.${encodeURIComponent(
            sessionId
          )}&limit=1`;
          const selectUrl = `${baseUrl}/rest/v1/conversations?${query}`;
          const { response, raw, contentType, host } = await requestSupabase(
            selectUrl,
            { method: "GET" },
            serviceRoleKey
          );
          if (!response.ok) {
            logUpstreamResponse(action, {
              host,
              status: response.status,
              contentType,
              raw,
            });
            sendUpstreamError(res, response.status, raw);
            return;
          }
          const existing = parseJson(raw);
          const existingId = Array.isArray(existing) ? existing[0]?.id : null;
          if (existingId) {
            const updateUrl = `${baseUrl}/rest/v1/conversations?id=eq.${existingId}`;
            const updateResult = await requestSupabase(
              updateUrl,
              { method: "PATCH", body: payload },
              serviceRoleKey
            );
          if (!updateResult.response.ok) {
            logUpstreamResponse(action, {
              host: updateResult.host,
              status: updateResult.response.status,
              contentType: updateResult.contentType,
              raw: updateResult.raw,
            });
            sendUpstreamError(res, updateResult.response.status, updateResult.raw);
            return;
          }
          sendJson(res, 200, {
            ok: true,
            status: 200,
            id: existingId ?? null,
            ts: Date.now(),
            data: { conversationId: existingId },
          });
          return;
        }
        }

        const insertUrl = `${baseUrl}/rest/v1/conversations?select=id`;
        const { response, raw, contentType, host } = await requestSupabase(
          insertUrl,
          { method: "POST", body: payload },
          serviceRoleKey
        );
        if (!response.ok) {
          logUpstreamResponse(action, {
            host,
            status: response.status,
            contentType,
            raw,
          });
          sendUpstreamError(res, response.status, raw);
          return;
        }
        const inserted = parseJson(raw);
        const insertedId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
        sendJson(res, 200, {
          ok: true,
          status: 200,
          id: insertedId ?? null,
          ts: Date.now(),
          data: { conversationId: insertedId ?? null },
        });
        return;
      }
      case "save_lead": {
        const leadData = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
        const payload = stripUndefined({
          visitor_id: leadData.visitorId,
          conversation_id: leadData.conversationId,
          name: leadData.name,
          email: leadData.email,
          phone: leadData.phone,
          business_name: leadData.businessName,
          trade: leadData.trade,
          team_size: leadData.teamSize,
          call_volume: leadData.callVolume,
          timeline: leadData.timeline,
          interests: leadData.interests,
          lead_score: leadData.leadScore,
          lead_temperature: leadData.leadTemperature,
          conversion_probability: leadData.conversionProbability,
          buying_signals: leadData.buyingSignals,
          objections: leadData.objections,
          ghl_contact_id: leadData.ghlContactId,
          status: "new",
          source: leadData.source ?? "funnel",
          utm_source: leadData.utmSource,
          utm_medium: leadData.utmMedium,
          utm_campaign: leadData.utmCampaign,
        });
        const url = `${baseUrl}/rest/v1/leads?select=id`;
        const { response, raw, contentType, host } = await requestSupabase(
          url,
          { method: "POST", body: payload },
          serviceRoleKey
        );
        if (!response.ok) {
          logUpstreamResponse(action, {
            host,
            status: response.status,
            contentType,
            raw,
          });
          sendUpstreamError(res, response.status, raw);
          return;
        }
        const parsed = parseJson(raw);
        const leadId = Array.isArray(parsed) ? parsed[0]?.id : parsed?.id;
        sendJson(res, 200, {
          ok: true,
          status: 200,
          id: leadId ?? null,
          ts: Date.now(),
          data: { leadId: leadId ?? null },
        });
        return;
      }
      case "update_lead_status": {
        const updateData = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
        const status = typeof updateData.status === "string" ? updateData.status : undefined;
        const leadId = updateData.leadId;
        const notes = updateData.notes;
        const revenueValue = updateData.revenueValue;
        const convertedAt = updateData.convertedAt;

        const coldStatuses = ["cold", "warm", "contacted", "nurturing", "new"];
        const salesStatuses = [
          "qualified",
          "disqualified",
          "opportunity",
          "negotiating",
          "closed_won",
          "closed_lost",
        ];

        let rpcName = "cold_update_lead_fields";
        if (status === "converted") {
          rpcName = "convert_lead";
        } else if (salesStatuses.includes(status ?? "")) {
          rpcName = "sales_update_lead_fields";
        } else if (coldStatuses.includes(status ?? "")) {
          rpcName = "cold_update_lead_fields";
        }

        const rpcPayload =
          rpcName === "convert_lead"
            ? stripUndefined({
                p_lead_id: leadId,
                p_converted_at:
                  typeof convertedAt === "string" ? convertedAt : new Date().toISOString(),
                p_notes: notes,
                p_revenue_value: revenueValue,
              })
            : stripUndefined({
                p_lead_id: leadId,
                p_status: status,
              });

        const url = `${baseUrl}/rest/v1/rpc/${rpcName}`;
        const { response, raw, contentType, host } = await requestSupabase(
          url,
          { method: "POST", body: rpcPayload },
          serviceRoleKey
        );
        if (!response.ok) {
          logUpstreamResponse(action, {
            host,
            status: response.status,
            contentType,
            raw,
          });
          sendUpstreamError(res, response.status, raw);
          return;
        }
        const parsed = parseJson(raw) ?? (raw ? { raw } : null);
        sendJson(res, 200, {
          ok: true,
          status: 200,
          id: null,
          ts: Date.now(),
          data: parsed,
        });
        return;
      }
      default:
        sendJson(res, 400, { ok: false, error: "unknown_action", code: "unknown_action" });
        return;
    }
  } catch (error) {
    logUpstreamException(action, error);
    sendUpstreamException(res, error);
  }
}
