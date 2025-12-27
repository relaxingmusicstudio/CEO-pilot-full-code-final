import { describe, expect, it } from "vitest";
import { simulateCostShock } from "../../../src/lib/ceoPilot/emergencyMode";
import { evaluateCostGovernance } from "../../../src/lib/ceoPilot/costGovernance";
import { createModelRouter, createInMemoryModelRoutingAuditStore } from "../../../src/lib/ceoPilot/modelRouter";
import { loadCausalChains } from "../../../src/lib/ceoPilot/runtimeState";

describe("ceoPilot emergency mode", () => {
  it("defers non-critical work during emergency mode", () => {
    const identityKey = "test:emergency:mode";
    simulateCostShock({
      identityKey,
      type: "budget_shock",
      severity: "high",
      description: "Simulated cost spike",
      now: "2025-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    const chains = loadCausalChains(identityKey);
    expect(chains.some((chain) => chain.actionType === "emergency_mode")).toBe(true);

    const decision = evaluateCostGovernance({
      identityKey,
      taskType: "summarize",
      taskClass: "routine",
      estimatedCostCents: 5,
      impact: "reversible",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.hardLimitExceeded).toBe(true);
    expect(decision.reason).toBe("emergency_mode_defer");
  });

  it("caps model routing tiers during emergency mode", () => {
    const identityKey = "test:emergency:router";
    simulateCostShock({
      identityKey,
      type: "price_change",
      severity: "high",
      description: "Simulated price change",
      now: "2025-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const router = createModelRouter({
      identityKey,
      auditStore: createInMemoryModelRoutingAuditStore(),
      now: () => "2025-01-02T00:00:00.000Z",
      idFactory: () => "model-1",
    });

    const decision = router.route({
      requestId: "req-emergency",
      task: "summarize",
      taskClass: "routine",
      riskLevel: "low",
      irreversible: false,
      complianceSensitive: false,
      noveltyScore: 0.8,
      ambiguityScore: 0.8,
      reasoningDepth: "deep",
      expectedTokens: 500,
      budgetCents: 100,
      requiresArbitration: false,
    });

    expect(decision.tier).toBe("economy");
    expect(decision.justification.join("|")).toContain("emergency_cap:economy");
  });
});
