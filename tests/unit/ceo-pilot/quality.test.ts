import { describe, expect, it } from "vitest";
import type { TaskOutcomeRecord } from "../../../src/lib/ceoPilot/contracts";
import { computeQualityMetrics, detectQualityRegressions } from "../../../src/lib/ceoPilot/quality";
import { DEFAULT_AGENT_IDS } from "../../../src/lib/ceoPilot/agents";
import { DEFAULT_GOAL_IDS } from "../../../src/lib/ceoPilot/goals";

const buildOutcome = (overrides: Partial<TaskOutcomeRecord> = {}): TaskOutcomeRecord => ({
  outcomeId: `outcome-${Math.random().toString(36).slice(2, 6)}`,
  taskId: "task-quality",
  taskType: "summarize",
  inputHash: "hash-quality",
  taskClass: "routine",
  goalId: DEFAULT_GOAL_IDS.ceoPilot,
  agentId: DEFAULT_AGENT_IDS.evaluation,
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
  createdAt: "2025-01-01T00:00:00.000Z",
  ...overrides,
});

describe("ceoPilot quality metrics", () => {
  it("computes decayed confidence for stale quality data", () => {
    const outcomes = [
      buildOutcome({ createdAt: "2025-01-01T00:00:00.000Z" }),
      buildOutcome({ createdAt: "2025-01-02T00:00:00.000Z" }),
      buildOutcome({ createdAt: "2025-01-03T00:00:00.000Z" }),
    ];
    const metrics = computeQualityMetrics(outcomes, {
      minSamples: 2,
      recentWindowSize: 2,
      regressionThreshold: 0.1,
      confidenceHalfLifeDays: 1,
    }, "2025-01-10T00:00:00.000Z");
    expect(metrics.length).toBe(1);
    expect(metrics[0]?.decayedConfidence).toBeLessThan(metrics[0]?.confidence);
  });

  it("detects quality regression on cheap tiers", () => {
    const baseline = [
      buildOutcome({ qualityScore: 0.92, createdAt: "2025-01-01T00:00:00.000Z" }),
      buildOutcome({ qualityScore: 0.91, createdAt: "2025-01-02T00:00:00.000Z" }),
      buildOutcome({ qualityScore: 0.9, createdAt: "2025-01-03T00:00:00.000Z" }),
    ];
    const recent = [
      buildOutcome({ qualityScore: 0.6, createdAt: "2025-01-04T00:00:00.000Z" }),
      buildOutcome({ qualityScore: 0.58, createdAt: "2025-01-05T00:00:00.000Z" }),
    ];
    const regressions = detectQualityRegressions([...baseline, ...recent], {
      minSamples: 2,
      recentWindowSize: 2,
      regressionThreshold: 0.15,
      confidenceHalfLifeDays: 30,
    }, "2025-01-06T00:00:00.000Z");
    expect(regressions.length).toBeGreaterThan(0);
    expect(regressions[0]?.taskType).toBe("summarize");
  });
});
