import { ActionImpact, DebtRecord, LongHorizonCommitment, LongHorizonCommitmentSchema } from "./contracts";
import { createId, nowIso } from "./utils";
import { recordDebt } from "./runtimeState";

export type LongHorizonPolicy = {
  commitmentJustificationDays: number;
  reversibleAlternativeRequiredForIrreversible: boolean;
  decisionDebtByImpact: Record<ActionImpact, number>;
};

export const defaultLongHorizonPolicy: LongHorizonPolicy = {
  commitmentJustificationDays: 30,
  reversibleAlternativeRequiredForIrreversible: true,
  decisionDebtByImpact: {
    reversible: 0,
    difficult: 1,
    irreversible: 3,
  },
};

export type LongHorizonAssessment = {
  decisionDebtDelta: number;
  technicalDebtDelta: number;
  commitmentDurationDays?: number;
  reversibleAlternativeProvided: boolean;
  justificationProvided: boolean;
  reasons: string[];
};

export type LongHorizonDecision = {
  allowed: boolean;
  reason?: string;
  requiresHumanReview: boolean;
  assessment: LongHorizonAssessment;
};

export const evaluateLongHorizon = (
  impact: ActionImpact,
  commitment?: LongHorizonCommitment,
  policy: LongHorizonPolicy = defaultLongHorizonPolicy
): LongHorizonDecision => {
  const parsedCommitment = commitment
    ? LongHorizonCommitmentSchema.safeParse(commitment)
    : { success: true, data: undefined };
  if (!parsedCommitment.success) {
    return {
      allowed: false,
      reason: "long_horizon_commitment_invalid",
      requiresHumanReview: true,
      assessment: {
        decisionDebtDelta: policy.decisionDebtByImpact[impact],
        technicalDebtDelta: 0,
        reversibleAlternativeProvided: false,
        justificationProvided: false,
        reasons: ["invalid_commitment"],
      },
    };
  }

  const reversibleAlternativeProvided = Boolean(parsedCommitment.data?.reversibleAlternative);
  const justificationProvided = Boolean(parsedCommitment.data?.justification);
  const commitmentDurationDays = parsedCommitment.data?.durationDays;
  const technicalDebtDelta = parsedCommitment.data?.technicalDebtDelta ?? 0;
  const decisionDebtDelta = policy.decisionDebtByImpact[impact];

  const reasons: string[] = [];
  if (impact === "irreversible") {
    reasons.push("irreversible_action");
  }

  if (impact === "irreversible" && policy.reversibleAlternativeRequiredForIrreversible && !reversibleAlternativeProvided) {
    return {
      allowed: false,
      reason: "reversible_alternative_required",
      requiresHumanReview: true,
      assessment: {
        decisionDebtDelta,
        technicalDebtDelta,
        commitmentDurationDays,
        reversibleAlternativeProvided,
        justificationProvided,
        reasons: [...reasons, "reversible_alternative_missing"],
      },
    };
  }

  if (impact === "irreversible" && !justificationProvided) {
    return {
      allowed: false,
      reason: "irreversible_justification_required",
      requiresHumanReview: true,
      assessment: {
        decisionDebtDelta,
        technicalDebtDelta,
        commitmentDurationDays,
        reversibleAlternativeProvided,
        justificationProvided,
        reasons: [...reasons, "missing_justification"],
      },
    };
  }

  if (
    typeof commitmentDurationDays === "number" &&
    commitmentDurationDays > policy.commitmentJustificationDays &&
    !justificationProvided
  ) {
    return {
      allowed: false,
      reason: "commitment_justification_required",
      requiresHumanReview: true,
      assessment: {
        decisionDebtDelta,
        technicalDebtDelta,
        commitmentDurationDays,
        reversibleAlternativeProvided,
        justificationProvided,
        reasons: [...reasons, "long_commitment_without_justification"],
      },
    };
  }

  return {
    allowed: true,
    requiresHumanReview: impact !== "reversible" && justificationProvided,
    assessment: {
      decisionDebtDelta,
      technicalDebtDelta,
      commitmentDurationDays,
      reversibleAlternativeProvided,
      justificationProvided,
      reasons,
    },
  };
};

export const recordLongHorizonDebt = (input: {
  identityKey: string;
  agentId: string;
  goalId?: string;
  assessment: LongHorizonAssessment;
  reason: string;
}): DebtRecord[] => {
  const timestamp = nowIso();
  const records: DebtRecord[] = [];
  if (input.assessment.decisionDebtDelta > 0) {
    records.push({
      debtId: createId("decision-debt"),
      type: "decision",
      delta: input.assessment.decisionDebtDelta,
      reason: input.reason,
      agentId: input.agentId,
      goalId: input.goalId,
      createdAt: timestamp,
    });
  }
  if (input.assessment.technicalDebtDelta > 0) {
    records.push({
      debtId: createId("tech-debt"),
      type: "technical",
      delta: input.assessment.technicalDebtDelta,
      reason: input.reason,
      agentId: input.agentId,
      goalId: input.goalId,
      createdAt: timestamp,
    });
  }

  records.forEach((record) => {
    recordDebt(input.identityKey, record);
  });

  return records;
};
