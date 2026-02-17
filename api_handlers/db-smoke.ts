import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";

type ApiRequest = {
  method?: string;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

const TABLE_NAME = "system_heartbeat";
const SMOKE_ID = "smoke";

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

const buildRestHeaders = (key: string) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "resolution=merge-duplicates,return=representation",
});

const errorPayload = (message: string, hint?: string) => ({
  message,
  ...(hint ? { hint } : {}),
});

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== "GET") {
    jsonErr(res, 405, "method_not_allowed", "method_not_allowed");
    return;
  }

  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const supabaseUrl = stripEnvValue(env.SUPABASE_URL || env.VITE_SUPABASE_URL);
  const serviceRoleKey = stripEnvValue(env.SUPABASE_SERVICE_ROLE_KEY);
  const anonKey = stripEnvValue(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY);

  const usedKey = serviceRoleKey ? "service_role" : anonKey ? "anon" : null;
  const resolvedKey = serviceRoleKey || anonKey || "";

  if (!supabaseUrl || !usedKey) {
    jsonOk(res, {
      ok: false,
      db: { write: false, read: false },
      table: TABLE_NAME,
      used_key: usedKey,
      error: errorPayload("missing supabase env", "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."),
    });
    return;
  }

  if (!isValidSupabaseUrl(supabaseUrl)) {
    jsonOk(res, {
      ok: false,
      db: { write: false, read: false },
      table: TABLE_NAME,
      used_key: usedKey,
      error: errorPayload("invalid SUPABASE_URL", "SUPABASE_URL must be a valid https URL."),
    });
    return;
  }

  const baseUrl = normalizeSupabaseUrl(supabaseUrl);
  const writePayload = {
    id: SMOKE_ID,
    service: "march-project",
    version: env.VERCEL_GIT_COMMIT_SHA || "dev",
    status: "ok",
    detail: {
      ts_client: new Date().toISOString(),
      env: {
        supabase_url_present: Boolean(supabaseUrl),
        supabase_anon_present: Boolean(anonKey),
        supabase_service_present: Boolean(serviceRoleKey),
      },
      sha: env.VERCEL_GIT_COMMIT_SHA || null,
    },
  };

  let writeOk = false;
  let readOk = false;
  let error: { message: string; hint?: string } | null = null;

  try {
    const writeUrl = `${baseUrl}/rest/v1/${TABLE_NAME}?on_conflict=id`;
    const writeResponse = await fetch(writeUrl, {
      method: "POST",
      headers: buildRestHeaders(resolvedKey),
      body: JSON.stringify([writePayload]),
    });

    if (!writeResponse.ok) {
      error = errorPayload(
        `write_failed:${writeResponse.status}`,
        "Check system_heartbeat table exists and RLS allows service_role writes."
      );
    } else {
      writeOk = true;
    }

    if (writeOk) {
      const readUrl = `${baseUrl}/rest/v1/${TABLE_NAME}?select=id,ts,service,version,status,detail&id=eq.${SMOKE_ID}`;
      const readResponse = await fetch(readUrl, {
        method: "GET",
        headers: buildRestHeaders(resolvedKey),
      });

      if (!readResponse.ok) {
        error = errorPayload(
          `read_failed:${readResponse.status}`,
          "Check system_heartbeat table exists and RLS allows service_role reads."
        );
      } else {
        readOk = true;
      }
    }
  } catch (err) {
    error = errorPayload(
      err instanceof Error ? err.message : "supabase_request_failed",
      "Supabase request failed."
    );
  }

  jsonOk(res, {
    ok: writeOk && readOk,
    db: { write: writeOk, read: readOk },
    table: TABLE_NAME,
    used_key: usedKey,
    error,
  });
}
