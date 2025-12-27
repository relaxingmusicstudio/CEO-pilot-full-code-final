import { describe, expect, it } from "vitest";
import { enforceRuntimeGovernance } from "../../../src/lib/ceoPilot/runtimeGovernance";
import { DEFAULT_GOAL_IDS } from "../../../src/lib/ceoPilot/goals";
import { saveGoals } from "../../../src/lib/ceoPilot/runtimeState";
import { buildTestAgentContext } from "../helpers/agentContext";

describe("ceoPilot meta-governance", () => {
  it("blocks expired goals from execution", async () => {
    const identityKey = "test:goals:expired";
    saveGoals(identityKey, [
      {
        goalId: "goal-expired",
        version: "v1",
        owner: { type: "human", id: "tester" },
        description: "Expired test goal",
        successMetrics: [{ metric: "safety", target: ">=1", direction: "increase" }],
        createdAt: "2024-01-01T00:00:00.000Z",
        expiresAt: "2024-01-02T00:00:00.000Z",
        reviewCadence: "monthly",
        status: "active",
        tags: ["test"],
      },
    ]);

    const context = buildTestAgentContext("task", {
      goalId: "goal-expired",
      taskId: "task-expired",
      explorationMode: true,
    });
    const decision = await enforceRuntimeGovernance(identityKey, context, "agent");

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("goal_expired_requires_reaffirmation");
  });

  it("requires exploration when novelty is high", async () => {
    const identityKey = "test:epistemic:novel";
    const context = buildTestAgentContext("task", {
      goalId: DEFAULT_GOAL_IDS.systemIntegrity,
      taskId: "task-novel",
      explorationMode: false,
    });

    const decision = await enforceRuntimeGovernance(identityKey, context, "agent");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("epistemic_exploration_required");
  });

  it("blocks irreversible actions under epistemic uncertainty", async () => {
    const identityKey = "test:epistemic:irreversible";
    const context = buildTestAgentContext("task", {
      goalId: DEFAULT_GOAL_IDS.systemIntegrity,
      taskId: "task-irreversible",
      explorationMode: true,
      impact: "irreversible",
      explainability: {
        whyDecision: "Impactful change requires justification.",
        alternativesRejected: ["defer action"],
        whatWouldChangeDecision: ["additional evidence"],
      },
    });

    const decision = await enforceRuntimeGovernance(identityKey, context, "agent");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("exploration_blocks_irreversible");
  });
});
