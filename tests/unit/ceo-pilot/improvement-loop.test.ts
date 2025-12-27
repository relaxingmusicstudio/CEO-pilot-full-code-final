import { describe, expect, it } from "vitest";
import type { TaskOutcomeRecord } from "../../../src/lib/ceoPilot/contracts";
import { createModelRouter, createInMemoryModelRoutingAuditStore } from "../../../src/lib/ceoPilot/modelRouter";
import { recordTaskOutcome, loadRoutingPreferences, loadFailureMemory, loadCausalChains } from "../../../src/lib/ceoPilot/runtimeState";
import { runSelfImprovementCycle } from "../../../src/lib/ceoPilot/improvement";
import { DEFAULT_AGENT_IDS } from "../../../src/lib/ceoPilot/agents";
import { DEFAULT_GOAL_IDS } from "../../../src/lib/ceoPilot/goals";

const buildOutcome = (overrides: Partial<TaskOutcomeRecord> = {}): TaskOutcomeRecord => ({
  outcomeId: `outcome-${Math.random().toString(36).slice(2, 6)}`,
  taskId: "task-improve",
  taskType: "summarize",
  inputHash: "hash-improve",
  output: { text: "result" },
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
  createdAt: "2025-01-01T00:00:00.000Z",
  ...overrides,
});

describe("ceoPilot self-improvement loop", () => {
  it("downgrades routing on verified cheap-tier quality and rolls back on regression", () => {
    const identityKey = "test:improve:cycle";
    const baselineOutcomes = [
      buildOutcome({ createdAt: "2025-01-01T00:00:00.000Z", qualityScore: 0.91 }),
      buildOutcome({ createdAt: "2025-01-02T00:00:00.000Z", qualityScore: 0.9 }),
      buildOutcome({ createdAt: "2025-01-03T00:00:00.000Z", qualityScore: 0.92 }),
      buildOutcome({ createdAt: "2025-01-04T00:00:00.000Z", qualityScore: 0.9 }),
      buildOutcome({ createdAt: "2025-01-05T00:00:00.000Z", qualityScore: 0.93 }),
      buildOutcome({ createdAt: "2025-01-01T00:00:00.000Z", modelTier: "standard", modelId: "model-standard", costCents: 15 }),
      buildOutcome({ createdAt: "2025-01-02T00:00:00.000Z", modelTier: "standard", modelId: "model-standard", costCents: 15 }),
      buildOutcome({ createdAt: "2025-01-03T00:00:00.000Z", modelTier: "standard", modelId: "model-standard", costCents: 15 }),
    ];

    baselineOutcomes.forEach((record) => recordTaskOutcome(identityKey, record));
    runSelfImprovementCycle(identityKey, undefined, "2025-01-06T00:00:00.000Z");

    const routingPrefs = loadRoutingPreferences(identityKey);
    const downgrade = routingPrefs.find((pref) => pref.taskType === "summarize" && pref.maxTier === "economy");
    expect(downgrade?.status).toBe("active");
    expect(downgrade?.lineage?.sourceOutcomeIds.length ?? 0).toBeGreaterThan(0);

    const chains = loadCausalChains(identityKey);
    expect(chains.length).toBeGreaterThan(0);
    expect(chains.some((chain) => chain.actionType === "routing_downgrade")).toBe(true);

    const router = createModelRouter({
      auditStore: createInMemoryModelRoutingAuditStore(),
      identityKey,
      now: () => "2025-01-06T00:00:00.000Z",
      idFactory: () => "model-route-1",
    });
    const decision = router.route({
      requestId: "req-route",
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

    const regressionOutcomes = [
      buildOutcome({ createdAt: "2025-01-06T00:00:00.000Z", qualityScore: 0.52 }),
      buildOutcome({ createdAt: "2025-01-07T00:00:00.000Z", qualityScore: 0.5 }),
      buildOutcome({ createdAt: "2025-01-08T00:00:00.000Z", qualityScore: 0.48 }),
      buildOutcome({ createdAt: "2025-01-09T00:00:00.000Z", qualityScore: 0.49 }),
      buildOutcome({ createdAt: "2025-01-10T00:00:00.000Z", qualityScore: 0.5 }),
    ];
    regressionOutcomes.forEach((record) => recordTaskOutcome(identityKey, record));
    runSelfImprovementCycle(identityKey, undefined, "2025-01-11T00:00:00.000Z");

    const updatedPrefs = loadRoutingPreferences(identityKey);
    const disabled = updatedPrefs.find((pref) => pref.taskType === "summarize" && pref.status === "disabled");
    expect(disabled).toBeDefined();
    const failureMemory = loadFailureMemory(identityKey);
    expect(failureMemory.length).toBeGreaterThan(0);
  });
});
