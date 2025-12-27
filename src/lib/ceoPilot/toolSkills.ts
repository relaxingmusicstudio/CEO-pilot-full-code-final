import {
  ToolSkillProfile,
  ToolSkillProfileSchema,
} from "./contracts";
import {
  defaultToolAdaptationPolicy,
  getToolStats,
  recommendTool,
  type ToolAdaptationPolicy,
  type ToolUsageStore,
} from "./adaptation";
import { clamp, nowIso } from "./utils";

export type ToolSkillPolicy = {
  minSamples: number;
  maxRetries: number;
  baseBackoffMs: number;
  latencyTargetMs: number;
  costTargetCents: number;
  failurePenaltyWeight: number;
  latencyPenaltyWeight: number;
  costPenaltyWeight: number;
  nonRetryablePenaltyWeight: number;
};

export const defaultToolSkillPolicy: ToolSkillPolicy = {
  minSamples: 5,
  maxRetries: 2,
  baseBackoffMs: 250,
  latencyTargetMs: 800,
  costTargetCents: 5,
  failurePenaltyWeight: 0.4,
  latencyPenaltyWeight: 0.2,
  costPenaltyWeight: 0.1,
  nonRetryablePenaltyWeight: 0.2,
};

export type ToolSkillProfileOptions = {
  policy?: ToolSkillPolicy;
  fallbackTools?: string[];
  adaptationPolicy?: ToolAdaptationPolicy;
  now?: string;
};

const computeReliabilityScore = (
  successRate: number,
  failureRate: number,
  nonRetryableRatio: number,
  latencyPenalty: number,
  costPenalty: number,
  policy: ToolSkillPolicy
): number =>
  clamp(
    successRate -
      failureRate * policy.failurePenaltyWeight -
      nonRetryableRatio * policy.nonRetryablePenaltyWeight -
      latencyPenalty * policy.latencyPenaltyWeight -
      costPenalty * policy.costPenaltyWeight,
    0,
    1
  );

const computeRetryPlan = (
  totalCalls: number,
  failureRate: number,
  retryableRatio: number,
  policy: ToolSkillPolicy
): number => {
  if (totalCalls < policy.minSamples) return 1;
  if (retryableRatio === 0) return 0;
  if (retryableRatio < 0.5) return 0;
  if (failureRate >= 0.5) return 1;
  if (failureRate >= 0.2) return Math.min(policy.maxRetries, 2);
  return 1;
};

const buildFallbackOrder = (
  fallbackTools: string[],
  store: ToolUsageStore,
  adaptationPolicy: ToolAdaptationPolicy
): string[] => {
  if (fallbackTools.length === 0) return [];
  const recommendations = fallbackTools
    .map((tool) => recommendTool(tool, store, adaptationPolicy))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.tool.localeCompare(b.tool);
    });
  return recommendations.map((rec) => rec.tool);
};

export const buildToolSkillProfile = (
  tool: string,
  store: ToolUsageStore,
  options: ToolSkillProfileOptions = {}
): ToolSkillProfile => {
  const policy = options.policy ?? defaultToolSkillPolicy;
  const adaptationPolicy = options.adaptationPolicy ?? defaultToolAdaptationPolicy;
  const stats = getToolStats(tool, store);
  const totalCalls = stats.totalCalls;
  const successRate = totalCalls === 0 ? 0 : stats.successes / totalCalls;
  const failureRate = totalCalls === 0 ? 0 : stats.failures / totalCalls;

  const retryableFailures =
    stats.failureTypeCounts.timeout + stats.failureTypeCounts.tool_runtime_error;
  const nonRetryableFailures = Math.max(stats.failures - retryableFailures, 0);
  const nonRetryableRatio = stats.failures === 0 ? 0 : nonRetryableFailures / stats.failures;
  const retryableRatio = stats.failures === 0 ? 0 : retryableFailures / stats.failures;

  const latencyPenalty =
    stats.avgLatencyMs <= policy.latencyTargetMs
      ? 0
      : clamp((stats.avgLatencyMs - policy.latencyTargetMs) / policy.latencyTargetMs, 0, 1);
  const costPenalty =
    stats.avgCostCents <= policy.costTargetCents
      ? 0
      : clamp((stats.avgCostCents - policy.costTargetCents) / policy.costTargetCents, 0, 1);

  const reliabilityScore = computeReliabilityScore(
    successRate,
    failureRate,
    nonRetryableRatio,
    latencyPenalty,
    costPenalty,
    policy
  );

  const recommendedRetries = Math.min(
    policy.maxRetries,
    computeRetryPlan(totalCalls, failureRate, retryableRatio, policy)
  );
  const backoffMs = policy.baseBackoffMs * (1 + Math.min(stats.consecutiveFailures, 3));
  const priorityScore = clamp(reliabilityScore - failureRate * 0.2, 0, 1);

  const fallbackOrder = buildFallbackOrder(
    options.fallbackTools ?? [],
    store,
    adaptationPolicy
  );

  const profile: ToolSkillProfile = {
    tool,
    totalCalls: stats.totalCalls,
    successRate,
    failureRate,
    avgLatencyMs: stats.avgLatencyMs,
    avgCostCents: stats.avgCostCents,
    reliabilityScore,
    failureTypeCounts: stats.failureTypeCounts,
    recommendedRetries,
    backoffMs,
    priorityScore,
    fallbackOrder,
    updatedAt: options.now ?? nowIso(),
  };

  const parsed = ToolSkillProfileSchema.safeParse(profile);
  if (!parsed.success) {
    throw new Error("tool_skill_profile_invalid");
  }
  return parsed.data;
};

export const buildToolSkillProfiles = (
  tools: string[],
  store: ToolUsageStore,
  options: ToolSkillProfileOptions = {}
): ToolSkillProfile[] => tools.map((tool) => buildToolSkillProfile(tool, store, options));

export const rankToolSkillProfiles = (profiles: ToolSkillProfile[]): ToolSkillProfile[] =>
  profiles
    .slice()
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      return a.tool.localeCompare(b.tool);
    });
