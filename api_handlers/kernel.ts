import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";
import { KERNEL_VERSION } from "../src/kernel/version.js";
import { probeKernelStatus } from "../src/kernel/kernelProbe.js";

type ApiRequest = {
  method?: string;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== "GET") {
    jsonErr(res, 405, "method_not_allowed", "method_not_allowed");
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
}
