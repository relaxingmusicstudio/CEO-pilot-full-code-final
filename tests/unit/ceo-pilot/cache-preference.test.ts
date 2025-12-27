import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createBudgetTracker } from "../../../src/lib/ceoPilot/safety";
import { createGovernedTool, invokeTool } from "../../../src/lib/ceoPilot/tooling";
import { upsertCachePreference } from "../../../src/lib/ceoPilot/runtimeState";
import { DEFAULT_AGENT_IDS } from "../../../src/lib/ceoPilot/agents";
import { DEFAULT_GOAL_IDS } from "../../../src/lib/ceoPilot/goals";

describe("ceoPilot cache preferences", () => {
  it("uses cache preferences when explicit cache context is missing", async () => {
    const identityKey = "test:cache-pref";
    let executions = 0;

    upsertCachePreference(identityKey, {
      preferenceId: "cache-pref-1",
      identityKey,
      taskType: "tool:echo",
      policy: {
        ttlMs: 60000,
        maxNoveltyScore: 0.5,
        allowIrreversible: false,
        allowExploration: true,
      },
      reason: "test cache preference",
      status: "active",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });

    const echoTool = createGovernedTool({
      name: "echo",
      version: "1",
      inputSchema: z.object({ text: z.string() }).strict(),
      outputSchema: z.object({ ok: z.boolean() }).strict(),
      impact: "reversible",
      permissionTiers: ["suggest", "execute"],
      execute: () => {
        executions += 1;
        return { ok: true };
      },
    });

    const call = {
      requestId: "req-cache-pref",
      tool: "echo",
      intent: "test",
      permissionTier: "execute",
      input: { text: "hello" },
      estimatedCostCents: 1,
      estimatedTokens: 10,
      sideEffectCount: 0,
      impact: "reversible",
      createdAt: "2025-01-01T00:00:00.000Z",
    };

    const agentContext = {
      agentId: DEFAULT_AGENT_IDS.evaluation,
      actionDomain: "system",
      decisionType: "tool_validation",
      tool: "echo",
      goalId: DEFAULT_GOAL_IDS.systemIntegrity,
      taskId: "task-cache-pref",
      taskDescription: "Cache preference test",
      taskType: "tool:echo",
      taskClass: "routine",
      estimatedCostCents: 1,
      explorationMode: true,
      actionTags: [],
      permissionTier: "execute",
      impact: "reversible" as const,
      confidence: {
        confidenceScore: 0.9,
        uncertaintyExplanation: "test input only",
        knownBlindSpots: ["no live provider data"],
        evidenceRefs: ["test:evidence"],
      },
      metrics: { uncertaintyVariance: 0.01, rollbackRate: 0.01, stableRuns: 6 },
    };

    const context = {
      permissionTier: "execute",
      budget: createBudgetTracker({ maxCostCents: 10, maxTokens: 100, maxSideEffects: 0 }),
      identityKey,
      initiator: "system" as const,
      agentContext,
    };

    const first = await invokeTool(echoTool, call, context);
    expect(first.status).toBe("success");
    expect(executions).toBe(1);

    const second = await invokeTool(echoTool, call, context);
    expect(second.status).toBe("success");
    expect(executions).toBe(1);
  });
});
