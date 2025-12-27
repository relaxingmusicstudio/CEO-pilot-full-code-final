import {
  DistilledRule,
  DistilledRuleSchema,
  RuleUsageRecord,
  RuleUsageRecordSchema,
  TaskOutcomeRecord,
} from "./contracts";
import {
  loadDistilledRules,
  loadTaskOutcomes,
  loadRuleUsage,
  recordRuleUsage,
  upsertDistilledRule,
} from "./runtimeState";
import { buildLineageMetadata } from "./interpretability";
import { createId, nowIso } from "./utils";

export type DistilledRuleStore = {
  list: () => DistilledRule[];
  upsert: (rule: DistilledRule) => DistilledRule[];
};

export const createDistilledRuleStore = (identityKey: string): DistilledRuleStore => ({
  list: () => loadDistilledRules(identityKey),
  upsert: (rule) => upsertDistilledRule(identityKey, rule),
});

export const createInMemoryDistilledRuleStore = (seed: DistilledRule[] = []): DistilledRuleStore => {
  const entries = [...seed];
  return {
    list: () => [...entries],
    upsert: (rule) => {
      const index = entries.findIndex((item) => item.ruleId === rule.ruleId);
      if (index >= 0) {
        entries[index] = rule;
      } else {
        entries.push(rule);
      }
      return [...entries];
    },
  };
};

export type RuleUsageStore = {
  record: (record: RuleUsageRecord) => RuleUsageRecord[];
  list: () => RuleUsageRecord[];
};

export const createRuleUsageStore = (identityKey: string): RuleUsageStore => ({
  record: (record) => recordRuleUsage(identityKey, record),
  list: () => loadRuleUsage(identityKey),
});

export const findActiveRule = (
  store: DistilledRuleStore,
  params: { taskType: string; inputHash: string; goalId: string }
): DistilledRule | null => {
  const rule = store
    .list()
    .find(
      (item) =>
        item.status === "active" &&
        item.taskType === params.taskType &&
        item.inputHash === params.inputHash &&
        item.goalId === params.goalId
    );
  return rule ?? null;
};

export type RuleExecutionDecision = {
  hit: boolean;
  reason: string;
  rule?: DistilledRule;
  output?: Record<string, unknown>;
};

export const applyDistilledRule = (
  store: DistilledRuleStore,
  context: { taskId: string; taskType: string; inputHash: string; goalId: string; now?: string },
  usageStore?: RuleUsageStore
): RuleExecutionDecision => {
  const now = context.now ?? nowIso();
  const rule = findActiveRule(store, context);
  if (!rule) {
    return { hit: false, reason: "no_rule" };
  }
  if (rule.expiresAt && Date.parse(rule.expiresAt) <= Date.parse(now)) {
    return { hit: false, reason: "rule_expired" };
  }
  if (rule.status !== "active") {
    return { hit: false, reason: "rule_inactive" };
  }
  const record: RuleUsageRecord = {
    usageId: createId("rule-use"),
    ruleId: rule.ruleId,
    taskId: context.taskId,
    success: true,
    createdAt: now,
  };
  const parsed = RuleUsageRecordSchema.safeParse(record);
  if (parsed.success) {
    usageStore?.record(parsed.data);
  }
  store.upsert({ ...rule, lastUsedAt: now, updatedAt: now });
  return { hit: true, reason: "rule_applied", rule, output: rule.output };
};

export type DistillationPolicy = {
  minSuccesses: number;
  minQualityScore: number;
  maxFailures: number;
  maxErrorRate: number;
  ruleTtlDays: number;
  assumedRuleCostCents: number;
};

export const defaultDistillationPolicy: DistillationPolicy = {
  minSuccesses: 3,
  minQualityScore: 0.8,
  maxFailures: 1,
  maxErrorRate: 0.2,
  ruleTtlDays: 30,
  assumedRuleCostCents: 1,
};

const computeConfidenceBounds = (successes: number, failures: number): [number, number] => {
  const total = Math.max(successes + failures, 1);
  const rate = successes / total;
  const delta = Math.min(0.2, 1 / Math.sqrt(total));
  return [Math.max(0, rate - delta), Math.min(1, rate + delta)];
};

const computeErrorRate = (successes: number, failures: number): number => {
  const total = Math.max(successes + failures, 1);
  return failures / total;
};

export const considerDistillation = (
  identityKey: string,
  params: {
    taskType: string;
    inputHash: string;
    goalId: string;
    output: Record<string, unknown>;
    outcomes?: TaskOutcomeRecord[];
    policy?: DistillationPolicy;
  },
  store: DistilledRuleStore = createDistilledRuleStore(identityKey)
): DistilledRule | null => {
  const now = nowIso();
  const policy = params.policy ?? defaultDistillationPolicy;
  const existing = findActiveRule(store, params);
  if (existing) return existing;

  const outcomes = params.outcomes ?? loadTaskOutcomes(identityKey);
  const eligible = outcomes.filter(
    (record) =>
      record.taskType === params.taskType &&
      record.goalId === params.goalId &&
      record.inputHash === params.inputHash &&
      record.taskClass === "routine" &&
      record.evaluationPassed &&
      record.qualityScore >= policy.minQualityScore
  );

  if (eligible.length < policy.minSuccesses) {
    return null;
  }

  const averageCostCents =
    eligible.reduce((total, record) => total + record.costCents, 0) / Math.max(eligible.length, 1);
  const ruleCostCents = Math.max(policy.assumedRuleCostCents, 0);
  if (ruleCostCents >= averageCostCents) {
    return null;
  }

  const reviewDays = policy.ruleTtlDays > 0 ? policy.ruleTtlDays : 30;
  const lineage = buildLineageMetadata(eligible, now, reviewDays);
  const expiresAt =
    policy.ruleTtlDays > 0
      ? new Date(Date.parse(now) + policy.ruleTtlDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;
  const rule: DistilledRule = {
    ruleId: createId("rule"),
    version: "v1",
    taskType: params.taskType,
    inputHash: params.inputHash,
    goalId: params.goalId,
    output: params.output,
    successCount: eligible.length,
    failureCount: 0,
    errorRate: 0,
    status: "active",
    provenance: {
      ...lineage,
      sourceModelTier: eligible[0]?.modelTier,
      sourceModelId: eligible[0]?.modelId,
      createdBy: "improvement_loop",
    },
    confidenceLowerBound: computeConfidenceBounds(eligible.length, 0)[0],
    confidenceUpperBound: computeConfidenceBounds(eligible.length, 0)[1],
    ruleCostCents,
    sourceCostCents: Math.round(averageCostCents),
    createdAt: now,
    updatedAt: now,
    lastValidatedAt: now,
    expiresAt,
  };

  const parsed = DistilledRuleSchema.safeParse(rule);
  if (!parsed.success) {
    throw new Error("distilled_rule_invalid");
  }
  store.upsert(parsed.data);
  return parsed.data;
};

export const updateRuleOutcome = (
  store: DistilledRuleStore,
  rule: DistilledRule,
  success: boolean,
  policy: DistillationPolicy = defaultDistillationPolicy,
  now: string = nowIso()
): DistilledRule => {
  const nextSuccessCount = rule.successCount + (success ? 1 : 0);
  const nextFailureCount = rule.failureCount + (success ? 0 : 1);
  const nextErrorRate = computeErrorRate(nextSuccessCount, nextFailureCount);
  const [lower, upper] = computeConfidenceBounds(nextSuccessCount, nextFailureCount);
  const updated: DistilledRule = {
    ...rule,
    successCount: nextSuccessCount,
    failureCount: nextFailureCount,
    errorRate: nextErrorRate,
    confidenceLowerBound: lower,
    confidenceUpperBound: upper,
    status:
      (!success && rule.failureCount + 1 >= policy.maxFailures) || nextErrorRate > policy.maxErrorRate
        ? "demoted"
        : rule.status,
    updatedAt: now,
    lastValidatedAt: now,
  };
  const parsed = DistilledRuleSchema.safeParse(updated);
  if (!parsed.success) {
    throw new Error("distilled_rule_update_invalid");
  }
  store.upsert(parsed.data);
  return parsed.data;
};
