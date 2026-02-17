import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";
import { getSupabaseConfig, insertTelemetry, readJsonBody, restRequest } from "./execution-spine-lib.js";

type ApiRequest = AsyncIterable<Uint8Array | string> & { method?: string; body?: unknown };
type ApiResponse = { statusCode: number; setHeader: (n: string, v: string) => void; end: (b?: string) => void };

type TaskRecord = {
  id: string;
  status: string;
  requires_approval: boolean;
};

const getSingle = (data: unknown) => {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
};

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

  const body = (await readJsonBody(req)) as { task_id?: string } | null;
  const task_id = body?.task_id;
  if (!task_id) {
    jsonErr(res, 400, "invalid_request", "invalid_request");
    return;
  }

  const taskRes = await restRequest<TaskRecord[]>(config, `tasks?select=id,status,requires_approval&id=eq.${task_id}&limit=1`);
  if (!taskRes.ok) {
    jsonErr(res, 500, "supabase_read_failed", "supabase_read_failed");
    return;
  }

  const task = getSingle(taskRes.data) as TaskRecord | null;
  if (!task) {
    jsonErr(res, 404, "task_not_found", "task_not_found");
    return;
  }

  if (task.status === "proposed") {
    jsonErr(res, 409, "task_not_approved", "task_not_approved");
    return;
  }
  if (task.status === "running") {
    jsonErr(res, 409, "task_running", "task_running");
    return;
  }
  if (task.status === "done") {
    jsonErr(res, 409, "task_done", "task_done");
    return;
  }

  const markRunning = await restRequest(config, `tasks?id=eq.${task_id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: { status: "running" },
  });

  if (!markRunning.ok) {
    jsonErr(res, 500, "supabase_update_failed", "supabase_update_failed");
    return;
  }

  const executionLog = await restRequest(config, "execution_logs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: [
      {
        task_id,
        status: "done",
        input: { task_id },
        output: { result: "noop" },
      },
    ],
  });

  if (!executionLog.ok) {
    jsonErr(res, 500, "execution_log_failed", "execution_log_failed");
    return;
  }

  const markDone = await restRequest(config, `tasks?id=eq.${task_id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: { status: "done" },
  });

  if (!markDone.ok) {
    jsonErr(res, 500, "supabase_update_failed", "supabase_update_failed");
    return;
  }

  await insertTelemetry(config, "task_executed", { task_id });

  jsonOk(res, { execution: "done" });
}
