import {
  ModelTier,
  QualityMetricRecord,
  QualityMetricRecordSchema,
  QualityRegressionRecord,
  QualityRegressionRecordSchema,
  TaskOutcomeRecord,
} from "./contracts";
import { clamp, createId, nowIso } from "./utils";

export type QualityPolicy = {
  minSamples: number;
  recentWindowSize: number;
  regressionThreshold: number;
  confidenceHalfLifeDays: number;
};

export const defaultQualityPolicy: QualityPolicy = {
  minSamples: 5,
  recentWindowSize: 5,
  regressionThreshold: 0.08,
  confidenceHalfLifeDays: 30,
};

const sortByTime = (records: TaskOutcomeRecord[]): TaskOutcomeRecord[] =>
  records.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));

const summarizeQuality = (records: TaskOutcomeRecord[]) => {
  const total = records.length;
  const avgQuality = total === 0 ? 0 : records.reduce((sum, r) => sum + r.qualityScore, 0) / total;
  const avgCost = total === 0 ? 0 : records.reduce((sum, r) => sum + r.costCents, 0) / total;
  const passRate = total === 0 ? 0 : records.filter((r) => r.evaluationPassed).length / total;
  return { total, avgQuality, avgCost, passRate };
};

const decayConfidence = (confidence: number, updatedAt: string, policy: QualityPolicy, now: string): number => {
  const ageMs = Math.max(0, Date.parse(now) - Date.parse(updatedAt));
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const factor = Math.pow(0.5, ageDays / Math.max(policy.confidenceHalfLifeDays, 1));
  return clamp(confidence * factor, 0, 1);
};

export const computeQualityMetrics = (
  outcomes: TaskOutcomeRecord[],
  policy: QualityPolicy = defaultQualityPolicy,
  now: string = nowIso()
): QualityMetricRecord[] => {
  const grouped = new Map<string, TaskOutcomeRecord[]>();
  outcomes.forEach((record) => {
    const key = `${record.taskType}::${record.taskClass}::${record.modelTier}`;
    const list = grouped.get(key) ?? [];
    list.push(record);
    grouped.set(key, list);
  });

  const metrics: QualityMetricRecord[] = [];
  grouped.forEach((records, key) => {
    const [taskType, taskClass, modelTier] = key.split("::") as [string, TaskOutcomeRecord["taskClass"], ModelTier];
    const stats = summarizeQuality(records);
    const confidence = clamp(stats.total / Math.max(policy.minSamples, 1), 0, 1);
    const updatedAt = records.reduce((latest, record) => (record.createdAt > latest ? record.createdAt : latest), records[0]?.createdAt ?? now);
    const metric: QualityMetricRecord = {
      metricId: createId("quality"),
      taskType,
      taskClass,
      modelTier,
      sampleCount: stats.total,
      passRate: clamp(stats.passRate, 0, 1),
      avgQuality: clamp(stats.avgQuality, 0, 1),
      avgCostCents: Math.round(stats.avgCost),
      confidence,
      decayedConfidence: decayConfidence(confidence, updatedAt, policy, now),
      updatedAt,
    };
    const parsed = QualityMetricRecordSchema.safeParse(metric);
    if (parsed.success) {
      metrics.push(parsed.data);
    }
  });

  return metrics;
};

export const detectQualityRegressions = (
  outcomes: TaskOutcomeRecord[],
  policy: QualityPolicy = defaultQualityPolicy,
  now: string = nowIso()
): QualityRegressionRecord[] => {
  const sorted = sortByTime(outcomes);
  const regressions: QualityRegressionRecord[] = [];
  const grouped = new Map<string, TaskOutcomeRecord[]>();
  sorted.forEach((record) => {
    const key = `${record.taskType}::${record.modelTier}`;
    const list = grouped.get(key) ?? [];
    list.push(record);
    grouped.set(key, list);
  });

  grouped.forEach((records, key) => {
    if (records.length < policy.minSamples + 1) return;
    const recent = records.slice(-policy.recentWindowSize);
    const baseline = records.slice(0, Math.max(0, records.length - policy.recentWindowSize));
    if (baseline.length < policy.minSamples || recent.length < 2) return;

    const baselineStats = summarizeQuality(baseline);
    const recentStats = summarizeQuality(recent);
    const delta = recentStats.avgQuality - baselineStats.avgQuality;
    if (delta >= -policy.regressionThreshold) return;

    const [taskType, modelTier] = key.split("::") as [string, ModelTier];
    const severity = delta <= -0.2 ? "high" : delta <= -0.12 ? "medium" : "low";
    const regression: QualityRegressionRecord = {
      regressionId: createId("regress"),
      taskType,
      modelTier,
      baselineQuality: clamp(baselineStats.avgQuality, 0, 1),
      recentQuality: clamp(recentStats.avgQuality, 0, 1),
      delta,
      severity,
      detectedAt: now,
    };
    const parsed = QualityRegressionRecordSchema.safeParse(regression);
    if (parsed.success) {
      regressions.push(parsed.data);
    }
  });

  return regressions;
};

export type QualityFallbackDecision = {
  fallbackTier?: ModelTier;
  reason?: string;
};

export const pickFallbackTier = (
  regressions: QualityRegressionRecord[],
  taskType: string,
  currentTier: ModelTier
): QualityFallbackDecision => {
  const hit = regressions.find((regression) => regression.taskType === taskType && regression.modelTier === currentTier);
  if (!hit) return {};
  const tiers: ModelTier[] = ["economy", "standard", "advanced", "frontier"];
  const currentIndex = tiers.indexOf(currentTier);
  const nextTier = currentIndex >= 0 && currentIndex < tiers.length - 1 ? tiers[currentIndex + 1] : undefined;
  if (!nextTier) return {};
  return {
    fallbackTier: nextTier,
    reason: `quality_regression:${hit.severity}`,
  };
};
