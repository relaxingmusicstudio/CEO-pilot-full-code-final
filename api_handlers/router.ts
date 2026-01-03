import { jsonErr } from "../src/kernel/apiJson.js";

import alexChat from "./alex-chat.js";
import build from "./build.js";
import decisionFeedback from "./decision-feedback.js";
import decisionById from "./decision/[id].js";
import diagDecisionWrite from "./diag-decision-write.js";
import diagSaveAnalytics from "./diag-save-analytics.js";
import diagSupabase from "./diag-supabase.js";
import diag from "./diag.js";
import eventHandler from "./event.js";
import eventsHandler from "./events.js";
import health from "./health.js";
import kernelStatus from "./kernel/status.js";
import mandateVerify from "./mandate/verify.js";
import resolveDecision from "./resolve-decision.js";
import routes from "./routes.js";
import saveAnalytics from "./save-analytics.js";
import searchDecision from "./search-decision.js";
import routesUnderscore from "./_routes.js";
import auditRun from "./audit/run.js";

type ApiRequest = AsyncIterable<Uint8Array | string> & {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

type ApiHandler = (req: ApiRequest, res: ApiResponse) => Promise<void> | void;

const setCorsHeaders = (res: ApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
};

const normalizePath = (pathValue: string) => {
  if (pathValue.length > 1 && pathValue.endsWith("/")) {
    return pathValue.slice(0, -1);
  }
  return pathValue;
};

const exactRoutes: Record<string, ApiHandler> = {
  "/api/health": health,
  "/api/build": build,
  "/api/_routes": routesUnderscore,
  "/api/routes": routes,
  "/api/alex-chat": alexChat,
  "/api/save-analytics": saveAnalytics,
  "/api/event": eventHandler,
  "/api/events": eventsHandler,
  "/api/diag": diag,
  "/api/diag-decision-write": diagDecisionWrite,
  "/api/diag-save-analytics": diagSaveAnalytics,
  "/api/diag-supabase": diagSupabase,
  "/api/kernel/status": kernelStatus,
  "/api/audit/run": auditRun,
  "/api/mandate/verify": mandateVerify,
  "/api/decision-feedback": decisionFeedback,
  "/api/search-decision": searchDecision,
  "/api/resolve-decision": resolveDecision,
};

const prefixRoutes: Array<{ prefix: string; handler: ApiHandler }> = [
  { prefix: "/api/decision/", handler: decisionById },
];

const respondNotFound = (res: ApiResponse, pathValue: string) => {
  setCorsHeaders(res);
  jsonErr(res, 404, "not_found", "not_found", { path: pathValue });
};

const respondHandlerError = (res: ApiResponse, pathValue: string, error: unknown) => {
  setCorsHeaders(res);
  const message = error instanceof Error ? error.message : "handler_failed";
  jsonErr(res, 500, "handler_failed", "handler_failed", { path: pathValue, error: message });
};

export const routeApiRequest = async (req: ApiRequest, res: ApiResponse) => {
  const rawUrl = req.url ?? "/api";
  let pathname = rawUrl;
  try {
    pathname = new URL(rawUrl, "http://localhost").pathname;
  } catch {
    pathname = rawUrl;
  }
  const normalizedPath = normalizePath(pathname);
  const exactHandler = exactRoutes[normalizedPath];
  const prefixHandler = prefixRoutes.find((route) => normalizedPath.startsWith(route.prefix))?.handler;
  const handler = exactHandler ?? prefixHandler;

  if (!handler) {
    respondNotFound(res, normalizedPath);
    return;
  }

  try {
    await handler(req, res);
  } catch (error) {
    respondHandlerError(res, normalizedPath, error);
  }
};
