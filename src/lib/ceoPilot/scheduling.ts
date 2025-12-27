import { ScheduledTask, SchedulingPolicy } from "./contracts";
import { upsertScheduledTask } from "./runtimeState";
import { createId, nowIso } from "./utils";

export type SchedulingContext = {
  identityKey: string;
  taskId: string;
  goalId: string;
  agentId: string;
  taskType: string;
  policy: SchedulingPolicy;
  now?: string;
  action?: ScheduledTask["action"];
  agentContext?: ScheduledTask["agentContext"];
  initiator?: ScheduledTask["initiator"];
  reason?: string;
};

export type SchedulingDecision = {
  executeNow: boolean;
  reason: string;
  scheduledTask?: ScheduledTask;
};

const isWithinOffPeak = (timestamp: Date): boolean => {
  const hour = timestamp.getHours();
  return hour >= 0 && hour < 6;
};

const nextOffPeakStart = (timestamp: Date): Date => {
  const next = new Date(timestamp);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return next;
};

const buildBatchKey = (taskType: string, windowStart: Date): string =>
  `${taskType}:${windowStart.toISOString()}`;

const scheduleAt = (
  policy: SchedulingPolicy,
  taskType: string,
  timestamp: Date
): { scheduledAt: Date; batchKey?: string } => {
  if (policy.mode === "deferred" && policy.batchWindowMinutes > 0) {
    const scheduledAt = new Date(timestamp);
    scheduledAt.setMinutes(scheduledAt.getMinutes() + policy.batchWindowMinutes);
    const windowStart = new Date(timestamp);
    const windowMinutes = Math.max(policy.batchWindowMinutes, 1);
    windowStart.setMinutes(Math.floor(windowStart.getMinutes() / windowMinutes) * windowMinutes, 0, 0);
    return { scheduledAt, batchKey: buildBatchKey(taskType, windowStart) };
  }
  if (policy.mode === "off-peak") {
    const scheduledAt = nextOffPeakStart(timestamp);
    return { scheduledAt, batchKey: buildBatchKey(taskType, scheduledAt) };
  }
  return { scheduledAt: timestamp };
};

export const evaluateSchedulingPolicy = (context: SchedulingContext): SchedulingDecision => {
  const nowValue = context.now ?? nowIso();
  const nowDate = new Date(nowValue);
  const deadline = context.policy.deadlineAt ? new Date(context.policy.deadlineAt) : null;

  if (deadline && nowDate >= deadline) {
    return { executeNow: true, reason: "deadline_due" };
  }

  if (context.policy.mode === "immediate") {
    return { executeNow: true, reason: "immediate" };
  }

  if (context.policy.mode === "off-peak" && isWithinOffPeak(nowDate)) {
    return { executeNow: true, reason: "within_off_peak" };
  }

  const scheduleMeta = scheduleAt(context.policy, context.taskType, nowDate);
  const scheduledTask: ScheduledTask = {
    scheduleId: createId("schedule"),
    taskId: context.taskId,
    goalId: context.goalId,
    agentId: context.agentId,
    taskType: context.taskType,
    policy: context.policy,
    scheduledAt: scheduleMeta.scheduledAt.toISOString(),
    status: context.policy.mode === "deferred" ? "deferred" : "scheduled",
    batchKey: scheduleMeta.batchKey,
    createdAt: nowValue,
    updatedAt: nowValue,
    initiator: context.initiator,
    reason: context.reason,
    action: context.action,
    agentContext: context.agentContext,
    attempts: 0,
  };

  return {
    executeNow: false,
    reason: context.policy.mode === "off-peak" ? "scheduled_off_peak" : "scheduled_deferred",
    scheduledTask,
  };
};

export const applySchedulingPolicy = (context: SchedulingContext): SchedulingDecision => {
  const decision = evaluateSchedulingPolicy(context);
  if (decision.scheduledTask) {
    upsertScheduledTask(context.identityKey, decision.scheduledTask);
  }
  return decision;
};

export const buildCostDeferralPolicy = (now: string = nowIso()): SchedulingPolicy => ({
  policyId: "cost-budget-deferral",
  mode: "deferred",
  urgency: "low",
  batchWindowMinutes: 60,
  createdAt: now,
});

export const scheduleDueToCost = (context: Omit<SchedulingContext, "policy">): SchedulingDecision => {
  const policy = buildCostDeferralPolicy(context.now ?? nowIso());
  return applySchedulingPolicy({ ...context, policy });
};
