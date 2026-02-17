type ApiRequest = AsyncIterable<Uint8Array | string> & {
  body?: unknown;
};

export type SupabaseConfig = {
  baseUrl: string;
  key: string;
};

const stripEnvValue = (value: string | undefined) => value?.trim().replace(/^"|"$|^'|'$/g, "");

const normalizeSupabaseUrl = (url: string) => (url.endsWith("/") ? url.slice(0, -1) : url);

export const getSupabaseConfig = (): SupabaseConfig | null => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const supabaseUrl = stripEnvValue(env.SUPABASE_URL || env.VITE_SUPABASE_URL);
  const serviceRoleKey = stripEnvValue(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { baseUrl: normalizeSupabaseUrl(supabaseUrl), key: serviceRoleKey };
};

export const readJsonBody = async (req: ApiRequest) => {
  if (req?.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) {
    raw += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const buildRestHeaders = (key: string) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
});

export const restRequest = async <T = unknown>(
  config: SupabaseConfig,
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) => {
  const url = `${config.baseUrl}/rest/v1/${path}`;
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: { ...buildRestHeaders(config.key), ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = null;
    }
  }
  return { ok: res.ok, status: res.status, data, text, headers: res.headers };
};

export const insertTelemetry = async (config: SupabaseConfig, event: string, payload: Record<string, unknown>) => {
  await restRequest(config, "telemetry", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: [{ event, payload }],
  });
};

export const parseCount = (contentRange: string | null) => {
  if (!contentRange) return 0;
  const parts = contentRange.split("/");
  if (parts.length < 2) return 0;
  const count = Number(parts[1]);
  return Number.isFinite(count) ? count : 0;
};
