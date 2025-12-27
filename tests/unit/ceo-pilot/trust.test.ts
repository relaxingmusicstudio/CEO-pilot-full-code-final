import { describe, expect, it } from "vitest";
import {
  buildRecommendation,
  canPromoteAutonomy,
  shouldEscalate,
} from "../../../src/lib/ceoPilot/trust";
import { FailureDebtReport } from "../../../src/lib/ceoPilot/evaluation";

const debtBlocked: FailureDebtReport = {
  totalFailures: 3,
  byTask: { "task-1": 2 },
  byFailureClass: {
    schema: 0,
    policy: 2,
    budget: 0,
    scope: 0,
    regression: 0,
    stability: 1,
    unknown: 0,
  },
  criticalFailures: ["task-1"],
  blocked: true,
  escalated: true,
  reasons: ["critical_failures_block_autonomy"],
};

describe("ceoPilot trust calibration", () => {
  it("requires explainability for critical actions", () => {
    expect(() =>
      buildRecommendation({
        agentId: "agent-1",
        intent: "pricing_change",
        summary: "Increase pricing",
        impact: "difficult",
        confidence: {
          confidenceScore: 0.6,
          uncertaintyExplanation: "Limited data",
          knownBlindSpots: ["seasonality"],
          evidenceRefs: [],
        },
      })
    ).toThrow("explainability_required_for_critical_action");
  });

  it("escalates on low confidence or irreversible impact", () => {
    const decision = shouldEscalate({
      confidenceScore: 0.4,
      noveltyScore: 0.2,
      impact: "irreversible",
      ambiguityCount: 0,
    });

    expect(decision.escalate).toBe(true);
    expect(decision.reasons).toContain("low_confidence");
    expect(decision.reasons).toContain("irreversible_action");
  });

  it("blocks promotion when failure debt is present", () => {
    const decision = canPromoteAutonomy({
      currentTier: "suggest",
      passRate: 0.95,
      uncertaintyVariance: 0.01,
      rollbackRate: 0.01,
      stableRuns: 6,
      failureDebt: debtBlocked,
    });

    expect(decision.eligible).toBe(false);
    expect(decision.reasons).toContain("failure_debt_blocks_promotion");
  });
});
