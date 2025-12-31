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

  const supabaseUrl = env?.SUPABASE_URL;
  const serviceRoleKey = env?.SUPABASE_SERVICE_ROLE_KEY;

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

  const targetUrl = `${supabaseUrl}/functions/v1/save-analytics`;

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ action, data }),
    });

    const raw = await response.text();
    const parsed = parseJson(raw);

    if (!response.ok) {
      console.error("[api/save-analytics] Upstream error.", {
        action,
        status: response.status,
      });
      sendJson(res, response.status, {
        ok: false,
        error: (parsed as { error?: string })?.error ?? "upstream_error",
        code: (parsed as { code?: string })?.code ?? "upstream_error",
        data: parsed ?? (raw ? { raw } : null),
      });
      return;
    }

    sendJson(res, 200, { ok: true, data: parsed ?? (raw ? { raw } : null) });
  } catch (error) {
    console.error("[api/save-analytics] Upstream exception.", {
      action,
      message: error instanceof Error ? error.message : "unknown",
    });
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "upstream_exception",
      code: "upstream_exception",
    });
  }
}
