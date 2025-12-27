import { describe, expect, it } from "vitest";
import { resolveDisagreement } from "../../../src/lib/ceoPilot/cooperation";
import type { DisagreementRecord } from "../../../src/lib/ceoPilot/contracts";
import {
  buildTrustIndex,
  createInMemoryCooperationMetricStore,
  recordCooperationOutcome,
} from "../../../src/lib/ceoPilot/cooperationEvolution";

const FIXED_NOW = "2025-01-01T00:00:00.000Z";

const record: DisagreementRecord = {
  disagreementId: "disagree-1",
  topic: "Routing choice",
  proposals: [
    {
      proposalId: "p1",
      agentId: "agent-a",
      summary: "Use source A",
      justification: "Higher quality",
      confidence: 0.7,
      riskLevel: 0.3,
      evidenceRefs: [],
      assumptions: [],
      unresolvedRisks: [],
      impact: "reversible",
      createdAt: FIXED_NOW,
    },
    {
      proposalId: "p2",
      agentId: "agent-b",
      summary: "Use source B",
      justification: "Lower cost",
      confidence: 0.6,
      riskLevel: 0.2,
      evidenceRefs: [],
      assumptions: [],
      unresolvedRisks: [],
      impact: "reversible",
      createdAt: FIXED_NOW,
    },
  ],
  status: "open",
  createdAt: FIXED_NOW,
};

describe("ceoPilot cooperation evolution", () => {
  it("escalates early when deadlock risk is high", () => {
    const store = createInMemoryCooperationMetricStore();
    recordCooperationOutcome(store, record, "escalated", "test:coop", FIXED_NOW);
    recordCooperationOutcome(store, record, "escalated", "test:coop", FIXED_NOW);
    recordCooperationOutcome(store, record, "forced_smallest_step", "test:coop", FIXED_NOW);
    const metrics = store.list();
    const trustIndex = buildTrustIndex(metrics);
    const deadlockScore = 0.9;

    const resolution = resolveDisagreement(record, {
      now: FIXED_NOW,
      trustIndex,
      deadlockScore,
    });

    expect(deadlockScore).toBeGreaterThan(0);
    expect(resolution.status).toBe("escalated");
  });
});
