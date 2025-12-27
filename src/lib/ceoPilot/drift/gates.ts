import type { DriftReport, ValueReaffirmationRecord } from "../contracts";

export type DriftGateDecision = {
  severity: DriftReport["severity"];
  requiresReaffirmation: boolean;
  throttle: boolean;
  freeze: boolean;
  reaffirmed: boolean;
  reason: string;
};

const isReaffirmed = (
  report: DriftReport,
  reaffirmation?: ValueReaffirmationRecord | null
): boolean => {
  if (!reaffirmation) return false;
  if (reaffirmation.anchorId !== report.anchorId) return false;
  if (reaffirmation.anchorVersion !== report.anchorVersion) return false;
  return Date.parse(reaffirmation.createdAt) >= Date.parse(report.createdAt);
};

export const buildDriftGateDecision = (
  report: DriftReport,
  reaffirmation?: ValueReaffirmationRecord | null
): DriftGateDecision => {
  const reaffirmed = isReaffirmed(report, reaffirmation);
  const requiresReaffirmation = (report.severity === "medium" || report.severity === "high") && !reaffirmed;
  const freeze = report.severity === "high" && !reaffirmed;
  const throttle = report.severity === "medium" && !reaffirmed;
  const reason = freeze
    ? "value_drift_freeze"
    : throttle
      ? "value_drift_throttle"
      : reaffirmed && (report.severity === "medium" || report.severity === "high")
        ? "value_drift_reaffirmed"
        : "value_drift_clear";

  return {
    severity: report.severity,
    requiresReaffirmation,
    throttle,
    freeze,
    reaffirmed,
    reason,
  };
};

export const shouldFreezeAutonomy = (
  report: DriftReport,
  reaffirmation?: ValueReaffirmationRecord | null
): boolean => buildDriftGateDecision(report, reaffirmation).freeze;

export const shouldThrottleAutonomy = (
  report: DriftReport,
  reaffirmation?: ValueReaffirmationRecord | null
): boolean => buildDriftGateDecision(report, reaffirmation).throttle;

export const canPromoteChanges = (
  report: DriftReport,
  reaffirmation?: ValueReaffirmationRecord | null
): boolean => !buildDriftGateDecision(report, reaffirmation).requiresReaffirmation;
