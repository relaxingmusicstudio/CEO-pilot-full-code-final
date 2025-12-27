import type { DriftReport, ValueAnchor, ValueReaffirmationRecord } from "../contracts";
import {
  ensureDefaultValueAnchors,
  loadCostEvents,
  loadDriftReports,
  loadImprovementRuns,
  loadModelRoutingHistory,
  loadTaskOutcomes,
  loadValueReaffirmations,
  recordDriftReport,
} from "../runtimeState";
import { pickPrimaryValueAnchor } from "../valueAnchors";
import { detectDrift } from "./detectDrift";
import { buildDriftGateDecision, type DriftGateDecision } from "./gates";
import { nowIso, stableStringify } from "../utils";

export type DriftState = {
  anchor: ValueAnchor;
  report: DriftReport;
  gate: DriftGateDecision;
  reaffirmation: ValueReaffirmationRecord | null;
};

const pickLatestReaffirmation = (
  records: ValueReaffirmationRecord[],
  anchor: ValueAnchor
): ValueReaffirmationRecord | null => {
  const relevant = records.filter(
    (record) => record.anchorId === anchor.anchorId && record.anchorVersion === anchor.version
  );
  if (relevant.length === 0) return null;
  return relevant.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
};

const shouldRecordReport = (latest: DriftReport | undefined, next: DriftReport, now: string): boolean => {
  if (!latest) return true;
  if (latest.severity !== next.severity) return true;
  if (latest.window.recentEnd !== next.window.recentEnd) return true;
  const latestMetrics = stableStringify(latest.metrics);
  const nextMetrics = stableStringify(next.metrics);
  if (latestMetrics !== nextMetrics) return true;
  const ageMs = Date.parse(now) - Date.parse(latest.createdAt);
  return Number.isFinite(ageMs) && ageMs > 15 * 60 * 1000;
};

export const evaluateDriftState = (identityKey: string, now: string = nowIso()): DriftState => {
  const anchors = ensureDefaultValueAnchors(identityKey);
  const anchor = pickPrimaryValueAnchor(anchors);
  if (!anchor) {
    throw new Error("value_anchor_missing");
  }

  const report = detectDrift({
    identityKey,
    anchor,
    outcomes: loadTaskOutcomes(identityKey),
    modelRoutingHistory: loadModelRoutingHistory(identityKey),
    costEvents: loadCostEvents(identityKey),
    improvementRuns: loadImprovementRuns(identityKey),
    now,
  });

  const latest = loadDriftReports(identityKey).slice(-1)[0];
  if (shouldRecordReport(latest, report, now)) {
    recordDriftReport(identityKey, report);
  }

  const reaffirmations = loadValueReaffirmations(identityKey);
  const reaffirmation = pickLatestReaffirmation(reaffirmations, anchor);
  const gate = buildDriftGateDecision(report, reaffirmation);

  return {
    anchor,
    report,
    gate,
    reaffirmation,
  };
};
