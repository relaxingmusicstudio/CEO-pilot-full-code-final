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

const setCorsHeaders = (res: ApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
};

const sendJson = (res: ApiResponse, status: number, payload: Record<string, unknown>) => {
  res.statusCode = status;
  setCorsHeaders(res);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
};

const stripEnvValue = (value: string | undefined) => value?.trim().replace(/^"|"$|^'|'$/g, "");

const normalizeSupabaseUrl = (url: string) => (url.endsWith("/") ? url.slice(0, -1) : url);

const parseHost = (value: string | undefined) => {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
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

const getEnvStatus = () => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const present = REQUIRED_ENV.reduce<Record<RequiredEnvKey, boolean>>((acc, key) => {
    acc[key] = Boolean(env?.[key]);
    return acc;
  }, {} as Record<RequiredEnvKey, boolean>);
  const missing = REQUIRED_ENV.filter((key) => !env?.[key]);
  return { env, present, missing };
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const { env, present, missing } = getEnvStatus();
  const supabaseUrl = stripEnvValue(env?.SUPABASE_URL);
  const serviceRoleKey = stripEnvValue(env?.SUPABASE_SERVICE_ROLE_KEY);
  const urlHost = parseHost(supabaseUrl);

  if (req.method === "OPTIONS") {
    sendJson(res, 200, {
      ok: true,
      status: 200,
      urlHost,
      timingMs: 0,
      writeOk: true,
      errorCode: null,
      env_present: present,
    });
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, {
      ok: false,
      status: 405,
      urlHost,
      timingMs: 0,
      writeOk: false,
      errorCode: "method_not_allowed",
      code: "method_not_allowed",
      error: "Method not allowed",
      env_present: present,
    });
    return;
  }

  if (missing.length > 0 || !supabaseUrl || !serviceRoleKey) {
    sendJson(res, 500, {
      ok: false,
      status: 500,
      urlHost,
      timingMs: 0,
      writeOk: false,
      errorCode: "missing_env",
      code: "missing_env",
      error: "Supabase env missing",
      env_present: present,
    });
    return;
  }

  if (!isValidSupabaseUrl(supabaseUrl)) {
    sendJson(res, 500, {
      ok: false,
      status: 500,
      urlHost,
      timingMs: 0,
      writeOk: false,
      errorCode: "missing_env",
      code: "missing_env",
      error: "Supabase URL invalid",
      env_present: present,
    });
    return;
  }

  const baseUrl = normalizeSupabaseUrl(supabaseUrl);
  const targetUrl = `${baseUrl}/rest/v1/ceo_decisions?select=id`;
  const startedAt = Date.now();

  const payload = {
    decision: "diagnostic write check",
    reasoning: "Verify Supabase write access for decisions.",
    confidence: 0,
    purpose: "decision_diag",
    status: "cancelled",
    context_snapshot: {
      source: "diag-decision-write",
      created_at: new Date().toISOString(),
    },
  };

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      sendJson(res, response.status, {
        ok: false,
        status: response.status,
        urlHost,
        timingMs: Date.now() - startedAt,
        writeOk: false,
        errorCode: "upstream_error",
        code: "upstream_error",
        error: "supabase_write_failed",
        env_present: present,
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      status: 200,
      urlHost,
      timingMs: Date.now() - startedAt,
      writeOk: true,
      errorCode: null,
      env_present: present,
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      status: 500,
      urlHost,
      timingMs: Date.now() - startedAt,
      writeOk: false,
      errorCode: "upstream_error",
      code: "upstream_error",
      error: error instanceof Error ? error.message : "supabase_write_failed",
      env_present: present,
    });
  }
}
