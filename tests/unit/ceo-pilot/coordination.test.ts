import { describe, expect, it } from "vitest";
import { evaluateAgentScope, recordDisagreement, validateHandoff } from "../../../src/lib/ceoPilot/coordination";
import { runReferee } from "../../../src/lib/ceoPilot/referee";

const BASE_AGENT = {
  agentId: "agent-1",
  displayName: "Ops Agent",
  role: "ops",
  scope: {
    domains: ["ops"],
    decisionScopes: ["recommend"],
    allowedTools: ["notify"],
    prohibitedActions: [],
  },
  maxPermissionTier: "suggest" as const,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

describe("ceoPilot coordination", () => {
  it("blocks actions outside agent scope", () => {
    const decision = evaluateAgentScope(BASE_AGENT, {
      tool: "execute",
      domain: "finance",
      decisionType: "recommend",
      permissionTier: "suggest",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("domain_out_of_scope");
  });

  it("routes irreversible disagreement to escalation", () => {
    const disagreement = recordDisagreement({
      topic: "Pricing change",
      proposals: [
        {
          proposalId: "p1",
          agentId: "agent-a",
          summary: "Increase price by 10%",
          justification: "Market demand",
          confidence: 0.6,
          riskLevel: 0.4,
          evidenceRefs: [],
          assumptions: ["demand stable"],
          unresolvedRisks: ["churn"],
          impact: "irreversible",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
        {
          proposalId: "p2",
          agentId: "agent-b",
          summary: "Hold pricing",
          justification: "Retention risk",
          confidence: 0.7,
          riskLevel: 0.2,
          evidenceRefs: [],
          assumptions: [],
          unresolvedRisks: [],
          impact: "difficult",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    });

    const outcome = runReferee(disagreement);
    expect(outcome.decision.action).toBe("escalate");
    expect(outcome.decision.requiresHumanReview).toBe(true);
  });

  it("requires governance for overrides", () => {
    const decision = validateHandoff({
      handoffId: "handoff-1",
      fromAgentId: "agent-a",
      toAgentId: "agent-b",
      taskId: "task-1",
      summary: "Override previous recommendation",
      assumptions: [],
      unresolvedRisks: [],
      confidence: 0.6,
      requiredTools: [],
      createdAt: "2025-01-01T00:00:00.000Z",
      overrideAgentId: "agent-c",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("override_requires_governance");
  });
});
