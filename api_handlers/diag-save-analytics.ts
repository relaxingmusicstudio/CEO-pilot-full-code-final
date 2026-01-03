import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";
import { buildNoopPayload, getKernelLockState } from "../src/kernel/governanceGate.js";

export const config = { runtime: "nodejs" };

type ApiRequest = {
  method?: string;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;
type RequiredEnvKey = (typeof REQUIRED_ENV)[number];

const VISITOR_FIELDS = [
  "visitor_id",
  "user_agent",
  "first_seen_at",
  "last_seen_at",
  "updated_at",
  "browser",
  "os",
  "device",
  "path",
  "referrer",
  "locale",
  "timezone",
  "screen",
  "meta",
];

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
  const env = process.env ?? {};
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
  const present: Record<RequiredEnvKey, boolean> = {
    SUPABASE_URL: Boolean(supabaseUrl),
    SUPABASE_ANON_KEY: Boolean(supabaseAnonKey),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(serviceRoleKey),
  };
  const missing = Object.entries(present)
    .filter(([, isPresent]) => !isPresent)
    .map(([key]) => key as RequiredEnvKey);
  return {
    present,
    missing,
    resolved: {
      SUPABASE_URL: supabaseUrl,
      SUPABASE_ANON_KEY: supabaseAnonKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    },
  };
};

export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === "OPTIONS") {
    respondOk(res, { status: 200 });
    return;
  }

  if (req.method !== "GET") {
    respondErr(res, 405, "method_not_allowed", "method_not_allowed", {
      status: 405,
      errorCode: "method_not_allowed",
      code: "method_not_allowed",
    });
    return;
  }

  const { present, missing } = getEnvStatus();
  const isProduction = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  const lockState = getKernelLockState({ isProduction });
  if (lockState.locked) {
    respondOk(res, buildNoopPayload(lockState, "kernel_lock"));
    return;
  }
  if (missing.length > 0) {
    respondErr(res, 500, "missing_env", "missing_env", {
      status: 500,
      missing,
      env_present: present,
      required_env: [...REQUIRED_ENV],
    });
    return;
  }
  respondOk(res, {
    status: 200,
    required_env: [...REQUIRED_ENV],
    env_present: present,
    expected_actions: ["upsert_visitor", "track_event", "upsert_consent"],
    visitor_fields: VISITOR_FIELDS,
    sample_payloads: {
      upsert_visitor: {
        visitor_id: "debug",
        user_agent: "Mozilla/5.0",
        path: "/",
      },
      track_event: {
        event_name: "debug",
        visitor_id: "debug",
        event_data: { k: "v" },
      },
      upsert_consent: {
        visitor_id: "debug",
        consent: true,
        enhanced_analytics: true,
      },
    },
    sample_curl:
      "curl -X POST -H \"Content-Type: application/json\" -d '{\"event_name\":\"debug\",\"visitor_id\":\"debug\",\"event_data\":{\"k\":\"v\"}}' https://pipe-profit-pilot.vercel.app/api/save-analytics",
  });
}
