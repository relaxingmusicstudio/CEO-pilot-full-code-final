import { DisagreementRecord, RefereeDecision, RefereeDecisionSchema } from "./contracts";
import { createId, nowIso } from "./utils";

export type RefereeOutcome = {
  decision: RefereeDecision;
  selectedProposalIds: string[];
};

const scoreProposal = (confidence: number, riskLevel: number): number =>
  confidence - riskLevel * 0.5;

// Referee is neutral; never executes actions and never approves irreversible impact.
export const runReferee = (record: DisagreementRecord): RefereeOutcome => {
  const hasIrreversible = record.proposals.some((proposal) => proposal.impact === "irreversible");
  if (hasIrreversible) {
    const decision: RefereeDecision = {
      decisionId: createId("ref"),
      disagreementId: record.disagreementId,
      action: "escalate",
      rationale: "irreversible_impact_requires_human_review",
      confidence: 0.5,
      selectedProposalIds: [],
      requiresHumanReview: true,
      allowedImpact: "difficult",
      createdAt: nowIso(),
    };

    return { decision: RefereeDecisionSchema.parse(decision), selectedProposalIds: [] };
  }

  const scored = record.proposals
    .map((proposal) => ({
      proposal,
      score: scoreProposal(proposal.confidence, proposal.riskLevel),
    }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const runnerUp = scored[1];

  if (!top || !runnerUp) {
    const decision: RefereeDecision = {
      decisionId: createId("ref"),
      disagreementId: record.disagreementId,
      action: "escalate",
      rationale: "insufficient_proposals",
      confidence: 0.4,
      selectedProposalIds: [],
      requiresHumanReview: true,
      allowedImpact: "difficult",
      createdAt: nowIso(),
    };

    return { decision: RefereeDecisionSchema.parse(decision), selectedProposalIds: [] };
  }

  const scoreGap = Math.abs(top.score - runnerUp.score);
  if (scoreGap <= 0.05) {
    const mergedSummary = [top.proposal.summary, runnerUp.proposal.summary].join(" | ");
    const mergedDecision: RefereeDecision = {
      decisionId: createId("ref"),
      disagreementId: record.disagreementId,
      action: "merge",
      rationale: "close_scores_merge_recommended",
      confidence: Math.max(top.proposal.confidence, runnerUp.proposal.confidence),
      selectedProposalIds: [top.proposal.proposalId, runnerUp.proposal.proposalId],
      mergedSummary,
      requiresHumanReview: false,
      allowedImpact: "difficult",
      createdAt: nowIso(),
    };

    return {
      decision: RefereeDecisionSchema.parse(mergedDecision),
      selectedProposalIds: mergedDecision.selectedProposalIds,
    };
  }

  const decision: RefereeDecision = {
    decisionId: createId("ref"),
    disagreementId: record.disagreementId,
    action: "select",
    rationale: "highest_confidence_lowest_risk",
    confidence: top.proposal.confidence,
    selectedProposalIds: [top.proposal.proposalId],
    requiresHumanReview: false,
    allowedImpact: "difficult",
    createdAt: nowIso(),
  };

  return {
    decision: RefereeDecisionSchema.parse(decision),
    selectedProposalIds: decision.selectedProposalIds,
  };
};
