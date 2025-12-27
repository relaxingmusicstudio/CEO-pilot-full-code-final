import {
  ActionImpact,
  AgentProposal,
  ConfidenceDisclosure,
  ConfidenceDisclosureSchema,
  EpistemicAssessment,
  ExplainabilitySnapshot,
  ExplainabilitySnapshotSchema,
  HandoffContract,
  LongHorizonCommitment,
  ModelTier,
  NormAssessment,
  PermissionTier,
  SecondOrderEffects,
  SchedulingPolicy,
  TaskClass,
} from "./contracts";
import { evaluateAgentScope, recordDisagreement, validateHandoff } from "./coordination";
import { createEscalateToReferee, resolveDisagreement } from "./cooperation";
import { runReferee } from "./referee";
import { buildTrustIndex, createCooperationMetricStore, recordCooperationOutcome } from "./cooperationEvolution";
import { assessEpistemic } from "./epistemic";
import {
  EVALUATION_TASKS,
  accumulateFailureDebt,
  buildCoverageReport,
  buildEvaluationVisibility,
  checkRegressionGuard,
  runEvaluationSuite,
  validateTaskRotation,
  type EvaluationTask,
  type EvaluationSummary,
} from "./evaluation";
import {
  canPromoteAutonomy,
  defaultEscalationPolicy,
  shouldEscalate,
  type EscalationDecision,
  type PromotionDecision,
} from "./trust";
import { getAgentProfile } from "./agents";
import { ensureDefaultGoals, findGoalConflicts, resolveGoalStatus, escalateGoalConflict } from "./goals";
import { evaluateSecondOrder } from "./secondOrder";
import { evaluateNorms } from "./norms";
import { evaluateLongHorizon, recordLongHorizonDebt, type LongHorizonAssessment } from "./longHorizon";
import { evaluateCostGovernance } from "./costGovernance";
import { applySchedulingPolicy } from "./scheduling";
import {
  loadAgentTier,
  loadEvaluationRuns,
  loadBehaviorFreezes,
  loadEscalationOverrides,
  loadGoals,
  loadSchedulingPreferences,
  loadTaskHistory,
  recordTaskHistory,
  saveAgentTier,
  saveEvaluationRun,
  ensureDefaultHumanControls,
} from "./runtimeState";
import { assertCostContext } from "./costUtils";
import { nowIso } from "./utils";

export type AgentRuntimeMetrics = {
  uncertaintyVariance: number;
  rollbackRate: number;
  stableRuns: number;
};

export type AgentRuntimeContext = {
  agentId: string;
  actionDomain: string;
  decisionType: string;
  tool?: string;
  goalId?: string;
  taskId?: string;
  taskDescription?: string;
  taskType?: string;
  taskClass?: TaskClass;
  estimatedCostCents?: number;
  modelTier?: ModelTier;
  modelId?: string;
  qualityScore?: number;
  evaluationPassed?: boolean;
  cacheHit?: boolean;
  ruleUsed?: boolean;
  durationMs?: number;
  retryCount?: number;
  humanOverride?: boolean;
  output?: Record<string, unknown>;
  schedulingPolicy?: SchedulingPolicy;
  explorationMode?: boolean;
  actionTags?: string[];
  secondOrderEffects?: SecondOrderEffects;
  longHorizonCommitment?: LongHorizonCommitment;
  normJustification?: string;
  permissionTier: PermissionTier;
  impact?: ActionImpact;
  confidence: ConfidenceDisclosure;
  explainability?: ExplainabilitySnapshot;
  proposals?: AgentProposal[];
  activeProposalId?: string;
  disagreementTopic?: string;
  handoff?: HandoffContract;
  noveltyScore?: number;
  ambiguityCount?: number;
  metrics?: AgentRuntimeMetrics;
  evaluationTasks?: EvaluationTask[];
};

export type RuntimeGovernanceEvaluation = {
  runId: string;
  passRate: number;
  failed: number;
  rotationOk: boolean;
  failureDebt: {
    totalFailures: number;
    blocked: boolean;
    escalated: boolean;
    reasons: string[];
  };
  regression?: {
    allowed: boolean;
    reason: string;
    passRateDelta: number;
    regressed: string[];
  };
  visibility?: {
    improved: string[];
    regressed: string[];
    unchanged: string[];
  };
};

export type RuntimeGovernanceDecision = {
  allowed: boolean;
  reason: string;
  requiresHumanReview: boolean;
  details: {
    goal?: {
      goalId: string;
      status: "active" | "expired" | "suspended";
      expiresAt: string;
      requiresReaffirmation: boolean;
      conflictId?: string;
      conflictReason?: string;
      arbitrationProtocolId?: string;
    };
    epistemic?: EpistemicAssessment;
    secondOrder?: {
      allowed: boolean;
      reason?: string;
      requiresHumanReview: boolean;
    };
    norms?: NormAssessment;
    longHorizon?: {
      assessment: LongHorizonAssessment;
      debtRecorded: number;
    };
    scope?: { allowed: boolean; reason?: string };
    handoff?: { allowed: boolean; reason?: string };
    disagreement?: {
      disagreementId: string;
      refereeDecisionId: string;
      action: "select" | "merge" | "escalate";
      selectedProposalIds: string[];
      requiresHumanReview: boolean;
    };
    evaluation?: RuntimeGovernanceEvaluation;
    cost?: {
      allowed: boolean;
      reason: string;
      requiresHumanReview: boolean;
      softLimitExceeded: boolean;
      hardLimitExceeded: boolean;
      demotedTier?: PermissionTier;
      routingTierCap?: ModelTier;
    };
    autonomy?: {
      currentTier: PermissionTier;
      requestedTier: PermissionTier;
      promotion?: PromotionDecision;
    };
    scheduling?: {
      executeNow: boolean;
      reason: string;
      scheduleId?: string;
      scheduledAt?: string;
      batchKey?: string;
    };
    escalation?: EscalationDecision;
  };
};

type EvaluationState = {
  ok: boolean;
  reason?: string;
  summary?: EvaluationSummary;
  evaluation?: RuntimeGovernanceEvaluation;
  failureDebt?: ReturnType<typeof accumulateFailureDebt>;
};

const tierOrder: Record<PermissionTier, number> = {
  draft: 0,
  suggest: 1,
  execute: 2,
};

const resolveSchedulingPreference = (
  identityKey: string,
  taskType?: string,
  nowValue: string = nowIso()
): SchedulingPolicy | undefined => {
  if (!taskType) return undefined;
  const preferences = loadSchedulingPreferences(identityKey).filter((pref) => pref.status === "active");
  const active = preferences.filter((pref) => !pref.expiresAt || Date.parse(pref.expiresAt) > Date.parse(nowValue));
  const match = active.find((pref) => pref.taskType === taskType);
  return match?.policy;
};

const resolveEscalationOverride = (
  identityKey: string,
  taskType?: string,
  nowValue: string = nowIso()
): { minConfidence?: number; noveltyThreshold?: number } | null => {
  const overrides = loadEscalationOverrides(identityKey).filter((override) => override.status === "active");
  const active = overrides.filter(
    (override) => !override.expiresAt || Date.parse(override.expiresAt) > Date.parse(nowValue)
  );
  const direct = taskType ? active.find((override) => override.taskType === taskType) : null;
  const global = active.find((override) => override.taskType === "any");
  const selected = direct ?? global;
  if (!selected) return null;
  return { minConfidence: selected.minConfidence, noveltyThreshold: selected.noveltyThreshold };
};

const defaultTierFor = (maxTier: PermissionTier): PermissionTier => {
  if (maxTier === "draft") return "draft";
  return "suggest";
};

let evaluationInProgress = false;

const buildEvaluationState = async (
  identityKey: string,
  tasks: EvaluationTask[]
): Promise<EvaluationState> => {
  const rotation = validateTaskRotation(tasks);
  if (!rotation.ok) {
    return { ok: false, reason: "evaluation_task_rotation_invalid" };
  }

  let history = loadEvaluationRuns(identityKey);
  if (history.length === 0) {
    if (evaluationInProgress) {
      const summary: EvaluationSummary = {
        runId: "eval:pending",
        total: tasks.length,
        passed: tasks.length,
        failed: 0,
        passRate: tasks.length === 0 ? 0 : 1,
        results: [],
        startedAt: nowIso(),
        completedAt: nowIso(),
        coverage: buildCoverageReport(tasks),
        rotation,
      };
      const failureDebt = accumulateFailureDebt(tasks, history);
      return {
        ok: true,
        summary,
        failureDebt,
        evaluation: {
          runId: summary.runId,
          passRate: summary.passRate,
          failed: summary.failed,
          rotationOk: rotation.ok,
          failureDebt: {
            totalFailures: failureDebt.totalFailures,
            blocked: failureDebt.blocked,
            escalated: failureDebt.escalated,
            reasons: failureDebt.reasons,
          },
        },
      };
    }
    evaluationInProgress = true;
    try {
      const summary = await runEvaluationSuite(tasks);
      const run = { runId: summary.runId, tasks, summary };
      history = saveEvaluationRun(identityKey, run);
    } finally {
      evaluationInProgress = false;
    }
  }

  const latest = history[history.length - 1];
  if (!latest) {
    return { ok: false, reason: "evaluation_missing" };
  }

  const failureDebt = accumulateFailureDebt(tasks, history);
  const baseline = history.length > 1 ? history[history.length - 2]?.summary : undefined;
  const regression = baseline ? checkRegressionGuard(baseline, latest.summary) : undefined;
  const visibility = baseline ? buildEvaluationVisibility(baseline, latest.summary) : undefined;

  return {
    ok: true,
    summary: latest.summary,
    failureDebt,
    evaluation: {
      runId: latest.summary.runId,
      passRate: latest.summary.passRate,
      failed: latest.summary.failed,
      rotationOk: rotation.ok,
      failureDebt: {
        totalFailures: failureDebt.totalFailures,
        blocked: failureDebt.blocked,
        escalated: failureDebt.escalated,
        reasons: failureDebt.reasons,
      },
      regression: regression
        ? {
            allowed: regression.allowed,
            reason: regression.reason,
            passRateDelta: regression.passRateDelta,
            regressed: regression.diff.regressed,
          }
        : undefined,
      visibility: visibility ? { ...visibility } : undefined,
    },
  };
};

export const enforceRuntimeGovernance = async (
  identityKey: string,
  context?: AgentRuntimeContext,
  initiator: "agent" | "human" | "system" = "agent"
): Promise<RuntimeGovernanceDecision> => {
  const details: RuntimeGovernanceDecision["details"] = {};

  if (!context) {
    return {
      allowed: false,
      reason: "missing_agent_context",
      requiresHumanReview: true,
      details,
    };
  }

  const now = nowIso();

  const agentProfile = getAgentProfile(context.agentId);
  if (!agentProfile) {
    return {
      allowed: false,
      reason: "agent_unregistered",
      requiresHumanReview: true,
      details,
    };
  }

  const humanProfiles = ensureDefaultHumanControls(identityKey);
  const humanControl = humanProfiles[0];
  if (humanControl?.emergencyStop && initiator !== "human") {
    return {
      allowed: false,
      reason: "human_emergency_stop",
      requiresHumanReview: true,
      details,
    };
  }

  if (humanControl && tierOrder[context.permissionTier] > tierOrder[humanControl.autonomyCeiling]) {
    return {
      allowed: false,
      reason: "human_autonomy_ceiling",
      requiresHumanReview: true,
      details,
    };
  }

  const parsedConfidence = ConfidenceDisclosureSchema.safeParse(context.confidence);
  if (!parsedConfidence.success) {
    return {
      allowed: false,
      reason: "invalid_confidence_disclosure",
      requiresHumanReview: true,
      details,
    };
  }

  if ((context.impact === "difficult" || context.impact === "irreversible") && !context.explainability) {
    return {
      allowed: false,
      reason: "explainability_required",
      requiresHumanReview: true,
      details,
    };
  }

  if (context.explainability) {
    const parsedExplainability = ExplainabilitySnapshotSchema.safeParse(context.explainability);
    if (!parsedExplainability.success) {
      return {
        allowed: false,
        reason: "invalid_explainability_snapshot",
        requiresHumanReview: true,
        details,
      };
    }
  }

  const toolName = context.tool || context.decisionType;
  const impact = context.impact ?? "reversible";
  const scopeDecision = evaluateAgentScope(agentProfile, {
    tool: toolName,
    domain: context.actionDomain,
    decisionType: context.decisionType,
    permissionTier: context.permissionTier,
  });
  details.scope = scopeDecision;
  if (!scopeDecision.allowed) {
    return {
      allowed: false,
      reason: scopeDecision.reason || "agent_scope_denied",
      requiresHumanReview: true,
      details,
    };
  }

  if (context.handoff) {
    const handoffDecision = validateHandoff(context.handoff);
    details.handoff = handoffDecision;
    if (!handoffDecision.allowed) {
      return {
        allowed: false,
        reason: handoffDecision.reason || "handoff_denied",
        requiresHumanReview: true,
        details,
      };
    }
  }

  if (context.proposals && context.proposals.length > 1) {
    const record = recordDisagreement({
      topic: context.disagreementTopic || context.decisionType,
      proposals: context.proposals,
    });
    const decisionNow = nowIso();
    const cooperationStore = createCooperationMetricStore(identityKey);
    const metrics = cooperationStore.list();
    const trustIndex = buildTrustIndex(metrics);
    const pairMetric = metrics.find((metric) =>
      record.proposals.some((proposal) => proposal.agentId === metric.agentA) &&
      record.proposals.some((proposal) => proposal.agentId === metric.agentB)
    );
    const resolution = resolveDisagreement(record, {
      now: decisionNow,
      trustIndex,
      deadlockScore: pairMetric?.deadlockScore,
      referee: runReferee,
    });
    recordCooperationOutcome(cooperationStore, record, resolution.status, identityKey, decisionNow);
    details.disagreement = {
      disagreementId: record.disagreementId,
      refereeDecisionId: resolution.decision.decisionId,
      action: resolution.decision.action,
      selectedProposalIds: resolution.selectedProposalIds,
      requiresHumanReview: resolution.requiresHumanReview,
    };

    if (resolution.requiresHumanReview || resolution.status === "escalated") {
      return {
        allowed: false,
        reason: "referee_escalation_required",
        requiresHumanReview: true,
        details,
      };
    }

    if (
      context.activeProposalId &&
      resolution.selectedProposalIds.length > 0 &&
      !resolution.selectedProposalIds.includes(context.activeProposalId)
    ) {
      return {
        allowed: false,
        reason: "referee_selected_other_proposal",
        requiresHumanReview: true,
        details,
      };
    }
  }

  ensureDefaultGoals(identityKey);
  if (!context.goalId) {
    return {
      allowed: false,
      reason: "goal_required",
      requiresHumanReview: true,
      details,
    };
  }

  const goals = loadGoals(identityKey);
  const goal = goals.find((item) => item.goalId === context.goalId);
  if (!goal) {
    return {
      allowed: false,
      reason: "goal_not_found",
      requiresHumanReview: true,
      details,
    };
  }

  const goalStatus = resolveGoalStatus(goal, now);
  const goalDetails = {
    goalId: goal.goalId,
    status: goalStatus,
    expiresAt: goal.expiresAt,
    requiresReaffirmation: goalStatus === "expired",
  };
  details.goal = goalDetails;

  if (goalStatus !== "active") {
    return {
      allowed: false,
      reason: goalStatus === "expired" ? "goal_expired_requires_reaffirmation" : "goal_suspended",
      requiresHumanReview: true,
      details,
    };
  }

  const conflicts = findGoalConflicts(identityKey, goal.goalId, now);
  if (conflicts.length > 0) {
    const conflict = conflicts[0];
    const protocol = createEscalateToReferee({
      fromAgentId: context.agentId,
      toAgentId: "referee",
      disagreementId: conflict.conflictId,
      topic: conflict.reason,
      proposalIds: conflict.goalIds,
    });
    escalateGoalConflict(identityKey, conflict, protocol.protocolId, now);
    details.goal = {
      ...goalDetails,
      conflictId: conflict.conflictId,
      conflictReason: conflict.reason,
      arbitrationProtocolId: protocol.protocolId,
    };
    return {
      allowed: false,
      reason: "goal_conflict_requires_arbitration",
      requiresHumanReview: true,
      details,
    };
  }

  if (!context.taskDescription || context.taskDescription.trim().length === 0) {
    return {
      allowed: false,
      reason: "task_description_required",
      requiresHumanReview: true,
      details,
    };
  }

  if (context.taskType) {
    const freeze = loadBehaviorFreezes(identityKey).find(
      (entry) =>
        entry.taskType === context.taskType &&
        entry.status === "active" &&
        (!entry.expiresAt || Date.parse(entry.expiresAt) > Date.parse(now))
    );
    if (freeze) {
      return {
        allowed: false,
        reason: "behavior_frozen",
        requiresHumanReview: true,
        details,
      };
    }
  }

  assertCostContext(context);

  const taskHistory = loadTaskHistory(identityKey);
  const epistemicDecision = assessEpistemic({
    description: context.taskDescription,
    impact,
    confidenceScore: parsedConfidence.data.confidenceScore,
    evidenceRefs: parsedConfidence.data.evidenceRefs ?? [],
    explorationMode: context.explorationMode ?? false,
    history: taskHistory,
  });
  details.epistemic = epistemicDecision.assessment;
  if (!epistemicDecision.allowed) {
    return {
      allowed: false,
      reason: epistemicDecision.reason || "epistemic_blocked",
      requiresHumanReview: epistemicDecision.requiresHumanReview,
      details,
    };
  }

  const secondOrderDecision = evaluateSecondOrder(impact, context.secondOrderEffects);
  details.secondOrder = {
    allowed: secondOrderDecision.allowed,
    reason: secondOrderDecision.reason,
    requiresHumanReview: secondOrderDecision.requiresHumanReview,
  };
  if (!secondOrderDecision.allowed) {
    return {
      allowed: false,
      reason: secondOrderDecision.reason || "second_order_blocked",
      requiresHumanReview: secondOrderDecision.requiresHumanReview,
      details,
    };
  }

  const normDecision = evaluateNorms(context.actionTags ?? [], context.normJustification);
  details.norms = normDecision.assessment;
  if (!normDecision.allowed) {
    return {
      allowed: false,
      reason: normDecision.reason || "norms_blocked",
      requiresHumanReview: normDecision.requiresHumanReview,
      details,
    };
  }

  const longHorizonDecision = evaluateLongHorizon(impact, context.longHorizonCommitment);
  details.longHorizon = { assessment: longHorizonDecision.assessment, debtRecorded: 0 };
  if (!longHorizonDecision.allowed) {
    return {
      allowed: false,
      reason: longHorizonDecision.reason || "long_horizon_blocked",
      requiresHumanReview: longHorizonDecision.requiresHumanReview,
      details,
    };
  }

  const tasks = context.evaluationTasks ?? EVALUATION_TASKS;
  const evaluationState = await buildEvaluationState(identityKey, tasks);
  if (!evaluationState.ok || !evaluationState.summary || !evaluationState.failureDebt || !evaluationState.evaluation) {
    details.evaluation = evaluationState.evaluation;
    return {
      allowed: false,
      reason: evaluationState.reason || "evaluation_unavailable",
      requiresHumanReview: true,
      details,
    };
  }

  details.evaluation = evaluationState.evaluation;
  if (evaluationState.failureDebt.blocked) {
    return {
      allowed: false,
      reason: "failure_debt_blocked",
      requiresHumanReview: true,
      details,
    };
  }

  if (evaluationState.failureDebt.escalated) {
    return {
      allowed: false,
      reason: "failure_debt_escalated",
      requiresHumanReview: true,
      details,
    };
  }

  if (evaluationState.evaluation.regression && !evaluationState.evaluation.regression.allowed) {
    return {
      allowed: false,
      reason: "evaluation_regression",
      requiresHumanReview: true,
      details,
    };
  }

  const defaultTier = defaultTierFor(agentProfile.maxPermissionTier);
  let tierState = loadAgentTier(agentProfile.agentId, defaultTier);

  const inferredTaskClass: TaskClass =
    context.taskClass ??
    ((impact === "irreversible" || impact === "difficult")
      ? "high_risk"
      : (context.noveltyScore ?? 0) >= 0.6
        ? "novel"
        : "routine");
  const taskType = context.taskType ?? context.decisionType;
  const costDecision = evaluateCostGovernance({
    identityKey,
    goalId: context.goalId,
    agentId: context.agentId,
    taskType,
    taskClass: inferredTaskClass,
    impact,
    estimatedCostCents: context.estimatedCostCents,
    justification: context.taskDescription,
  });
  details.cost = {
    allowed: costDecision.allowed,
    reason: costDecision.reason,
    requiresHumanReview: costDecision.requiresHumanReview,
    softLimitExceeded: costDecision.softLimitExceeded,
    hardLimitExceeded: costDecision.hardLimitExceeded,
    demotedTier: costDecision.demoteTier,
    routingTierCap: costDecision.routingTierCap,
  };
  if (!costDecision.allowed) {
    return {
      allowed: false,
      reason: costDecision.reason,
      requiresHumanReview: costDecision.requiresHumanReview,
      details,
    };
  }

  if (
    costDecision.demoteTier &&
    tierOrder[costDecision.demoteTier] < tierOrder[tierState.tier]
  ) {
    saveAgentTier(agentProfile.agentId, costDecision.demoteTier);
    tierState = { ...tierState, tier: costDecision.demoteTier };
  }
  if (context.permissionTier === "draft") {
    details.autonomy = {
      currentTier: tierState.tier,
      requestedTier: context.permissionTier,
    };
    return {
      allowed: false,
      reason: "draft_tier_disallows_execution",
      requiresHumanReview: true,
      details,
    };
  }

  if (tierOrder[context.permissionTier] > tierOrder[tierState.tier]) {
    const metrics = context.metrics || {
      uncertaintyVariance: 1,
      rollbackRate: 1,
      stableRuns: 0,
    };
    const promotion = canPromoteAutonomy({
      currentTier: tierState.tier,
      passRate: evaluationState.summary.passRate,
      uncertaintyVariance: metrics.uncertaintyVariance,
      rollbackRate: metrics.rollbackRate,
      stableRuns: metrics.stableRuns,
      failureDebt: evaluationState.failureDebt,
    });
    details.autonomy = {
      currentTier: tierState.tier,
      requestedTier: context.permissionTier,
      promotion,
    };
    if (!promotion.eligible || promotion.nextTier !== context.permissionTier) {
      return {
        allowed: false,
        reason: "autonomy_promotion_blocked",
        requiresHumanReview: true,
        details,
      };
    }
    saveAgentTier(agentProfile.agentId, promotion.nextTier);
  } else {
    details.autonomy = {
      currentTier: tierState.tier,
      requestedTier: context.permissionTier,
    };
  }

  if (initiator !== "human") {
    if (humanControl?.requireHumanReviewForIrreversible && impact === "irreversible") {
      return {
        allowed: false,
        reason: "human_review_required_irreversible",
        requiresHumanReview: true,
        details,
      };
    }
    const noveltyScore = context.noveltyScore ?? epistemicDecision.assessment.noveltyScore;
    const effectiveNovelty = epistemicDecision.assessment.mode === "exploration" ? 0 : noveltyScore;
    const escalationOverride = resolveEscalationOverride(identityKey, context.taskType, now);
    const escalationPolicy = escalationOverride
      ? {
          ...defaultEscalationPolicy,
          minConfidence: escalationOverride.minConfidence ?? defaultEscalationPolicy.minConfidence,
          noveltyThreshold: escalationOverride.noveltyThreshold ?? defaultEscalationPolicy.noveltyThreshold,
        }
      : defaultEscalationPolicy;
    const minConfidence = humanControl?.minConfidence ?? escalationPolicy.minConfidence;
    const noveltyThreshold = humanControl?.noveltyThreshold ?? escalationPolicy.noveltyThreshold;
    const escalation = shouldEscalate(
      {
        confidenceScore: parsedConfidence.data.confidenceScore,
        noveltyScore: effectiveNovelty,
        impact,
        ambiguityCount: context.ambiguityCount ?? 0,
      },
      { ...escalationPolicy, minConfidence, noveltyThreshold }
    );
    details.escalation = escalation;
    if (escalation.escalate) {
      return {
        allowed: false,
        reason: "trust_escalation_required",
        requiresHumanReview: true,
        details,
      };
    }
  }

  const effectiveSchedulingPolicy =
    context.schedulingPolicy ?? resolveSchedulingPreference(identityKey, context.taskType, now);
  if (effectiveSchedulingPolicy && context.taskId && context.goalId && context.taskType) {
    const schedulingDecision = applySchedulingPolicy({
      identityKey,
      taskId: context.taskId,
      goalId: context.goalId,
      agentId: context.agentId,
      taskType: context.taskType,
      policy: effectiveSchedulingPolicy,
    });
    details.scheduling = {
      executeNow: schedulingDecision.executeNow,
      reason: schedulingDecision.reason,
      scheduleId: schedulingDecision.scheduledTask?.scheduleId,
      scheduledAt: schedulingDecision.scheduledTask?.scheduledAt,
      batchKey: schedulingDecision.scheduledTask?.batchKey,
    };
    if (!schedulingDecision.executeNow) {
      return {
        allowed: false,
        reason: schedulingDecision.reason,
        requiresHumanReview: false,
        details,
      };
    }
  }

  const taskRecordId = context.taskId ?? createId("task");
  recordTaskHistory(identityKey, {
    taskId: taskRecordId,
    goalId: context.goalId,
    description: context.taskDescription,
    createdAt: nowIso(),
  });

  const debtReason =
    longHorizonDecision.assessment.reasons.length > 0
      ? longHorizonDecision.assessment.reasons.join("|")
      : `impact:${impact}`;
  const debtRecords = recordLongHorizonDebt({
    identityKey,
    agentId: context.agentId,
    goalId: context.goalId,
    assessment: longHorizonDecision.assessment,
    reason: debtReason,
  });
  if (details.longHorizon) {
    details.longHorizon.debtRecorded = debtRecords.length;
  }

  const requiresHumanReview =
    Boolean(normDecision.requiresHumanReview) ||
    Boolean(longHorizonDecision.requiresHumanReview) ||
    Boolean(secondOrderDecision.requiresHumanReview) ||
    Boolean(costDecision.requiresHumanReview);

  return {
    allowed: true,
    reason: "ok",
    requiresHumanReview,
    details,
  };
};
