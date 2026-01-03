import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";
import { API_ROUTES } from "../src/kernel/routes.js";
import { buildDiagReport, buildEnvReport } from "../src/server/diagSpine.js";

export const config = { runtime: "nodejs" };

type ApiRequest = AsyncIterable<Uint8Array | string> & {
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

const createUuid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
  extra: Record<string, unknown>
) => {
  setCorsHeaders(res);
  jsonErr(res, status, errorCode, message, extra);
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const envReport = buildEnvReport(env);
  const timestamp = new Date().toISOString();
  const correlationId = createUuid();

  if (req.method === "OPTIONS") {
    respondOk(res, {
      ok: true,
      timestamp,
      correlation_id: correlationId,
      env: { present: envReport.present, sanity: envReport.sanity },
      checks: [],
      errors: [],
      note: "preflight",
    });
    return;
  }

  if (req.method !== "GET") {
    respondErr(res, 405, "method_not_allowed", "method_not_allowed", {
      ok: false,
      timestamp,
      correlation_id: correlationId,
      env: { present: envReport.present, sanity: envReport.sanity },
      checks: [],
      errors: [
        {
          name: "method",
          classification: "ROUTE",
          detail: "method_not_allowed",
        },
      ],
    });
    return;
  }

  try {
    const report = await buildDiagReport({
      env,
      headers: req.headers,
      apiRoutes: API_ROUTES,
      correlationId,
      timestamp,
    });
    respondOk(res, report);
  } catch (error) {
    respondErr(res, 500, "diag_failed", "diag_failed", {
      ok: false,
      timestamp,
      correlation_id: correlationId,
      env: { present: envReport.present, sanity: envReport.sanity },
      checks: [],
      errors: [
        {
          name: "diag",
          classification: "CODE",
          detail: error instanceof Error ? error.message : "diag_failed",
        },
      ],
    });
  }
}
