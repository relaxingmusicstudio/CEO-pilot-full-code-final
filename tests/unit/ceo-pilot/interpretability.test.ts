import { describe, expect, it } from "vitest";
import type { ImprovementCandidate, TaskOutcomeRecord } from "../../../src/lib/ceoPilot/contracts";
import { buildCausalChainForCandidate } from "../../../src/lib/ceoPilot/interpretability";
import { computeQualityMetrics } from "../../../src/lib/ceoPilot/quality";
import { DEFAULT_AGENT_IDS } from "../../../src/lib/ceoPilot/agents";
import { DEFAULT_GOAL_IDS } from "../../../src/lib/ceoPilot/goals";

const buildOutcome = (overrides: Partial<TaskOutcomeRecord> = {}): TaskOutcomeRecord => ({
  outcomeId: `outcome-${Math.random().toString(36).slice(2, 6)}`,
  taskId: "task-interp",
  taskType: "summarize",
  inputHash: "hash-interp",
  output: { text: "result" },
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

describe("ceoPilot interpretability", () => {
  it("builds a clear causal chain when signals exist", () => {
    const now = "2025-01-06T00:00:00.000Z";
    const outcomes = [
      buildOutcome({ createdAt: "2025-01-01T00:00:00.000Z", qualityScore: 0.91 }),
      buildOutcome({ createdAt: "2025-01-02T00:00:00.000Z", qualityScore: 0.9 }),
      buildOutcome({ createdAt: "2025-01-03T00:00:00.000Z", qualityScore: 0.92 }),
    ];
    const metrics = computeQualityMetrics(outcomes, undefined, now);
    const candidate: ImprovementCandidate = {
      candidateId: "cand-1",
      identityKey: "test:interp",
      type: "routing_downgrade",
      status: "proposed",
      reason: "economy_quality_verified",
      evidenceRefs: [],
      target: { taskType: "summarize", modelTier: "economy" },
      createdAt: now,
    };

    const chain = buildCausalChainForCandidate({
      candidate,
      identityKey: "test:interp",
      sources: {
        outcomes,
        metrics,
        regressions: [],
        costEvents: [],
        cooperationMetrics: [],
      },
      now,
    });

    expect(chain.explanationQuality).toBe("clear");
    expect(chain.triggers.length).toBeGreaterThan(0);
    expect(chain.explanation.summary.length).toBeGreaterThan(0);
  });

  it("flags explanation failure when triggers are missing", () => {
    const now = "2025-01-06T00:00:00.000Z";
    const candidate: ImprovementCandidate = {
      candidateId: "cand-2",
      identityKey: "test:interp",
      type: "routing_upgrade",
      status: "proposed",
      reason: "quality_regression",
      evidenceRefs: [],
      target: { taskType: "summarize", modelTier: "standard" },
      createdAt: now,
    };

    const chain = buildCausalChainForCandidate({
      candidate,
      identityKey: "test:interp",
      sources: {
        outcomes: [],
        metrics: [],
        regressions: [],
        costEvents: [],
        cooperationMetrics: [],
      },
      now,
    });

    expect(chain.explanationQuality).toBe("insufficient");
    expect(chain.requiresHumanReview).toBe(true);
  });
});
