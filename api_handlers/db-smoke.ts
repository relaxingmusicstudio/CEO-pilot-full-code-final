import { createClient } from "@supabase/supabase-js";
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== "GET") {
    jsonErr(res, 405, "method_not_allowed", "method_not_allowed");
    return;
  }

  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const supabaseUrl = stripEnvValue(env.SUPABASE_URL || env.VITE_SUPABASE_URL);
  const serviceRoleKey = stripEnvValue(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    jsonOk(res, {
      ok: false,
      db: "disconnected",
      error: "missing supabase env",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase.rpc("db_to_regclass", { p_name: "public.visitors" });

    if (error) {
      jsonOk(res, {
        ok: false,
        db: "disconnected",
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    jsonOk(res, {
      ok: true,
      db: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    jsonOk(res, {
      ok: false,
      db: "disconnected",
      error: err instanceof Error ? err.message : "supabase_request_failed",
      timestamp: new Date().toISOString(),
    });
  }
}
