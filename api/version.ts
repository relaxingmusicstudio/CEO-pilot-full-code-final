import { jsonErr, jsonOk, safeHandler, type ApiRequest, type ApiResponse } from "../src/kernel/apiJson.js";
import { ErrorCode } from "../src/kernel/errorCodes.js";

export const config = { runtime: "nodejs" };

const handler = async (req: ApiRequest, res: ApiResponse) => {
  const method = req.method?.toUpperCase() || "GET";
  if (method !== "GET" && method !== "HEAD") {
    jsonErr(res, 405, ErrorCode.METHOD_NOT_ALLOWED, "method_not_allowed");
    return;
  }

  jsonOk(res, {
    service: "ceo-pilot",
    version: process.env.VERCEL_GIT_COMMIT_SHA || "dev",
    ts: new Date().toISOString(),
  });
};

export default safeHandler(handler);
