import { CooperationMetric, CooperationMetricSchema, DisagreementRecord } from "./contracts";
import { clamp, createId, nowIso } from "./utils";
import { loadCooperationMetrics, upsertCooperationMetric } from "./runtimeState";

export type CooperationMetricStore = {
  list: () => CooperationMetric[];
  upsert: (metric: CooperationMetric) => CooperationMetric[];
};

export const createCooperationMetricStore = (identityKey: string): CooperationMetricStore => ({
  list: () => loadCooperationMetrics(identityKey),
  upsert: (metric) => upsertCooperationMetric(identityKey, metric),
});

export const createInMemoryCooperationMetricStore = (seed: CooperationMetric[] = []): CooperationMetricStore => {
  const entries = [...seed];
  return {
    list: () => [...entries],
    upsert: (metric) => {
      const index = entries.findIndex(
        (entry) => entry.agentA === metric.agentA && entry.agentB === metric.agentB
      );
      if (index >= 0) {
        entries[index] = metric;
      } else {
        entries.push(metric);
      }
      return [...entries];
    },
  };
};

const pairKey = (agentA: string, agentB: string): [string, string] =>
  agentA.localeCompare(agentB) <= 0 ? [agentA, agentB] : [agentB, agentA];

const computeTrustScore = (disagreementCount: number, escalationCount: number, forcedCount: number): number => {
  if (disagreementCount === 0) return 1;
  const escalationRate = escalationCount / disagreementCount;
  const forcedRate = forcedCount / disagreementCount;
  return clamp(1 - escalationRate * 0.6 - forcedRate * 0.3, 0, 1);
};

const computeDeadlockScore = (disagreementCount: number, escalationCount: number, forcedCount: number): number => {
  if (disagreementCount === 0) return 0;
  const escalationRate = escalationCount / disagreementCount;
  const forcedRate = forcedCount / disagreementCount;
  return clamp(escalationRate * 0.7 + forcedRate * 0.3, 0, 1);
};

export const recordCooperationOutcome = (
  store: CooperationMetricStore,
  record: DisagreementRecord,
  outcome: CooperationMetric["lastOutcome"],
  identityKey: string = "unknown",
  now: string = nowIso()
): CooperationMetric => {
  const agents = record.proposals.map((proposal) => proposal.agentId);
  if (agents.length < 2) {
    const metric: CooperationMetric = {
      metricId: createId("coop"),
      identityKey,
      agentA: agents[0] ?? "unknown",
      agentB: agents[0] ?? "unknown",
      disagreementCount: 1,
      escalationCount: outcome === "escalated" ? 1 : 0,
      forcedCount: outcome === "forced_smallest_step" ? 1 : 0,
      resolvedCount: outcome === "selected" || outcome === "merged" ? 1 : 0,
      trustScore: 0,
      deadlockScore: 0,
      lastOutcome: outcome,
      updatedAt: now,
    };
    return metric;
  }

  const [agentA, agentB] = pairKey(agents[0], agents[1]);
  const existing = store.list().find((metric) => metric.agentA === agentA && metric.agentB === agentB);
  const disagreementCount = (existing?.disagreementCount ?? 0) + 1;
  const escalationCount = (existing?.escalationCount ?? 0) + (outcome === "escalated" ? 1 : 0);
  const forcedCount = (existing?.forcedCount ?? 0) + (outcome === "forced_smallest_step" ? 1 : 0);
  const resolvedCount =
    (existing?.resolvedCount ?? 0) + (outcome === "selected" || outcome === "merged" ? 1 : 0);
  const trustScore = computeTrustScore(disagreementCount, escalationCount, forcedCount);
  const deadlockScore = computeDeadlockScore(disagreementCount, escalationCount, forcedCount);

  const metric: CooperationMetric = {
    metricId: existing?.metricId ?? createId("coop"),
    identityKey: existing?.identityKey ?? identityKey,
    agentA,
    agentB,
    disagreementCount,
    escalationCount,
    forcedCount,
    resolvedCount,
    trustScore,
    deadlockScore,
    lastOutcome: outcome,
    updatedAt: now,
  };
  const parsed = CooperationMetricSchema.safeParse(metric);
  if (!parsed.success) {
    return metric;
  }
  store.upsert(parsed.data);
  return parsed.data;
};

export const buildTrustIndex = (metrics: CooperationMetric[]): Map<string, number> => {
  const scores = new Map<string, { total: number; count: number }>();
  metrics.forEach((metric) => {
    const left = scores.get(metric.agentA) ?? { total: 0, count: 0 };
    left.total += metric.trustScore;
    left.count += 1;
    scores.set(metric.agentA, left);
    const right = scores.get(metric.agentB) ?? { total: 0, count: 0 };
    right.total += metric.trustScore;
    right.count += 1;
    scores.set(metric.agentB, right);
  });
  const index = new Map<string, number>();
  scores.forEach((value, agentId) => {
    index.set(agentId, value.count === 0 ? 0 : value.total / value.count);
  });
  return index;
};
