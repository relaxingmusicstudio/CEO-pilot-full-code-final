import {
  ModelRoutingDecision,
  ModelRoutingDecisionSchema,
  ModelRoutingRequest,
  ModelRoutingRequestSchema,
  TaskOutcomeRecord,
  ModelTier,
  ReasoningDepth,
  CostRoutingCap,
  RoutingPreference,
} from "./contracts";
import { createId, nowIso } from "./utils";
import {
  loadModelRoutingHistory,
  saveModelRoutingDecision,
  type ModelRoutingLogEntry,
  loadTaskOutcomes,
  recordTaskOutcome,
  loadCostRoutingCap,
  loadRoutingPreferences,
  loadEmergencyMode,
  ensureDefaultHumanControls,
  loadHumanControls,
} from "./runtimeState";

export type ModelSpec = {
  id: string;
  tier: ModelTier;
  costPer1kTokensCents: number;
  maxTokens: number;
};

export type ModelCatalog = {
  models: ModelSpec[];
};

export type TaskOutcomeStore = {
  record: (record: TaskOutcomeRecord) => TaskOutcomeRecord[];
  list: (taskType?: string) => TaskOutcomeRecord[];
};

export const createTaskOutcomeStore = (identityKey: string): TaskOutcomeStore => ({
  record: (record) => recordTaskOutcome(identityKey, record),
  list: (taskType) => {
    const outcomes = loadTaskOutcomes(identityKey);
    if (!taskType) return outcomes;
    return outcomes.filter((record) => record.taskType === taskType);
  },
});

export const createInMemoryTaskOutcomeStore = (
  seed: TaskOutcomeRecord[] = []
): TaskOutcomeStore => {
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

export type ModelRoutingPolicy = {
  noveltyStandardThreshold: number;
  noveltyAdvancedThreshold: number;
  ambiguityStandardThreshold: number;
  ambiguityAdvancedThreshold: number;
};

export type ModelRoutingCostPolicy = {
  minSamples: number;
  qualityFloor: number;
  passRateFloor: number;
  qualityImprovementThreshold: number;
};

export const defaultModelRoutingPolicy: ModelRoutingPolicy = {
  noveltyStandardThreshold: 0.4,
  noveltyAdvancedThreshold: 0.7,
  ambiguityStandardThreshold: 0.4,
  ambiguityAdvancedThreshold: 0.7,
};

export const defaultModelRoutingCostPolicy: ModelRoutingCostPolicy = {
  minSamples: 3,
  qualityFloor: 0.8,
  passRateFloor: 0.8,
  qualityImprovementThreshold: 0.05,
};

export const DEFAULT_MODEL_CATALOG: ModelCatalog = {
  models: [
    { id: "ppp-economy-1", tier: "economy", costPer1kTokensCents: 5, maxTokens: 4096 },
    { id: "ppp-standard-1", tier: "standard", costPer1kTokensCents: 15, maxTokens: 8192 },
    { id: "ppp-advanced-1", tier: "advanced", costPer1kTokensCents: 30, maxTokens: 16384 },
    { id: "ppp-frontier-1", tier: "frontier", costPer1kTokensCents: 60, maxTokens: 32000 },
  ],
};

export type ModelRoutingAuditStore = {
  record: (entry: ModelRoutingLogEntry) => void;
  list: () => ModelRoutingLogEntry[];
};

export const createModelRoutingAuditStore = (identityKey: string): ModelRoutingAuditStore => ({
  record: (entry) => {
    saveModelRoutingDecision(identityKey, entry);
  },
  list: () => loadModelRoutingHistory(identityKey),
});

export const createInMemoryModelRoutingAuditStore = (): ModelRoutingAuditStore => {
  const entries: ModelRoutingLogEntry[] = [];
  return {
    record: (entry) => {
      entries.push(entry);
    },
    list: () => [...entries],
  };
};

export type ModelRouter = {
  route: (request: ModelRoutingRequest) => ModelRoutingDecision;
  audit: ModelRoutingAuditStore;
};

export type ModelRouterOptions = {
  catalog?: ModelCatalog;
  policy?: ModelRoutingPolicy;
  costPolicy?: ModelRoutingCostPolicy;
  outcomeStore?: TaskOutcomeStore;
  auditStore?: ModelRoutingAuditStore;
  identityKey?: string;
  now?: () => string;
  idFactory?: (prefix: string) => string;
};

const TIERS: ModelTier[] = ["economy", "standard", "advanced", "frontier"];

const tierRank = (tier: ModelTier): number => TIERS.indexOf(tier);

const maxTier = (left: ModelTier, right: ModelTier): ModelTier =>
  tierRank(left) >= tierRank(right) ? left : right;

const minTier = (left: ModelTier, right: ModelTier): ModelTier =>
  tierRank(left) <= tierRank(right) ? left : right;

const estimateCost = (model: ModelSpec, expectedTokens: number): number =>
  Math.ceil((expectedTokens / 1000) * model.costPer1kTokensCents);

type OutcomeStats = {
  tier: ModelTier;
  count: number;
  avgQuality: number;
  avgCostCents: number;
  passRate: number;
};

const buildOutcomeStats = (
  records: TaskOutcomeRecord[],
  taskType: string
): Map<ModelTier, OutcomeStats> => {
  const stats = new Map<ModelTier, { count: number; qualityTotal: number; costTotal: number; passCount: number }>();
  records
    .filter((record) => record.taskType === taskType)
    .forEach((record) => {
      const existing = stats.get(record.modelTier) ?? {
        count: 0,
        qualityTotal: 0,
        costTotal: 0,
        passCount: 0,
      };
      existing.count += 1;
      existing.qualityTotal += record.qualityScore;
      existing.costTotal += record.costCents;
      if (record.evaluationPassed) {
        existing.passCount += 1;
      }
      stats.set(record.modelTier, existing);
    });

  const outcomeStats = new Map<ModelTier, OutcomeStats>();
  stats.forEach((value, tier) => {
    outcomeStats.set(tier, {
      tier,
      count: value.count,
      avgQuality: value.count === 0 ? 0 : value.qualityTotal / value.count,
      avgCostCents: value.count === 0 ? 0 : value.costTotal / value.count,
      passRate: value.count === 0 ? 0 : value.passCount / value.count,
    });
  });

  return outcomeStats;
};

const sortByCost = (left: ModelSpec, right: ModelSpec): number => {
  if (left.costPer1kTokensCents !== right.costPer1kTokensCents) {
    return left.costPer1kTokensCents - right.costPer1kTokensCents;
  }
  return left.id.localeCompare(right.id);
};

const selectModelForTier = (
  tier: ModelTier,
  expectedTokens: number,
  catalog: ModelCatalog
): { model: ModelSpec; hasCapacity: boolean } | null => {
  const models = catalog.models.filter((model) => model.tier === tier);
  if (models.length === 0) return null;
  const capacityModels = models.filter((model) => model.maxTokens >= expectedTokens);
  const candidates = (capacityModels.length > 0 ? capacityModels : models).slice().sort(sortByCost);
  const selected = candidates[0];
  if (!selected) return null;
  return { model: selected, hasCapacity: selected.maxTokens >= expectedTokens };
};

const ensureCapacityTier = (
  tier: ModelTier,
  expectedTokens: number,
  catalog: ModelCatalog
): { model: ModelSpec; tier: ModelTier; hasCapacity: boolean } => {
  const startIndex = tierRank(tier);
  for (let idx = startIndex; idx < TIERS.length; idx += 1) {
    const candidateTier = TIERS[idx];
    const selection = selectModelForTier(candidateTier, expectedTokens, catalog);
    if (selection && selection.hasCapacity) {
      return { model: selection.model, tier: candidateTier, hasCapacity: true };
    }
  }

  const fallback = catalog.models
    .slice()
    .sort((a, b) => {
      if (a.maxTokens !== b.maxTokens) return b.maxTokens - a.maxTokens;
      return sortByCost(a, b);
    })[0];

  if (!fallback) {
    throw new Error("model_catalog_empty");
  }

  return { model: fallback, tier: fallback.tier, hasCapacity: false };
};

const resolveRoutingPreference = (
  identityKey: string | undefined,
  taskType: string,
  now: string
): RoutingPreference | null => {
  if (!identityKey) return null;
  const prefs = loadRoutingPreferences(identityKey).filter((pref) => pref.taskType === taskType && pref.status === "active");
  const active = prefs.filter((pref) => !pref.expiresAt || Date.parse(pref.expiresAt) > Date.parse(now));
  if (active.length === 0) return null;
  return active.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
};

const resolveHumanMaxTier = (identityKey: string | undefined): ModelTier | null => {
  if (!identityKey) return null;
  const profiles = ensureDefaultHumanControls(identityKey);
  const profile = profiles[0] ?? loadHumanControls(identityKey)[0];
  return profile?.maxModelTier ?? null;
};

const computeMinimumTier = (request: ModelRoutingRequest): ModelTier => {
  if (request.requiresArbitration || request.irreversible || request.complianceSensitive) {
    return "frontier";
  }
  if (request.taskClass === "high_risk") {
    return "frontier";
  }
  if (request.riskLevel === "high" || request.riskLevel === "critical") {
    return "frontier";
  }
  if (request.riskLevel === "medium") {
    return "advanced";
  }
  return "economy";
};

const depthTierMap: Record<ReasoningDepth, ModelTier> = {
  shallow: "economy",
  medium: "standard",
  deep: "advanced",
};

const buildPreferredTier = (
  request: ModelRoutingRequest,
  policy: ModelRoutingPolicy
): ModelTier => {
  let preferred = depthTierMap[request.reasoningDepth];

  if (
    request.noveltyScore >= policy.noveltyAdvancedThreshold ||
    request.ambiguityScore >= policy.ambiguityAdvancedThreshold
  ) {
    preferred = maxTier(preferred, "advanced");
  } else if (
    request.noveltyScore >= policy.noveltyStandardThreshold ||
    request.ambiguityScore >= policy.ambiguityStandardThreshold
  ) {
    preferred = maxTier(preferred, "standard");
  }

  return preferred;
};

const findCheapestTierMeetingQuality = (
  stats: Map<ModelTier, OutcomeStats>,
  minimumTier: ModelTier,
  policy: ModelRoutingCostPolicy
): ModelTier | null => {
  const startIndex = tierRank(minimumTier);
  for (let idx = startIndex; idx < TIERS.length; idx += 1) {
    const tier = TIERS[idx];
    const tierStats = stats.get(tier);
    if (!tierStats) continue;
    if (tierStats.count < policy.minSamples) continue;
    if (tierStats.avgQuality < policy.qualityFloor) continue;
    if (tierStats.passRate < policy.passRateFloor) continue;
    return tier;
  }
  return null;
};

const buildCostAwareTier = (
  request: ModelRoutingRequest,
  minimumTier: ModelTier,
  preferredTier: ModelTier,
  outcomeStore: TaskOutcomeStore | undefined,
  costPolicy: ModelRoutingCostPolicy
): { tier: ModelTier; reasons: string[] } => {
  if (!outcomeStore) {
    return { tier: preferredTier, reasons: [] };
  }
  if (request.taskClass !== "routine") {
    return { tier: preferredTier, reasons: ["task_class_exempt"] };
  }
  const outcomes = outcomeStore.list(request.task);
  if (outcomes.length < costPolicy.minSamples) {
    return { tier: preferredTier, reasons: ["insufficient_cost_history"] };
  }
  const stats = buildOutcomeStats(outcomes, request.task);
  const cheapestTier = findCheapestTierMeetingQuality(stats, minimumTier, costPolicy);
  if (!cheapestTier) {
    return { tier: preferredTier, reasons: ["no_cost_efficient_tier"] };
  }

  if (tierRank(cheapestTier) < tierRank(preferredTier)) {
    const preferredStats = stats.get(preferredTier);
    const cheapestStats = stats.get(cheapestTier);
    if (
      preferredStats &&
      cheapestStats &&
      preferredStats.count >= costPolicy.minSamples &&
      preferredStats.avgQuality - cheapestStats.avgQuality >= costPolicy.qualityImprovementThreshold
    ) {
      return { tier: preferredTier, reasons: ["quality_gain_verified"] };
    }
    return { tier: cheapestTier, reasons: ["history_downgrade"] };
  }

  return { tier: preferredTier, reasons: [] };
};

const buildRiskJustification = (request: ModelRoutingRequest, policy: ModelRoutingPolicy): string[] => {
  const reasons: string[] = [];
  if (request.requiresArbitration) reasons.push("requires_arbitration");
  if (request.irreversible) reasons.push("irreversible_action");
  if (request.complianceSensitive) reasons.push("compliance_sensitive");
  reasons.push(`task_class:${request.taskClass}`);
  reasons.push(`risk:${request.riskLevel}`);
  if (request.reasoningDepth === "deep") reasons.push("deep_reasoning");
  if (request.noveltyScore >= policy.noveltyAdvancedThreshold) reasons.push("high_novelty");
  if (request.ambiguityScore >= policy.ambiguityAdvancedThreshold) reasons.push("high_ambiguity");
  return reasons;
};

const buildDecision = (
  request: ModelRoutingRequest,
  catalog: ModelCatalog,
  policy: ModelRoutingPolicy,
  costPolicy: ModelRoutingCostPolicy,
  outcomeStore: TaskOutcomeStore | undefined,
  routingCap: CostRoutingCap | null | undefined,
  routingPreference: RoutingPreference | null,
  humanMaxTier: ModelTier | null,
  emergencyCap: ModelTier | null,
  now: string,
  idFactory: (prefix: string) => string
): ModelRoutingDecision => {
  let minimumTier = computeMinimumTier(request);
  const preferredTier = maxTier(minimumTier, buildPreferredTier(request, policy));
  const reasons = buildRiskJustification(request, policy);
  const costAware = buildCostAwareTier(
    request,
    minimumTier,
    preferredTier,
    outcomeStore,
    costPolicy
  );
  if (costAware.reasons.length > 0) {
    reasons.push(...costAware.reasons);
  }
  const effectiveTier = maxTier(minimumTier, costAware.tier);
  let selectedTier = effectiveTier;

  if (routingCap?.tier) {
    const capped = minTier(selectedTier, routingCap.tier);
    if (tierRank(capped) < tierRank(selectedTier)) {
      reasons.push(`cost_tier_cap:${routingCap.tier}`);
      selectedTier = maxTier(minimumTier, capped);
      if (selectedTier !== capped) {
        reasons.push("cost_tier_cap_blocked_by_minimum");
      }
    }
  }

  if (routingPreference?.minTier) {
    minimumTier = maxTier(minimumTier, routingPreference.minTier);
    reasons.push(`routing_pref_min:${routingPreference.minTier}`);
  }
  if (routingPreference?.maxTier) {
    const capped = minTier(selectedTier, routingPreference.maxTier);
    if (tierRank(capped) < tierRank(selectedTier)) {
      reasons.push(`routing_pref_max:${routingPreference.maxTier}`);
      selectedTier = maxTier(minimumTier, capped);
    }
  }

  if (humanMaxTier) {
    const capped = minTier(selectedTier, humanMaxTier);
    if (tierRank(capped) < tierRank(selectedTier)) {
      reasons.push(`human_max_tier:${humanMaxTier}`);
      selectedTier = maxTier(minimumTier, capped);
    }
  }

  if (emergencyCap) {
    const capped = minTier(selectedTier, emergencyCap);
    if (tierRank(capped) < tierRank(selectedTier)) {
      reasons.push(`emergency_cap:${emergencyCap}`);
      selectedTier = maxTier(minimumTier, capped);
    }
  }

  if (selectedTier !== minimumTier) {
    reasons.push(`tier_preference:${selectedTier}`);
  }

  let selected = ensureCapacityTier(selectedTier, request.expectedTokens, catalog);
  if (!selected.hasCapacity) {
    reasons.push("capacity_exceeded");
  }

  let estimatedCostCents = estimateCost(selected.model, request.expectedTokens);
  let withinBudget = estimatedCostCents <= request.budgetCents;

  let budgetDowngraded = false;
  if (!withinBudget && tierRank(selected.tier) > tierRank(minimumTier)) {
    for (let idx = tierRank(selected.tier) - 1; idx >= tierRank(minimumTier); idx -= 1) {
      const candidateTier = TIERS[idx];
      const candidateSelection = selectModelForTier(candidateTier, request.expectedTokens, catalog);
      if (!candidateSelection) continue;
      const candidateCost = estimateCost(candidateSelection.model, request.expectedTokens);
      if (candidateCost <= request.budgetCents) {
        selected = { model: candidateSelection.model, tier: candidateTier, hasCapacity: candidateSelection.hasCapacity };
        estimatedCostCents = candidateCost;
        withinBudget = true;
        budgetDowngraded = true;
        break;
      }
    }
  }

  if (budgetDowngraded) reasons.push("budget_downgrade");
  if (!withinBudget) reasons.push("budget_exceeded");
  reasons.push(`tier:${selected.tier}`);

  const decision: ModelRoutingDecision = {
    decisionId: idFactory("model"),
    requestId: request.requestId,
    selectedModel: selected.model.id,
    tier: selected.tier,
    justification: reasons.length > 0 ? reasons : ["tier:unspecified"],
    estimatedCostCents,
    withinBudget,
    createdAt: now,
  };

  return ModelRoutingDecisionSchema.parse(decision);
};

export const createModelRouter = (options: ModelRouterOptions = {}): ModelRouter => {
  const catalog = options.catalog ?? DEFAULT_MODEL_CATALOG;
  const policy = options.policy ?? defaultModelRoutingPolicy;
  const costPolicy = options.costPolicy ?? defaultModelRoutingCostPolicy;
  const outcomeStore = options.outcomeStore ?? (options.identityKey ? createTaskOutcomeStore(options.identityKey) : undefined);
  const audit = options.auditStore ?? createModelRoutingAuditStore(options.identityKey ?? "system");
  const now = options.now ?? nowIso;
  const idFactory = options.idFactory ?? createId;

  return {
    route: (request: ModelRoutingRequest) => {
      const parsed = ModelRoutingRequestSchema.safeParse(request);
      if (!parsed.success) {
        throw new Error("model_routing_request_invalid");
      }
      const routingCap = options.identityKey ? loadCostRoutingCap(options.identityKey) : null;
      const routingPreference = options.identityKey
        ? resolveRoutingPreference(options.identityKey, parsed.data.task, now())
        : null;
      const emergency = options.identityKey ? loadEmergencyMode(options.identityKey) : null;
      const humanMaxTier = options.identityKey ? resolveHumanMaxTier(options.identityKey) : null;
      const emergencyCap = emergency?.maxModelTier ?? null;
      const decision = buildDecision(
        parsed.data,
        catalog,
        policy,
        costPolicy,
        outcomeStore,
        routingCap,
        routingPreference,
        humanMaxTier,
        emergencyCap,
        now(),
        idFactory
      );
      audit.record({ request: parsed.data, decision });
      return decision;
    },
    audit,
  };
};
