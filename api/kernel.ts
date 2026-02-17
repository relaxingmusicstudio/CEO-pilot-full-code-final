import { jsonErr, jsonOk, safeHandler, type ApiRequest, type ApiResponse } from "../src/kernel/apiJson.js";
import { ErrorCode } from "../src/kernel/errorCodes.js";
import { KERNEL_VERSION } from "../src/kernel/version.js";
import { probeKernelStatus } from "../src/kernel/kernelProbe.js";

export const config = { runtime: "nodejs" };

const handler = async (req: ApiRequest, res: ApiResponse) => {
  const method = req.method?.toUpperCase() || "GET";
  if (method !== "GET" && method !== "HEAD") {
    jsonErr(res, 405, ErrorCode.METHOD_NOT_ALLOWED, "method_not_allowed");
    return;
  }

  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const result = await probeKernelStatus({
    baseUrl: env.KERNEL_BASE_URL,
    healthPath: env.KERNEL_HEALTH_PATH,
    authHeader: env.KERNEL_AUTH_HEADER,
    authValue: env.KERNEL_AUTH_VALUE,
  });

  jsonOk(res, {
    service: "ceo-pilot",
    kernelVersion: KERNEL_VERSION,
    kernelBaseUrl: result.kernelBaseUrl,
    kernelHealthPath: result.kernelHealthPath,
    ts: new Date().toISOString(),
    ok: result.ok,
    status: result.status,
    reason: result.reason,
    hint: result.hint,
    latencyMs: result.latencyMs,
    upstreamStatus: result.upstreamStatus,
  });
};

export default safeHandler(handler);
