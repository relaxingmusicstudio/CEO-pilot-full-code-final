import { ActionImpact, SecondOrderEffects, SecondOrderEffectsSchema } from "./contracts";
import { nowIso } from "./utils";

export type SecondOrderPolicy = {
  requiredImpacts: ActionImpact[];
  uncertaintyThreshold: number;
};

export const defaultSecondOrderPolicy: SecondOrderPolicy = {
  requiredImpacts: ["difficult", "irreversible"],
  uncertaintyThreshold: 0.6,
};

export type SecondOrderDecision = {
  allowed: boolean;
  reason?: string;
  requiresHumanReview: boolean;
  assessment?: SecondOrderEffects;
};

export const evaluateSecondOrder = (
  impact: ActionImpact,
  effects?: SecondOrderEffects,
  policy: SecondOrderPolicy = defaultSecondOrderPolicy
): SecondOrderDecision => {
  if (policy.requiredImpacts.includes(impact) && !effects) {
    return {
      allowed: false,
      reason: "second_order_effects_required",
      requiresHumanReview: true,
    };
  }

  if (!effects) {
    return { allowed: true, requiresHumanReview: false };
  }

  const parsed = SecondOrderEffectsSchema.safeParse({
    ...effects,
    checkedAt: effects.checkedAt || nowIso(),
  });
  if (!parsed.success) {
    return {
      allowed: false,
      reason: "second_order_effects_invalid",
      requiresHumanReview: true,
    };
  }

  const hasIncentiveRisk = parsed.data.incentiveRisks.length > 0;
  if (parsed.data.uncertaintyScore >= policy.uncertaintyThreshold) {
    return {
      allowed: false,
      reason: "second_order_uncertainty_high",
      requiresHumanReview: true,
      assessment: parsed.data,
    };
  }

  if (hasIncentiveRisk) {
    return {
      allowed: false,
      reason: "second_order_incentive_risk",
      requiresHumanReview: true,
      assessment: parsed.data,
    };
  }

  return {
    allowed: true,
    requiresHumanReview: false,
    assessment: parsed.data,
  };
};
