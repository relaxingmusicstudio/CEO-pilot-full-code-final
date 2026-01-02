export const config = { runtime: "nodejs" };

type ApiRequest = {
  method?: string;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
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

const sendJson = (res: ApiResponse, status: number, payload: Record<string, unknown>) => {
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
  return { present };
};

export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true, status: 200 });
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, {
      ok: false,
      status: 405,
      errorCode: "method_not_allowed",
      error: "method_not_allowed",
      code: "method_not_allowed",
    });
    return;
  }

  const { present } = getEnvStatus();
  sendJson(res, 200, {
    ok: true,
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
