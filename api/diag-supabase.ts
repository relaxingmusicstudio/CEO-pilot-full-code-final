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

const MAX_PREVIEW = 600;

const setCorsHeaders = (res: ApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
};

const sendJson = (
  res: ApiResponse,
  status: number,
  payload: {
    ok: boolean;
    status: number;
    urlHost: string | null;
    timingMs: number;
    bodyPreview: string;
    errorCode: string | null;
  }
) => {
  res.statusCode = status;
  setCorsHeaders(res);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
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

const truncate = (value: string) => (value.length > MAX_PREVIEW ? `${value.slice(0, MAX_PREVIEW)}...` : value);

const parseHost = (supabaseUrl?: string) => {
  if (!supabaseUrl) return null;
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return null;
  }
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const { env, missing } = getEnvStatus();
  const urlHost = parseHost(env?.SUPABASE_URL);

  if (req.method === "OPTIONS") {
    sendJson(res, 200, {
      ok: true,
      status: 200,
      urlHost,
      timingMs: 0,
      bodyPreview: "",
      errorCode: null,
    });
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, {
      ok: false,
      status: 405,
      urlHost,
      timingMs: 0,
      bodyPreview: "",
      errorCode: "method_not_allowed",
    });
    return;
  }

  if (missing.length > 0 || !env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
    sendJson(res, 500, {
      ok: false,
      status: 500,
      urlHost,
      timingMs: 0,
      bodyPreview: "",
      errorCode: "server_env_missing",
    });
    return;
  }

  const baseUrl = env.SUPABASE_URL.endsWith("/") ? env.SUPABASE_URL.slice(0, -1) : env.SUPABASE_URL;
  const targetUrl = `${baseUrl}/rest/v1/visitors?select=visitor_id&limit=1`;

  const startedAt = Date.now();
  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    const raw = await response.text();
    const preview = truncate(raw ?? "");

    if (!response.ok) {
      sendJson(res, response.status, {
        ok: false,
        status: response.status,
        urlHost,
        timingMs: Date.now() - startedAt,
        bodyPreview: preview,
        errorCode: "upstream_error",
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      status: 200,
      urlHost,
      timingMs: Date.now() - startedAt,
      bodyPreview: preview,
      errorCode: null,
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      status: 500,
      urlHost,
      timingMs: Date.now() - startedAt,
      bodyPreview: truncate(error instanceof Error ? error.message : "upstream_exception"),
      errorCode: "upstream_exception",
    });
  }
}
