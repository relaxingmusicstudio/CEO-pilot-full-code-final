import {
  BehaviorFreeze,
  CachePreference,
  ImprovementCandidate,
  ImprovementRunRecord,
  LineageMetadata,
  RoutingPreference,
  SchedulingPreference,
  EscalationOverride,
  TaskOutcomeRecord,
} from "./contracts";
import {
  loadBehaviorFreezes,
  loadCachePreferences,
  loadCostEvents,
  loadFailureMemory,
  loadImprovementCandidates,
  loadRoutingPreferences,
  loadSchedulingPreferences,
  loadTaskOutcomes,
  loadCooperationMetrics,
  recordCausalChain,
  saveQualityMetrics,
  recordQualityRegression,
  recordImprovementRun,
  upsertBehaviorFreeze,
  upsertCachePreference,
  upsertEscalationOverride,
  upsertFailureMemory,
  upsertImprovementCandidate,
  upsertRoutingPreference,
  upsertSchedulingPreference,
} from "./runtimeState";
import { computeQualityMetrics, detectQualityRegressions, pickFallbackTier, defaultQualityPolicy } from "./quality";
import { createDistilledRuleStore, considerDistillation, findActiveRule } from "./distillation";
import { buildCausalChainForCandidate, buildLineageMetadata } from "./interpretability";
import { evaluateDriftState } from "./drift/state";
import { createId, nowIso, stableStringify, hashString } from "./utils";

export type ImprovementPolicy = {
  minSamples: number;
  routingQualityFloor: number;
  freezeFailureRate: number;
  cooldownHours: number;
  failureMemoryHours: number;
  cacheTtlMs: number;
  scheduleBatchMinutes: number;
  escalationDeadlockThreshold: number;
};

export const defaultImprovementPolicy: ImprovementPolicy = {
  minSamples: 3,
  routingQualityFloor: 0.85,
  freezeFailureRate: 0.4,
  cooldownHours: 12,
  failureMemoryHours: 72,
  cacheTtlMs: 1000 * 60 * 60 * 24,
  scheduleBatchMinutes: 60,
  escalationDeadlockThreshold: 0.6,
};

const buildCandidateKey = (candidate: ImprovementCandidate): string =>
  hashString(
    stableStringify({
      type: candidate.type,
      target: candidate.target,
    })
  );

const isWithinCooldown = (candidate: ImprovementCandidate, now: string): boolean => {
  if (!candidate.cooldownUntil) return false;
  return Date.parse(candidate.cooldownUntil) > Date.parse(now);
};

const buildCooldownUntil = (now: string, hours: number): string => {
  const next = new Date(now);
  next.setHours(next.getHours() + hours);
  return next.toISOString();
};

const hasFailureMemory = (key: string, memories: ReturnType<typeof loadFailureMemory>, now: string): boolean =>
  memories.some((record) => record.key === key && (!record.expiresAt || Date.parse(record.expiresAt) > Date.parse(now)));

const ensureCandidate = (candidate: ImprovementCandidate, now: string, policy: ImprovementPolicy): ImprovementCandidate => ({
  ...candidate,
  createdAt: candidate.createdAt || now,
  cooldownUntil: candidate.cooldownUntil ?? buildCooldownUntil(now, policy.cooldownHours),
});

const buildRoutingPreference = (
  identityKey: string,
  taskType: string,
  reason: string,
  now: string,
  updates: Pick<RoutingPreference, "minTier" | "maxTier">,
  lineage?: LineageMetadata
): RoutingPreference => ({
  preferenceId: createId("route"),
  identityKey,
  taskType,
  reason,
  minTier: updates.minTier,
  maxTier: updates.maxTier,
  status: "active",
  lineage,
  createdAt: now,
  updatedAt: now,
});

const buildCachePreference = (
  identityKey: string,
  taskType: string,
  reason: string,
  now: string,
  ttlMs: number
): CachePreference => ({
  preferenceId: createId("cache-pref"),
  identityKey,
  taskType,
  policy: {
    ttlMs,
    maxNoveltyScore: 0.5,
    allowIrreversible: false,
    allowExploration: false,
  },
  reason,
  status: "active",
  createdAt: now,
  updatedAt: now,
});

const buildSchedulingPreference = (
  identityKey: string,
  taskType: string,
  reason: string,
  now: string,
  batchMinutes: number,
  lineage?: LineageMetadata
): SchedulingPreference => ({
  preferenceId: createId("sched-pref"),
  identityKey,
  taskType,
  policy: {
    policyId: `policy-${taskType}`,
    mode: "deferred",
    urgency: "low",
    batchWindowMinutes: batchMinutes,
    createdAt: now,
  },
  reason,
  status: "active",
  lineage,
  createdAt: now,
  updatedAt: now,
});

const buildBehaviorFreeze = (
  identityKey: string,
  taskType: string,
  reason: string,
  now: string
): BehaviorFreeze => ({
  freezeId: createId("freeze"),
  identityKey,
  taskType,
  reason,
  status: "active",
  createdAt: now,
});

const buildEscalationOverride = (
  identityKey: string,
  reason: string,
  now: string,
  lineage?: LineageMetadata
): EscalationOverride => ({
  overrideId: createId("escalate"),
  identityKey,
  taskType: "any",
  minConfidence: 0.65,
  noveltyThreshold: 0.6,
  reason,
  status: "active",
  lineage,
  createdAt: now,
  updatedAt: now,
});

const groupOutcomesByTask = (outcomes: TaskOutcomeRecord[]): Map<string, TaskOutcomeRecord[]> => {
  const grouped = new Map<string, TaskOutcomeRecord[]>();
  outcomes.forEach((record) => {
    const list = grouped.get(record.taskType) ?? [];
    list.push(record);
    grouped.set(record.taskType, list);
  });
  return grouped;
};

const groupOutcomesByInput = (outcomes: TaskOutcomeRecord[]): Map<string, TaskOutcomeRecord[]> => {
  const grouped = new Map<string, TaskOutcomeRecord[]>();
  outcomes.forEach((record) => {
    if (!record.inputHash) return;
    const key = `${record.taskType}::${record.goalId}::${record.inputHash}`;
    const list = grouped.get(key) ?? [];
    list.push(record);
    grouped.set(key, list);
  });
  return grouped;
};

export type ImprovementCycleResult = {
  run: ImprovementRunRecord;
  candidates: ImprovementCandidate[];
};

export type ImprovementApplyResult = {
  appliedCandidate?: ImprovementCandidate;
  failureReason?: string;
};

export type ImprovementRollbackResult = {
  rolledBack: boolean;
  reason?: string;
};

export const applyImprovementCandidate = (input: {
  identityKey: string;
  candidate: ImprovementCandidate;
  outcomes: TaskOutcomeRecord[];
  policy?: ImprovementPolicy;
  now?: string;
}): ImprovementApplyResult => {
  const now = input.now ?? nowIso();
  const policy = input.policy ?? defaultImprovementPolicy;
  const candidate = input.candidate;
  const lineageForTask = (taskType?: string): LineageMetadata =>
    buildLineageMetadata(taskType ? groupOutcomesByTask(input.outcomes).get(taskType) ?? [] : input.outcomes, now);

  if (candidate.type === "routing_downgrade") {
    const lineage = lineageForTask(candidate.target.taskType);
    const pref = buildRoutingPreference(input.identityKey, candidate.target.taskType ?? "unknown", candidate.reason, now, {
      maxTier: candidate.target.modelTier ?? "economy",
    }, lineage);
    upsertRoutingPreference(input.identityKey, pref);
    return { appliedCandidate: { ...candidate, status: "applied", appliedAt: now } };
  }

  if (candidate.type === "routing_upgrade") {
    const lineage = lineageForTask(candidate.target.taskType);
    const pref = buildRoutingPreference(input.identityKey, candidate.target.taskType ?? "unknown", candidate.reason, now, {
      minTier: candidate.target.modelTier,
    }, lineage);
    upsertRoutingPreference(input.identityKey, pref);
    return { appliedCandidate: { ...candidate, status: "applied", appliedAt: now } };
  }

  if (candidate.type === "cache_policy") {
    const pref = buildCachePreference(
      input.identityKey,
      candidate.target.taskType ?? "unknown",
      candidate.reason,
      now,
      policy.cacheTtlMs
    );
    upsertCachePreference(input.identityKey, pref);
    return { appliedCandidate: { ...candidate, status: "applied", appliedAt: now } };
  }

  if (candidate.type === "schedule_policy") {
    const lineage = lineageForTask(candidate.target.taskType);
    const pref = buildSchedulingPreference(
      input.identityKey,
      candidate.target.taskType ?? "unknown",
      candidate.reason,
      now,
      policy.scheduleBatchMinutes,
      lineage
    );
    upsertSchedulingPreference(input.identityKey, pref);
    return { appliedCandidate: { ...candidate, status: "applied", appliedAt: now } };
  }

  if (candidate.type === "freeze_behavior") {
    const freeze = buildBehaviorFreeze(input.identityKey, candidate.target.taskType ?? "unknown", candidate.reason, now);
    upsertBehaviorFreeze(input.identityKey, freeze);
    return { appliedCandidate: { ...candidate, status: "applied", appliedAt: now } };
  }

  if (candidate.type === "escalation_adjustment") {
    const lineage = lineageForTask();
    const override = buildEscalationOverride(input.identityKey, candidate.reason, now, lineage);
    upsertEscalationOverride(input.identityKey, override);
    return { appliedCandidate: { ...candidate, status: "applied", appliedAt: now } };
  }

  if (candidate.type === "distill_rule") {
    const store = createDistilledRuleStore(input.identityKey);
    const rule = considerDistillation(input.identityKey, {
      taskType: candidate.target.taskType ?? "unknown",
      inputHash: candidate.target.inputHash ?? "missing",
      goalId: candidate.target.goalId ?? "goal:unknown",
      output: input.outcomes.find(
        (record) =>
          record.taskType === candidate.target.taskType &&
          record.goalId === candidate.target.goalId &&
          record.inputHash === candidate.target.inputHash &&
          record.output
      )?.output ?? {},
    });
    if (rule) {
      return {
        appliedCandidate: {
          ...candidate,
          status: "applied",
          appliedAt: now,
          target: { ...candidate.target, ruleId: rule.ruleId },
        },
      };
    }
    return { failureReason: "distillation_failed" };
  }

  return { failureReason: "unsupported_candidate" };
};

export const rollbackImprovementCandidate = (
  identityKey: string,
  candidate: ImprovementCandidate,
  now: string = nowIso()
): ImprovementRollbackResult => {
  const taskType = candidate.target.taskType;
  if (!taskType && candidate.type !== "escalation_adjustment" && candidate.type !== "distill_rule") {
    return { rolledBack: false, reason: "missing_task_type" };
  }

  if (candidate.type === "routing_downgrade" || candidate.type === "routing_upgrade") {
    const prefs = loadRoutingPreferences(identityKey);
    const active = prefs.find((pref) => pref.taskType === taskType && pref.status === "active");
    if (!active) return { rolledBack: false, reason: "routing_preference_not_found" };
    upsertRoutingPreference(identityKey, { ...active, status: "disabled", updatedAt: now });
    return { rolledBack: true };
  }

  if (candidate.type === "cache_policy") {
    const prefs = loadCachePreferences(identityKey);
    const active = prefs.find((pref) => pref.taskType === taskType && pref.status === "active");
    if (!active) return { rolledBack: false, reason: "cache_preference_not_found" };
    upsertCachePreference(identityKey, { ...active, status: "disabled", updatedAt: now });
    return { rolledBack: true };
  }

  if (candidate.type === "schedule_policy") {
    const prefs = loadSchedulingPreferences(identityKey);
    const active = prefs.find((pref) => pref.taskType === taskType && pref.status === "active");
    if (!active) return { rolledBack: false, reason: "scheduling_preference_not_found" };
    upsertSchedulingPreference(identityKey, { ...active, status: "disabled", updatedAt: now });
    return { rolledBack: true };
  }

  if (candidate.type === "freeze_behavior") {
    const freezes = loadBehaviorFreezes(identityKey);
    const active = freezes.find((freeze) => freeze.taskType === taskType && freeze.status === "active");
    if (!active) return { rolledBack: false, reason: "freeze_not_found" };
    upsertBehaviorFreeze(identityKey, { ...active, status: "expired", expiresAt: now });
    return { rolledBack: true };
  }

  if (candidate.type === "escalation_adjustment") {
    const overrides = loadEscalationOverrides(identityKey);
    const active = overrides.find((override) => override.status === "active");
    if (!active) return { rolledBack: false, reason: "override_not_found" };
    upsertEscalationOverride(identityKey, { ...active, status: "disabled", updatedAt: now });
    return { rolledBack: true };
  }

  if (candidate.type === "distill_rule") {
    const rules = createDistilledRuleStore(identityKey).list();
    const ruleId = candidate.target.ruleId;
    const rule = rules.find((item) => item.ruleId === ruleId);
    if (!rule) return { rolledBack: false, reason: "rule_not_found" };
    createDistilledRuleStore(identityKey).upsert({ ...rule, status: "demoted", updatedAt: now });
    return { rolledBack: true };
  }

  return { rolledBack: false, reason: "unsupported_candidate" };
};

export const runSelfImprovementCycle = (
  identityKey: string,
  policy: ImprovementPolicy = defaultImprovementPolicy,
  now: string = nowIso()
): ImprovementCycleResult => {
  const outcomes = loadTaskOutcomes(identityKey);
  const metrics = computeQualityMetrics(outcomes, defaultQualityPolicy, now);
  const regressions = detectQualityRegressions(outcomes, defaultQualityPolicy, now);
  saveQualityMetrics(identityKey, metrics);
  regressions.forEach((regression) => recordQualityRegression(identityKey, regression));
  const existingCandidates = loadImprovementCandidates(identityKey);
  const failureMemory = loadFailureMemory(identityKey);
  const routingPreferences = loadRoutingPreferences(identityKey);
  const cachePreferences = loadCachePreferences(identityKey);
  const schedulingPreferences = loadSchedulingPreferences(identityKey);
  const behaviorFreezes = loadBehaviorFreezes(identityKey);
  const costEvents = loadCostEvents(identityKey);
  const cooperationMetrics = loadCooperationMetrics(identityKey);
  const sources = { outcomes, metrics, regressions, costEvents, cooperationMetrics };
  const driftState = evaluateDriftState(identityKey, now);
  const driftBlocksAutoApply = driftState.gate.freeze || driftState.gate.throttle;

  const candidates: ImprovementCandidate[] = [];

  const grouped = groupOutcomesByTask(outcomes);
  const inputGroups = groupOutcomesByInput(outcomes);
  grouped.forEach((records, taskType) => {
    const successes = records.filter((record) => record.evaluationPassed);
    const failures = records.filter((record) => !record.evaluationPassed);
    const failureRate = records.length === 0 ? 0 : failures.length / records.length;

    const economyMetrics = metrics.find(
      (metric) => metric.taskType === taskType && metric.modelTier === "economy"
    );
    const fallback = pickFallbackTier(regressions, taskType, "economy");

    if (fallback.fallbackTier) {
      const existing = routingPreferences.find((pref) => pref.taskType === taskType && pref.status === "active");
      const candidate: ImprovementCandidate = ensureCandidate(
        {
          candidateId: createId("improve"),
          identityKey,
          type: "routing_upgrade",
          status: "proposed",
          reason: fallback.reason ?? "quality_regression",
          evidenceRefs: [`regression:${taskType}`],
          target: { taskType, modelTier: fallback.fallbackTier },
          createdAt: now,
          appliedAt: undefined,
          rollbackAt: undefined,
          rollbackReason: undefined,
          cooldownUntil: undefined,
        },
        now,
        policy
      );
      const key = buildCandidateKey(candidate);
      if (!existing || existing.minTier !== fallback.fallbackTier) {
        if (!hasFailureMemory(key, failureMemory, now)) {
          candidates.push(candidate);
        }
      }
    } else if (economyMetrics && economyMetrics.sampleCount >= policy.minSamples) {
      if (economyMetrics.avgQuality >= policy.routingQualityFloor && economyMetrics.decayedConfidence >= 0.5) {
        const existing = routingPreferences.find((pref) => pref.taskType === taskType && pref.status === "active");
        if (!existing || existing.maxTier !== "economy") {
          const candidate: ImprovementCandidate = ensureCandidate(
            {
              candidateId: createId("improve"),
              identityKey,
              type: "routing_downgrade",
              status: "proposed",
              reason: "economy_quality_verified",
              evidenceRefs: [`quality:${economyMetrics.avgQuality.toFixed(2)}`],
              target: { taskType, modelTier: "economy" },
              createdAt: now,
              appliedAt: undefined,
              rollbackAt: undefined,
              rollbackReason: undefined,
              cooldownUntil: undefined,
            },
            now,
            policy
          );
          const key = buildCandidateKey(candidate);
          if (!hasFailureMemory(key, failureMemory, now)) {
            candidates.push(candidate);
          }
        }
      }
    }

    if (records.length >= policy.minSamples && failureRate >= policy.freezeFailureRate) {
      if (!behaviorFreezes.some((freeze) => freeze.taskType === taskType && freeze.status === "active")) {
        candidates.push(
          ensureCandidate(
            {
              candidateId: createId("improve"),
              identityKey,
              type: "freeze_behavior",
              status: "proposed",
              reason: `failure_rate:${failureRate.toFixed(2)}`,
              evidenceRefs: [`failures:${failures.length}`],
              target: { taskType },
              createdAt: now,
              appliedAt: undefined,
              rollbackAt: undefined,
              rollbackReason: undefined,
              cooldownUntil: undefined,
            },
            now,
            policy
          )
        );
      }
    }

    if (successes.length >= policy.minSamples) {
      if (!cachePreferences.some((pref) => pref.taskType === taskType && pref.status === "active")) {
        candidates.push(
          ensureCandidate(
            {
              candidateId: createId("improve"),
              identityKey,
              type: "cache_policy",
              status: "proposed",
              reason: "routine_success_pattern",
              evidenceRefs: [`successes:${successes.length}`],
              target: { taskType },
              createdAt: now,
              appliedAt: undefined,
              rollbackAt: undefined,
              rollbackReason: undefined,
              cooldownUntil: undefined,
            },
            now,
            policy
          )
        );
      }
    }
  });

  inputGroups.forEach((records, key) => {
    const [taskType, goalId, inputHash] = key.split("::");
    const successful = records.filter((record) => record.evaluationPassed && record.output);
    if (successful.length < policy.minSamples) return;
    const store = createDistilledRuleStore(identityKey);
    const existing = findActiveRule(store, { taskType, goalId, inputHash });
    if (existing) return;
    const latestOutput = successful[successful.length - 1]?.output;
    if (!latestOutput) return;
    candidates.push(
      ensureCandidate(
        {
          candidateId: createId("improve"),
          identityKey,
          type: "distill_rule",
          status: "proposed",
          reason: "repeated_success_output",
          evidenceRefs: [`distill:${successful.length}`],
          target: { taskType, goalId, inputHash },
          createdAt: now,
          appliedAt: undefined,
          rollbackAt: undefined,
          rollbackReason: undefined,
          cooldownUntil: undefined,
        },
        now,
        policy
      )
    );
  });

  if (costEvents.some((event) => event.type === "soft_limit_exceeded")) {
    const seen = new Set(schedulingPreferences.map((pref) => pref.taskType));
    grouped.forEach((_records, taskType) => {
      if (seen.has(taskType)) return;
      candidates.push(
        ensureCandidate(
          {
            candidateId: createId("improve"),
            identityKey,
            type: "schedule_policy",
            status: "proposed",
            reason: "soft_limit_backpressure",
            evidenceRefs: ["cost:soft_limit"],
            target: { taskType },
            createdAt: now,
            appliedAt: undefined,
            rollbackAt: undefined,
            rollbackReason: undefined,
            cooldownUntil: undefined,
          },
          now,
          policy
        )
      );
    });
  }

  const highDeadlock = cooperationMetrics.some((metric) => metric.deadlockScore >= policy.escalationDeadlockThreshold);
  if (highDeadlock) {
    candidates.push(
      ensureCandidate(
        {
          candidateId: createId("improve"),
          identityKey,
          type: "escalation_adjustment",
          status: "proposed",
          reason: "cooperation_deadlock_detected",
          evidenceRefs: ["cooperation:deadlock"],
          target: { taskType: "any" },
          createdAt: now,
          appliedAt: undefined,
          rollbackAt: undefined,
          rollbackReason: undefined,
          cooldownUntil: undefined,
        },
        now,
        policy
      )
    );
  }

  const applied: ImprovementCandidate[] = [];
  const skipped: ImprovementCandidate[] = [];
  let rolledBackCount = 0;

  candidates.forEach((candidate) => {
    const key = buildCandidateKey(candidate);
    const existing = existingCandidates.find((entry) => buildCandidateKey(entry) === key && entry.status === "applied");
    if (existing && isWithinCooldown(existing, now)) {
      skipped.push({ ...candidate, status: "skipped" });
      return;
    }
    if (hasFailureMemory(key, failureMemory, now)) {
      skipped.push({ ...candidate, status: "skipped" });
      return;
    }

    const chain = buildCausalChainForCandidate({
      candidate,
      identityKey,
      sources,
      now,
    });
    const gatedChain = driftBlocksAutoApply
      ? {
          ...chain,
          requiresHumanReview: true,
          failureReason: chain.failureReason ? `${chain.failureReason}; value_drift_gate` : "value_drift_gate",
        }
      : chain;
    if (chain.explanationQuality !== "clear") {
      recordCausalChain(identityKey, gatedChain);
      const rejected = { ...candidate, status: "rejected" as const };
      upsertImprovementCandidate(identityKey, rejected);
      skipped.push(rejected);
      return;
    }

    if (driftBlocksAutoApply) {
      recordCausalChain(identityKey, gatedChain);
      const proposed = { ...candidate, status: "proposed" as const };
      upsertImprovementCandidate(identityKey, proposed);
      skipped.push({ ...candidate, status: "skipped" });
      return;
    }

    const applyResult = applyImprovementCandidate({
      identityKey,
      candidate,
      outcomes,
      policy,
      now,
    });

    if (applyResult.appliedCandidate) {
      recordCausalChain(identityKey, { ...chain, appliedAt: now });
      applied.push(applyResult.appliedCandidate);
      upsertImprovementCandidate(identityKey, applyResult.appliedCandidate);
    } else {
      recordCausalChain(identityKey, chain);
      skipped.push({ ...candidate, status: "skipped" });
    }
  });

  routingPreferences
    .filter((pref) => pref.status === "active" && pref.maxTier === "economy")
    .forEach((pref) => {
      const fallback = pickFallbackTier(regressions, pref.taskType, "economy");
      if (!fallback.fallbackTier) return;
      const rollbackCandidate: ImprovementCandidate = {
        candidateId: createId("improve"),
        identityKey,
        type: "routing_downgrade",
        status: "rolled_back",
        reason: fallback.reason ?? "quality_regression",
        evidenceRefs: ["regression:rollback"],
        target: { taskType: pref.taskType, modelTier: "economy" },
        createdAt: now,
        appliedAt: pref.createdAt,
        rollbackAt: now,
        rollbackReason: fallback.reason ?? "quality_regression",
        cooldownUntil: buildCooldownUntil(now, policy.cooldownHours),
      };
      upsertRoutingPreference(identityKey, {
        ...pref,
        status: "disabled",
        updatedAt: now,
      });
      const failureRecord = {
        memoryId: createId("failure"),
        identityKey,
        candidateType: "routing_downgrade" as const,
        key: buildCandidateKey(rollbackCandidate),
        failureCount: 1,
        reason: rollbackCandidate.rollbackReason ?? "quality_regression",
        lastFailedAt: now,
        expiresAt: buildCooldownUntil(now, policy.failureMemoryHours),
      };
      upsertFailureMemory(identityKey, failureRecord);
      upsertImprovementCandidate(identityKey, rollbackCandidate);
      rolledBackCount += 1;
    });

  const allCandidates = [...applied, ...skipped];
  const run: ImprovementRunRecord = {
    runId: createId("improve-run"),
    identityKey,
    createdAt: now,
    completedAt: now,
    candidates: allCandidates,
    appliedCount: applied.length,
    rolledBackCount,
    skippedCount: skipped.length,
  };
  recordImprovementRun(identityKey, run);
  return { run, candidates: allCandidates };
};
