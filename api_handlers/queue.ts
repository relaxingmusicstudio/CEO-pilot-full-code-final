import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";
import { getSupabaseConfig, insertTelemetry, readJsonBody, restRequest } from "./execution-spine-lib.js";

type ApiRequest = AsyncIterable<Uint8Array | string> & { method?: string; body?: unknown };
type ApiResponse = { statusCode: number; setHeader: (n: string, v: string) => void; end: (b?: string) => void };

type TaskInput = {
  title?: string;
  payload?: unknown;
  requires_approval?: boolean;
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

  const body = (await readJsonBody(req)) as {
    org_id?: string;
    plan_id?: string;
    tasks?: TaskInput[];
  } | null;

  const org_id = body?.org_id ?? null;
  const plan_id = body?.plan_id ?? null;
  const tasks = Array.isArray(body?.tasks) ? body?.tasks : [];

  const rows = tasks.map((task) => ({
    org_id,
    plan_id,
    title: task.title ?? "task",
    payload: task.payload ?? {},
    status: "proposed",
    requires_approval: task.requires_approval ?? true,
  }));

  if (rows.length > 0) {
    const insert = await restRequest(config, "tasks", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: rows,
    });
    if (!insert.ok) {
      jsonErr(res, 500, "supabase_insert_failed", "supabase_insert_failed");
      return;
    }
  }

  await insertTelemetry(config, "task_queued", {
    org_id,
    plan_id,
    queued: rows.length,
  });

  jsonOk(res, { queued: rows.length });
}
