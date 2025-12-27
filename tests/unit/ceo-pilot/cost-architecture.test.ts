import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createInMemoryModelRoutingAuditStore,
  createInMemoryTaskOutcomeStore,
  createModelRouter,
} from "../../../src/lib/ceoPilot/modelRouter";
import {
  createCacheEntry,
  createInMemoryCacheStore,
  hashCacheInput,
} from "../../../src/lib/ceoPilot/cache";
import { createBudgetTracker } from "../../../src/lib/ceoPilot/safety";
import { createGovernedTool, invokeTool } from "../../../src/lib/ceoPilot/tooling";
import { DEFAULT_AGENT_IDS, getAgentProfile } from "../../../src/lib/ceoPilot/agents";
import { DEFAULT_GOAL_IDS } from "../../../src/lib/ceoPilot/goals";
import type { TaskOutcomeRecord } from "../../../src/lib/ceoPilot/contracts";
import {
  applyDistilledRule,
  considerDistillation,
  createInMemoryDistilledRuleStore,
} from "../../../src/lib/ceoPilot/distillation";
import { recordTaskHistory } from "../../../src/lib/ceoPilot/runtimeState";

const FIXED_NOW = "2025-01-01T00:00:00.000Z";

const buildOutcome = (
  overrides: Partial<TaskOutcomeRecord> = {}
): TaskOutcomeRecord => ({
  outcomeId: `outcome-${Math.random().toString(36).slice(2, 6)}`,
  taskId: "task-1",
  taskType: "summarize",
  inputHash: "hash-1",
  taskClass: "routine",
  goalId: DEFAULT_GOAL_IDS.ceoPilot,
  agentId: DEFAULT_AGENT_IDS.evaluation,
  modelTier: "economy",
  modelId: "model-economy",
  cacheHit: false,
  ruleUsed: false,
  evaluationPassed: true,
  qualityScore: 0.9,
  costCents: 5,
  modelCostCents: 5,
  toolCostCents: 0,
  durationMs: 120,
  retryCount: 0,
  humanOverride: false,
  createdAt: FIXED_NOW,
  ...overrides,
});

describe("ceoPilot cost architecture", () => {
  it("trends routine tasks toward cheaper tiers with proven quality", () => {
    const outcomes: TaskOutcomeRecord[] = [
      buildOutcome({ modelTier: "economy", qualityScore: 0.9, costCents: 5 }),
      buildOutcome({ modelTier: "economy", qualityScore: 0.91, costCents: 5 }),
      buildOutcome({ modelTier: "economy", qualityScore: 0.92, costCents: 5 }),
      buildOutcome({ modelTier: "standard", qualityScore: 0.93, costCents: 15, modelId: "model-standard" }),
      buildOutcome({ modelTier: "standard", qualityScore: 0.94, costCents: 15, modelId: "model-standard" }),
      buildOutcome({ modelTier: "standard", qualityScore: 0.92, costCents: 15, modelId: "model-standard" }),
    ];
    const outcomeStore = createInMemoryTaskOutcomeStore(outcomes);
    const router = createModelRouter({
      auditStore: createInMemoryModelRoutingAuditStore(),
      outcomeStore,
      now: () => FIXED_NOW,
      idFactory: () => "model-1",
    });

    const decision = router.route({
      requestId: "req-1",
      task: "summarize",
      taskClass: "routine",
      riskLevel: "low",
      irreversible: false,
      complianceSensitive: false,
      noveltyScore: 0.1,
      ambiguityScore: 0.1,
      reasoningDepth: "medium",
      expectedTokens: 500,
      budgetCents: 100,
      requiresArbitration: false,
    });

    expect(decision.tier).toBe("economy");
    expect(decision.justification).toContain("history_downgrade");
  });

  it("bypasses tool execution on cache hit", async () => {
    const agentProfile = getAgentProfile(DEFAULT_AGENT_IDS.evaluation);
    if (!agentProfile) throw new Error("missing evaluation agent profile");
    let executions = 0;
    const cacheStore = createInMemoryCacheStore();
    const cachePolicy = {
      ttlMs: 60000,
      maxNoveltyScore: 0.5,
      allowIrreversible: false,
      allowExploration: true,
    };

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
      requestId: "req-cache",
      tool: "echo",
      intent: "test",
      permissionTier: "execute",
      input: { text: "hello" },
      estimatedCostCents: 1,
      estimatedTokens: 10,
      sideEffectCount: 0,
      impact: "reversible",
      createdAt: FIXED_NOW,
    };

    const context = {
      permissionTier: "execute",
      budget: createBudgetTracker({ maxCostCents: 10, maxTokens: 100, maxSideEffects: 0 }),
      identityKey: "test:cache",
      initiator: "system",
      agentContext: {
        agentId: agentProfile.agentId,
        actionDomain: "system",
        decisionType: "tool_validation",
        tool: echoTool.name,
        goalId: DEFAULT_GOAL_IDS.systemIntegrity,
        taskId: "task-cache",
        taskDescription: "Validate cache hits bypass execution.",
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
      cache: {
        store: cacheStore,
        policy: cachePolicy,
        goalId: DEFAULT_GOAL_IDS.systemIntegrity,
        goalVersion: "v1",
        taskType: "tool:echo",
        taskClass: "routine",
        noveltyScore: 0.1,
      },
    };

    const first = await invokeTool(echoTool, call, context);
    expect(first.status).toBe("success");
    expect(executions).toBe(1);

    const second = await invokeTool(echoTool, call, context);
    expect(second.status).toBe("success");
    expect(executions).toBe(1);
  });

  it("executes distilled rules without model usage", () => {
    const store = createInMemoryDistilledRuleStore();
    const inputHash = "hash-distill";
    const outcomes: TaskOutcomeRecord[] = [
      buildOutcome({ inputHash }),
      buildOutcome({ inputHash }),
      buildOutcome({ inputHash }),
    ];

    const rule = considerDistillation(
      "test:distill",
      {
        taskType: "summarize",
        inputHash,
        goalId: DEFAULT_GOAL_IDS.ceoPilot,
        output: { ok: true },
        outcomes,
      },
      store
    );

    expect(rule).not.toBeNull();

    let llmCalls = 0;
    const execute = () => {
      const decision = applyDistilledRule(store, {
        taskId: "task-distill",
        taskType: "summarize",
        inputHash,
        goalId: DEFAULT_GOAL_IDS.ceoPilot,
      });
      if (decision.hit) return decision.output;
      llmCalls += 1;
      return { ok: true };
    };

    const output = execute();
    expect(output).toEqual({ ok: true });
    expect(llmCalls).toBe(0);
  });

  it("still blocks unsafe actions even with cache entries", async () => {
    const agentProfile = getAgentProfile(DEFAULT_AGENT_IDS.evaluation);
    if (!agentProfile) throw new Error("missing evaluation agent profile");
    const cacheStore = createInMemoryCacheStore();
    const cachePolicy = {
      ttlMs: 60000,
      maxNoveltyScore: 0.5,
      allowIrreversible: true,
      allowExploration: true,
    };
    const input = { text: "irreversible" };
    const inputHash = hashCacheInput(input);
    const entry = createCacheEntry({
      kind: "tool",
      taskType: "tool:echo",
      goalId: DEFAULT_GOAL_IDS.systemIntegrity,
      goalVersion: "v1",
      inputHash,
      policy: cachePolicy,
      payload: { ok: true },
      now: FIXED_NOW,
    });
    cacheStore.upsert(entry);

    const echoTool = createGovernedTool({
      name: "echo",
      version: "1",
      inputSchema: z.object({ text: z.string() }).strict(),
      outputSchema: z.object({ ok: z.boolean() }).strict(),
      impact: "irreversible",
      permissionTiers: ["execute"],
      execute: () => ({ ok: true }),
    });

    recordTaskHistory("test:unsafe", {
      taskId: "history-unsafe",
      goalId: DEFAULT_GOAL_IDS.systemIntegrity,
      description: "Unsafe action should be blocked.",
      createdAt: FIXED_NOW,
    });

    const result = await invokeTool(
      echoTool,
      {
        requestId: "req-unsafe",
        tool: "echo",
        intent: "test",
        permissionTier: "execute",
        input,
        estimatedCostCents: 1,
        estimatedTokens: 10,
        sideEffectCount: 1,
        impact: "irreversible",
        createdAt: FIXED_NOW,
      },
      {
        permissionTier: "execute",
        budget: createBudgetTracker({ maxCostCents: 10, maxTokens: 100, maxSideEffects: 2 }),
        identityKey: "test:unsafe",
        initiator: "human",
        agentContext: {
          agentId: agentProfile.agentId,
          actionDomain: "system",
          decisionType: "tool_validation",
          tool: echoTool.name,
          goalId: DEFAULT_GOAL_IDS.systemIntegrity,
          taskId: "task-unsafe",
          taskDescription: "Unsafe action should be blocked.",
          taskType: "tool:echo",
          taskClass: "routine",
          estimatedCostCents: 1,
          explorationMode: false,
          actionTags: [],
          permissionTier: "execute",
          impact: "irreversible",
          explainability: {
            whyDecision: "Test irreversible safety gate.",
            alternativesRejected: ["skip approval"],
            whatWouldChangeDecision: ["human approval"],
          },
          secondOrderEffects: {
            effects: ["test impact"],
            incentiveRisks: [],
            uncertaintyScore: 0.1,
            mitigations: ["review"],
            checkedAt: FIXED_NOW,
          },
          longHorizonCommitment: {
            commitmentSummary: "Test irreversible action.",
            durationDays: 1,
            justification: "Test only.",
            reversibleAlternative: "Do nothing",
            technicalDebtDelta: 0,
          },
          confidence: {
            confidenceScore: 0.9,
            uncertaintyExplanation: "Test input only.",
            knownBlindSpots: ["no live provider data"],
            evidenceRefs: ["test:evidence", "test:evidence-2", "test:evidence-3"],
          },
          metrics: { uncertaintyVariance: 0.01, rollbackRate: 0.01, stableRuns: 6 },
        },
        cache: {
          store: cacheStore,
          policy: cachePolicy,
          goalId: DEFAULT_GOAL_IDS.systemIntegrity,
          goalVersion: "v1",
          taskType: "tool:echo",
          taskClass: "routine",
          noveltyScore: 0.1,
        },
      }
    );

    expect(result.status).toBe("failure");
    expect(result.failure?.type).toBe("permission_denied");
  });
});
