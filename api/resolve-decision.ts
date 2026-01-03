import handler from "../api_handlers/resolve-decision.js";

export const config = { runtime: "nodejs" };

type ApiRequest = AsyncIterable<Uint8Array | string> & {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

type CapturedResponse = {
  res: ApiResponse & {
    status?: (code: number) => ApiResponse;
    json?: (payload: Record<string, unknown>) => void;
  };
  getStatus: () => number;
  getBody: () => string;
  getHeaders: () => Map<string, string>;
};

const ROUTE = "/api/resolve-decision";

const buildTraceId = () => `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const createCapturedResponse = (): CapturedResponse => {
  let body = "";
  const headers = new Map<string, string>();
  const res: ApiResponse & {
    status?: (code: number) => ApiResponse;
    json?: (payload: Record<string, unknown>) => void;
  } = {
    statusCode: 200,
    setHeader: (name, value) => {
      headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value));
    },
    end: (chunk?: string) => {
      if (chunk) {
        body += typeof chunk === "string" ? chunk : String(chunk);
      }
    },
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload: Record<string, unknown>) => {
    body += JSON.stringify(payload);
  };

  return {
    res,
    getStatus: () => res.statusCode,
    getBody: () => body,
    getHeaders: () => headers,
  };
};

const safeJsonParse = (raw: string): Record<string, unknown> | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const applyHeaders = (res: ApiResponse, headers: Map<string, string>) => {
  headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
};

const sendJson = (
  res: ApiResponse,
  status: number,
  payload: Record<string, unknown>,
  headers: Map<string, string>
) => {
  applyHeaders(res, headers);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
};

const normalizeError = (payload: Record<string, unknown> | null, status: number) => {
  const errorCode =
    (payload && typeof payload.errorCode === "string" && payload.errorCode) ||
    (payload && typeof payload.code === "string" && payload.code) ||
    (status >= 500 ? "server_error" : "request_failed");
  const rawMessage =
    (payload && typeof payload.error === "string" && payload.error) ||
    (payload && typeof payload.message === "string" && payload.message) ||
    "request_failed";
  const message = rawMessage.slice(0, 200);
  return { code: errorCode, message };
};

export default async function apiResolveDecision(req: ApiRequest, res: ApiResponse) {
  const traceId = buildTraceId();
  const ts = Date.now();
  const capture = createCapturedResponse();

  try {
    await handler(req, capture.res);
  } catch {
    sendJson(
      res,
      500,
      {
        ok: false,
        error: { code: "handler_exception", message: "handler_exception" },
        trace_id: traceId,
        where: ROUTE,
        ts,
      },
      capture.getHeaders()
    );
    return;
  }

  const status = capture.getStatus();
  const payload = safeJsonParse(capture.getBody());
  if (!payload) {
    sendJson(
      res,
      500,
      {
        ok: false,
        error: { code: "invalid_json", message: "invalid_json" },
        trace_id: traceId,
        where: ROUTE,
        ts,
      },
      capture.getHeaders()
    );
    return;
  }

  const isError = status >= 400 || payload.ok === false;
  if (isError) {
    const { code, message } = normalizeError(payload, status);
    sendJson(
      res,
      status >= 400 ? status : 500,
      {
        ok: false,
        error: { code, message },
        trace_id: traceId,
        where: ROUTE,
        ts,
      },
      capture.getHeaders()
    );
    return;
  }

  sendJson(
    res,
    status >= 200 && status < 400 ? status : 200,
    {
      ok: true,
      data: payload,
      trace_id: traceId,
      ts,
    },
    capture.getHeaders()
  );
}
