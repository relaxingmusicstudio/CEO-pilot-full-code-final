import { EvaluationRun } from "./evaluation";
import {
  DebtRecord,
  DebtRecordSchema,
  DistilledRule,
  DistilledRuleSchema,
  CacheEntry,
  CacheEntrySchema,
  CachePreference,
  CachePreferenceSchema,
  CausalChainRecord,
  CausalChainRecordSchema,
  CostBudget,
  CostBudgetSchema,
  CostEventRecord,
  CostEventRecordSchema,
  CostShockEvent,
  CostShockEventSchema,
  CostRoutingCap,
  CostRoutingCapSchema,
  EconomicBudgetState,
  EconomicBudgetStateSchema,
  EconomicAuditRecord,
  EconomicAuditRecordSchema,
  CooperationMetric,
  CooperationMetricSchema,
  Goal,
  GoalConflict,
  GoalConflictSchema,
  GoalSchema,
  HumanControlProfile,
  HumanControlProfileSchema,
  HumanDecisionRecord,
  HumanDecisionRecordSchema,
  RolePolicy,
  RolePolicySchema,
  RoleConstitutionAuditRecord,
  RoleConstitutionAuditRecordSchema,
  ValueAnchor,
  ValueAnchorSchema,
  DriftReport,
  DriftReportSchema,
  ValueReaffirmationRecord,
  ValueReaffirmationRecordSchema,
  ImprovementCandidate,
  ImprovementCandidateSchema,
  ImprovementRunRecord,
  ImprovementRunRecordSchema,
  FailureMemoryRecord,
  FailureMemoryRecordSchema,
  QualityMetricRecord,
  QualityMetricRecordSchema,
  QualityRegressionRecord,
  QualityRegressionRecordSchema,
  RoutingPreference,
  RoutingPreferenceSchema,
  SchedulingPreference,
  SchedulingPreferenceSchema,
  BehaviorFreeze,
  BehaviorFreezeSchema,
  EscalationOverride,
  EscalationOverrideSchema,
  EmergencyModeState,
  EmergencyModeStateSchema,
  RuleUsageRecord,
  RuleUsageRecordSchema,
  ScheduledTask,
  ScheduledTaskSchema,
  ModelRoutingDecision,
  ModelRoutingDecisionSchema,
  ModelRoutingRequest,
  ModelRoutingRequestSchema,
  PermissionTier,
  TaskOutcomeRecord,
  TaskOutcomeRecordSchema,
  TaskHistoryRecord,
  TaskHistoryRecordSchema,
} from "./contracts";
import { createId, nowIso } from "./utils";
import { DEFAULT_VALUE_ANCHORS } from "./valueAnchors";
import { DEFAULT_ROLE_POLICIES } from "./rolePolicies";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

const createMemoryStorage = (): StorageLike => {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
};

const memoryStorage = createMemoryStorage();

const getStorage = (): StorageLike => {
  const globalStorage = (globalThis as { localStorage?: StorageLike }).localStorage;
  if (globalStorage) return globalStorage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return memoryStorage;
};

const EVAL_RUNS_PREFIX = "ppp:ceoPilot:evaluationRuns:v1::";
const AGENT_TIER_PREFIX = "ppp:ceoPilot:agentTier:v1::";
const MODEL_ROUTING_PREFIX = "ppp:ceoPilot:modelRouting:v1::";
const GOAL_PREFIX = "ppp:ceoPilot:goals:v1::";
const GOAL_CONFLICT_PREFIX = "ppp:ceoPilot:goalConflicts:v1::";
const TASK_HISTORY_PREFIX = "ppp:ceoPilot:taskHistory:v1::";
const DEBT_LEDGER_PREFIX = "ppp:ceoPilot:debtLedger:v1::";
const TASK_OUTCOME_PREFIX = "ppp:ceoPilot:taskOutcomes:v1::";
const QUALITY_METRIC_PREFIX = "ppp:ceoPilot:qualityMetrics:v1::";
const QUALITY_REGRESSION_PREFIX = "ppp:ceoPilot:qualityRegressions:v1::";
const IMPROVEMENT_CANDIDATE_PREFIX = "ppp:ceoPilot:improvementCandidates:v1::";
const IMPROVEMENT_RUN_PREFIX = "ppp:ceoPilot:improvementRuns:v1::";
const CAUSAL_CHAIN_PREFIX = "ppp:ceoPilot:causalChains:v1::";
const FAILURE_MEMORY_PREFIX = "ppp:ceoPilot:failureMemory:v1::";
const COST_BUDGET_PREFIX = "ppp:ceoPilot:costBudgets:v1::";
const COST_EVENT_PREFIX = "ppp:ceoPilot:costEvents:v1::";
const COST_SHOCK_PREFIX = "ppp:ceoPilot:costShocks:v1::";
const COST_ROUTING_CAP_PREFIX = "ppp:ceoPilot:costRoutingCap:v1::";
const ECONOMIC_BUDGET_PREFIX = "ppp:ceoPilot:economicBudget:v1::";
const ECONOMIC_AUDIT_PREFIX = "ppp:ceoPilot:economicAudits:v1::";
const CACHE_ENTRY_PREFIX = "ppp:ceoPilot:cacheEntries:v1::";
const CACHE_PREFERENCE_PREFIX = "ppp:ceoPilot:cachePreferences:v1::";
const SCHEDULED_TASK_PREFIX = "ppp:ceoPilot:scheduledTasks:v1::";
const SCHEDULING_PREFERENCE_PREFIX = "ppp:ceoPilot:schedulingPreferences:v1::";
const ROUTING_PREFERENCE_PREFIX = "ppp:ceoPilot:routingPreferences:v1::";
const BEHAVIOR_FREEZE_PREFIX = "ppp:ceoPilot:behaviorFreeze:v1::";
const ESCALATION_OVERRIDE_PREFIX = "ppp:ceoPilot:escalationOverrides:v1::";
const EMERGENCY_MODE_PREFIX = "ppp:ceoPilot:emergencyMode:v1::";
const DISTILLED_RULE_PREFIX = "ppp:ceoPilot:distilledRules:v1::";
const RULE_USAGE_PREFIX = "ppp:ceoPilot:ruleUsage:v1::";
const COOPERATION_METRIC_PREFIX = "ppp:ceoPilot:cooperationMetrics:v1::";
const HUMAN_CONTROL_PREFIX = "ppp:ceoPilot:humanControls:v1::";
const HUMAN_DECISION_PREFIX = "ppp:ceoPilot:humanDecisions:v1::";
const VALUE_ANCHOR_PREFIX = "ppp:ceoPilot:valueAnchors:v1::";
const DRIFT_REPORT_PREFIX = "ppp:ceoPilot:driftReports:v1::";
const VALUE_REAFFIRM_PREFIX = "ppp:ceoPilot:valueReaffirmations:v1::";
const ROLE_POLICY_PREFIX = "ppp:ceoPilot:rolePolicies:v1::";
const ROLE_CONSTITUTION_AUDIT_PREFIX = "ppp:ceoPilot:roleConstitutionAudits:v1::";

const DEFAULT_GOAL_IDS = {
  systemIntegrity: "goal-system-integrity",
  ceoPilot: "goal-ceo-pilot",
};

const DEFAULT_AGENT_IDS = {
  ceo: "ceo_agent",
  revenue: "revenue_agent",
  evaluation: "evaluation_agent",
};

const DEFAULT_BUDGET_CREATED_AT = "2025-01-01T00:00:00.000Z";

const DEFAULT_HUMAN_CONTROL_CREATED_AT = "2025-01-01T00:00:00.000Z";

export const DEFAULT_HUMAN_CONTROLS: HumanControlProfile[] = [
  {
    profileId: "human-control-default",
    identityKey: "system",
    ownerId: "system",
    autonomyCeiling: "execute",
    maxModelTier: "frontier",
    minConfidence: 0.55,
    noveltyThreshold: 0.7,
    requireHumanReviewForIrreversible: true,
    emergencyStop: false,
    createdAt: DEFAULT_HUMAN_CONTROL_CREATED_AT,
    updatedAt: DEFAULT_HUMAN_CONTROL_CREATED_AT,
  },
];

export const DEFAULT_COST_BUDGETS: CostBudget[] = [
  {
    budgetId: "budget-goal-system-integrity-monthly",
    scope: { goalId: DEFAULT_GOAL_IDS.systemIntegrity },
    period: "monthly",
    limitCents: 20000,
    softLimitCents: 15000,
    status: "active",
    createdAt: DEFAULT_BUDGET_CREATED_AT,
  },
  {
    budgetId: "budget-goal-ceo-pilot-monthly",
    scope: { goalId: DEFAULT_GOAL_IDS.ceoPilot },
    period: "monthly",
    limitCents: 50000,
    softLimitCents: 35000,
    status: "active",
    createdAt: DEFAULT_BUDGET_CREATED_AT,
  },
  {
    budgetId: "budget-agent-ceo-weekly",
    scope: { agentId: DEFAULT_AGENT_IDS.ceo },
    period: "weekly",
    limitCents: 15000,
    softLimitCents: 12000,
    status: "active",
    createdAt: DEFAULT_BUDGET_CREATED_AT,
  },
  {
    budgetId: "budget-agent-revenue-weekly",
    scope: { agentId: DEFAULT_AGENT_IDS.revenue },
    period: "weekly",
    limitCents: 25000,
    softLimitCents: 20000,
    status: "active",
    createdAt: DEFAULT_BUDGET_CREATED_AT,
  },
  {
    budgetId: "budget-agent-evaluation-weekly",
    scope: { agentId: DEFAULT_AGENT_IDS.evaluation },
    period: "weekly",
    limitCents: 5000,
    softLimitCents: 4000,
    status: "active",
    createdAt: DEFAULT_BUDGET_CREATED_AT,
  },
];

const readJson = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const loadEvaluationRuns = (identityKey: string, storage: StorageLike = getStorage()): EvaluationRun[] => {
  const raw = storage.getItem(`${EVAL_RUNS_PREFIX}${identityKey}`);
  const parsed = readJson<EvaluationRun[]>(raw, []);
  return Array.isArray(parsed) ? parsed : [];
};

export const saveEvaluationRun = (
  identityKey: string,
  run: EvaluationRun,
  storage: StorageLike = getStorage()
): EvaluationRun[] => {
  const history = loadEvaluationRuns(identityKey, storage);
  const nextHistory = [...history, run];
  try {
    storage.setItem(`${EVAL_RUNS_PREFIX}${identityKey}`, JSON.stringify(nextHistory));
  } catch {
    // ignore persistence errors
  }
  return nextHistory;
};

export type AgentTierState = {
  agentId: string;
  tier: PermissionTier;
  updatedAt: string;
};

export const loadAgentTier = (
  agentId: string,
  fallbackTier: PermissionTier,
  storage: StorageLike = getStorage()
): AgentTierState => {
  const raw = storage.getItem(`${AGENT_TIER_PREFIX}${agentId}`);
  const parsed = readJson<AgentTierState | null>(raw, null);
  if (!parsed || !parsed.tier) {
    return { agentId, tier: fallbackTier, updatedAt: nowIso() };
  }
  return parsed;
};

export const saveAgentTier = (
  agentId: string,
  tier: PermissionTier,
  storage: StorageLike = getStorage()
): AgentTierState => {
  const state: AgentTierState = { agentId, tier, updatedAt: nowIso() };
  try {
    storage.setItem(`${AGENT_TIER_PREFIX}${agentId}`, JSON.stringify(state));
  } catch {
    // ignore persistence errors
  }
  return state;
};

export type ModelRoutingLogEntry = {
  request: ModelRoutingRequest;
  decision: ModelRoutingDecision;
};

export const loadModelRoutingHistory = (
  identityKey: string,
  storage: StorageLike = getStorage()
): ModelRoutingLogEntry[] => {
  const raw = storage.getItem(`${MODEL_ROUTING_PREFIX}${identityKey}`);
  const parsed = readJson<ModelRoutingLogEntry[]>(raw, []);
  if (!Array.isArray(parsed)) return [];

  return parsed.filter((entry) => {
    const requestOk = ModelRoutingRequestSchema.safeParse(entry.request).success;
    const decisionOk = ModelRoutingDecisionSchema.safeParse(entry.decision).success;
    return requestOk && decisionOk;
  });
};

export const saveModelRoutingHistory = (
  identityKey: string,
  entries: ModelRoutingLogEntry[],
  storage: StorageLike = getStorage(),
  maxEntries: number = 200
): ModelRoutingLogEntry[] => {
  const filtered = entries.filter((entry) => {
    const requestOk = ModelRoutingRequestSchema.safeParse(entry.request).success;
    const decisionOk = ModelRoutingDecisionSchema.safeParse(entry.decision).success;
    return requestOk && decisionOk;
  });
  const next = filtered.slice(-maxEntries);
  try {
    storage.setItem(`${MODEL_ROUTING_PREFIX}${identityKey}`, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return next;
};

export const saveModelRoutingDecision = (
  identityKey: string,
  entry: ModelRoutingLogEntry,
  storage: StorageLike = getStorage(),
  maxEntries: number = 200
): ModelRoutingLogEntry[] => {
  const requestParsed = ModelRoutingRequestSchema.safeParse(entry.request);
  const decisionParsed = ModelRoutingDecisionSchema.safeParse(entry.decision);
  if (!requestParsed.success || !decisionParsed.success) {
    return loadModelRoutingHistory(identityKey, storage);
  }

  const history = loadModelRoutingHistory(identityKey, storage);
  const nextHistory = [...history, { request: requestParsed.data, decision: decisionParsed.data }].slice(
    -maxEntries
  );
  try {
    storage.setItem(`${MODEL_ROUTING_PREFIX}${identityKey}`, JSON.stringify(nextHistory));
  } catch {
    // ignore persistence errors
  }
  return nextHistory;
};

export const loadGoals = (identityKey: string, storage: StorageLike = getStorage()): Goal[] => {
  const raw = storage.getItem(`${GOAL_PREFIX}${identityKey}`);
  const parsed = readJson<Goal[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((goal) => GoalSchema.safeParse(goal).success);
};

export const saveGoals = (
  identityKey: string,
  goals: Goal[],
  storage: StorageLike = getStorage()
): Goal[] => {
  const filtered = goals.filter((goal) => GoalSchema.safeParse(goal).success);
  try {
    storage.setItem(`${GOAL_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const upsertGoal = (
  identityKey: string,
  goal: Goal,
  storage: StorageLike = getStorage()
): Goal[] => {
  const parsed = GoalSchema.safeParse(goal);
  if (!parsed.success) return loadGoals(identityKey, storage);
  const existing = loadGoals(identityKey, storage);
  const next = [...existing.filter((item) => item.goalId !== goal.goalId), parsed.data];
  return saveGoals(identityKey, next, storage);
};

export const loadValueAnchors = (
  identityKey: string,
  storage: StorageLike = getStorage()
): ValueAnchor[] => {
  const raw = storage.getItem(`${VALUE_ANCHOR_PREFIX}${identityKey}`);
  const parsed = readJson<ValueAnchor[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((anchor) => ValueAnchorSchema.safeParse(anchor).success);
};

export const saveValueAnchors = (
  identityKey: string,
  anchors: ValueAnchor[],
  storage: StorageLike = getStorage()
): ValueAnchor[] => {
  const filtered = anchors.filter((anchor) => ValueAnchorSchema.safeParse(anchor).success);
  try {
    storage.setItem(`${VALUE_ANCHOR_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const ensureDefaultValueAnchors = (
  identityKey: string,
  storage: StorageLike = getStorage()
): ValueAnchor[] => {
  const existing = loadValueAnchors(identityKey, storage);
  if (existing.length > 0) return existing;
  const seeded = DEFAULT_VALUE_ANCHORS.map((anchor) => ({
    ...anchor,
    createdAt: anchor.createdAt || nowIso(),
  }));
  try {
    storage.setItem(`${VALUE_ANCHOR_PREFIX}${identityKey}`, JSON.stringify(seeded));
  } catch {
    // ignore persistence errors
  }
  return seeded;
};

export const upsertValueAnchor = (
  identityKey: string,
  anchor: ValueAnchor,
  storage: StorageLike = getStorage()
): ValueAnchor[] => {
  const parsed = ValueAnchorSchema.safeParse(anchor);
  if (!parsed.success) return loadValueAnchors(identityKey, storage);
  const existing = loadValueAnchors(identityKey, storage);
  const next = [...existing.filter((item) => item.anchorId !== anchor.anchorId), parsed.data];
  return saveValueAnchors(identityKey, next, storage);
};

export const loadRolePolicies = (
  identityKey: string,
  storage: StorageLike = getStorage()
): RolePolicy[] => {
  const raw = storage.getItem(`${ROLE_POLICY_PREFIX}${identityKey}`);
  const parsed = readJson<RolePolicy[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((policy) => RolePolicySchema.safeParse(policy).success);
};

export const saveRolePolicies = (
  identityKey: string,
  policies: RolePolicy[],
  storage: StorageLike = getStorage()
): RolePolicy[] => {
  const filtered = policies.filter((policy) => RolePolicySchema.safeParse(policy).success);
  try {
    storage.setItem(`${ROLE_POLICY_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const ensureDefaultRolePolicies = (
  identityKey: string,
  storage: StorageLike = getStorage()
): RolePolicy[] => {
  const existing = loadRolePolicies(identityKey, storage);
  if (existing.length > 0) return existing;
  const seeded = DEFAULT_ROLE_POLICIES.map((policy) => ({
    ...policy,
    createdAt: policy.createdAt || nowIso(),
    updatedAt: policy.updatedAt || nowIso(),
  }));
  try {
    storage.setItem(`${ROLE_POLICY_PREFIX}${identityKey}`, JSON.stringify(seeded));
  } catch {
    // ignore persistence errors
  }
  return seeded;
};

export const upsertRolePolicy = (
  identityKey: string,
  policy: RolePolicy,
  storage: StorageLike = getStorage()
): RolePolicy[] => {
  const parsed = RolePolicySchema.safeParse(policy);
  if (!parsed.success) return loadRolePolicies(identityKey, storage);
  const existing = loadRolePolicies(identityKey, storage);
  const next = [...existing.filter((item) => item.policyId !== policy.policyId), parsed.data];
  return saveRolePolicies(identityKey, next, storage);
};

export const loadGoalConflicts = (
  identityKey: string,
  storage: StorageLike = getStorage()
): GoalConflict[] => {
  const raw = storage.getItem(`${GOAL_CONFLICT_PREFIX}${identityKey}`);
  const parsed = readJson<GoalConflict[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((conflict) => GoalConflictSchema.safeParse(conflict).success);
};

export const recordGoalConflict = (
  identityKey: string,
  conflict: GoalConflict,
  storage: StorageLike = getStorage(),
  maxEntries: number = 200
): GoalConflict[] => {
  const parsed = GoalConflictSchema.safeParse(conflict);
  if (!parsed.success) return loadGoalConflicts(identityKey, storage);
  const history = loadGoalConflicts(identityKey, storage);
  const next = [...history, parsed.data].slice(-maxEntries);
  try {
    storage.setItem(`${GOAL_CONFLICT_PREFIX}${identityKey}`, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return next;
};

export const saveGoalConflicts = (
  identityKey: string,
  conflicts: GoalConflict[],
  storage: StorageLike = getStorage()
): GoalConflict[] => {
  const filtered = conflicts.filter((conflict) => GoalConflictSchema.safeParse(conflict).success);
  try {
    storage.setItem(`${GOAL_CONFLICT_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const upsertGoalConflict = (
  identityKey: string,
  conflict: GoalConflict,
  storage: StorageLike = getStorage()
): GoalConflict[] => {
  const parsed = GoalConflictSchema.safeParse(conflict);
  if (!parsed.success) return loadGoalConflicts(identityKey, storage);
  const existing = loadGoalConflicts(identityKey, storage);
  const next = [...existing.filter((item) => item.conflictId !== conflict.conflictId), parsed.data];
  return saveGoalConflicts(identityKey, next, storage);
};

export const loadTaskHistory = (
  identityKey: string,
  storage: StorageLike = getStorage()
): TaskHistoryRecord[] => {
  const raw = storage.getItem(`${TASK_HISTORY_PREFIX}${identityKey}`);
  const parsed = readJson<TaskHistoryRecord[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => TaskHistoryRecordSchema.safeParse(record).success);
};

export const saveTaskHistory = (
  identityKey: string,
  records: TaskHistoryRecord[],
  storage: StorageLike = getStorage()
): TaskHistoryRecord[] => {
  const filtered = records.filter((record) => TaskHistoryRecordSchema.safeParse(record).success);
  try {
    storage.setItem(`${TASK_HISTORY_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const recordTaskHistory = (
  identityKey: string,
  record: TaskHistoryRecord,
  storage: StorageLike = getStorage(),
  maxEntries: number = 300
): TaskHistoryRecord[] => {
  const parsed = TaskHistoryRecordSchema.safeParse(record);
  if (!parsed.success) return loadTaskHistory(identityKey, storage);
  const history = loadTaskHistory(identityKey, storage);
  const next = [...history, parsed.data].slice(-maxEntries);
  try {
    storage.setItem(`${TASK_HISTORY_PREFIX}${identityKey}`, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return next;
};

export const loadDebtLedger = (
  identityKey: string,
  storage: StorageLike = getStorage()
): DebtRecord[] => {
  const raw = storage.getItem(`${DEBT_LEDGER_PREFIX}${identityKey}`);
  const parsed = readJson<DebtRecord[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => DebtRecordSchema.safeParse(record).success);
};

export const saveDebtLedger = (
  identityKey: string,
  records: DebtRecord[],
  storage: StorageLike = getStorage()
): DebtRecord[] => {
  const filtered = records.filter((record) => DebtRecordSchema.safeParse(record).success);
  try {
    storage.setItem(`${DEBT_LEDGER_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const recordDebt = (
  identityKey: string,
  record: DebtRecord,
  storage: StorageLike = getStorage(),
  maxEntries: number = 300
): DebtRecord[] => {
  const parsed = DebtRecordSchema.safeParse(record);
  if (!parsed.success) return loadDebtLedger(identityKey, storage);
  const history = loadDebtLedger(identityKey, storage);
  const next = [...history, parsed.data].slice(-maxEntries);
  try {
    storage.setItem(`${DEBT_LEDGER_PREFIX}${identityKey}`, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return next;
};

export const loadTaskOutcomes = (
  identityKey: string,
  storage: StorageLike = getStorage()
): TaskOutcomeRecord[] => {
  const raw = storage.getItem(`${TASK_OUTCOME_PREFIX}${identityKey}`);
  const parsed = readJson<TaskOutcomeRecord[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => TaskOutcomeRecordSchema.safeParse(record).success);
};

export const saveTaskOutcomes = (
  identityKey: string,
  records: TaskOutcomeRecord[],
  storage: StorageLike = getStorage()
): TaskOutcomeRecord[] => {
  const filtered = records.filter((record) => TaskOutcomeRecordSchema.safeParse(record).success);
  try {
    storage.setItem(`${TASK_OUTCOME_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const recordTaskOutcome = (
  identityKey: string,
  record: TaskOutcomeRecord,
  storage: StorageLike = getStorage(),
  maxEntries: number = 500
): TaskOutcomeRecord[] => {
  const parsed = TaskOutcomeRecordSchema.safeParse(record);
  if (!parsed.success) return loadTaskOutcomes(identityKey, storage);
  const history = loadTaskOutcomes(identityKey, storage);
  const next = [...history, parsed.data].slice(-maxEntries);
  try {
    storage.setItem(`${TASK_OUTCOME_PREFIX}${identityKey}`, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return next;
};

export const loadQualityMetrics = (
  identityKey: string,
  storage: StorageLike = getStorage()
): QualityMetricRecord[] => {
  const raw = storage.getItem(`${QUALITY_METRIC_PREFIX}${identityKey}`);
  const parsed = readJson<QualityMetricRecord[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => QualityMetricRecordSchema.safeParse(record).success);
};

export const saveQualityMetrics = (
  identityKey: string,
  metrics: QualityMetricRecord[],
  storage: StorageLike = getStorage()
): QualityMetricRecord[] => {
  const filtered = metrics.filter((record) => QualityMetricRecordSchema.safeParse(record).success);
  try {
    storage.setItem(`${QUALITY_METRIC_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const upsertQualityMetric = (
  identityKey: string,
  metric: QualityMetricRecord,
  storage: StorageLike = getStorage()
): QualityMetricRecord[] => {
  const parsed = QualityMetricRecordSchema.safeParse(metric);
  if (!parsed.success) return loadQualityMetrics(identityKey, storage);
  const existing = loadQualityMetrics(identityKey, storage);
  const next = [...existing.filter((item) => item.metricId !== metric.metricId), parsed.data];
  return saveQualityMetrics(identityKey, next, storage);
};

export const loadQualityRegressions = (
  identityKey: string,
  storage: StorageLike = getStorage()
): QualityRegressionRecord[] => {
  const raw = storage.getItem(`${QUALITY_REGRESSION_PREFIX}${identityKey}`);
  const parsed = readJson<QualityRegressionRecord[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => QualityRegressionRecordSchema.safeParse(record).success);
};

export const saveQualityRegressions = (
  identityKey: string,
  records: QualityRegressionRecord[],
  storage: StorageLike = getStorage()
): QualityRegressionRecord[] => {
  const filtered = records.filter((record) => QualityRegressionRecordSchema.safeParse(record).success);
  try {
    storage.setItem(`${QUALITY_REGRESSION_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const recordQualityRegression = (
  identityKey: string,
  record: QualityRegressionRecord,
  storage: StorageLike = getStorage(),
  maxEntries: number = 200
): QualityRegressionRecord[] => {
  const parsed = QualityRegressionRecordSchema.safeParse(record);
  if (!parsed.success) return loadQualityRegressions(identityKey, storage);
  const history = loadQualityRegressions(identityKey, storage);
  const next = [...history, parsed.data].slice(-maxEntries);
  try {
    storage.setItem(`${QUALITY_REGRESSION_PREFIX}${identityKey}`, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return next;
};

export const loadImprovementCandidates = (
  identityKey: string,
  storage: StorageLike = getStorage()
): ImprovementCandidate[] => {
  const raw = storage.getItem(`${IMPROVEMENT_CANDIDATE_PREFIX}${identityKey}`);
  const parsed = readJson<ImprovementCandidate[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => ImprovementCandidateSchema.safeParse(record).success);
};

export const saveImprovementCandidates = (
  identityKey: string,
  candidates: ImprovementCandidate[],
  storage: StorageLike = getStorage()
): ImprovementCandidate[] => {
  const filtered = candidates.filter((record) => ImprovementCandidateSchema.safeParse(record).success);
  try {
    storage.setItem(`${IMPROVEMENT_CANDIDATE_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const upsertImprovementCandidate = (
  identityKey: string,
  candidate: ImprovementCandidate,
  storage: StorageLike = getStorage()
): ImprovementCandidate[] => {
  const parsed = ImprovementCandidateSchema.safeParse(candidate);
  if (!parsed.success) return loadImprovementCandidates(identityKey, storage);
  const existing = loadImprovementCandidates(identityKey, storage);
  const next = [...existing.filter((item) => item.candidateId !== candidate.candidateId), parsed.data];
  return saveImprovementCandidates(identityKey, next, storage);
};

export const loadImprovementRuns = (
  identityKey: string,
  storage: StorageLike = getStorage()
): ImprovementRunRecord[] => {
  const raw = storage.getItem(`${IMPROVEMENT_RUN_PREFIX}${identityKey}`);
  const parsed = readJson<ImprovementRunRecord[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => ImprovementRunRecordSchema.safeParse(record).success);
};

export const saveImprovementRuns = (
  identityKey: string,
  records: ImprovementRunRecord[],
  storage: StorageLike = getStorage()
): ImprovementRunRecord[] => {
  const filtered = records.filter((record) => ImprovementRunRecordSchema.safeParse(record).success);
  try {
    storage.setItem(`${IMPROVEMENT_RUN_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const recordImprovementRun = (
  identityKey: string,
  record: ImprovementRunRecord,
  storage: StorageLike = getStorage(),
  maxEntries: number = 200
): ImprovementRunRecord[] => {
  const parsed = ImprovementRunRecordSchema.safeParse(record);
  if (!parsed.success) return loadImprovementRuns(identityKey, storage);
  const history = loadImprovementRuns(identityKey, storage);
  const next = [...history, parsed.data].slice(-maxEntries);
  try {
    storage.setItem(`${IMPROVEMENT_RUN_PREFIX}${identityKey}`, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return next;
};

export const loadCausalChains = (
  identityKey: string,
  storage: StorageLike = getStorage()
): CausalChainRecord[] => {
  const raw = storage.getItem(`${CAUSAL_CHAIN_PREFIX}${identityKey}`);
  const parsed = readJson<CausalChainRecord[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => CausalChainRecordSchema.safeParse(record).success);
};

export const saveCausalChains = (
  identityKey: string,
  records: CausalChainRecord[],
  storage: StorageLike = getStorage()
): CausalChainRecord[] => {
  const filtered = records.filter((record) => CausalChainRecordSchema.safeParse(record).success);
  try {
    storage.setItem(`${CAUSAL_CHAIN_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const recordCausalChain = (
  identityKey: string,
  record: CausalChainRecord,
  storage: StorageLike = getStorage(),
  maxEntries: number = 300
): CausalChainRecord[] => {
  const parsed = CausalChainRecordSchema.safeParse(record);
  if (!parsed.success) return loadCausalChains(identityKey, storage);
  const history = loadCausalChains(identityKey, storage);
  const next = [...history, parsed.data].slice(-maxEntries);
  try {
    storage.setItem(`${CAUSAL_CHAIN_PREFIX}${identityKey}`, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return next;
};

export const loadFailureMemory = (
  identityKey: string,
  storage: StorageLike = getStorage()
): FailureMemoryRecord[] => {
  const raw = storage.getItem(`${FAILURE_MEMORY_PREFIX}${identityKey}`);
  const parsed = readJson<FailureMemoryRecord[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => FailureMemoryRecordSchema.safeParse(record).success);
};

export const saveFailureMemory = (
  identityKey: string,
  records: FailureMemoryRecord[],
  storage: StorageLike = getStorage()
): FailureMemoryRecord[] => {
  const filtered = records.filter((record) => FailureMemoryRecordSchema.safeParse(record).success);
  try {
    storage.setItem(`${FAILURE_MEMORY_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const upsertFailureMemory = (
  identityKey: string,
  record: FailureMemoryRecord,
  storage: StorageLike = getStorage()
): FailureMemoryRecord[] => {
  const parsed = FailureMemoryRecordSchema.safeParse(record);
  if (!parsed.success) return loadFailureMemory(identityKey, storage);
  const existing = loadFailureMemory(identityKey, storage);
  const next = [...existing.filter((item) => item.memoryId !== record.memoryId), parsed.data];
  try {
    storage.setItem(`${FAILURE_MEMORY_PREFIX}${identityKey}`, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return next;
};

export const loadCostBudgets = (
  identityKey: string,
  storage: StorageLike = getStorage()
): CostBudget[] => {
  const raw = storage.getItem(`${COST_BUDGET_PREFIX}${identityKey}`);
  const parsed = readJson<CostBudget[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((budget) => CostBudgetSchema.safeParse(budget).success);
};

export const ensureDefaultCostBudgets = (
  identityKey: string,
  storage: StorageLike = getStorage()
): CostBudget[] => {
  const existing = loadCostBudgets(identityKey, storage);
  if (existing.length > 0) return existing;
  const seeded = DEFAULT_COST_BUDGETS.map((budget) => ({
    ...budget,
    createdAt: budget.createdAt || nowIso(),
  }));
  try {
    storage.setItem(`${COST_BUDGET_PREFIX}${identityKey}`, JSON.stringify(seeded));
  } catch {
    // ignore persistence errors
  }
  seeded.forEach((budget) => {
    recordCostEvent(
      identityKey,
      {
        eventId: createId("cost-event"),
        type: "budget_seeded",
        identityKey,
        budgetId: budget.budgetId,
        goalId: budget.scope.goalId,
        agentId: budget.scope.agentId,
        taskType: budget.scope.taskType,
        reason: "default_budget_seeded",
        createdAt: nowIso(),
        metadata: {
          limitCents: budget.limitCents,
          softLimitCents: budget.softLimitCents,
          period: budget.period,
        },
      },
      storage
    );
  });
  return seeded;
};

export const saveCostBudgets = (
  identityKey: string,
  budgets: CostBudget[],
  storage: StorageLike = getStorage()
): CostBudget[] => {
  const filtered = budgets.filter((budget) => CostBudgetSchema.safeParse(budget).success);
  try {
    storage.setItem(`${COST_BUDGET_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const upsertCostBudget = (
  identityKey: string,
  budget: CostBudget,
  storage: StorageLike = getStorage()
): CostBudget[] => {
  const parsed = CostBudgetSchema.safeParse(budget);
  if (!parsed.success) return loadCostBudgets(identityKey, storage);
  const existing = loadCostBudgets(identityKey, storage);
  const next = [...existing.filter((item) => item.budgetId !== budget.budgetId), parsed.data];
  return saveCostBudgets(identityKey, next, storage);
};

export const loadCostEvents = (
  identityKey: string,
  storage: StorageLike = getStorage()
): CostEventRecord[] => {
  const raw = storage.getItem(`${COST_EVENT_PREFIX}${identityKey}`);
  const parsed = readJson<CostEventRecord[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => CostEventRecordSchema.safeParse(record).success);
};

export const saveCostEvents = (
  identityKey: string,
  records: CostEventRecord[],
  storage: StorageLike = getStorage()
): CostEventRecord[] => {
  const filtered = records.filter((record) => CostEventRecordSchema.safeParse(record).success);
  try {
    storage.setItem(`${COST_EVENT_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const recordCostEvent = (
  identityKey: string,
  record: CostEventRecord,
  storage: StorageLike = getStorage(),
  maxEntries: number = 300
): CostEventRecord[] => {
  const parsed = CostEventRecordSchema.safeParse(record);
  if (!parsed.success) return loadCostEvents(identityKey, storage);
  const history = loadCostEvents(identityKey, storage);
  const next = [...history, parsed.data].slice(-maxEntries);
  try {
    storage.setItem(`${COST_EVENT_PREFIX}${identityKey}`, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return next;
};

export const loadDriftReports = (
  identityKey: string,
  storage: StorageLike = getStorage()
): DriftReport[] => {
  const raw = storage.getItem(`${DRIFT_REPORT_PREFIX}${identityKey}`);
  const parsed = readJson<DriftReport[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => DriftReportSchema.safeParse(record).success);
};

export const saveDriftReports = (
  identityKey: string,
  reports: DriftReport[],
  storage: StorageLike = getStorage()
): DriftReport[] => {
  const filtered = reports.filter((record) => DriftReportSchema.safeParse(record).success);
  try {
    storage.setItem(`${DRIFT_REPORT_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const recordDriftReport = (
  identityKey: string,
  report: DriftReport,
  storage: StorageLike = getStorage(),
  maxEntries: number = 200
): DriftReport[] => {
  const parsed = DriftReportSchema.safeParse(report);
  if (!parsed.success) return loadDriftReports(identityKey, storage);
  const history = loadDriftReports(identityKey, storage);
  const next = [...history, parsed.data].slice(-maxEntries);
  try {
    storage.setItem(`${DRIFT_REPORT_PREFIX}${identityKey}`, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return next;
};

export const loadCostRoutingCap = (
  identityKey: string,
  storage: StorageLike = getStorage()
): CostRoutingCap | null => {
  const key = `${COST_ROUTING_CAP_PREFIX}${identityKey}`;
  const raw = storage.getItem(key);
  const parsed = readJson<CostRoutingCap | null>(raw, null);
  if (!parsed) return null;
  const validated = CostRoutingCapSchema.safeParse(parsed);
  if (!validated.success) return null;
  if (validated.data.expiresAt && Date.parse(validated.data.expiresAt) <= Date.now()) {
    storage.removeItem?.(key);
    return null;
  }
  return validated.data;
};

export const saveCostRoutingCap = (
  identityKey: string,
  cap: CostRoutingCap,
  storage: StorageLike = getStorage()
): CostRoutingCap | null => {
  const parsed = CostRoutingCapSchema.safeParse(cap);
  if (!parsed.success) return null;
  try {
    storage.setItem(`${COST_ROUTING_CAP_PREFIX}${identityKey}`, JSON.stringify(parsed.data));
  } catch {
    // ignore persistence errors
  }
  return parsed.data;
};

export const clearCostRoutingCap = (
  identityKey: string,
  storage: StorageLike = getStorage()
): void => {
  storage.removeItem?.(`${COST_ROUTING_CAP_PREFIX}${identityKey}`);
};

export const loadEconomicBudgetState = (
  identityKey: string,
  storage: StorageLike = getStorage()
): EconomicBudgetState | null => {
  const raw = storage.getItem(`${ECONOMIC_BUDGET_PREFIX}${identityKey}`);
  const parsed = readJson<EconomicBudgetState | null>(raw, null);
  if (!parsed) return null;
  const validated = EconomicBudgetStateSchema.safeParse(parsed);
  return validated.success ? validated.data : null;
};

export const saveEconomicBudgetState = (
  identityKey: string,
  state: EconomicBudgetState,
  storage: StorageLike = getStorage()
): EconomicBudgetState | null => {
  const parsed = EconomicBudgetStateSchema.safeParse(state);
  if (!parsed.success) return null;
  try {
    storage.setItem(`${ECONOMIC_BUDGET_PREFIX}${identityKey}`, JSON.stringify(parsed.data));
  } catch {
    // ignore persistence errors
  }
  return parsed.data;
};

export const loadEconomicAudits = (
  identityKey: string,
  storage: StorageLike = getStorage()
): EconomicAuditRecord[] => {
  const raw = storage.getItem(`${ECONOMIC_AUDIT_PREFIX}${identityKey}`);
  const parsed = readJson<EconomicAuditRecord[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => EconomicAuditRecordSchema.safeParse(record).success);
};

export const saveEconomicAudits = (
  identityKey: string,
  records: EconomicAuditRecord[],
  storage: StorageLike = getStorage()
): EconomicAuditRecord[] => {
  const filtered = records.filter((record) => EconomicAuditRecordSchema.safeParse(record).success);
  try {
    storage.setItem(`${ECONOMIC_AUDIT_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const recordEconomicAudit = (
  identityKey: string,
  record: EconomicAuditRecord,
  storage: StorageLike = getStorage(),
  maxEntries: number = 300
): EconomicAuditRecord[] => {
  const parsed = EconomicAuditRecordSchema.safeParse(record);
  if (!parsed.success) return loadEconomicAudits(identityKey, storage);
  const history = loadEconomicAudits(identityKey, storage);
  const next = [...history, parsed.data].slice(-maxEntries);
  return saveEconomicAudits(identityKey, next, storage);
};

export const loadCostShockEvents = (
  identityKey: string,
  storage: StorageLike = getStorage()
): CostShockEvent[] => {
  const raw = storage.getItem(`${COST_SHOCK_PREFIX}${identityKey}`);
  const parsed = readJson<CostShockEvent[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => CostShockEventSchema.safeParse(record).success);
};

export const saveCostShockEvents = (
  identityKey: string,
  records: CostShockEvent[],
  storage: StorageLike = getStorage()
): CostShockEvent[] => {
  const filtered = records.filter((record) => CostShockEventSchema.safeParse(record).success);
  try {
    storage.setItem(`${COST_SHOCK_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const recordCostShockEvent = (
  identityKey: string,
  record: CostShockEvent,
  storage: StorageLike = getStorage(),
  maxEntries: number = 200
): CostShockEvent[] => {
  const parsed = CostShockEventSchema.safeParse(record);
  if (!parsed.success) return loadCostShockEvents(identityKey, storage);
  const history = loadCostShockEvents(identityKey, storage);
  const next = [...history, parsed.data].slice(-maxEntries);
  try {
    storage.setItem(`${COST_SHOCK_PREFIX}${identityKey}`, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return next;
};

export const loadEmergencyMode = (
  identityKey: string,
  storage: StorageLike = getStorage()
): EmergencyModeState | null => {
  const raw = storage.getItem(`${EMERGENCY_MODE_PREFIX}${identityKey}`);
  const parsed = readJson<EmergencyModeState | null>(raw, null);
  if (!parsed) return null;
  const validated = EmergencyModeStateSchema.safeParse(parsed);
  if (!validated.success) return null;
  if (validated.data.expiresAt && Date.parse(validated.data.expiresAt) <= Date.now()) {
    storage.removeItem?.(`${EMERGENCY_MODE_PREFIX}${identityKey}`);
    return null;
  }
  return validated.data;
};

export const saveEmergencyMode = (
  identityKey: string,
  state: EmergencyModeState,
  storage: StorageLike = getStorage()
): EmergencyModeState | null => {
  const parsed = EmergencyModeStateSchema.safeParse(state);
  if (!parsed.success) return null;
  try {
    storage.setItem(`${EMERGENCY_MODE_PREFIX}${identityKey}`, JSON.stringify(parsed.data));
  } catch {
    // ignore persistence errors
  }
  return parsed.data;
};

export const clearEmergencyMode = (
  identityKey: string,
  storage: StorageLike = getStorage()
): void => {
  storage.removeItem?.(`${EMERGENCY_MODE_PREFIX}${identityKey}`);
};

export const loadCacheEntries = (
  identityKey: string,
  storage: StorageLike = getStorage()
): CacheEntry[] => {
  const raw = storage.getItem(`${CACHE_ENTRY_PREFIX}${identityKey}`);
  const parsed = readJson<CacheEntry[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry) => CacheEntrySchema.safeParse(entry).success);
};

export const saveCacheEntries = (
  identityKey: string,
  entries: CacheEntry[],
  storage: StorageLike = getStorage()
): CacheEntry[] => {
  const filtered = entries.filter((entry) => CacheEntrySchema.safeParse(entry).success);
  try {
    storage.setItem(`${CACHE_ENTRY_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const upsertCacheEntry = (
  identityKey: string,
  entry: CacheEntry,
  storage: StorageLike = getStorage()
): CacheEntry[] => {
  const parsed = CacheEntrySchema.safeParse(entry);
  if (!parsed.success) return loadCacheEntries(identityKey, storage);
  const existing = loadCacheEntries(identityKey, storage);
  const next = [...existing.filter((item) => item.cacheKey !== entry.cacheKey), parsed.data];
  return saveCacheEntries(identityKey, next, storage);
};

export const loadCachePreferences = (
  identityKey: string,
  storage: StorageLike = getStorage()
): CachePreference[] => {
  const raw = storage.getItem(`${CACHE_PREFERENCE_PREFIX}${identityKey}`);
  const parsed = readJson<CachePreference[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => CachePreferenceSchema.safeParse(record).success);
};

export const saveCachePreferences = (
  identityKey: string,
  preferences: CachePreference[],
  storage: StorageLike = getStorage()
): CachePreference[] => {
  const filtered = preferences.filter((record) => CachePreferenceSchema.safeParse(record).success);
  try {
    storage.setItem(`${CACHE_PREFERENCE_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const upsertCachePreference = (
  identityKey: string,
  preference: CachePreference,
  storage: StorageLike = getStorage()
): CachePreference[] => {
  const parsed = CachePreferenceSchema.safeParse(preference);
  if (!parsed.success) return loadCachePreferences(identityKey, storage);
  const existing = loadCachePreferences(identityKey, storage);
  const next = [
    ...existing.filter((item) => item.preferenceId !== preference.preferenceId),
    parsed.data,
  ];
  return saveCachePreferences(identityKey, next, storage);
};

export const loadScheduledTasks = (
  identityKey: string,
  storage: StorageLike = getStorage()
): ScheduledTask[] => {
  const raw = storage.getItem(`${SCHEDULED_TASK_PREFIX}${identityKey}`);
  const parsed = readJson<ScheduledTask[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((task) => ScheduledTaskSchema.safeParse(task).success);
};

export const saveScheduledTasks = (
  identityKey: string,
  tasks: ScheduledTask[],
  storage: StorageLike = getStorage()
): ScheduledTask[] => {
  const filtered = tasks.filter((task) => ScheduledTaskSchema.safeParse(task).success);
  try {
    storage.setItem(`${SCHEDULED_TASK_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const upsertScheduledTask = (
  identityKey: string,
  task: ScheduledTask,
  storage: StorageLike = getStorage()
): ScheduledTask[] => {
  const parsed = ScheduledTaskSchema.safeParse(task);
  if (!parsed.success) return loadScheduledTasks(identityKey, storage);
  const existing = loadScheduledTasks(identityKey, storage);
  const next = [...existing.filter((item) => item.scheduleId !== task.scheduleId), parsed.data];
  return saveScheduledTasks(identityKey, next, storage);
};

export const loadSchedulingPreferences = (
  identityKey: string,
  storage: StorageLike = getStorage()
): SchedulingPreference[] => {
  const raw = storage.getItem(`${SCHEDULING_PREFERENCE_PREFIX}${identityKey}`);
  const parsed = readJson<SchedulingPreference[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => SchedulingPreferenceSchema.safeParse(record).success);
};

export const saveSchedulingPreferences = (
  identityKey: string,
  preferences: SchedulingPreference[],
  storage: StorageLike = getStorage()
): SchedulingPreference[] => {
  const filtered = preferences.filter((record) => SchedulingPreferenceSchema.safeParse(record).success);
  try {
    storage.setItem(`${SCHEDULING_PREFERENCE_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const upsertSchedulingPreference = (
  identityKey: string,
  preference: SchedulingPreference,
  storage: StorageLike = getStorage()
): SchedulingPreference[] => {
  const parsed = SchedulingPreferenceSchema.safeParse(preference);
  if (!parsed.success) return loadSchedulingPreferences(identityKey, storage);
  const existing = loadSchedulingPreferences(identityKey, storage);
  const next = [
    ...existing.filter((item) => item.preferenceId !== preference.preferenceId),
    parsed.data,
  ];
  return saveSchedulingPreferences(identityKey, next, storage);
};

export const loadRoutingPreferences = (
  identityKey: string,
  storage: StorageLike = getStorage()
): RoutingPreference[] => {
  const raw = storage.getItem(`${ROUTING_PREFERENCE_PREFIX}${identityKey}`);
  const parsed = readJson<RoutingPreference[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => RoutingPreferenceSchema.safeParse(record).success);
};

export const saveRoutingPreferences = (
  identityKey: string,
  preferences: RoutingPreference[],
  storage: StorageLike = getStorage()
): RoutingPreference[] => {
  const filtered = preferences.filter((record) => RoutingPreferenceSchema.safeParse(record).success);
  try {
    storage.setItem(`${ROUTING_PREFERENCE_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const upsertRoutingPreference = (
  identityKey: string,
  preference: RoutingPreference,
  storage: StorageLike = getStorage()
): RoutingPreference[] => {
  const parsed = RoutingPreferenceSchema.safeParse(preference);
  if (!parsed.success) return loadRoutingPreferences(identityKey, storage);
  const existing = loadRoutingPreferences(identityKey, storage);
  const next = [
    ...existing.filter((item) => item.preferenceId !== preference.preferenceId),
    parsed.data,
  ];
  return saveRoutingPreferences(identityKey, next, storage);
};

export const loadBehaviorFreezes = (
  identityKey: string,
  storage: StorageLike = getStorage()
): BehaviorFreeze[] => {
  const raw = storage.getItem(`${BEHAVIOR_FREEZE_PREFIX}${identityKey}`);
  const parsed = readJson<BehaviorFreeze[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => BehaviorFreezeSchema.safeParse(record).success);
};

export const saveBehaviorFreezes = (
  identityKey: string,
  records: BehaviorFreeze[],
  storage: StorageLike = getStorage()
): BehaviorFreeze[] => {
  const filtered = records.filter((record) => BehaviorFreezeSchema.safeParse(record).success);
  try {
    storage.setItem(`${BEHAVIOR_FREEZE_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const upsertBehaviorFreeze = (
  identityKey: string,
  freeze: BehaviorFreeze,
  storage: StorageLike = getStorage()
): BehaviorFreeze[] => {
  const parsed = BehaviorFreezeSchema.safeParse(freeze);
  if (!parsed.success) return loadBehaviorFreezes(identityKey, storage);
  const existing = loadBehaviorFreezes(identityKey, storage);
  const next = [...existing.filter((item) => item.freezeId !== freeze.freezeId), parsed.data];
  try {
    storage.setItem(`${BEHAVIOR_FREEZE_PREFIX}${identityKey}`, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return next;
};

export const loadEscalationOverrides = (
  identityKey: string,
  storage: StorageLike = getStorage()
): EscalationOverride[] => {
  const raw = storage.getItem(`${ESCALATION_OVERRIDE_PREFIX}${identityKey}`);
  const parsed = readJson<EscalationOverride[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => EscalationOverrideSchema.safeParse(record).success);
};

export const saveEscalationOverrides = (
  identityKey: string,
  records: EscalationOverride[],
  storage: StorageLike = getStorage()
): EscalationOverride[] => {
  const filtered = records.filter((record) => EscalationOverrideSchema.safeParse(record).success);
  try {
    storage.setItem(`${ESCALATION_OVERRIDE_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const upsertEscalationOverride = (
  identityKey: string,
  override: EscalationOverride,
  storage: StorageLike = getStorage()
): EscalationOverride[] => {
  const parsed = EscalationOverrideSchema.safeParse(override);
  if (!parsed.success) return loadEscalationOverrides(identityKey, storage);
  const existing = loadEscalationOverrides(identityKey, storage);
  const next = [
    ...existing.filter((item) => item.overrideId !== override.overrideId),
    parsed.data,
  ];
  try {
    storage.setItem(`${ESCALATION_OVERRIDE_PREFIX}${identityKey}`, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return next;
};

export const loadDistilledRules = (
  identityKey: string,
  storage: StorageLike = getStorage()
): DistilledRule[] => {
  const raw = storage.getItem(`${DISTILLED_RULE_PREFIX}${identityKey}`);
  const parsed = readJson<DistilledRule[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((rule) => DistilledRuleSchema.safeParse(rule).success);
};

export const saveDistilledRules = (
  identityKey: string,
  rules: DistilledRule[],
  storage: StorageLike = getStorage()
): DistilledRule[] => {
  const filtered = rules.filter((rule) => DistilledRuleSchema.safeParse(rule).success);
  try {
    storage.setItem(`${DISTILLED_RULE_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const upsertDistilledRule = (
  identityKey: string,
  rule: DistilledRule,
  storage: StorageLike = getStorage()
): DistilledRule[] => {
  const parsed = DistilledRuleSchema.safeParse(rule);
  if (!parsed.success) return loadDistilledRules(identityKey, storage);
  const existing = loadDistilledRules(identityKey, storage);
  const next = [...existing.filter((item) => item.ruleId !== rule.ruleId), parsed.data];
  return saveDistilledRules(identityKey, next, storage);
};

export const loadRuleUsage = (
  identityKey: string,
  storage: StorageLike = getStorage()
): RuleUsageRecord[] => {
  const raw = storage.getItem(`${RULE_USAGE_PREFIX}${identityKey}`);
  const parsed = readJson<RuleUsageRecord[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => RuleUsageRecordSchema.safeParse(record).success);
};

export const saveRuleUsage = (
  identityKey: string,
  records: RuleUsageRecord[],
  storage: StorageLike = getStorage()
): RuleUsageRecord[] => {
  const filtered = records.filter((record) => RuleUsageRecordSchema.safeParse(record).success);
  try {
    storage.setItem(`${RULE_USAGE_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const recordRuleUsage = (
  identityKey: string,
  record: RuleUsageRecord,
  storage: StorageLike = getStorage(),
  maxEntries: number = 500
): RuleUsageRecord[] => {
  const parsed = RuleUsageRecordSchema.safeParse(record);
  if (!parsed.success) return loadRuleUsage(identityKey, storage);
  const history = loadRuleUsage(identityKey, storage);
  const next = [...history, parsed.data].slice(-maxEntries);
  try {
    storage.setItem(`${RULE_USAGE_PREFIX}${identityKey}`, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return next;
};

export const loadCooperationMetrics = (
  identityKey: string,
  storage: StorageLike = getStorage()
): CooperationMetric[] => {
  const raw = storage.getItem(`${COOPERATION_METRIC_PREFIX}${identityKey}`);
  const parsed = readJson<CooperationMetric[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => CooperationMetricSchema.safeParse(record).success);
};

export const saveCooperationMetrics = (
  identityKey: string,
  records: CooperationMetric[],
  storage: StorageLike = getStorage()
): CooperationMetric[] => {
  const filtered = records.filter((record) => CooperationMetricSchema.safeParse(record).success);
  try {
    storage.setItem(`${COOPERATION_METRIC_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const upsertCooperationMetric = (
  identityKey: string,
  metric: CooperationMetric,
  storage: StorageLike = getStorage()
): CooperationMetric[] => {
  const parsed = CooperationMetricSchema.safeParse(metric);
  if (!parsed.success) return loadCooperationMetrics(identityKey, storage);
  const existing = loadCooperationMetrics(identityKey, storage);
  const next = [
    ...existing.filter(
      (item) => item.metricId !== metric.metricId || item.agentA !== metric.agentA || item.agentB !== metric.agentB
    ),
    parsed.data,
  ];
  try {
    storage.setItem(`${COOPERATION_METRIC_PREFIX}${identityKey}`, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return next;
};

export const loadHumanControls = (
  identityKey: string,
  storage: StorageLike = getStorage()
): HumanControlProfile[] => {
  const raw = storage.getItem(`${HUMAN_CONTROL_PREFIX}${identityKey}`);
  const parsed = readJson<HumanControlProfile[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => HumanControlProfileSchema.safeParse(record).success);
};

export const saveHumanControls = (
  identityKey: string,
  profiles: HumanControlProfile[],
  storage: StorageLike = getStorage()
): HumanControlProfile[] => {
  const filtered = profiles.filter((record) => HumanControlProfileSchema.safeParse(record).success);
  try {
    storage.setItem(`${HUMAN_CONTROL_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const ensureDefaultHumanControls = (
  identityKey: string,
  storage: StorageLike = getStorage()
): HumanControlProfile[] => {
  const existing = loadHumanControls(identityKey, storage);
  if (existing.length > 0) return existing;
  const seeded = DEFAULT_HUMAN_CONTROLS.map((profile) => ({
    ...profile,
    identityKey,
    createdAt: profile.createdAt || nowIso(),
    updatedAt: profile.updatedAt || nowIso(),
  }));
  try {
    storage.setItem(`${HUMAN_CONTROL_PREFIX}${identityKey}`, JSON.stringify(seeded));
  } catch {
    // ignore persistence errors
  }
  return seeded;
};

export const upsertHumanControlProfile = (
  identityKey: string,
  profile: HumanControlProfile,
  storage: StorageLike = getStorage()
): HumanControlProfile[] => {
  const parsed = HumanControlProfileSchema.safeParse(profile);
  if (!parsed.success) return loadHumanControls(identityKey, storage);
  const existing = loadHumanControls(identityKey, storage);
  const next = [
    ...existing.filter((item) => item.profileId !== profile.profileId),
    parsed.data,
  ];
  return saveHumanControls(identityKey, next, storage);
};

export const loadHumanDecisions = (
  identityKey: string,
  storage: StorageLike = getStorage()
): HumanDecisionRecord[] => {
  const raw = storage.getItem(`${HUMAN_DECISION_PREFIX}${identityKey}`);
  const parsed = readJson<HumanDecisionRecord[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => HumanDecisionRecordSchema.safeParse(record).success);
};

export const saveHumanDecisions = (
  identityKey: string,
  decisions: HumanDecisionRecord[],
  storage: StorageLike = getStorage()
): HumanDecisionRecord[] => {
  const filtered = decisions.filter((record) => HumanDecisionRecordSchema.safeParse(record).success);
  try {
    storage.setItem(`${HUMAN_DECISION_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const recordHumanDecision = (
  identityKey: string,
  decision: HumanDecisionRecord,
  storage: StorageLike = getStorage(),
  maxEntries: number = 300
): HumanDecisionRecord[] => {
  const parsed = HumanDecisionRecordSchema.safeParse(decision);
  if (!parsed.success) return loadHumanDecisions(identityKey, storage);
  const history = loadHumanDecisions(identityKey, storage);
  const next = [...history, parsed.data].slice(-maxEntries);
  return saveHumanDecisions(identityKey, next, storage);
};

export const loadRoleConstitutionAudits = (
  identityKey: string,
  storage: StorageLike = getStorage()
): RoleConstitutionAuditRecord[] => {
  const raw = storage.getItem(`${ROLE_CONSTITUTION_AUDIT_PREFIX}${identityKey}`);
  const parsed = readJson<RoleConstitutionAuditRecord[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => RoleConstitutionAuditRecordSchema.safeParse(record).success);
};

export const saveRoleConstitutionAudits = (
  identityKey: string,
  records: RoleConstitutionAuditRecord[],
  storage: StorageLike = getStorage()
): RoleConstitutionAuditRecord[] => {
  const filtered = records.filter((record) => RoleConstitutionAuditRecordSchema.safeParse(record).success);
  try {
    storage.setItem(`${ROLE_CONSTITUTION_AUDIT_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const recordRoleConstitutionAudit = (
  identityKey: string,
  record: RoleConstitutionAuditRecord,
  storage: StorageLike = getStorage(),
  maxEntries: number = 300
): RoleConstitutionAuditRecord[] => {
  const parsed = RoleConstitutionAuditRecordSchema.safeParse(record);
  if (!parsed.success) return loadRoleConstitutionAudits(identityKey, storage);
  const history = loadRoleConstitutionAudits(identityKey, storage);
  const next = [...history, parsed.data].slice(-maxEntries);
  return saveRoleConstitutionAudits(identityKey, next, storage);
};

export const loadValueReaffirmations = (
  identityKey: string,
  storage: StorageLike = getStorage()
): ValueReaffirmationRecord[] => {
  const raw = storage.getItem(`${VALUE_REAFFIRM_PREFIX}${identityKey}`);
  const parsed = readJson<ValueReaffirmationRecord[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((record) => ValueReaffirmationRecordSchema.safeParse(record).success);
};

export const saveValueReaffirmations = (
  identityKey: string,
  records: ValueReaffirmationRecord[],
  storage: StorageLike = getStorage()
): ValueReaffirmationRecord[] => {
  const filtered = records.filter((record) => ValueReaffirmationRecordSchema.safeParse(record).success);
  try {
    storage.setItem(`${VALUE_REAFFIRM_PREFIX}${identityKey}`, JSON.stringify(filtered));
  } catch {
    // ignore persistence errors
  }
  return filtered;
};

export const recordValueReaffirmation = (
  identityKey: string,
  record: ValueReaffirmationRecord,
  storage: StorageLike = getStorage(),
  maxEntries: number = 200
): ValueReaffirmationRecord[] => {
  const parsed = ValueReaffirmationRecordSchema.safeParse(record);
  if (!parsed.success) return loadValueReaffirmations(identityKey, storage);
  const history = loadValueReaffirmations(identityKey, storage);
  const next = [...history, parsed.data].slice(-maxEntries);
  return saveValueReaffirmations(identityKey, next, storage);
};
