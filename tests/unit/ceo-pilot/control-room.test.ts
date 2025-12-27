import { describe, expect, it } from "vitest";
import { applyHumanDecision, exportState, importState } from "../../../src/lib/ceoPilot/controlRoomApi";
import {
  loadHumanDecisions,
  loadImprovementCandidates,
  loadRoutingPreferences,
  saveCausalChains,
  saveHumanDecisions,
  saveImprovementCandidates,
  saveRoutingPreferences,
  saveTaskOutcomes,
} from "../../../src/lib/ceoPilot/runtimeState";
import type {
  CausalChainRecord,
  HumanDecisionRecord,
  ImprovementCandidate,
  RoutingPreference,
  TaskOutcomeRecord,
} from "../../../src/lib/ceoPilot/contracts";

describe("control room governance workflow", () => {
  it("records approvals, rejections, and escalations with persisted decisions", () => {
    const identityKey = "test:control-room:decisions";
    const now = "2025-01-01T00:00:00.000Z";

    const approveCandidate: ImprovementCandidate = {
      candidateId: "candidate-approve",
      identityKey,
      type: "cache_policy",
      status: "proposed",
      reason: "routine_success_pattern",
      evidenceRefs: ["evidence:success"],
      target: { taskType: "task:cache" },
      createdAt: now,
    };

    const rejectCandidate: ImprovementCandidate = {
      candidateId: "candidate-reject",
      identityKey,
      type: "routing_upgrade",
      status: "proposed",
      reason: "quality_regression",
      evidenceRefs: ["evidence:regression"],
      target: { taskType: "task:upgrade", modelTier: "standard" },
      createdAt: now,
    };

    const escalateCandidate: ImprovementCandidate = {
      candidateId: "candidate-escalate",
      identityKey,
      type: "cache_policy",
      status: "proposed",
      reason: "needs_review",
      evidenceRefs: ["evidence:review"],
      target: { taskType: "task:escalate" },
      createdAt: now,
    };

    const routingPref: RoutingPreference = {
      preferenceId: "route-1",
      identityKey,
      taskType: "task:upgrade",
      reason: "baseline",
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    saveImprovementCandidates(identityKey, [approveCandidate, rejectCandidate, escalateCandidate]);
    saveRoutingPreferences(identityKey, [routingPref]);

    applyHumanDecision({
      identityKey,
      targetType: "improvement_candidate",
      targetId: approveCandidate.candidateId,
      decision: "approve",
      notes: "approved",
      decidedBy: "human",
      now,
    });

    applyHumanDecision({
      identityKey,
      targetType: "improvement_candidate",
      targetId: rejectCandidate.candidateId,
      decision: "reject",
      notes: "reject_reason",
      decidedBy: "human",
      now,
    });

    applyHumanDecision({
      identityKey,
      targetType: "improvement_candidate",
      targetId: escalateCandidate.candidateId,
      decision: "escalate",
      decidedBy: "human",
      now,
    });

    const candidates = loadImprovementCandidates(identityKey);
    expect(candidates.find((item) => item.candidateId === approveCandidate.candidateId)?.status).toBe("applied");
    expect(candidates.find((item) => item.candidateId === rejectCandidate.candidateId)?.status).toBe("rejected");
    expect(candidates.find((item) => item.candidateId === escalateCandidate.candidateId)?.status).toBe("proposed");

    const routingPrefs = loadRoutingPreferences(identityKey);
    expect(routingPrefs.find((pref) => pref.preferenceId === routingPref.preferenceId)?.status).toBe("disabled");

    const decisions = loadHumanDecisions(identityKey);
    expect(decisions).toHaveLength(3);
  });

  it("blocks approvals when explanations require human review and notes are missing", () => {
    const identityKey = "test:control-room:explain";
    const now = "2025-01-02T00:00:00.000Z";

    const candidate: ImprovementCandidate = {
      candidateId: "candidate-review",
      identityKey,
      type: "cache_policy",
      status: "proposed",
      reason: "insufficient_explanation",
      evidenceRefs: ["evidence:missing"],
      target: { taskType: "task:review" },
      createdAt: now,
    };

    const chain: CausalChainRecord = {
      chainId: "chain-review",
      candidateId: candidate.candidateId,
      identityKey,
      actionType: "cache_policy",
      status: "explanation_failed",
      triggers: [
        {
          triggerId: "trigger-1",
          type: "outcome_sample",
          summary: "missing evidence",
          recordedAt: now,
        },
      ],
      alternatives: [
        {
          action: "skip_cache",
          reason: "avoid stale outputs",
          expectedDownside: "higher cost",
        },
      ],
      counterfactuals: [
        {
          alternative: "skip_cache",
          expectedDownside: "higher cost",
          uncertainty: "signals incomplete",
        },
      ],
      explanation: {
        summary: "Explanation missing",
        whatChanged: "No change applied",
        whyNow: "Signals incomplete",
        riskAccepted: "none",
        riskAvoided: "unverifiable change",
        reevaluateBy: "2025-02-01T00:00:00.000Z",
      },
      explanationQuality: "insufficient",
      requiresHumanReview: true,
      createdAt: now,
    };

    saveImprovementCandidates(identityKey, [candidate]);
    saveCausalChains(identityKey, [chain]);

    expect(() =>
      applyHumanDecision({
        identityKey,
        targetType: "improvement_candidate",
        targetId: candidate.candidateId,
        decision: "approve",
        decidedBy: "human",
        now,
      })
    ).toThrow("explanation_required");
  });

  it("exports and imports runtime state without schema loss", () => {
    const identityKey = "test:control-room:export";
    const targetIdentity = "test:control-room:import";
    const now = "2025-01-03T00:00:00.000Z";

    const candidate: ImprovementCandidate = {
      candidateId: "candidate-export",
      identityKey,
      type: "cache_policy",
      status: "proposed",
      reason: "routine_success_pattern",
      evidenceRefs: ["evidence:export"],
      target: { taskType: "task:export" },
      createdAt: now,
    };

    const chain: CausalChainRecord = {
      chainId: "chain-export",
      candidateId: candidate.candidateId,
      identityKey,
      actionType: "cache_policy",
      status: "complete",
      triggers: [
        {
          triggerId: "trigger-export",
          type: "outcome_sample",
          summary: "successes=3",
          recordedAt: now,
        },
      ],
      alternatives: [
        {
          action: "skip_cache",
          reason: "avoid stale outputs",
          expectedDownside: "higher cost",
        },
      ],
      counterfactuals: [
        {
          alternative: "skip_cache",
          expectedDownside: "higher cost",
          uncertainty: "task mix may change",
        },
      ],
      explanation: {
        summary: "Caching enabled for task:export",
        whatChanged: "Cache preference activated",
        whyNow: "Stable outcomes observed",
        riskAccepted: "potential staleness",
        riskAvoided: "repeat spend",
        reevaluateBy: "2025-02-02T00:00:00.000Z",
      },
      explanationQuality: "clear",
      requiresHumanReview: false,
      createdAt: now,
    };

    const outcome: TaskOutcomeRecord = {
      outcomeId: "outcome-export",
      taskId: "task-export",
      taskType: "task:export",
      taskClass: "routine",
      goalId: "goal-export",
      agentId: "agent-export",
      modelTier: "economy",
      modelId: "model-export",
      evaluationPassed: true,
      qualityScore: 0.9,
      costCents: 12,
      modelCostCents: 6,
      toolCostCents: 6,
      durationMs: 120,
      cacheHit: false,
      ruleUsed: false,
      retryCount: 0,
      humanOverride: false,
      createdAt: now,
    };

    const decision: HumanDecisionRecord = {
      decisionId: "decision-export",
      identityKey,
      targetType: "improvement_candidate",
      targetId: candidate.candidateId,
      decision: "approve",
      notes: "approved",
      decidedBy: "human",
      createdAt: now,
    };

    saveImprovementCandidates(identityKey, [candidate]);
    saveCausalChains(identityKey, [chain]);
    saveTaskOutcomes(identityKey, [outcome]);
    saveHumanDecisions(identityKey, [decision]);

    const payload = exportState(identityKey);
    const snapshot = importState(payload, targetIdentity);

    expect(snapshot.identityKey).toBe(targetIdentity);
    expect(snapshot.data.improvementCandidates.length).toBe(1);
    expect(snapshot.data.causalChains.length).toBe(1);
    expect(snapshot.data.outcomes.length).toBe(1);
    expect(snapshot.data.humanDecisions.length).toBe(1);
  });
});
