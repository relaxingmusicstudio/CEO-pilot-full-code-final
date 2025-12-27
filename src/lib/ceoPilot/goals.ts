import { Goal, GoalConflict, GoalStatus } from "./contracts";
import { createId, nowIso } from "./utils";
import {
  loadGoals,
  loadGoalConflicts,
  recordGoalConflict,
  upsertGoal,
  upsertGoalConflict,
} from "./runtimeState";

export const DEFAULT_GOAL_IDS = {
  systemIntegrity: "goal-system-integrity",
  ceoPilot: "goal-ceo-pilot",
} as const;

const DEFAULT_CREATED_AT = "2025-01-01T00:00:00.000Z";
const DEFAULT_EXPIRES_AT = "2099-12-31T00:00:00.000Z";

export const DEFAULT_GOALS: Goal[] = [
  {
    goalId: DEFAULT_GOAL_IDS.systemIntegrity,
    version: "v1",
    owner: { type: "human", id: "system" },
    description: "Protect governance integrity and safe system operation.",
    successMetrics: [
      { metric: "governance_pass_rate", target: ">=0.95", direction: "increase" },
    ],
    createdAt: DEFAULT_CREATED_AT,
    expiresAt: DEFAULT_EXPIRES_AT,
    reviewCadence: "quarterly",
    status: "active",
    tags: ["system", "governance"],
  },
  {
    goalId: DEFAULT_GOAL_IDS.ceoPilot,
    version: "v1",
    owner: { type: "human", id: "system" },
    description: "Operate CEO Pilot safely with transparent decision support.",
    successMetrics: [
      { metric: "decision_support_quality", target: ">=0.85", direction: "increase" },
    ],
    createdAt: DEFAULT_CREATED_AT,
    expiresAt: DEFAULT_EXPIRES_AT,
    reviewCadence: "monthly",
    status: "active",
    tags: ["ceo", "governance"],
  },
];

export const ensureDefaultGoals = (identityKey: string): Goal[] => {
  const existing = loadGoals(identityKey);
  if (existing.length > 0) return existing;
  DEFAULT_GOALS.forEach((goal) => upsertGoal(identityKey, goal));
  return loadGoals(identityKey);
};

export const resolveGoalStatus = (goal: Goal, now: string = nowIso()): GoalStatus => {
  if (goal.status === "suspended") return "suspended";
  if (Date.parse(goal.expiresAt) <= Date.parse(now)) return "expired";
  return goal.status;
};

export const isGoalActive = (goal: Goal, now: string = nowIso()): boolean =>
  resolveGoalStatus(goal, now) === "active";

const buildConflictKey = (goalIds: string[], reason: string): string =>
  `${[...goalIds].sort().join("|")}::${reason}`;

const detectMetricConflicts = (goals: Goal[]): GoalConflict[] => {
  const conflicts: GoalConflict[] = [];
  for (let i = 0; i < goals.length; i += 1) {
    for (let j = i + 1; j < goals.length; j += 1) {
      const left = goals[i];
      const right = goals[j];
      if (!left || !right) continue;
      left.successMetrics.forEach((leftMetric) => {
        right.successMetrics.forEach((rightMetric) => {
          if (leftMetric.metric !== rightMetric.metric) return;
          if (leftMetric.direction === rightMetric.direction) return;
          conflicts.push({
            conflictId: createId("goal-conflict"),
            goalIds: [left.goalId, right.goalId],
            reason: `metric_direction_conflict:${leftMetric.metric}`,
            status: "open",
            createdAt: nowIso(),
          });
        });
      });
    }
  }
  return conflicts;
};

export const detectGoalConflicts = (goals: Goal[], now: string = nowIso()): GoalConflict[] => {
  const activeGoals = goals.filter((goal) => isGoalActive(goal, now));
  if (activeGoals.length < 2) return [];
  return detectMetricConflicts(activeGoals);
};

export const registerGoalConflict = (
  identityKey: string,
  conflict: GoalConflict
): GoalConflict[] => recordGoalConflict(identityKey, conflict);

export const escalateGoalConflict = (
  identityKey: string,
  conflict: GoalConflict,
  arbitrationProtocolId: string,
  now: string = nowIso()
): GoalConflict[] => {
  const updated: GoalConflict = {
    ...conflict,
    status: "escalated",
    arbitrationProtocolId,
    resolvedAt: conflict.resolvedAt,
  };
  return upsertGoalConflict(identityKey, updated);
};

export const findGoalConflicts = (
  identityKey: string,
  goalId: string,
  now: string = nowIso()
): GoalConflict[] => {
  const goals = loadGoals(identityKey);
  const existing = loadGoalConflicts(identityKey);
  const detected = detectGoalConflicts(goals, now);
  const existingKeys = new Set(existing.map((item) => buildConflictKey(item.goalIds, item.reason)));
  detected.forEach((conflict) => {
    const key = buildConflictKey(conflict.goalIds, conflict.reason);
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      registerGoalConflict(identityKey, conflict);
    }
  });

  const allConflicts = loadGoalConflicts(identityKey);
  return allConflicts.filter(
    (conflict) =>
      conflict.status !== "resolved" && conflict.goalIds.includes(goalId) && !conflict.resolvedAt
  );
};
