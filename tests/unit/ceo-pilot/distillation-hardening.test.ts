import { describe, expect, it } from "vitest";
import type { TaskOutcomeRecord, DistilledRule } from "../../../src/lib/ceoPilot/contracts";
import {
  applyDistilledRule,
  considerDistillation,
  createInMemoryDistilledRuleStore,
  updateRuleOutcome,
  defaultDistillationPolicy,
} from "../../../src/lib/ceoPilot/distillation";
import { DEFAULT_AGENT_IDS } from "../../../src/lib/ceoPilot/agents";
import { DEFAULT_GOAL_IDS } from "../../../src/lib/ceoPilot/goals";

const buildOutcome = (overrides: Partial<TaskOutcomeRecord> = {}): TaskOutcomeRecord => ({
  outcomeId: `outcome-${Math.random().toString(36).slice(2, 6)}`,
  taskId: "task-distill",
  taskType: "summarize",
  inputHash: "hash-distill",
  output: { text: "result" },
  taskClass: "routine",
  goalId: DEFAULT_GOAL_IDS.ceoPilot,
  agentId: DEFAULT_AGENT_IDS.evaluation,
  modelTier: "standard",
  modelId: "model-standard",
  cacheHit: false,
  ruleUsed: false,
  evaluationPassed: true,
  qualityScore: 0.9,
  costCents: 20,
  modelCostCents: 20,
  toolCostCents: 0,
  durationMs: 120,
  retryCount: 0,
  humanOverride: false,
  createdAt: "2025-01-01T00:00:00.000Z",
  ...overrides,
});

describe("ceoPilot distillation hardening", () => {
  it("captures provenance and expiry on distilled rules", () => {
    const outcomes = [buildOutcome(), buildOutcome(), buildOutcome()];
    const store = createInMemoryDistilledRuleStore();
    const rule = considerDistillation(
      "test:distill",
      {
        taskType: "summarize",
        inputHash: "hash-distill",
        goalId: DEFAULT_GOAL_IDS.ceoPilot,
        output: { text: "result" },
        outcomes,
      },
      store
    );

    expect(rule).not.toBeNull();
    expect(rule?.provenance.sourceOutcomeIds.length).toBeGreaterThan(0);
    expect(rule?.provenance.timeWindowStart).toBeDefined();
    expect(rule?.provenance.reviewBy).toBeDefined();
    expect(rule?.ruleCostCents).toBeLessThan(rule?.sourceCostCents ?? 0);
    expect(rule?.expiresAt).toBeDefined();
  });

  it("rejects expired distilled rules", () => {
    const store = createInMemoryDistilledRuleStore();
    const expired: DistilledRule = {
      ruleId: "rule-expired",
      version: "v1",
      taskType: "summarize",
      inputHash: "hash-expired",
      goalId: DEFAULT_GOAL_IDS.ceoPilot,
      output: { text: "old" },
      successCount: 3,
      failureCount: 0,
      errorRate: 0,
      status: "active",
      provenance: { sourceOutcomeIds: ["o1"], createdBy: "system" },
      confidenceLowerBound: 0.7,
      confidenceUpperBound: 0.9,
      ruleCostCents: 1,
      sourceCostCents: 10,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      lastValidatedAt: "2025-01-01T00:00:00.000Z",
      expiresAt: "2025-01-02T00:00:00.000Z",
    };
    store.upsert(expired);

    const decision = applyDistilledRule(store, {
      taskId: "task-expired",
      taskType: "summarize",
      inputHash: "hash-expired",
      goalId: DEFAULT_GOAL_IDS.ceoPilot,
      now: "2025-02-01T00:00:00.000Z",
    });
    expect(decision.hit).toBe(false);
    expect(decision.reason).toBe("rule_expired");
  });

  it("demotes rules when error rate increases", () => {
    const store = createInMemoryDistilledRuleStore();
    const rule = considerDistillation(
      "test:distill",
      {
        taskType: "summarize",
        inputHash: "hash-demote",
        goalId: DEFAULT_GOAL_IDS.ceoPilot,
        output: { text: "result" },
        outcomes: [buildOutcome({ inputHash: "hash-demote" }), buildOutcome({ inputHash: "hash-demote" }), buildOutcome({ inputHash: "hash-demote" })],
      },
      store
    );

    if (!rule) throw new Error("rule not created");
    const updated = updateRuleOutcome(store, rule, false, {
      ...defaultDistillationPolicy,
      maxErrorRate: 0.1,
    });
    expect(updated.status).toBe("demoted");
    expect(updated.errorRate).toBeGreaterThan(0);
  });
});
