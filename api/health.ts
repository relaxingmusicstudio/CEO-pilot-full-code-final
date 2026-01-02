import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";

type ApiRequest = {
  method?: string;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
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

const buildRestHeaders = (serviceRoleKey: string) => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
});

const checkDb = async (supabaseUrl: string | undefined, serviceRoleKey: string | undefined) => {
  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, reason: "missing_env" };
  }
  if (!isValidSupabaseUrl(supabaseUrl)) {
    return { ok: false, reason: "invalid_env" };
  }
  try {
    const baseUrl = normalizeSupabaseUrl(supabaseUrl);
    const healthUrl = `${baseUrl}/rest/v1/events?select=id&limit=1`;
    const response = await fetch(healthUrl, {
      method: "GET",
      headers: buildRestHeaders(serviceRoleKey),
    });
    if (!response.ok) {
      return { ok: false, reason: `status:${response.status}` };
    }
    return { ok: true, reason: null };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "fetch_failed" };
  }
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== "GET") {
    jsonErr(res, 405, "method_not_allowed", "method_not_allowed");
    return;
  }

  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const supabaseUrl = stripEnvValue(env?.SUPABASE_URL);
  const serviceRoleKey = stripEnvValue(env?.SUPABASE_SERVICE_ROLE_KEY);
  const dbCheck = await checkDb(supabaseUrl, serviceRoleKey);

  jsonOk(res, {
    node: process.version,
    ts: Date.now(),
    version: "v14",
    db: dbCheck.ok,
    ...(dbCheck.ok ? {} : { db_error: dbCheck.reason }),
  });
}
