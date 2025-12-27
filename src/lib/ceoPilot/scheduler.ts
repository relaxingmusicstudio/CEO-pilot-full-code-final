import type { DecisionOutcome } from "../decisionOutcome";
import { runPipelineStep } from "../revenueKernel/pipeline";
import type { PolicyContext } from "../policyEngine";
import { loadScheduledTasks, upsertScheduledTask } from "./runtimeState";
import type { ScheduledTask } from "./contracts";
import { nowIso } from "./utils";

export type SchedulerRunOptions = {
  identityKey: string;
  now?: string;
  maxTasks?: number;
  policyContext?: PolicyContext;
};

export type SchedulerRunSummary = {
  processed: number;
  executed: number;
  deferred: number;
  failed: number;
};

const isDue = (task: ScheduledTask, nowValue: string): boolean =>
  (task.status === "scheduled" || task.status === "deferred") &&
  Date.parse(task.scheduledAt) <= Date.parse(nowValue);

const outcomeType = (outcome: DecisionOutcome | null): DecisionOutcome["type"] | "error" => {
  if (!outcome) return "error";
  return outcome.type;
};

const buildDeferredAt = (nowValue: string, minutes: number): string => {
  const next = new Date(nowValue);
  next.setMinutes(next.getMinutes() + minutes);
  return next.toISOString();
};

export const runScheduler = async (options: SchedulerRunOptions): Promise<SchedulerRunSummary> => {
  const nowValue = options.now ?? nowIso();
  const tasks = loadScheduledTasks(options.identityKey);
  const due = tasks.filter((task) => isDue(task, nowValue)).slice(0, options.maxTasks ?? 10);

  let executed = 0;
  let deferred = 0;
  let failed = 0;

  for (const task of due) {
    const attempts = (task.attempts ?? 0) + 1;
    const baseUpdate: ScheduledTask = {
      ...task,
      attempts,
      lastAttemptAt: nowValue,
      updatedAt: nowValue,
    };

    if (!task.action || !task.agentContext) {
      failed += 1;
      upsertScheduledTask(options.identityKey, {
        ...baseUpdate,
        status: "failed",
        failureReason: "missing_payload",
        completedAt: nowValue,
      });
      continue;
    }

    try {
      const result = await runPipelineStep({
        action: task.action,
        identity: { userId: options.identityKey },
        policyContext: options.policyContext,
        agentContext: task.agentContext,
        initiator: task.initiator,
      });
      const outcome = outcomeType(result.outcome);
      if (outcome === "executed") {
        executed += 1;
        upsertScheduledTask(options.identityKey, {
          ...baseUpdate,
          status: "executed",
          completedAt: nowValue,
        });
      } else if (outcome === "deferred") {
        deferred += 1;
        upsertScheduledTask(options.identityKey, {
          ...baseUpdate,
          status: "deferred",
          scheduledAt: buildDeferredAt(nowValue, 60),
          reason: `deferred:${result.outcome.summary}`,
        });
      } else {
        failed += 1;
        upsertScheduledTask(options.identityKey, {
          ...baseUpdate,
          status: "failed",
          failureReason: `outcome:${outcome}`,
          completedAt: nowValue,
        });
      }
    } catch (error) {
      failed += 1;
      upsertScheduledTask(options.identityKey, {
        ...baseUpdate,
        status: "failed",
        failureReason: error instanceof Error ? error.message : "scheduler_error",
        completedAt: nowValue,
      });
    }
  }

  return {
    processed: due.length,
    executed,
    deferred,
    failed,
  };
};
