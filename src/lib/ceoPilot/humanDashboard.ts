import { loadCostEvents, loadImprovementRuns, loadQualityMetrics, loadCooperationMetrics, loadEmergencyMode } from "./runtimeState";
import { clamp, nowIso } from "./utils";

export type HumanDashboardSummary = {
  identityKey: string;
  updatedAt: string;
  quality: {
    averageQuality: number;
    trackedTaskTypes: number;
  };
  cost: {
    softLimitEvents: number;
    hardLimitEvents: number;
    totalEvents: number;
  };
  cooperation: {
    avgTrustScore: number;
    deadlockPairs: number;
  };
  improvements: {
    totalRuns: number;
    applied: number;
    rolledBack: number;
  };
  emergencyMode: {
    active: boolean;
    mode?: string;
    reason?: string;
  };
};

export const buildHumanDashboard = (identityKey: string): HumanDashboardSummary => {
  const qualityMetrics = loadQualityMetrics(identityKey);
  const costEvents = loadCostEvents(identityKey);
  const improvementRuns = loadImprovementRuns(identityKey);
  const cooperationMetrics = loadCooperationMetrics(identityKey);
  const emergency = loadEmergencyMode(identityKey);

  const avgQuality =
    qualityMetrics.length === 0
      ? 0
      : qualityMetrics.reduce((sum, metric) => sum + metric.avgQuality, 0) / qualityMetrics.length;
  const avgTrust =
    cooperationMetrics.length === 0
      ? 1
      : cooperationMetrics.reduce((sum, metric) => sum + metric.trustScore, 0) / cooperationMetrics.length;

  const applied = improvementRuns.reduce((sum, run) => sum + run.appliedCount, 0);
  const rolledBack = improvementRuns.reduce((sum, run) => sum + run.rolledBackCount, 0);

  return {
    identityKey,
    updatedAt: nowIso(),
    quality: {
      averageQuality: clamp(avgQuality, 0, 1),
      trackedTaskTypes: new Set(qualityMetrics.map((metric) => metric.taskType)).size,
    },
    cost: {
      softLimitEvents: costEvents.filter((event) => event.type === "soft_limit_exceeded").length,
      hardLimitEvents: costEvents.filter((event) => event.type === "hard_limit_exceeded").length,
      totalEvents: costEvents.length,
    },
    cooperation: {
      avgTrustScore: clamp(avgTrust, 0, 1),
      deadlockPairs: cooperationMetrics.filter((metric) => metric.deadlockScore >= 0.7).length,
    },
    improvements: {
      totalRuns: improvementRuns.length,
      applied,
      rolledBack,
    },
    emergencyMode: {
      active: Boolean(emergency && emergency.mode !== "normal"),
      mode: emergency?.mode,
      reason: emergency?.reason,
    },
  };
};
