import { describe, expect, it } from "vitest";
import { detectDrift } from "../../../src/lib/ceoPilot/drift/detectDrift";
import { buildDriftGateDecision } from "../../../src/lib/ceoPilot/drift/gates";
import { DEFAULT_VALUE_ANCHORS } from "../../../src/lib/ceoPilot/valueAnchors";
import type {
  CostEventRecord,
  DriftReport,
  ImprovementRunRecord,
  ModelRoutingDecision,
  ModelRoutingRequest,
  TaskOutcomeRecord,
  ValueReaffirmationRecord,
} from "../../../src/lib/ceoPilot/contracts";

const anchor = DEFAULT_VALUE_ANCHORS[0];

let outcomeCounter = 0;
const buildOutcome = (createdAt: string, overrides: Partial<TaskOutcomeRecord> = {}): TaskOutcomeRecord => {
  outcomeCounter += 1;
  return {
    outcomeId: `outcome-${outcomeCounter}`,
    taskId: `task-${createdAt}`,
    taskType: "alpha",
    inputHash: `hash-${createdAt}`,
    output: { ok: true },
    taskClass: "routine",
    goalId: "goal-test",
    agentId: "agent-test",
    modelTier: "economy",
    modelId: "model-economy",
    cacheHit: false,
    ruleUsed: false,
    evaluationPassed: true,
    qualityScore: 0.9,
    costCents: 5,
    modelCostCents: 5,
    toolCostCents: 0,
    durationMs: 120,
    retryCount: 0,
    humanOverride: false,
    createdAt,
    ...overrides,
  };
};

const buildRoutingEntry = (createdAt: string, tier: ModelRoutingDecision["tier"], requestId: string) => ({
  request: {
    requestId,
    task: "alpha",
    taskClass: "routine",
    riskLevel: "low",
    irreversible: false,
    complianceSensitive: false,
    noveltyScore: 0.1,
    ambiguityScore: 0,
    reasoningDepth: "shallow",
    expectedTokens: 120,
    budgetCents: 100,
    requiresArbitration: false,
  } satisfies ModelRoutingRequest,
  decision: {
    decisionId: `decision-${requestId}`,
    requestId,
    selectedModel: `model-${tier}`,
    tier,
    justification: ["test"],
    estimatedCostCents: 5,
    withinBudget: true,
    createdAt,
  } satisfies ModelRoutingDecision,
});

const buildReport = (severity: DriftReport["severity"], createdAt: string): DriftReport => ({
  reportId: `report-${severity}`,
  identityKey: "test:drift",
  anchorId: anchor.anchorId,
  anchorVersion: anchor.version,
  severity,
  reasons: [],
  metrics: {
    decisionDistribution: { baseline: {}, recent: {}, jsDivergence: 0, sampleCount: 0 },
    routingDistribution: { baseline: {}, recent: {}, jsDivergence: 0, sampleCount: 0 },
    outcomeRates: {
      baselineFailureRate: 0,
      recentFailureRate: 0,
      deltaFailureRate: 0,
      baselineRollbackRate: 0,
      recentRollbackRate: 0,
      deltaRollbackRate: 0,
      sampleCount: 0,
    },
    constraintTrend: {
      baselineViolations: 0,
      recentViolations: 0,
      violationRateDelta: 0,
      baselineNearMisses: 0,
      recentNearMisses: 0,
      nearMissRateDelta: 0,
      sampleCount: 0,
    },
    weightDrift: { available: false, reason: "none" },
  },
  window: {
    baselineStart: "2025-01-01T00:00:00.000Z",
    baselineEnd: "2025-01-08T00:00:00.000Z",
    recentStart: "2025-01-08T00:00:00.000Z",
    recentEnd: "2025-01-15T00:00:00.000Z",
  },
  createdAt,
});

describe("ceoPilot value drift detection", () => {
  it("flags drift with distribution and outcome shifts", () => {
    const now = "2025-02-01T00:00:00.000Z";
    const baselineDates = [
      "2025-01-10T00:00:00.000Z",
      "2025-01-11T00:00:00.000Z",
      "2025-01-12T00:00:00.000Z",
      "2025-01-13T00:00:00.000Z",
      "2025-01-14T00:00:00.000Z",
      "2025-01-15T00:00:00.000Z",
    ];
    const recentDates = [
      "2025-01-25T00:00:00.000Z",
      "2025-01-26T00:00:00.000Z",
      "2025-01-27T00:00:00.000Z",
      "2025-01-28T00:00:00.000Z",
      "2025-01-29T00:00:00.000Z",
      "2025-01-30T00:00:00.000Z",
    ];
    const outcomes = [
      ...baselineDates.map((date) => buildOutcome(date, { taskType: "alpha", evaluationPassed: true })),
      ...recentDates.map((date) => buildOutcome(date, { taskType: "beta", evaluationPassed: false })),
    ];
    const routingHistory = [
      ...baselineDates.map((date, idx) => buildRoutingEntry(date, "economy", `req-base-${idx}`)),
      ...recentDates.map((date, idx) => buildRoutingEntry(date, "frontier", `req-recent-${idx}`)),
    ];
    const costEvents: CostEventRecord[] = [];
    const improvementRuns: ImprovementRunRecord[] = [];

    const report = detectDrift({
      identityKey: "test:drift",
      anchor,
      outcomes,
      modelRoutingHistory: routingHistory,
      costEvents,
      improvementRuns,
      now,
      baselineDays: 14,
      recentDays: 7,
      minSamples: 3,
    });

    expect(report.severity).toBe("high");
    expect(report.reasons).toContain("decision_distribution_drift");
    expect(report.reasons).toContain("routing_distribution_drift");
    expect(report.reasons).toContain("outcome_failure_rate_drift");
  });

  it("freezes and throttles based on drift severity", () => {
    const high = buildReport("high", "2025-01-10T00:00:00.000Z");
    const highGate = buildDriftGateDecision(high, null);
    expect(highGate.freeze).toBe(true);
    expect(highGate.requiresReaffirmation).toBe(true);

    const medium = buildReport("medium", "2025-01-10T00:00:00.000Z");
    const mediumGate = buildDriftGateDecision(medium, null);
    expect(mediumGate.throttle).toBe(true);
    expect(mediumGate.requiresReaffirmation).toBe(true);
  });

  it("clears drift gate after reaffirmation", () => {
    const report = buildReport("high", "2025-01-10T00:00:00.000Z");
    const reaffirmation: ValueReaffirmationRecord = {
      reaffirmationId: "reaffirm-1",
      identityKey: "test:drift",
      anchorId: anchor.anchorId,
      anchorVersion: anchor.version,
      decisionId: "decision-1",
      decidedBy: "human",
      notes: "reaffirmed",
      createdAt: "2025-01-11T00:00:00.000Z",
    };

    const gate = buildDriftGateDecision(report, reaffirmation);
    expect(gate.reaffirmed).toBe(true);
    expect(gate.freeze).toBe(false);
    expect(gate.requiresReaffirmation).toBe(false);
  });
});
