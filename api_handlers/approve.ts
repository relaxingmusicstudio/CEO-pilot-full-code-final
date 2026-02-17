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

  const body = (await readJsonBody(req)) as { task_id?: string; user_id?: string } | null;
  const task_id = body?.task_id;
  const user_id = body?.user_id;

  if (!task_id || !user_id) {
    jsonErr(res, 400, "invalid_request", "invalid_request");
    return;
  }

  const approvalInsert = await restRequest(config, "approvals", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: [{ task_id, approved_by: user_id }],
  });

  if (!approvalInsert.ok) {
    jsonErr(res, 500, "supabase_insert_failed", "supabase_insert_failed");
    return;
  }

  const updateTask = await restRequest(config, `tasks?id=eq.${task_id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: { status: "approved" },
  });

  if (!updateTask.ok) {
    jsonErr(res, 500, "supabase_update_failed", "supabase_update_failed");
    return;
  }

  await insertTelemetry(config, "task_approved", { task_id, user_id });

  jsonOk(res, { approved: true });
}
