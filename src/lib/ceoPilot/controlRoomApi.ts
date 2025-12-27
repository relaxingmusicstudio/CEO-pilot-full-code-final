import type {
  ActionImpact,
  CostRoutingCap,
  DistilledRule,
  EmergencyModeState,
  ImprovementCandidate,
  ModelTier,
  PermissionTier,
  TaskOutcomeRecord,
} from "./contracts";
import { applyImprovementCandidate, rollbackImprovementCandidate } from "./improvement";
import { setEmergencyMode, clearEmergencyModeState } from "./emergencyMode";
import {
  ensureDefaultCostBudgets,
  ensureDefaultHumanControls,
  loadBehaviorFreezes,
  loadCacheEntries,
  loadCachePreferences,
  loadCausalChains,
  loadCostBudgets,
  loadCostEvents,
  loadCostRoutingCap,
  loadCostShockEvents,
  loadDistilledRules,
  loadEmergencyMode,
  loadEscalationOverrides,
  loadGoals,
  loadGoalConflicts,
  loadHumanControls,
  loadHumanDecisions,
  loadImprovementCandidates,
  loadImprovementRuns,
  loadModelRoutingHistory,
  loadQualityMetrics,
  loadQualityRegressions,
  loadRoutingPreferences,
  loadSchedulingPreferences,
  loadScheduledTasks,
  loadTaskOutcomes,
  recordHumanDecision,
  saveBehaviorFreezes,
  saveCacheEntries,
  saveCachePreferences,
  saveCausalChains,
  saveCostBudgets,
  saveCostEvents,
  saveCostRoutingCap,
  saveCostShockEvents,
  saveDistilledRules,
  saveEscalationOverrides,
  saveGoals,
  saveGoalConflicts,
  saveHumanControls,
  saveHumanDecisions,
  saveImprovementCandidates,
  saveImprovementRuns,
  saveModelRoutingHistory,
  saveQualityMetrics,
  saveQualityRegressions,
  saveRoutingPreferences,
  saveSchedulingPreferences,
  saveScheduledTasks,
  saveTaskOutcomes,
} from "./runtimeState";
import { createId, nowIso } from "./utils";

export type ImprovementDecisionInput = {
  identityKey: string;
  targetType: "improvement_candidate" | "distilled_rule";
  targetId: string;
  decision: "approve" | "reject" | "request_more_evidence" | "escalate";
  notes?: string;
  decidedBy?: string;
  now?: string;
};

export type ControlProfileInput = {
  identityKey: string;
  autonomyCap?: PermissionTier;
  maxModelTier?: ModelTier;
  minConfidence?: number;
  noveltyThreshold?: number;
  emergencyStop?: boolean;
  emergencyMode?: EmergencyModeState["mode"] | "clear";
  emergencyReason?: string;
  emergencyExpiresAt?: string;
  freezeTaskTypes?: string[];
  releaseFreezeTaskTypes?: string[];
  costRoutingCapTier?: ModelTier;
  costRoutingCapReason?: string;
  costRoutingCapExpiresAt?: string;
};

export type RuntimeSnapshot = {
  identityKey: string;
  generatedAt: string;
  safeMode: boolean;
  safeModeReasons: string[];
  summary: {
    emergencyMode: EmergencyModeState | null;
    autonomyCeiling: PermissionTier | null;
    maxModelTier: ModelTier | null;
    costRoutingCap: CostRoutingCap | null;
    last24h: {
      outcomeCount: number;
      avgQuality: number;
      avgCostCents: number;
      failures: number;
    };
  };
  data: {
    goals: ReturnType<typeof loadGoals>;
    goalConflicts: ReturnType<typeof loadGoalConflicts>;
    outcomes: TaskOutcomeRecord[];
    qualityMetrics: ReturnType<typeof loadQualityMetrics>;
    qualityRegressions: ReturnType<typeof loadQualityRegressions>;
    improvementCandidates: ImprovementCandidate[];
    improvementRuns: ReturnType<typeof loadImprovementRuns>;
    causalChains: ReturnType<typeof loadCausalChains>;
    routingPreferences: ReturnType<typeof loadRoutingPreferences>;
    cachePreferences: ReturnType<typeof loadCachePreferences>;
    schedulingPreferences: ReturnType<typeof loadSchedulingPreferences>;
    behaviorFreezes: ReturnType<typeof loadBehaviorFreezes>;
    escalationOverrides: ReturnType<typeof loadEscalationOverrides>;
    distilledRules: DistilledRule[];
    costBudgets: ReturnType<typeof loadCostBudgets>;
    costEvents: ReturnType<typeof loadCostEvents>;
    costShocks: ReturnType<typeof loadCostShockEvents>;
    costRoutingCap: CostRoutingCap | null;
    scheduledTasks: ReturnType<typeof loadScheduledTasks>;
    cacheEntries: ReturnType<typeof loadCacheEntries>;
    emergencyMode: EmergencyModeState | null;
    humanControls: ReturnType<typeof loadHumanControls>;
    humanDecisions: ReturnType<typeof loadHumanDecisions>;
    modelRoutingHistory: ReturnType<typeof loadModelRoutingHistory>;
  };
};

export type RuntimeStateExport = {
  version: "v1";
  identityKey: string;
  exportedAt: string;
  data: RuntimeSnapshot["data"];
};

const computeLast24hSummary = (outcomes: TaskOutcomeRecord[], now: string) => {
  const cutoff = Date.parse(now) - 24 * 60 * 60 * 1000;
  const recent = outcomes.filter((record) => Date.parse(record.createdAt) >= cutoff);
  if (recent.length === 0) {
    return { outcomeCount: 0, avgQuality: 0, avgCostCents: 0, failures: 0 };
  }
  const totalCost = recent.reduce((sum, record) => sum + record.costCents, 0);
  const avgQuality = recent.reduce((sum, record) => sum + record.qualityScore, 0) / recent.length;
  const failures = recent.filter((record) => !record.evaluationPassed).length;
  return {
    outcomeCount: recent.length,
    avgQuality: Number(avgQuality.toFixed(3)),
    avgCostCents: Math.round(totalCost / recent.length),
    failures,
  };
};

export const getRuntimeSnapshot = (identityKey: string, now: string = nowIso()): RuntimeSnapshot => {
  const costBudgets = ensureDefaultCostBudgets(identityKey);
  const humanControls = ensureDefaultHumanControls(identityKey);
  const emergencyMode = loadEmergencyMode(identityKey);
  const outcomes = loadTaskOutcomes(identityKey);
  const improvementCandidates = loadImprovementCandidates(identityKey);
  const causalChains = loadCausalChains(identityKey);
  const safeModeReasons: string[] = [];

  if (costBudgets.length === 0) safeModeReasons.push("missing_cost_budgets");
  if (humanControls.length === 0) safeModeReasons.push("missing_human_controls");
  if (improvementCandidates.length === 0) safeModeReasons.push("missing_improvement_candidates");
  if (causalChains.length === 0) safeModeReasons.push("missing_causal_chains");

  const primaryControl = humanControls[0] ?? null;
  const summary = {
    emergencyMode,
    autonomyCeiling: primaryControl?.autonomyCeiling ?? null,
    maxModelTier: primaryControl?.maxModelTier ?? null,
    costRoutingCap: loadCostRoutingCap(identityKey),
    last24h: computeLast24hSummary(outcomes, now),
  };

  return {
    identityKey,
    generatedAt: now,
    safeMode: safeModeReasons.length > 0,
    safeModeReasons,
    summary,
    data: {
      goals: loadGoals(identityKey),
      goalConflicts: loadGoalConflicts(identityKey),
      outcomes,
      qualityMetrics: loadQualityMetrics(identityKey),
      qualityRegressions: loadQualityRegressions(identityKey),
      improvementCandidates,
      improvementRuns: loadImprovementRuns(identityKey),
      causalChains,
      routingPreferences: loadRoutingPreferences(identityKey),
      cachePreferences: loadCachePreferences(identityKey),
      schedulingPreferences: loadSchedulingPreferences(identityKey),
      behaviorFreezes: loadBehaviorFreezes(identityKey),
      escalationOverrides: loadEscalationOverrides(identityKey),
      distilledRules: loadDistilledRules(identityKey),
      costBudgets,
      costEvents: loadCostEvents(identityKey),
      costShocks: loadCostShockEvents(identityKey),
      costRoutingCap: loadCostRoutingCap(identityKey),
      scheduledTasks: loadScheduledTasks(identityKey),
      cacheEntries: loadCacheEntries(identityKey),
      emergencyMode,
      humanControls,
      humanDecisions: loadHumanDecisions(identityKey),
      modelRoutingHistory: loadModelRoutingHistory(identityKey),
    },
  };
};

export const listOutcomes = (input: { identityKey: string; since?: string }): TaskOutcomeRecord[] => {
  const outcomes = loadTaskOutcomes(input.identityKey);
  if (!input.since) return outcomes;
  return outcomes.filter((record) => Date.parse(record.createdAt) >= Date.parse(input.since));
};

export const listCausalChains = (input: {
  identityKey: string;
  since?: string;
  filters?: { actionType?: RuntimeSnapshot["data"]["causalChains"][number]["actionType"]; status?: string; taskType?: string };
}) => {
  const chains = loadCausalChains(input.identityKey);
  const candidates = loadImprovementCandidates(input.identityKey);
  const candidateById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));

  return chains.filter((chain) => {
    if (input.since && Date.parse(chain.createdAt) < Date.parse(input.since)) return false;
    if (input.filters?.actionType && chain.actionType !== input.filters.actionType) return false;
    if (input.filters?.status && chain.status !== input.filters.status) return false;
    if (input.filters?.taskType) {
      const candidate = candidateById.get(chain.candidateId);
      if (!candidate || candidate.target.taskType !== input.filters.taskType) return false;
    }
    return true;
  });
};

export const listImprovementCandidates = (input: {
  identityKey: string;
  status?: ImprovementCandidate["status"];
}): ImprovementCandidate[] => {
  const candidates = loadImprovementCandidates(input.identityKey);
  if (!input.status) return candidates;
  return candidates.filter((candidate) => candidate.status === input.status);
};

export const applyHumanDecision = (input: ImprovementDecisionInput) => {
  const now = input.now ?? nowIso();
  const decisionRecord = {
    decisionId: createId("decision"),
    identityKey: input.identityKey,
    targetType: input.targetType,
    targetId: input.targetId,
    decision: input.decision,
    notes: input.notes,
    decidedBy: input.decidedBy,
    createdAt: now,
  } as const;

  if (input.targetType === "improvement_candidate") {
    const candidates = loadImprovementCandidates(input.identityKey);
    const candidate = candidates.find((item) => item.candidateId === input.targetId);
    if (!candidate) {
      throw new Error("candidate_not_found");
    }

    const chains = loadCausalChains(input.identityKey)
      .filter((chain) => chain.candidateId === candidate.candidateId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const latestChain = chains[chains.length - 1];
    if (latestChain?.requiresHumanReview && input.decision === "approve" && !input.notes) {
      throw new Error("explanation_required");
    }

    if (input.decision === "approve") {
      const applyResult = applyImprovementCandidate({
        identityKey: input.identityKey,
        candidate,
        outcomes: loadTaskOutcomes(input.identityKey),
        now,
      });
      if (!applyResult.appliedCandidate) {
        throw new Error(applyResult.failureReason ?? "candidate_apply_failed");
      }
      saveImprovementCandidates(input.identityKey, [
        ...candidates.filter((item) => item.candidateId !== candidate.candidateId),
        applyResult.appliedCandidate,
      ]);
    } else if (input.decision === "reject") {
      rollbackImprovementCandidate(input.identityKey, candidate, now);
      saveImprovementCandidates(input.identityKey, [
        ...candidates.filter((item) => item.candidateId !== candidate.candidateId),
        { ...candidate, status: "rejected", rollbackAt: now, rollbackReason: input.notes },
      ]);
    } else {
      saveImprovementCandidates(input.identityKey, [
        ...candidates.filter((item) => item.candidateId !== candidate.candidateId),
        { ...candidate, status: "proposed" },
      ]);
    }
  }

  if (input.targetType === "distilled_rule") {
    const rules = loadDistilledRules(input.identityKey);
    const rule = rules.find((item) => item.ruleId === input.targetId);
    if (!rule) {
      throw new Error("rule_not_found");
    }
    if (input.decision === "approve") {
      saveDistilledRules(input.identityKey, [
        ...rules.filter((item) => item.ruleId !== rule.ruleId),
        { ...rule, status: "active", updatedAt: now, lastValidatedAt: now },
      ]);
    } else if (input.decision === "reject") {
      saveDistilledRules(input.identityKey, [
        ...rules.filter((item) => item.ruleId !== rule.ruleId),
        { ...rule, status: "demoted", updatedAt: now, lastValidatedAt: now },
      ]);
    }
  }

  recordHumanDecision(input.identityKey, decisionRecord);
  return decisionRecord;
};

export const setControlProfile = (input: ControlProfileInput) => {
  const now = nowIso();
  const profiles = ensureDefaultHumanControls(input.identityKey);
  const current = profiles[0];
  if (!current) {
    throw new Error("missing_human_controls");
  }

  const nextProfile = {
    ...current,
    autonomyCeiling: input.autonomyCap ?? current.autonomyCeiling,
    maxModelTier: input.maxModelTier ?? current.maxModelTier,
    minConfidence: input.minConfidence ?? current.minConfidence,
    noveltyThreshold: input.noveltyThreshold ?? current.noveltyThreshold,
    emergencyStop: input.emergencyStop ?? current.emergencyStop,
    updatedAt: now,
  };
  saveHumanControls(input.identityKey, [nextProfile]);

  if (input.emergencyMode) {
    if (input.emergencyMode === "clear") {
      clearEmergencyModeState(input.identityKey);
    } else {
      setEmergencyMode(input.identityKey, {
        mode: input.emergencyMode,
        reason: input.emergencyReason ?? "manual_override",
        triggeredBy: "human",
        maxModelTier: input.maxModelTier ?? current.maxModelTier,
        scheduleNonCritical: input.emergencyMode !== "normal",
        blockHighRisk: input.emergencyMode === "emergency",
        createdAt: now,
        expiresAt: input.emergencyExpiresAt,
      });
    }
  }

  if (input.freezeTaskTypes && input.freezeTaskTypes.length > 0) {
    const existing = loadBehaviorFreezes(input.identityKey);
    const next = [...existing];
    input.freezeTaskTypes.forEach((taskType) => {
      next.push({
        freezeId: createId("freeze"),
        identityKey: input.identityKey,
        taskType,
        reason: "manual_freeze",
        status: "active",
        createdAt: now,
      });
    });
    saveBehaviorFreezes(input.identityKey, next);
  }

  if (input.releaseFreezeTaskTypes && input.releaseFreezeTaskTypes.length > 0) {
    const existing = loadBehaviorFreezes(input.identityKey);
    const next = existing.map((freeze) =>
      input.releaseFreezeTaskTypes?.includes(freeze.taskType)
        ? { ...freeze, status: "expired", expiresAt: now }
        : freeze
    );
    saveBehaviorFreezes(input.identityKey, next);
  }

  if (input.costRoutingCapTier) {
    saveCostRoutingCap(input.identityKey, {
      capId: createId("cost-cap"),
      identityKey: input.identityKey,
      tier: input.costRoutingCapTier,
      reason: input.costRoutingCapReason ?? "manual_cap",
      createdAt: now,
      expiresAt: input.costRoutingCapExpiresAt,
    });
  }

  recordHumanDecision(input.identityKey, {
    decisionId: createId("decision"),
    identityKey: input.identityKey,
    targetType: "control_profile",
    targetId: nextProfile.profileId,
    decision: "approve",
    notes: "control_profile_updated",
    createdAt: now,
  });

  return nextProfile;
};

export const exportState = (identityKey: string): RuntimeStateExport => {
  const snapshot = getRuntimeSnapshot(identityKey);
  return {
    version: "v1",
    identityKey,
    exportedAt: nowIso(),
    data: snapshot.data,
  };
};

export const importState = (payload: RuntimeStateExport, identityKey?: string) => {
  const targetKey = identityKey ?? payload.identityKey;
  const data = payload.data;

  saveGoals(targetKey, data.goals ?? []);
  saveGoalConflicts(targetKey, data.goalConflicts ?? []);
  saveTaskOutcomes(targetKey, data.outcomes ?? []);
  saveQualityMetrics(targetKey, data.qualityMetrics ?? []);
  saveQualityRegressions(targetKey, data.qualityRegressions ?? []);
  saveImprovementCandidates(targetKey, data.improvementCandidates ?? []);
  saveImprovementRuns(targetKey, data.improvementRuns ?? []);
  saveCausalChains(targetKey, data.causalChains ?? []);
  saveRoutingPreferences(targetKey, data.routingPreferences ?? []);
  saveCachePreferences(targetKey, data.cachePreferences ?? []);
  saveSchedulingPreferences(targetKey, data.schedulingPreferences ?? []);
  saveBehaviorFreezes(targetKey, data.behaviorFreezes ?? []);
  saveEscalationOverrides(targetKey, data.escalationOverrides ?? []);
  saveDistilledRules(targetKey, data.distilledRules ?? []);
  saveCostBudgets(targetKey, data.costBudgets ?? []);
  saveCostEvents(targetKey, data.costEvents ?? []);
  saveCostShockEvents(targetKey, data.costShocks ?? []);
  if (data.costRoutingCap) {
    saveCostRoutingCap(targetKey, data.costRoutingCap);
  }
  saveScheduledTasks(targetKey, data.scheduledTasks ?? []);
  saveCacheEntries(targetKey, data.cacheEntries ?? []);
  if (data.emergencyMode) {
    setEmergencyMode(targetKey, data.emergencyMode);
  }
  saveHumanControls(targetKey, data.humanControls ?? []);
  saveHumanDecisions(targetKey, data.humanDecisions ?? []);
  saveModelRoutingHistory(targetKey, data.modelRoutingHistory ?? []);

  return getRuntimeSnapshot(targetKey);
};

export const listImprovementQueue = (identityKey: string) => {
  const candidates = loadImprovementCandidates(identityKey);
  const chains = loadCausalChains(identityKey);
  const byCandidate = new Map<string, typeof chains>();
  chains.forEach((chain) => {
    const list = byCandidate.get(chain.candidateId) ?? [];
    list.push(chain);
    byCandidate.set(chain.candidateId, list);
  });
  return candidates.map((candidate) => {
    const history = byCandidate.get(candidate.candidateId) ?? [];
    const latest = history.sort((left, right) => left.createdAt.localeCompare(right.createdAt)).slice(-1)[0];
    return {
      candidate,
      chain: latest,
    };
  });
};

export const computeExpectedImpact = (candidate: ImprovementCandidate, outcomes: TaskOutcomeRecord[]) => {
  const relevant = candidate.target.taskType
    ? outcomes.filter((record) => record.taskType === candidate.target.taskType)
    : outcomes;
  if (relevant.length === 0) {
    return { costDeltaCents: null as number | null, qualityDelta: null as number | null };
  }
  const avgCost = relevant.reduce((sum, record) => sum + record.costCents, 0) / relevant.length;
  const avgQuality = relevant.reduce((sum, record) => sum + record.qualityScore, 0) / relevant.length;

  if (candidate.type === "distill_rule") {
    return { costDeltaCents: Math.round(1 - avgCost), qualityDelta: null };
  }

  if (candidate.type === "routing_downgrade") {
    return { costDeltaCents: Math.round(-Math.abs(avgCost * 0.4)), qualityDelta: -0.02 };
  }
  if (candidate.type === "routing_upgrade") {
    return { costDeltaCents: Math.round(Math.abs(avgCost * 0.4)), qualityDelta: 0.02 };
  }
  if (candidate.type === "cache_policy" || candidate.type === "schedule_policy") {
    return { costDeltaCents: Math.round(-Math.abs(avgCost * 0.2)), qualityDelta: 0 };
  }
  if (candidate.type === "freeze_behavior") {
    return { costDeltaCents: 0, qualityDelta: 0 };
  }
  if (candidate.type === "escalation_adjustment") {
    return { costDeltaCents: Math.round(avgCost * 0.1), qualityDelta: 0 };
  }
  return { costDeltaCents: null, qualityDelta: null };
};

export const buildSafeModeAction = (safeMode: boolean, impact: ActionImpact = "reversible") => ({
  allowed: !safeMode,
  impact,
});
