import { NormAssessment, NormAssessmentSchema, NormSeverity, NormViolation } from "./contracts";
import { nowIso } from "./utils";

export type NormRule = {
  normId: string;
  description: string;
  severity: NormSeverity;
  triggerTags: string[];
  requiresJustification: boolean;
  overridable: boolean;
};

export const DEFAULT_NORM_RULES: NormRule[] = [
  {
    normId: "no_deception",
    description: "Reject deceptive or fraudulent actions regardless of metrics.",
    severity: "hard",
    triggerTags: ["deceptive", "fraud", "impersonation"],
    requiresJustification: true,
    overridable: false,
  },
  {
    normId: "no_harm",
    description: "Reject actions with direct harm signals.",
    severity: "hard",
    triggerTags: ["harm", "violence", "coercion"],
    requiresJustification: true,
    overridable: false,
  },
  {
    normId: "privacy_respect",
    description: "Require explicit justification for privacy-sensitive actions.",
    severity: "soft",
    triggerTags: ["privacy", "pii", "sensitive_data"],
    requiresJustification: true,
    overridable: true,
  },
  {
    normId: "bias_check",
    description: "Require justification and escalation on bias risk.",
    severity: "soft",
    triggerTags: ["bias_risk", "fairness_risk"],
    requiresJustification: true,
    overridable: true,
  },
];

export type NormDecision = {
  allowed: boolean;
  reason?: string;
  requiresHumanReview: boolean;
  assessment: NormAssessment;
};

const buildViolation = (rule: NormRule): NormViolation => ({
  normId: rule.normId,
  severity: rule.severity,
  reason: rule.description,
  requiresJustification: rule.requiresJustification,
});

export const evaluateNorms = (
  actionTags: string[],
  justification?: string,
  rules: NormRule[] = DEFAULT_NORM_RULES,
  checkedAt: string = nowIso()
): NormDecision => {
  const tags = new Set(actionTags.map((tag) => tag.toLowerCase()));
  const violations = rules
    .filter((rule) => rule.triggerTags.some((tag) => tags.has(tag.toLowerCase())))
    .map(buildViolation);

  const assessment: NormAssessment = {
    violations,
    justification: justification && justification.trim().length > 0 ? justification : undefined,
    checkedAt,
  };
  const parsed = NormAssessmentSchema.safeParse(assessment);
  if (!parsed.success) {
    throw new Error("norm_assessment_invalid");
  }

  if (violations.length === 0) {
    return { allowed: true, requiresHumanReview: false, assessment: parsed.data };
  }

  const hasHardViolation = violations.some((violation) => violation.severity === "hard");
  if (hasHardViolation) {
    return {
      allowed: false,
      reason: "norm_violation_hard",
      requiresHumanReview: true,
      assessment: parsed.data,
    };
  }

  if (!assessment.justification) {
    return {
      allowed: false,
      reason: "norm_justification_required",
      requiresHumanReview: true,
      assessment: parsed.data,
    };
  }

  return {
    allowed: true,
    reason: "norm_violation_acknowledged",
    requiresHumanReview: true,
    assessment: parsed.data,
  };
};
