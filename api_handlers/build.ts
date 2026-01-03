import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";

export const config = { runtime: "nodejs" };

type ApiRequest = {
  method?: string;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

const safeEnv = (value: string | undefined) => (value ? value.trim() : null);

export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== "GET") {
    jsonErr(res, 405, "method_not_allowed", "method_not_allowed");
    return;
  }

  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

  jsonOk(res, {
    ts: new Date().toISOString(),
    node: process.version,
    env: {
      nodeEnv: safeEnv(env.NODE_ENV),
      vercelEnv: safeEnv(env.VERCEL_ENV),
      vercelUrl: safeEnv(env.VERCEL_URL),
    },
    build: {
      commitSha: safeEnv(env.VERCEL_GIT_COMMIT_SHA),
      commitRef: safeEnv(env.VERCEL_GIT_COMMIT_REF),
      deploymentId: safeEnv(env.VERCEL_DEPLOYMENT_ID),
      buildId: safeEnv(env.VERCEL_BUILD_ID),
    },
  });
}
