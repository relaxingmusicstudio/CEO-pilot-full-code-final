import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";

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

const respondOk = (res: ApiResponse, data: Record<string, unknown>) => {
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
    respondOk(res, {
      status: 200,
      urlHost,
      timingMs: 0,
      bodyPreview: "",
      errorCode: null,
    });
    return;
  }

  if (req.method !== "GET") {
    respondErr(res, 405, "method_not_allowed", "method_not_allowed", {
      status: 405,
      urlHost,
      timingMs: 0,
      bodyPreview: "",
      errorCode: "method_not_allowed",
    });
    return;
  }

  if (missing.length > 0 || !env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
    respondErr(res, 500, "server_env_missing", "server_env_missing", {
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
      respondErr(res, response.status, "upstream_error", "upstream_error", {
        status: response.status,
        urlHost,
        timingMs: Date.now() - startedAt,
        bodyPreview: preview,
        errorCode: "upstream_error",
      });
      return;
    }

    respondOk(res, {
      status: 200,
      urlHost,
      timingMs: Date.now() - startedAt,
      bodyPreview: preview,
      errorCode: null,
    });
  } catch (error) {
    respondErr(res, 500, "upstream_exception", "upstream_exception", {
      status: 500,
      urlHost,
      timingMs: Date.now() - startedAt,
      bodyPreview: truncate(error instanceof Error ? error.message : "upstream_exception"),
      errorCode: "upstream_exception",
    });
  }
}
