import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createBudgetTracker } from "../../../src/lib/ceoPilot/safety";
import { createGovernedTool, invokeTool } from "../../../src/lib/ceoPilot/tooling";
import { DEFAULT_AGENT_IDS, getAgentProfile } from "../../../src/lib/ceoPilot/agents";
import { DEFAULT_GOAL_IDS } from "../../../src/lib/ceoPilot/goals";

const FIXED_NOW = "2025-01-01T00:00:00.000Z";

const echoTool = createGovernedTool({
  name: "echo",
  version: "1",
  inputSchema: z.object({ text: z.string() }).strict(),
  outputSchema: z.object({ ok: z.boolean() }).strict(),
  impact: "reversible" as const,
  permissionTiers: ["suggest", "execute"],
  execute: () => ({ ok: true }),
});

describe("ceoPilot tooling", () => {
  it("blocks invalid input", async () => {
    const agentProfile = getAgentProfile(DEFAULT_AGENT_IDS.evaluation);
    if (!agentProfile) throw new Error("missing evaluation agent profile");
    const result = await invokeTool(
      echoTool,
      {
        requestId: "req-1",
        tool: "echo",
        intent: "test",
        permissionTier: "suggest",
        input: { text: 42 },
        costUnits: 1,
        costCategory: "compute",
        estimatedCostCents: 0,
        estimatedTokens: 0,
        sideEffectCount: 0,
        impact: "reversible",
        createdAt: FIXED_NOW,
      },
      {
        permissionTier: "suggest",
        budget: createBudgetTracker({ maxCostCents: 10, maxTokens: 100, maxSideEffects: 0 }),
        identityKey: "test:tooling",
        initiator: "system",
        agentContext: {
          agentId: agentProfile.agentId,
          actionDomain: "system",
          decisionType: "tool_validation",
          tool: echoTool.name,
          goalId: DEFAULT_GOAL_IDS.systemIntegrity,
          taskId: "task-tool-validation",
          taskDescription: "Validate tool input schema handling.",
          taskType: "tool:echo",
          taskClass: "routine",
          estimatedCostCents: 1,
          explorationMode: true,
          actionTags: [],
          permissionTier: "suggest",
          impact: "reversible",
          confidence: {
            confidenceScore: 0.9,
            uncertaintyExplanation: "Test input only.",
            knownBlindSpots: ["no live provider data"],
            evidenceRefs: ["test:evidence"],
          },
          metrics: { uncertaintyVariance: 0.01, rollbackRate: 0.01, stableRuns: 6 },
        },
      }
    );

    expect(result.status).toBe("failure");
    expect(result.failure?.type).toBe("schema_validation_error");
  });

  it("enforces budgets", async () => {
    const agentProfile = getAgentProfile(DEFAULT_AGENT_IDS.evaluation);
    if (!agentProfile) throw new Error("missing evaluation agent profile");
    const result = await invokeTool(
      echoTool,
      {
        requestId: "req-2",
        tool: "echo",
        intent: "test",
        permissionTier: "execute",
        input: { text: "ok" },
        costUnits: 6,
        costCategory: "compute",
        estimatedCostCents: 50,
        estimatedTokens: 500,
        sideEffectCount: 1,
        impact: "reversible",
        createdAt: FIXED_NOW,
      },
      {
        permissionTier: "execute",
        budget: createBudgetTracker({ maxCostCents: 10, maxTokens: 100, maxSideEffects: 0 }),
        identityKey: "test:tooling",
        initiator: "system",
        agentContext: {
          agentId: agentProfile.agentId,
          actionDomain: "system",
          decisionType: "tool_validation",
          tool: echoTool.name,
          goalId: DEFAULT_GOAL_IDS.systemIntegrity,
          taskId: "task-tool-budget",
          taskDescription: "Validate tool budget enforcement.",
          taskType: "tool:echo",
          taskClass: "routine",
          estimatedCostCents: 50,
          explorationMode: true,
          actionTags: [],
          permissionTier: "execute",
          impact: "reversible",
          confidence: {
            confidenceScore: 0.9,
            uncertaintyExplanation: "Test input only.",
            knownBlindSpots: ["no live provider data"],
            evidenceRefs: ["test:evidence"],
          },
          metrics: { uncertaintyVariance: 0.01, rollbackRate: 0.01, stableRuns: 6 },
        },
      }
    );

    expect(result.status).toBe("failure");
    expect(result.failure?.type).toBe("budget_exceeded");
  });

  it("allows valid execution", async () => {
    const agentProfile = getAgentProfile(DEFAULT_AGENT_IDS.evaluation);
    if (!agentProfile) throw new Error("missing evaluation agent profile");
    const result = await invokeTool(
      echoTool,
      {
        requestId: "req-3",
        tool: "echo",
        intent: "test",
        permissionTier: "execute",
        input: { text: "ok" },
        costUnits: 1,
        costCategory: "compute",
        estimatedCostCents: 1,
        estimatedTokens: 10,
        sideEffectCount: 0,
        impact: "reversible",
        createdAt: FIXED_NOW,
      },
      {
        permissionTier: "execute",
        budget: createBudgetTracker({ maxCostCents: 10, maxTokens: 100, maxSideEffects: 0 }),
        identityKey: "test:tooling",
        initiator: "system",
        agentContext: {
          agentId: agentProfile.agentId,
          actionDomain: "system",
          decisionType: "tool_validation",
          tool: echoTool.name,
          goalId: DEFAULT_GOAL_IDS.systemIntegrity,
          taskId: "task-tool-execution",
          taskDescription: "Validate tool execution flow.",
          taskType: "tool:echo",
          taskClass: "routine",
          estimatedCostCents: 1,
          explorationMode: true,
          actionTags: [],
          permissionTier: "execute",
          impact: "reversible",
          confidence: {
            confidenceScore: 0.9,
            uncertaintyExplanation: "Test input only.",
            knownBlindSpots: ["no live provider data"],
            evidenceRefs: ["test:evidence"],
          },
          metrics: { uncertaintyVariance: 0.01, rollbackRate: 0.01, stableRuns: 6 },
        },
      }
    );

    expect(result.status).toBe("success");
  });
});
