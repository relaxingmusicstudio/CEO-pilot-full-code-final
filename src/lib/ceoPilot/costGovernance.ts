import {
  ActionImpact,
  CostBudget,
  ModelTier,
  PermissionTier,
  TaskClass,
  TaskOutcomeRecord,
} from "./contracts";
import {
  ensureDefaultCostBudgets,
  loadCostBudgets,
  loadEmergencyMode,
  loadTaskOutcomes,
  recordCostEvent,
  recordTaskOutcome,
  saveCostRoutingCap,
  upsertCostBudget,
} from "./runtimeState";
import { createId, nowIso } from "./utils";

export type TaskOutcomeStore = {
  record: (record: TaskOutcomeRecord) => TaskOutcomeRecord[];
  list: (taskType?: string) => TaskOutcomeRecord[];
};

export const createTaskOutcomeStore = (identityKey: string): TaskOutcomeStore => ({
  record: (record) => recordTaskOutcome(identityKey, record),
  list: (taskType) => {
    const records = loadTaskOutcomes(identityKey);
    if (!taskType) return records;
    return records.filter((record) => record.taskType === taskType);
  },
});

export const createInMemoryTaskOutcomeStore = (seed: TaskOutcomeRecord[] = []): TaskOutcomeStore => {
  const entries = [...seed];
  return {
    record: (record) => {
      entries.push(record);
      return [...entries];
    },
    list: (taskType) => {
      if (!taskType) return [...entries];
      return entries.filter((record) => record.taskType === taskType);
    },
  };
};

export type CostBudgetStore = {
  list: () => CostBudget[];
  upsert: (budget: CostBudget) => CostBudget[];
};

export const createCostBudgetStore = (identityKey: string): CostBudgetStore => ({
  list: () => loadCostBudgets(identityKey),
  upsert: (budget) => upsertCostBudget(identityKey, budget),
});

export type TaskOutcomeInput = Omit<TaskOutcomeRecord, "outcomeId" | "createdAt"> & {
  outcomeId?: string;
  createdAt?: string;
};

export const recordOutcome = (identityKey: string, input: TaskOutcomeInput): TaskOutcomeRecord[] => {
  const record: TaskOutcomeRecord = {
    outcomeId: input.outcomeId ?? createId("outcome"),
    createdAt: input.createdAt ?? nowIso(),
    ...input,
  };
  return recordTaskOutcome(identityKey, record);
};

export type CostBudgetUsage = {
  budget: CostBudget;
  spentCents: number;
  projectedCents: number;
  remainingCents: number;
  softLimitExceeded: boolean;
  hardLimitExceeded: boolean;
};

export type CostGovernanceContext = {
  identityKey: string;
  goalId?: string;
  agentId?: string;
  taskType?: string;
  taskClass?: TaskClass;
  impact?: ActionImpact;
  estimatedCostCents?: number;
  justification?: string;
  now?: string;
};

export type CostGovernanceDecision = {
  allowed: boolean;
  reason: string;
  requiresHumanReview: boolean;
  blocked: boolean;
  budgetUsage: CostBudgetUsage[];
  softLimitExceeded: boolean;
  hardLimitExceeded: boolean;
  demoteTier?: PermissionTier;
  routingTierCap?: ModelTier;
};

const matchesScope = (
  budget: CostBudget,
  context: CostGovernanceContext,
  record?: TaskOutcomeRecord
): boolean => {
  if (budget.scope.goalId && budget.scope.goalId !== (record?.goalId ?? context.goalId)) {
    return false;
  }
  if (budget.scope.agentId && budget.scope.agentId !== (record?.agentId ?? context.agentId)) {
    return false;
  }
  if (budget.scope.taskType && budget.scope.taskType !== (record?.taskType ?? context.taskType)) {
    return false;
  }
  return true;
};

const getPeriodWindow = (period: CostBudget["period"], nowIsoValue: string): [number, number] => {
  const nowDate = new Date(nowIsoValue);
  const end = nowDate.getTime();
  if (period === "total") {
    return [0, end];
  }
  if (period === "daily") {
    const start = new Date(nowDate);
    start.setHours(0, 0, 0, 0);
    return [start.getTime(), end];
  }
  if (period === "weekly") {
    const start = new Date(nowDate);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    return [start.getTime(), end];
  }
  const start = new Date(nowDate);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return [start.getTime(), end];
};

const isCriticalWork = (context: CostGovernanceContext): boolean =>
  context.taskClass === "high_risk" ||
  context.impact === "irreversible" ||
  context.impact === "difficult";

const computeBudgetUsage = (
  budget: CostBudget,
  outcomes: TaskOutcomeRecord[],
  context: CostGovernanceContext,
  now: string
): CostBudgetUsage => {
  const [start, end] = getPeriodWindow(budget.period, now);
  const spent = outcomes
    .filter((record) => {
      if (!matchesScope(budget, context, record)) return false;
      const timestamp = Date.parse(record.createdAt);
      return timestamp >= start && timestamp <= end;
    })
    .reduce((total, record) => total + record.costCents, 0);
  const projected = spent + Math.max(context.estimatedCostCents ?? 0, 0);
  const remaining = budget.limitCents - projected;
  const softExceeded = projected >= budget.softLimitCents;
  const hardExceeded = projected >= budget.limitCents;
  return {
    budget,
    spentCents: spent,
    projectedCents: projected,
    remainingCents: remaining,
    softLimitExceeded: softExceeded,
    hardLimitExceeded: hardExceeded,
  };
};

const periodEnd = (period: CostBudget["period"], nowIsoValue: string): string | undefined => {
  const nowDate = new Date(nowIsoValue);
  if (period === "total") return undefined;
  if (period === "daily") {
    const end = new Date(nowDate);
    end.setHours(23, 59, 59, 999);
    return end.toISOString();
  }
  if (period === "weekly") {
    const end = new Date(nowDate);
    const day = end.getDay();
    const diff = day === 0 ? 0 : 7 - day;
    end.setDate(end.getDate() + diff);
    end.setHours(23, 59, 59, 999);
    return end.toISOString();
  }
  const end = new Date(nowDate);
  end.setMonth(end.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
};

export const evaluateCostGovernance = (context: CostGovernanceContext): CostGovernanceDecision => {
  ensureDefaultCostBudgets(context.identityKey);
  const emergency = loadEmergencyMode(context.identityKey);
  const critical = isCriticalWork(context);
  if (emergency && emergency.mode !== "normal") {
    if (emergency.blockHighRisk && critical) {
      return {
        allowed: false,
        reason: "emergency_mode_block_high_risk",
        requiresHumanReview: true,
        blocked: true,
        budgetUsage: [],
        softLimitExceeded: false,
        hardLimitExceeded: true,
        demoteTier: "suggest",
        routingTierCap: emergency.maxModelTier ?? "economy",
      };
    }
    if (emergency.scheduleNonCritical && !critical) {
      return {
        allowed: false,
        reason: "emergency_mode_defer",
        requiresHumanReview: false,
        blocked: true,
        budgetUsage: [],
        softLimitExceeded: false,
        hardLimitExceeded: true,
        demoteTier: "suggest",
        routingTierCap: emergency.maxModelTier ?? "economy",
      };
    }
  }
  const budgets = loadCostBudgets(context.identityKey).filter((budget) => budget.status === "active");
  if (budgets.length === 0) {
    return {
      allowed: true,
      reason: "no_budget",
      requiresHumanReview: false,
      blocked: false,
      budgetUsage: [],
      softLimitExceeded: false,
      hardLimitExceeded: false,
    };
  }

  const now = context.now ?? nowIso();
  const outcomes = loadTaskOutcomes(context.identityKey);
  const usage = budgets
    .filter((budget) => matchesScope(budget, context))
    .map((budget) => computeBudgetUsage(budget, outcomes, context, now));

  const softExceeded = usage.some((entry) => entry.softLimitExceeded);
  const hardExceeded = usage.some((entry) => entry.hardLimitExceeded);
  const softBudget = usage.find((entry) => entry.softLimitExceeded);
  const hardBudget = usage.find((entry) => entry.hardLimitExceeded);

  if (hardExceeded && !critical) {
    recordCostEvent(context.identityKey, {
      eventId: createId("cost-event"),
      type: "hard_limit_exceeded",
      identityKey: context.identityKey,
      budgetId: hardBudget?.budget.budgetId,
      goalId: context.goalId,
      agentId: context.agentId,
      taskType: context.taskType,
      taskClass: context.taskClass,
      reason: "hard_limit_blocked",
      justification: context.justification,
      createdAt: now,
      metadata: { remainingCents: hardBudget?.remainingCents },
    });
    return {
      allowed: false,
      reason: "cost_budget_exceeded",
      requiresHumanReview: false,
      blocked: true,
      budgetUsage: usage,
      softLimitExceeded: softExceeded,
      hardLimitExceeded: hardExceeded,
      demoteTier: "suggest",
    };
  }

  if (hardExceeded && critical) {
    recordCostEvent(context.identityKey, {
      eventId: createId("cost-event"),
      type: "hard_limit_exceeded",
      identityKey: context.identityKey,
      budgetId: hardBudget?.budget.budgetId,
      goalId: context.goalId,
      agentId: context.agentId,
      taskType: context.taskType,
      taskClass: context.taskClass,
      reason: "hard_limit_critical",
      justification: context.justification,
      createdAt: now,
      metadata: { remainingCents: hardBudget?.remainingCents },
    });
    return {
      allowed: true,
      reason: "cost_budget_exceeded_critical",
      requiresHumanReview: true,
      blocked: false,
      budgetUsage: usage,
      softLimitExceeded: softExceeded,
      hardLimitExceeded: hardExceeded,
    };
  }

  if (softExceeded) {
    const routingTierCap: ModelTier = "economy";
    if (softBudget) {
      saveCostRoutingCap(context.identityKey, {
        capId: createId("cost-cap"),
        identityKey: context.identityKey,
        tier: routingTierCap,
        reason: "soft_limit_cap",
        budgetId: softBudget.budget.budgetId,
        scope: softBudget.budget.scope,
        createdAt: now,
        expiresAt: periodEnd(softBudget.budget.period, now),
      });
    }
    recordCostEvent(context.identityKey, {
      eventId: createId("cost-event"),
      type: "soft_limit_exceeded",
      identityKey: context.identityKey,
      budgetId: softBudget?.budget.budgetId,
      goalId: context.goalId,
      agentId: context.agentId,
      taskType: context.taskType,
      taskClass: context.taskClass,
      reason: "soft_limit_triggered",
      justification: context.justification,
      createdAt: now,
      metadata: { routingTierCap },
    });
    if (softBudget) {
      recordCostEvent(context.identityKey, {
        eventId: createId("cost-event"),
        type: "routing_cap_applied",
        identityKey: context.identityKey,
        budgetId: softBudget.budget.budgetId,
        goalId: context.goalId,
        agentId: context.agentId,
        taskType: context.taskType,
        taskClass: context.taskClass,
        reason: "routing_tier_cap_applied",
        justification: context.justification,
        createdAt: now,
        metadata: { routingTierCap },
      });
    }
    return {
      allowed: true,
      reason: "cost_budget_soft_limit",
      requiresHumanReview: true,
      blocked: false,
      budgetUsage: usage,
      softLimitExceeded: softExceeded,
      hardLimitExceeded: hardExceeded,
      routingTierCap,
    };
  }

  return {
    allowed: true,
    reason: "cost_budget_ok",
    requiresHumanReview: false,
    blocked: false,
    budgetUsage: usage,
    softLimitExceeded: softExceeded,
    hardLimitExceeded: hardExceeded,
  };
};
