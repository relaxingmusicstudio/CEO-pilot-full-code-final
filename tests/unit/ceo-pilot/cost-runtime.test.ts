import { describe, expect, it } from "vitest";
import { executeActionPipeline } from "../../../src/lib/actionPipeline";
import { runPipelineStep } from "../../../src/lib/revenueKernel/pipeline";
import { evaluateCostGovernance } from "../../../src/lib/ceoPilot/costGovernance";
import {
  loadCostBudgets,
  loadCostRoutingCap,
  loadScheduledTasks,
  saveCostBudgets,
  upsertScheduledTask,
} from "../../../src/lib/ceoPilot/runtimeState";
import { runScheduler } from "../../../src/lib/ceoPilot/scheduler";
import type { ScheduledTask, SchedulingPolicy } from "../../../src/lib/ceoPilot/contracts";
import { nowIso } from "../../../src/lib/ceoPilot/utils";
import { buildTestAgentContext } from "../helpers/agentContext";
import { computeActionId, type ActionSpec } from "../../../src/types/actions";

const buildAction = (overrides: Partial<Omit<ActionSpec, "action_id">> = {}): ActionSpec => {
  const base: Omit<ActionSpec, "action_id"> = {
    action_type: "task",
    description: "Cost runtime test action",
    intent_id: "intent-cost",
    expected_metric: "metric",
    risk_level: "low",
    irreversible: false,
    payload: {},
    ...overrides,
  };
  return { ...base, action_id: computeActionId(base) };
};

describe("ceoPilot cost runtime wiring", () => {
  it("throws when cost context is missing in runtime pipeline", async () => {
    const action = buildAction();
    const context = buildTestAgentContext(action.action_type) as unknown as Record<string, unknown>;
    delete context.taskType;
    delete context.taskClass;
    delete context.estimatedCostCents;

    const prior = process.env.PPP_FORCE_RUNTIME;
    process.env.PPP_FORCE_RUNTIME = "true";
    try {
      await expect(
        executeActionPipeline(action, {
          identityKey: "test:cost:missing",
          agentContext: context,
        })
      ).rejects.toThrow("cost_context_required");
    } finally {
      if (prior === undefined) {
        delete process.env.PPP_FORCE_RUNTIME;
      } else {
        process.env.PPP_FORCE_RUNTIME = prior;
      }
    }
  });

  it("seeds cost budgets automatically", () => {
    const identityKey = "test:cost:seed";
    expect(loadCostBudgets(identityKey)).toHaveLength(0);
    evaluateCostGovernance({
      identityKey,
      taskType: "seed",
      taskClass: "routine",
      estimatedCostCents: 1,
    });
    expect(loadCostBudgets(identityKey).length).toBeGreaterThan(0);
  });

  it("applies routing downgrade on soft limit", () => {
    const identityKey = "test:cost:soft";
    saveCostBudgets(identityKey, [
      {
        budgetId: "budget-soft",
        scope: { taskType: "task" },
        period: "daily",
        limitCents: 100,
        softLimitCents: 50,
        status: "active",
        createdAt: nowIso(),
      },
    ]);

    const decision = evaluateCostGovernance({
      identityKey,
      taskType: "task",
      taskClass: "routine",
      estimatedCostCents: 60,
      justification: "soft limit test",
    });

    expect(decision.softLimitExceeded).toBe(true);
    expect(decision.routingTierCap).toBe("economy");
    const cap = loadCostRoutingCap(identityKey);
    expect(cap?.tier).toBe("economy");
  });

  it("blocks hard limit and schedules the task", async () => {
    const identityKey = "test:cost:hard";
    saveCostBudgets(identityKey, [
      {
        budgetId: "budget-hard",
        scope: { goalId: "goal-system-integrity" },
        period: "daily",
        limitCents: 10,
        softLimitCents: 5,
        status: "active",
        createdAt: nowIso(),
      },
    ]);

    const action = buildAction();
    const agentContext = buildTestAgentContext(action.action_type, {
      goalId: "goal-system-integrity",
      taskId: action.action_id,
      estimatedCostCents: 50,
    });

    const result = await runPipelineStep({
      action,
      identity: { userId: identityKey },
      policyContext: { mode: "MOCK", trustLevel: 1 },
      agentContext,
    });

    expect(result.outcome.type).toBe("deferred");
    const scheduled = loadScheduledTasks(identityKey);
    expect(scheduled.length).toBeGreaterThan(0);
    expect(scheduled[0]?.status).toBe("deferred");
  });

  it("scheduler executes due tasks and respects governance", async () => {
    const identityKey = "test:cost:scheduler";
    const now = nowIso();
    const policy: SchedulingPolicy = {
      policyId: "policy-test",
      mode: "deferred",
      urgency: "low",
      batchWindowMinutes: 0,
      createdAt: now,
    };

    const action = buildAction();
    const allowedContext = buildTestAgentContext(action.action_type, {
      taskId: action.action_id,
    });

    const blockedAction = buildAction({ irreversible: true, risk_level: "high" });
    const blockedContext = buildTestAgentContext(blockedAction.action_type, {
      taskId: blockedAction.action_id,
      impact: "irreversible",
      taskClass: "high_risk",
    });

    const tasks: ScheduledTask[] = [
      {
        scheduleId: "schedule-allowed",
        taskId: action.action_id,
        goalId: allowedContext.goalId ?? "goal-system-integrity",
        agentId: allowedContext.agentId,
        taskType: allowedContext.taskType ?? "action:task",
        policy,
        scheduledAt: now,
        status: "scheduled",
        createdAt: now,
        action,
        agentContext: allowedContext,
      },
      {
        scheduleId: "schedule-blocked",
        taskId: blockedAction.action_id,
        goalId: blockedContext.goalId ?? "goal-system-integrity",
        agentId: blockedContext.agentId,
        taskType: blockedContext.taskType ?? "action:task",
        policy,
        scheduledAt: now,
        status: "scheduled",
        createdAt: now,
        action: blockedAction,
        agentContext: blockedContext,
      },
    ];

    tasks.forEach((task) => upsertScheduledTask(identityKey, task));

    const summary = await runScheduler({
      identityKey,
      now,
      policyContext: { mode: "MOCK", trustLevel: 1 },
    });

    expect(summary.processed).toBe(2);
    const updated = loadScheduledTasks(identityKey);
    const allowed = updated.find((task) => task.scheduleId === "schedule-allowed");
    const blocked = updated.find((task) => task.scheduleId === "schedule-blocked");
    expect(allowed?.status).toBe("executed");
    expect(blocked?.status).toBe("failed");
    expect(blocked?.failureReason).toContain("outcome");
  });
});
