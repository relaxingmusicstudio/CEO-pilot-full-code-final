import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";
import { getSupabaseConfig, insertTelemetry, readJsonBody, restRequest } from "./execution-spine-lib.js";

type ApiRequest = AsyncIterable<Uint8Array | string> & { method?: string; body?: unknown };
type ApiResponse = { statusCode: number; setHeader: (n: string, v: string) => void; end: (b?: string) => void };

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    jsonErr(res, 405, "method_not_allowed", "method_not_allowed");
    return;
  }

  const config = getSupabaseConfig();
  if (!config) {
    jsonErr(res, 500, "missing_env", "missing_env");
    return;
  }

  const body = (await readJsonBody(req)) as { org_id?: string; objective?: string; plan?: unknown } | null;
  const org_id = body?.org_id ?? null;
  const objective = body?.objective ?? null;
  const content = body?.plan ?? null;

  const insert = await restRequest(config, "plans", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: [{ org_id, objective, content, status: "draft" }],
  });

  if (!insert.ok) {
    jsonErr(res, 500, "supabase_insert_failed", "supabase_insert_failed");
    return;
  }

  await insertTelemetry(config, "plan_reviewed", {
    org_id,
    objective,
  });

  jsonOk(res, {
    findings: [],
    risks: [],
    suggested_tasks: [],
  });
}
