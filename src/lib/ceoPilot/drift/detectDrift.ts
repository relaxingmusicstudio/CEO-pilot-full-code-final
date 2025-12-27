import type {
  CostEventRecord,
  DriftReport,
  DriftSeverity,
  ImprovementRunRecord,
  ModelRoutingDecision,
  ModelRoutingRequest,
  TaskOutcomeRecord,
  ValueAnchor,
} from "../contracts";
import { clamp, createId, nowIso } from "../utils";

export type RoutingHistoryEntry = {
  request: ModelRoutingRequest;
  decision: ModelRoutingDecision;
};

export type DriftDetectorInput = {
  identityKey: string;
  anchor: ValueAnchor;
  outcomes: TaskOutcomeRecord[];
  modelRoutingHistory: RoutingHistoryEntry[];
  costEvents: CostEventRecord[];
  improvementRuns: ImprovementRunRecord[];
  now?: string;
  baselineDays?: number;
  recentDays?: number;
  minSamples?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const buildWindow = (nowValue: string, baselineDays: number, recentDays: number) => {
  const nowMs = Date.parse(nowValue);
  const recentEnd = new Date(nowMs);
  const recentStart = new Date(nowMs - recentDays * DAY_MS);
  const baselineEnd = new Date(nowMs - recentDays * DAY_MS);
  const baselineStart = new Date(nowMs - (baselineDays + recentDays) * DAY_MS);
  return {
    baselineStart: baselineStart.toISOString(),
    baselineEnd: baselineEnd.toISOString(),
    recentStart: recentStart.toISOString(),
    recentEnd: recentEnd.toISOString(),
  };
};

const splitByWindow = <T>(records: T[], getTime: (item: T) => number, window: ReturnType<typeof buildWindow>) => {
  const baselineStart = Date.parse(window.baselineStart);
  const baselineEnd = Date.parse(window.baselineEnd);
  const recentStart = Date.parse(window.recentStart);
  const recentEnd = Date.parse(window.recentEnd);
  const baseline = records.filter((record) => {
    const time = getTime(record);
    return time >= baselineStart && time < baselineEnd;
  });
  const recent = records.filter((record) => {
    const time = getTime(record);
    return time >= recentStart && time <= recentEnd;
  });
  return { baseline, recent };
};

const buildDistribution = (records: string[]): Record<string, number> => {
  const counts = new Map<string, number>();
  records.forEach((key) => {
    if (!key) return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
  if (total === 0) return {};
  const distribution: Record<string, number> = {};
  counts.forEach((value, key) => {
    distribution[key] = value / total;
  });
  return distribution;
};

const jsDivergence = (left: Record<string, number>, right: Record<string, number>): number => {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  if (keys.size === 0) return 0;
  const getValue = (dist: Record<string, number>, key: string) => dist[key] ?? 0;
  const log2 = (value: number) => Math.log(value) / Math.log(2);
  let klLeft = 0;
  let klRight = 0;
  keys.forEach((key) => {
    const p = getValue(left, key);
    const q = getValue(right, key);
    const m = 0.5 * (p + q);
    if (p > 0 && m > 0) {
      klLeft += p * log2(p / m);
    }
    if (q > 0 && m > 0) {
      klRight += q * log2(q / m);
    }
  });
  const js = 0.5 * klLeft + 0.5 * klRight;
  return clamp(js, 0, 1);
};

const computeRate = (numerator: number, denominator: number): number =>
  denominator <= 0 ? 0 : clamp(numerator / denominator, 0, 1);

const buildDistributionMetric = (
  baselineRecords: string[],
  recentRecords: string[],
  minSamples: number
) => {
  const baseline = buildDistribution(baselineRecords);
  const recent = buildDistribution(recentRecords);
  const sampleCount = baselineRecords.length + recentRecords.length;
  const insufficient = baselineRecords.length < minSamples || recentRecords.length < minSamples;
  return {
    metric: {
      baseline,
      recent,
      jsDivergence: insufficient ? 0 : jsDivergence(baseline, recent),
      sampleCount,
    },
    insufficient,
  };
};

const buildOutcomeMetric = (
  baseline: TaskOutcomeRecord[],
  recent: TaskOutcomeRecord[],
  improvementRuns: ImprovementRunRecord[],
  window: ReturnType<typeof buildWindow>,
  minSamples: number
) => {
  const baselineFailures = baseline.filter((record) => !record.evaluationPassed).length;
  const recentFailures = recent.filter((record) => !record.evaluationPassed).length;
  const baselineFailureRate = computeRate(baselineFailures, baseline.length);
  const recentFailureRate = computeRate(recentFailures, recent.length);

  const runWindow = splitByWindow(improvementRuns, (run) => Date.parse(run.createdAt), window);
  const baselineRollbacks = runWindow.baseline.reduce((sum, run) => sum + run.rolledBackCount, 0);
  const recentRollbacks = runWindow.recent.reduce((sum, run) => sum + run.rolledBackCount, 0);
  const baselineApplied = runWindow.baseline.reduce((sum, run) => sum + run.appliedCount, 0);
  const recentApplied = runWindow.recent.reduce((sum, run) => sum + run.appliedCount, 0);
  const baselineRollbackRate = computeRate(baselineRollbacks, baselineApplied + baselineRollbacks);
  const recentRollbackRate = computeRate(recentRollbacks, recentApplied + recentRollbacks);

  const insufficientOutcomes = baseline.length < minSamples || recent.length < minSamples;
  const insufficientRollbacks = runWindow.baseline.length < minSamples || runWindow.recent.length < minSamples;
  const sampleCount = baseline.length + recent.length;

  return {
    metric: {
      baselineFailureRate,
      recentFailureRate,
      deltaFailureRate: recentFailureRate - baselineFailureRate,
      baselineRollbackRate: insufficientRollbacks ? 0 : baselineRollbackRate,
      recentRollbackRate: insufficientRollbacks ? 0 : recentRollbackRate,
      deltaRollbackRate: insufficientRollbacks ? 0 : recentRollbackRate - baselineRollbackRate,
      sampleCount,
    },
    insufficient: insufficientOutcomes,
    rollbackInsufficient: insufficientRollbacks,
  };
};

const buildConstraintMetric = (
  baseline: CostEventRecord[],
  recent: CostEventRecord[],
  minSamples: number
) => {
  const violationTypes = new Set(["hard_limit_exceeded"]);
  const nearMissTypes = new Set(["soft_limit_exceeded", "routing_cap_applied", "scheduled_due_to_cost"]);
  const countViolations = (records: CostEventRecord[]) =>
    records.filter((record) => violationTypes.has(record.type)).length;
  const countNearMisses = (records: CostEventRecord[]) =>
    records.filter((record) => nearMissTypes.has(record.type)).length;
  const baselineViolations = countViolations(baseline);
  const recentViolations = countViolations(recent);
  const baselineNearMisses = countNearMisses(baseline);
  const recentNearMisses = countNearMisses(recent);
  const baselineViolationRate = computeRate(baselineViolations, baseline.length);
  const recentViolationRate = computeRate(recentViolations, recent.length);
  const baselineNearMissRate = computeRate(baselineNearMisses, baseline.length);
  const recentNearMissRate = computeRate(recentNearMisses, recent.length);
  const insufficient = baseline.length < minSamples || recent.length < minSamples;

  return {
    metric: {
      baselineViolations,
      recentViolations,
      violationRateDelta: recentViolationRate - baselineViolationRate,
      baselineNearMisses,
      recentNearMisses,
      nearMissRateDelta: recentNearMissRate - baselineNearMissRate,
      sampleCount: baseline.length + recent.length,
    },
    insufficient,
  };
};

const scoreRatio = (value: number, threshold: number): number => {
  if (threshold <= 0) return 0;
  return Math.abs(value) / threshold;
};

const resolveSeverity = (score: number): DriftSeverity => {
  if (score >= 2) return "high";
  if (score >= 1) return "medium";
  if (score >= 0.5) return "low";
  return "none";
};

export const detectDrift = (input: DriftDetectorInput): DriftReport => {
  const now = input.now ?? nowIso();
  const baselineDays = input.baselineDays ?? 28;
  const recentDays = input.recentDays ?? 7;
  const minSamples = input.minSamples ?? 6;
  const window = buildWindow(now, baselineDays, recentDays);

  const outcomeWindow = splitByWindow(input.outcomes, (record) => Date.parse(record.createdAt), window);
  const routingWindow = splitByWindow(
    input.modelRoutingHistory,
    (entry) => Date.parse(entry.decision.createdAt),
    window
  );
  const costWindow = splitByWindow(input.costEvents, (record) => Date.parse(record.createdAt), window);

  const decisionMetric = buildDistributionMetric(
    outcomeWindow.baseline.map((record) => record.taskType),
    outcomeWindow.recent.map((record) => record.taskType),
    minSamples
  );
  const routingMetric = buildDistributionMetric(
    routingWindow.baseline.map((entry) => entry.decision.tier),
    routingWindow.recent.map((entry) => entry.decision.tier),
    minSamples
  );
  const outcomeMetric = buildOutcomeMetric(
    outcomeWindow.baseline,
    outcomeWindow.recent,
    input.improvementRuns,
    window,
    minSamples
  );
  const constraintMetric = buildConstraintMetric(costWindow.baseline, costWindow.recent, minSamples);

  const thresholds = input.anchor.escalationThresholds;
  const reasons: string[] = [];
  const scores: number[] = [];

  if (!decisionMetric.insufficient && decisionMetric.metric.jsDivergence >= thresholds.decisionDistribution) {
    reasons.push("decision_distribution_drift");
    scores.push(scoreRatio(decisionMetric.metric.jsDivergence, thresholds.decisionDistribution));
  }

  if (!routingMetric.insufficient && routingMetric.metric.jsDivergence >= thresholds.routingDistribution) {
    reasons.push("routing_distribution_drift");
    scores.push(scoreRatio(routingMetric.metric.jsDivergence, thresholds.routingDistribution));
  }

  if (!outcomeMetric.insufficient && outcomeMetric.metric.deltaFailureRate >= thresholds.outcomeFailureDelta) {
    reasons.push("outcome_failure_rate_drift");
    scores.push(scoreRatio(outcomeMetric.metric.deltaFailureRate, thresholds.outcomeFailureDelta));
  }

  if (
    !outcomeMetric.rollbackInsufficient &&
    outcomeMetric.metric.deltaRollbackRate >= thresholds.rollbackRateDelta
  ) {
    reasons.push("rollback_rate_drift");
    scores.push(scoreRatio(outcomeMetric.metric.deltaRollbackRate, thresholds.rollbackRateDelta));
  }

  if (!constraintMetric.insufficient && constraintMetric.metric.violationRateDelta >= thresholds.constraintViolationRate) {
    reasons.push("constraint_violation_trend");
    scores.push(scoreRatio(constraintMetric.metric.violationRateDelta, thresholds.constraintViolationRate));
  }

  if (!constraintMetric.insufficient && constraintMetric.metric.nearMissRateDelta >= thresholds.nearMissRate) {
    reasons.push("near_miss_trend");
    scores.push(scoreRatio(constraintMetric.metric.nearMissRateDelta, thresholds.nearMissRate));
  }

  const allInsufficient =
    decisionMetric.insufficient &&
    routingMetric.insufficient &&
    outcomeMetric.insufficient &&
    constraintMetric.insufficient;
  if (allInsufficient) {
    reasons.push("insufficient_history");
  }

  const severity = allInsufficient ? "none" : resolveSeverity(scores.length > 0 ? Math.max(...scores) : 0);

  return {
    reportId: createId("drift"),
    identityKey: input.identityKey,
    anchorId: input.anchor.anchorId,
    anchorVersion: input.anchor.version,
    severity,
    reasons,
    metrics: {
      decisionDistribution: decisionMetric.metric,
      routingDistribution: routingMetric.metric,
      outcomeRates: outcomeMetric.metric,
      constraintTrend: constraintMetric.metric,
      weightDrift: {
        available: false,
        reason: "metric_weights_unconfigured",
      },
    },
    window,
    createdAt: now,
  };
};
