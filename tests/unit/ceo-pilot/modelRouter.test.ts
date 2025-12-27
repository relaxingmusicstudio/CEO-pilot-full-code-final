import { describe, expect, it } from "vitest";
import {
  createInMemoryModelRoutingAuditStore,
  createModelRouter,
} from "../../../src/lib/ceoPilot/modelRouter";

const FIXED_NOW = "2025-01-01T00:00:00.000Z";
const idFactory = (prefix: string) => `${prefix}-1`;

const baseRequest = {
  requestId: "req-1",
  task: "Summarize market notes",
  taskClass: "routine" as const,
  riskLevel: "low" as const,
  irreversible: false,
  complianceSensitive: false,
  noveltyScore: 0.1,
  ambiguityScore: 0.1,
  reasoningDepth: "shallow" as const,
  expectedTokens: 1000,
  budgetCents: 100,
  requiresArbitration: false,
};

describe("ceoPilot model router", () => {
  it("routes low risk work to economy tier", () => {
    const router = createModelRouter({
      auditStore: createInMemoryModelRoutingAuditStore(),
      now: () => FIXED_NOW,
      idFactory,
    });

    const decision = router.route(baseRequest);
    expect(decision.tier).toBe("economy");
    expect(decision.withinBudget).toBe(true);
  });

  it("routes arbitration work to frontier tier", () => {
    const router = createModelRouter({
      auditStore: createInMemoryModelRoutingAuditStore(),
      now: () => FIXED_NOW,
      idFactory,
    });

    const decision = router.route({
      ...baseRequest,
      requestId: "req-2",
      riskLevel: "high",
      reasoningDepth: "deep",
      requiresArbitration: true,
      budgetCents: 500,
    });

    expect(decision.tier).toBe("frontier");
  });

  it("downgrades tier to meet budget for low risk tasks", () => {
    const router = createModelRouter({
      auditStore: createInMemoryModelRoutingAuditStore(),
      now: () => FIXED_NOW,
      idFactory,
    });

    const decision = router.route({
      ...baseRequest,
      requestId: "req-3",
      reasoningDepth: "medium",
      noveltyScore: 0.5,
      budgetCents: 10,
    });

    expect(decision.tier).toBe("economy");
    expect(decision.withinBudget).toBe(true);
    expect(decision.justification).toContain("budget_downgrade");
  });
});
