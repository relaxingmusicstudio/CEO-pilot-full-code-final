import { FailureType, ToolUsageEvent, ToolUsageEventSchema } from "./contracts";
import { clamp } from "./utils";

export type ToolUsageStore = {
  record: (event: ToolUsageEvent) => void;
  list: (tool?: string) => ToolUsageEvent[];
};

export const createToolUsageStore = (): ToolUsageStore => {
  const store = new Map<string, ToolUsageEvent[]>();
  return {
    record: (event) => {
      const parsed = ToolUsageEventSchema.safeParse(event);
      if (!parsed.success) return;
      const list = store.get(event.tool) ?? [];
      store.set(event.tool, [...list, parsed.data]);
    },
    list: (tool) => {
      if (!tool) return Array.from(store.values()).flat();
      return store.get(tool) ?? [];
    },
  };
};

export type ToolStats = {
  tool: string;
  totalCalls: number;
  successes: number;
  failures: number;
  consecutiveFailures: number;
  failureRate: number;
  avgLatencyMs: number;
  avgCostCents: number;
  lastFailureAt?: string;
  failureTypeCounts: Record<FailureType, number>;
};

export const getToolStats = (tool: string, store: ToolUsageStore): ToolStats => {
  const events = store.list(tool).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const failureTypeCounts: Record<FailureType, number> = {
    schema_validation_error: 0,
    tool_runtime_error: 0,
    timeout: 0,
    permission_denied: 0,
    budget_exceeded: 0,
    policy_blocked: 0,
    unknown: 0,
  };

  let successes = 0;
  let failures = 0;
  let consecutiveFailures = 0;
  let lastFailureAt: string | undefined;
  let latencyTotal = 0;
  let costTotal = 0;

  events.forEach((event) => {
    latencyTotal += event.latencyMs;
    costTotal += event.costCents ?? 0;
    if (event.status === "success") {
      successes += 1;
      consecutiveFailures = 0;
      return;
    }

    failures += 1;
    consecutiveFailures += 1;
    lastFailureAt = event.timestamp;
    const failureType = event.failureType ?? "unknown";
    failureTypeCounts[failureType] = (failureTypeCounts[failureType] ?? 0) + 1;
  });

  const totalCalls = events.length;
  const failureRate = totalCalls === 0 ? 0 : failures / totalCalls;
  const avgLatencyMs = totalCalls === 0 ? 0 : Math.round(latencyTotal / totalCalls);
  const avgCostCents = totalCalls === 0 ? 0 : Math.round(costTotal / totalCalls);

  return {
    tool,
    totalCalls,
    successes,
    failures,
    consecutiveFailures,
    failureRate,
    avgLatencyMs,
    avgCostCents,
    lastFailureAt,
    failureTypeCounts,
  };
};

export type ToolAdaptationPolicy = {
  maxConsecutiveFailures: number;
  disableFailureRate: number;
  degradeFailureRate: number;
  minSamples: number;
  cooldownMs: number;
};

export const defaultToolAdaptationPolicy: ToolAdaptationPolicy = {
  maxConsecutiveFailures: 3,
  disableFailureRate: 0.6,
  degradeFailureRate: 0.3,
  minSamples: 5,
  cooldownMs: 1000 * 60 * 10,
};

export type ToolRecommendation = {
  tool: string;
  status: "active" | "degraded" | "disabled";
  score: number;
  reason: string;
  stats: ToolStats;
};

export const recommendTool = (
  tool: string,
  store: ToolUsageStore,
  policy: ToolAdaptationPolicy = defaultToolAdaptationPolicy,
  nowMs: number = Date.now()
): ToolRecommendation => {
  const stats = getToolStats(tool, store);
  if (stats.totalCalls < policy.minSamples) {
    return {
      tool,
      status: "active",
      score: 1,
      reason: "insufficient_history",
      stats,
    };
  }

  const recentFailureAge = stats.lastFailureAt ? nowMs - Date.parse(stats.lastFailureAt) : null;
  const withinCooldown = recentFailureAge !== null && recentFailureAge < policy.cooldownMs;

  if (stats.consecutiveFailures >= policy.maxConsecutiveFailures && withinCooldown) {
    return {
      tool,
      status: "disabled",
      score: 0,
      reason: "consecutive_failures",
      stats,
    };
  }

  if (stats.failureRate >= policy.disableFailureRate) {
    return {
      tool,
      status: "disabled",
      score: 0,
      reason: "failure_rate_too_high",
      stats,
    };
  }

  const baseScore = clamp(1 - stats.failureRate, 0, 1);
  if (stats.failureRate >= policy.degradeFailureRate) {
    return {
      tool,
      status: "degraded",
      score: baseScore * 0.6,
      reason: "degraded_failure_rate",
      stats,
    };
  }

  return {
    tool,
    status: "active",
    score: baseScore,
    reason: "healthy",
    stats,
  };
};

export const rankTools = (
  tools: string[],
  store: ToolUsageStore,
  policy: ToolAdaptationPolicy = defaultToolAdaptationPolicy
): ToolRecommendation[] => {
  return tools
    .map((tool) => recommendTool(tool, store, policy))
    .sort((a, b) => b.score - a.score);
};

export type FailurePattern = {
  tool: string;
  failureType: FailureType;
  count: number;
};

export const detectFailurePatterns = (
  tool: string,
  store: ToolUsageStore,
  minCount: number = 2
): FailurePattern[] => {
  const stats = getToolStats(tool, store);
  return (Object.keys(stats.failureTypeCounts) as FailureType[])
    .map((failureType) => ({
      tool,
      failureType,
      count: stats.failureTypeCounts[failureType],
    }))
    .filter((pattern) => pattern.count >= minCount)
    .sort((a, b) => b.count - a.count);
};
