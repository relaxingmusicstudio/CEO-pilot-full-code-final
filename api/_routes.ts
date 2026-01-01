export const config = { runtime: "nodejs" };

type ApiRequest = {
  method?: string;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

const ROUTES = ["/api/health", "/api/alex-chat", "/api/save-analytics", "/api/_routes"];

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

  sendJson(res, 200, {
    ok: true,
    status: 200,
    routes: ROUTES,
  });
}
