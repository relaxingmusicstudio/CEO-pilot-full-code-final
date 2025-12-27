import { describe, expect, it } from "vitest";
import { resolveDisagreement } from "../../../src/lib/ceoPilot/cooperation";
import { DisagreementRecord } from "../../../src/lib/ceoPilot/contracts";

const FIXED_NOW = "2025-01-01T00:00:00.000Z";
const idFactory = (prefix: string) => `${prefix}-1`;

describe("ceoPilot cooperation protocols", () => {
  it("resolves disagreements deterministically", () => {
    const record: DisagreementRecord = {
      disagreementId: "disagree-1",
      topic: "Routing choice",
      proposals: [
        {
          proposalId: "p1",
          agentId: "agent-a",
          summary: "Use source A first",
          justification: "Higher accuracy",
          confidence: 0.8,
          riskLevel: 0.2,
          evidenceRefs: [],
          assumptions: [],
          unresolvedRisks: [],
          impact: "reversible",
          createdAt: FIXED_NOW,
        },
        {
          proposalId: "p2",
          agentId: "agent-b",
          summary: "Use source B first",
          justification: "Lower cost",
          confidence: 0.6,
          riskLevel: 0.4,
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

    const options = { now: FIXED_NOW, timeoutMs: 1000 * 60, idFactory };
    const first = resolveDisagreement(record, options);
    const second = resolveDisagreement(record, options);

    expect(first.selectedProposalIds).toEqual(second.selectedProposalIds);
    expect(first.status).toBe("selected");
  });
});
