import { describe, expect, it } from "vitest";
import { enforceRuntimeGovernance } from "../../../src/lib/ceoPilot/runtimeGovernance";
import { upsertHumanControlProfile } from "../../../src/lib/ceoPilot/runtimeState";
import { createModelRouter, createInMemoryModelRoutingAuditStore } from "../../../src/lib/ceoPilot/modelRouter";
import { buildTestAgentContext } from "../helpers/agentContext";

describe("ceoPilot human controls", () => {
  it("blocks actions above the human autonomy ceiling", async () => {
    const identityKey = "test:human:ceiling";
    upsertHumanControlProfile(identityKey, {
      profileId: "human-control-override",
      identityKey,
      ownerId: "human",
      autonomyCeiling: "suggest",
      maxModelTier: "frontier",
      minConfidence: 0.5,
      noveltyThreshold: 0.7,
      requireHumanReviewForIrreversible: true,
      emergencyStop: false,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });

    const context = buildTestAgentContext("task", { permissionTier: "execute" });
    const decision = await enforceRuntimeGovernance(identityKey, context, "agent");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("human_autonomy_ceiling");
  });

  it("caps model routing using human max model tier", () => {
    const identityKey = "test:human:router";
    upsertHumanControlProfile(identityKey, {
      profileId: "human-control-cap",
      identityKey,
      ownerId: "human",
      autonomyCeiling: "execute",
      maxModelTier: "standard",
      minConfidence: 0.5,
      noveltyThreshold: 0.7,
      requireHumanReviewForIrreversible: true,
      emergencyStop: false,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });

    const router = createModelRouter({
      identityKey,
      auditStore: createInMemoryModelRoutingAuditStore(),
      now: () => "2025-01-02T00:00:00.000Z",
      idFactory: () => "model-1",
    });

    const decision = router.route({
      requestId: "req-human-cap",
      task: "summarize",
      taskClass: "routine",
      riskLevel: "low",
      irreversible: false,
      complianceSensitive: false,
      noveltyScore: 0.9,
      ambiguityScore: 0.9,
      reasoningDepth: "deep",
      expectedTokens: 4000,
      budgetCents: 200,
      requiresArbitration: false,
    });

    expect(decision.tier).toBe("standard");
    expect(decision.justification.join("|")).toContain("human_max_tier:standard");
  });
});
