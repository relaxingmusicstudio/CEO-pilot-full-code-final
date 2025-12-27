import {
  ActionImpact,
  ConfidenceDisclosure,
  ConfidenceDisclosureSchema,
  ExplainabilitySnapshot,
  ExplainabilitySnapshotSchema,
  PermissionTier,
  Recommendation,
  RecommendationSchema,
  TrustAssessment,
  TrustAssessmentSchema,
} from "./contracts";
import { FailureDebtReport } from "./evaluation";
import { createId, nowIso } from "./utils";

export type TrustPolicy = {
  minPassRateDraftToSuggest: number;
  minPassRateSuggestToExecute: number;
  maxUncertaintyVariance: number;
  maxRollbackRate: number;
  minStableRuns: number;
};

export const defaultTrustPolicy: TrustPolicy = {
  minPassRateDraftToSuggest: 0.85,
  minPassRateSuggestToExecute: 0.92,
  maxUncertaintyVariance: 0.05,
  maxRollbackRate: 0.05,
  minStableRuns: 5,
};

export type EscalationPolicy = {
  minConfidence: number;
  noveltyThreshold: number;
  repeatedAmbiguityThreshold: number;
};

export const defaultEscalationPolicy: EscalationPolicy = {
  minConfidence: 0.55,
  noveltyThreshold: 0.7,
  repeatedAmbiguityThreshold: 3,
};

export type RecommendationInput = {
  agentId: string;
  intent: string;
  summary: string;
  impact: ActionImpact;
  confidence: ConfidenceDisclosure;
  explainability?: ExplainabilitySnapshot;
  requiresHumanReview?: boolean;
};

// Recommendations must disclose confidence, uncertainty, and blind spots.
export const buildRecommendation = (input: RecommendationInput): Recommendation => {
  const confidence = ConfidenceDisclosureSchema.parse(input.confidence);
  if ((input.impact === "difficult" || input.impact === "irreversible") && !input.explainability) {
    throw new Error("explainability_required_for_critical_action");
  }

  const recommendation: Recommendation = {
    recommendationId: createId("rec"),
    agentId: input.agentId,
    intent: input.intent,
    summary: input.summary,
    impact: input.impact,
    confidence,
    explainability: input.explainability
      ? ExplainabilitySnapshotSchema.parse(input.explainability)
      : undefined,
    requiresHumanReview: input.requiresHumanReview ?? false,
    createdAt: nowIso(),
  };

  return RecommendationSchema.parse(recommendation);
};

export type EscalationContext = {
  confidenceScore: number;
  noveltyScore: number;
  impact: ActionImpact;
  ambiguityCount: number;
};

export type EscalationDecision = {
  escalate: boolean;
  reasons: string[];
};

export const shouldEscalate = (
  context: EscalationContext,
  policy: EscalationPolicy = defaultEscalationPolicy
): EscalationDecision => {
  const reasons: string[] = [];

  if (context.confidenceScore < policy.minConfidence) {
    reasons.push("low_confidence");
  }
  if (context.noveltyScore >= policy.noveltyThreshold) {
    reasons.push("high_novelty");
  }
  if (context.impact === "irreversible") {
    reasons.push("irreversible_action");
  }
  if (context.ambiguityCount >= policy.repeatedAmbiguityThreshold) {
    reasons.push("repeated_ambiguity");
  }

  return { escalate: reasons.length > 0, reasons };
};

export type PromotionInputs = {
  currentTier: PermissionTier;
  passRate: number;
  uncertaintyVariance: number;
  rollbackRate: number;
  stableRuns: number;
  failureDebt: FailureDebtReport;
};

export type PromotionDecision = {
  eligible: boolean;
  nextTier: PermissionTier;
  reasons: string[];
};

const nextTierFor = (tier: PermissionTier): PermissionTier => {
  if (tier === "draft") return "suggest";
  if (tier === "suggest") return "execute";
  return "execute";
};

// Promotion requires sustained evaluation performance and low uncertainty/rollback.
export const canPromoteAutonomy = (
  inputs: PromotionInputs,
  policy: TrustPolicy = defaultTrustPolicy
): PromotionDecision => {
  const reasons: string[] = [];
  const nextTier = nextTierFor(inputs.currentTier);

  if (inputs.failureDebt.blocked) {
    reasons.push("failure_debt_blocks_promotion");
  }

  if (inputs.stableRuns < policy.minStableRuns) {
    reasons.push("insufficient_stable_runs");
  }

  if (inputs.uncertaintyVariance > policy.maxUncertaintyVariance) {
    reasons.push("uncertainty_variance_too_high");
  }

  if (inputs.rollbackRate > policy.maxRollbackRate) {
    reasons.push("rollback_rate_too_high");
  }

  const requiredPassRate =
    inputs.currentTier === "draft" ? policy.minPassRateDraftToSuggest : policy.minPassRateSuggestToExecute;
  if (inputs.passRate < requiredPassRate) {
    reasons.push("pass_rate_below_threshold");
  }

  return {
    eligible: reasons.length === 0,
    nextTier,
    reasons,
  };
};

export type TrustAssessmentInput = {
  agentId: string;
  tier: PermissionTier;
  passRate: number;
  failureDebt: FailureDebtReport;
  uncertaintyVariance: number;
  rollbackRate: number;
};

export const buildTrustAssessment = (input: TrustAssessmentInput): TrustAssessment => {
  const assessment: TrustAssessment = {
    assessmentId: createId("trust"),
    agentId: input.agentId,
    tier: input.tier,
    eligibleForPromotion: false,
    reasons: input.failureDebt.reasons,
    metrics: {
      evaluationPassRate: input.passRate,
      failureDebt: input.failureDebt.totalFailures,
      uncertaintyVariance: input.uncertaintyVariance,
      rollbackRate: input.rollbackRate,
    },
    assessedAt: nowIso(),
  };

  return TrustAssessmentSchema.parse(assessment);
};
