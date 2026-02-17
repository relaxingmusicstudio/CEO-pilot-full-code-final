import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";
import { getSupabaseConfig, parseCount, restRequest } from "./execution-spine-lib.js";

type ApiRequest = {
  method?: string;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

type ExecutionLog = {
  id: string;
  status: string;
  task_id: string | null;
  created_at: string;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== "GET") {
    jsonErr(res, 405, "method_not_allowed", "method_not_allowed");
    return;
  }

  const config = getSupabaseConfig();
  if (!config) {
    jsonErr(res, 500, "missing_env", "missing_env");
    return;
  }

  const dbProbe = await restRequest(config, "orgs?select=id&limit=1");
  const db_status = dbProbe.ok ? "connected" : "disconnected";

  const orgCountRes = await restRequest(config, "orgs?select=id", {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  const taskCountRes = await restRequest(config, "tasks?select=id&status=in.(approved,running)", {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  const pendingApprovalsRes = await restRequest(config, "tasks?select=id&status=eq.proposed&requires_approval=eq.true", {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  const lastExecutionRes = await restRequest<ExecutionLog[]>(config, "execution_logs?select=id,status,task_id,created_at&order=created_at.desc&limit=1");

  const active_orgs = parseCount(orgCountRes.headers.get("content-range"));
  const active_tasks = parseCount(taskCountRes.headers.get("content-range"));
  const pending_approvals = parseCount(pendingApprovalsRes.headers.get("content-range"));

  jsonOk(res, {
    kernel_status: "active",
    db_status,
    active_orgs,
    active_tasks,
    pending_approvals,
    last_execution: Array.isArray(lastExecutionRes.data) ? lastExecutionRes.data[0] ?? null : null,
  });
}
