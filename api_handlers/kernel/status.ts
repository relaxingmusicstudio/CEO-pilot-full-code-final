import { jsonErr, jsonOk } from "../../src/kernel/apiJson.js";
import { getKernelLockState } from "../../src/kernel/governanceGate.js";

export const config = { runtime: "nodejs" };

type ApiRequest = {
  method?: string;
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

export default function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    jsonOk(res, { status: 200 });
    return;
  }

  if (req.method && req.method !== "GET") {
    jsonErr(res, 405, "method_not_allowed", "method_not_allowed");
    return;
  }

  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const isProduction = env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
  const lockState = getKernelLockState({ isProduction });

  jsonOk(res, {
    status: 200,
    ts: new Date().toISOString(),
    node: process.version,
    env: {
      nodeEnv: env.NODE_ENV ?? null,
      vercelEnv: env.VERCEL_ENV ?? null,
    },
    lock: lockState,
  });
}
