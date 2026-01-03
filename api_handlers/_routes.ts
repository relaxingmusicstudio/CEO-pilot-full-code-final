import {
  API_PREFIX,
  API_ROUTES,
  AUTH_REDIRECT_RULES,
  PROTECTED_PREFIXES,
  PUBLIC_ROUTES,
} from "../src/kernel/routes.js";
import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";

type ApiRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

const setCorsHeaders = (res: ApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
};

const resolveHost = (headers?: Record<string, string | string[] | undefined>) => {
  if (!headers) return null;
  const forwarded = headers["x-forwarded-host"];
  if (typeof forwarded === "string" && forwarded) return forwarded;
  const host = headers.host;
  return typeof host === "string" && host ? host : null;
};

export default function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    jsonOk(res, { status: 200 });
    return;
  }

  if (req.method !== "GET") {
    jsonErr(res, 405, "method_not_allowed", "method_not_allowed");
    return;
  }

  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const hasSupabaseEnv = Boolean(env?.SUPABASE_URL && env?.SUPABASE_SERVICE_ROLE_KEY);

  jsonOk(res, {
    status: 200,
    nodeVersion: process.version,
    deployedHost: resolveHost(req.headers),
    hasSupabaseEnv,
    apiPrefix: API_PREFIX,
    publicRoutes: PUBLIC_ROUTES,
    protectedRoutes: PROTECTED_PREFIXES,
    apiRoutes: API_ROUTES,
    authRedirectRules: AUTH_REDIRECT_RULES,
  });
}
