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
]);

const MAX_ERROR_BODY = 1200;
const MAX_LOG_BODY = 200;

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

const sendNoContent = (res: ApiResponse) => {
  res.statusCode = 204;
  setCorsHeaders(res);
  res.end();
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

const truncateLogBody = (raw: string) =>
  raw.length > MAX_LOG_BODY ? `${raw.slice(0, MAX_LOG_BODY)}...` : raw;

const normalizeSupabaseUrl = (url: string) => (url.endsWith("/") ? url.slice(0, -1) : url);

const stripEnvValue = (value: string | undefined) => value?.trim().replace(/^"|"$|^'|'$/g, "");

const parseHost = (value: string) => {
  try {
    return new URL(value).host;
  } catch {
    return "unknown";
  }
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
  sendJson(res, status, {
    ok: false,
    code: "upstream_error",
    status,
    body: raw ? truncateBody(raw) : "",
    errorCode: "upstream_error",
  });
};

const sendUpstreamException = (res: ApiResponse, error: unknown) => {
  sendJson(res, 500, {
    ok: false,
    code: "upstream_error",
    errorCode: "upstream_exception",
    error: error instanceof Error ? error.message : "upstream_exception",
  });
};

const logUpstreamResponse = (
  action: string,
  details: { host: string; status: number; contentType: string; raw: string }
) => {
  console.error("[api/save-analytics] Upstream response.", {
    action,
    host: details.host,
    status: details.status,
    contentType: details.contentType,
    bodyPreview: truncateLogBody(details.raw ?? ""),
  });
};

const logUpstreamException = (action: string, host: string, error: unknown) => {
  if (error instanceof Error) {
    console.error("[api/save-analytics] Upstream exception.", {
      action,
      host,
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    return;
  }
  console.error("[api/save-analytics] Upstream exception.", {
    action,
    host,
    name: "unknown",
    message: "unknown_error",
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

const buildHealthResponse = (method: string, envPresent: Record<RequiredEnvKey, boolean>) => ({
  status: "ok",
  method,
  expected_methods: ["POST"],
  required_env: [...REQUIRED_ENV],
  env_present: envPresent,
  message: "Use POST via Network tab or curl/Invoke-RestMethod for verification.",
});

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === "OPTIONS") {
    sendNoContent(res);
    return;
  }

  const { env, present, missing } = getEnvStatus();

  if (req.method === "GET") {
    sendJson(res, 200, buildHealthResponse("GET", present));
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed", code: "method_not_allowed" });
    return;
  }

  const body = await readJsonBody(req);
  if (!body || typeof body !== "object") {
    console.error("[api/save-analytics] Invalid JSON payload.");
    sendJson(res, 400, { ok: false, error: "invalid_json", code: "invalid_json" });
    return;
  }

  const payloadObject = body as Record<string, unknown>;
  const action = payloadObject.action;
  const data = payloadObject.data ?? null;

  if (!action || typeof action !== "string") {
    sendJson(res, 400, { ok: false, error: "missing_action", code: "missing_action" });
    return;
  }

  if (!ALLOWED_ACTIONS.has(action)) {
    sendJson(res, 403, { ok: false, error: "action_not_allowed", code: "action_not_allowed" });
    return;
  }

  const supabaseUrl = stripEnvValue(env?.SUPABASE_URL);
  const serviceRoleKey = stripEnvValue(env?.SUPABASE_SERVICE_ROLE_KEY);

  if (missing.length > 0 || !supabaseUrl || !serviceRoleKey) {
    console.error("[api/save-analytics] Missing Supabase env.", {
      missing,
    });
    sendJson(res, 500, {
      ok: false,
      error: "server_env_missing",
      code: "server_env_missing",
      missing,
    });
    return;
  }

  if (!isValidSupabaseUrl(supabaseUrl)) {
    console.error("[api/save-analytics] Invalid Supabase URL.", {
      host: parseHost(supabaseUrl),
    });
    sendJson(res, 500, {
      ok: false,
      error: "server_env_invalid",
      code: "server_env_invalid",
    });
    return;
  }

  const baseUrl = normalizeSupabaseUrl(supabaseUrl);
  const baseHost = parseHost(baseUrl);

  try {
    switch (action) {
      case "upsert_visitor": {
        const visitor = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
        const payload = stripUndefined({
          visitor_id: visitor.visitorId,
          device: visitor.device,
          browser: visitor.browser,
          utm_source: visitor.utmSource,
          utm_medium: visitor.utmMedium,
          utm_campaign: visitor.utmCampaign,
          landing_page: visitor.landingPage,
          referrer: visitor.referrer,
          last_seen_at: new Date().toISOString(),
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
        sendJson(res, 200, { ok: true, data: parsed });
        return;
      }
      case "track_event": {
        const eventData = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
        const payload = stripUndefined({
          visitor_id: eventData.visitorId,
          session_id: eventData.sessionId,
          event_type: eventData.eventType,
          event_data: eventData.eventData,
          page_url: eventData.pageUrl,
          utm_source: eventData.utmSource,
          utm_medium: eventData.utmMedium,
          utm_campaign: eventData.utmCampaign,
        });
        const url = `${baseUrl}/rest/v1/analytics_events`;
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
        sendJson(res, 200, { ok: true, data: parsed });
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
            sendJson(res, 200, { ok: true, data: { conversationId: existingId } });
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
        sendJson(res, 200, { ok: true, data: { conversationId: insertedId ?? null } });
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
        sendJson(res, 200, { ok: true, data: { leadId: leadId ?? null } });
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
        sendJson(res, 200, { ok: true, data: parsed });
        return;
      }
      default:
        sendJson(res, 400, { ok: false, error: "unknown_action", code: "unknown_action" });
        return;
    }
  } catch (error) {
    logUpstreamException(action, baseHost, error);
    sendUpstreamException(res, error);
  }
}
