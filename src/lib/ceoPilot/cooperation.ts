import {
  ActionImpact,
  AgentProposal,
  CooperationProtocol,
  CooperationProtocolSchema,
  DisagreementRecord,
  RefereeDecision,
} from "./contracts";
import { createId, nowIso } from "./utils";
import { runReferee, type RefereeOutcome } from "./referee";

export type ProtocolFactoryOptions = {
  now?: string;
  idFactory?: (prefix: string) => string;
  expiresAt?: string;
  status?: CooperationProtocol["status"];
};

const buildProtocol = (protocol: CooperationProtocol): CooperationProtocol => {
  const parsed = CooperationProtocolSchema.safeParse(protocol);
  if (!parsed.success) {
    throw new Error("cooperation_protocol_invalid");
  }
  return parsed.data;
};

const baseProtocol = (
  type: CooperationProtocol["type"],
  fromAgentId: string,
  toAgentId: string,
  payload: CooperationProtocol["payload"],
  options: ProtocolFactoryOptions = {}
): CooperationProtocol => {
  const now = options.now ?? nowIso();
  const idFactory = options.idFactory ?? createId;
  const status = options.status ?? "open";

  return buildProtocol({
    protocolId: idFactory("proto"),
    type,
    fromAgentId,
    toAgentId,
    createdAt: now,
    expiresAt: options.expiresAt,
    status,
    payload,
  } as CooperationProtocol);
};

export const createRequestEvidence = (input: {
  fromAgentId: string;
  toAgentId: string;
  topic: string;
  evidenceNeeded: string[];
  dueAt?: string;
}, options?: ProtocolFactoryOptions): CooperationProtocol =>
  baseProtocol(
    "request-evidence",
    input.fromAgentId,
    input.toAgentId,
    {
      topic: input.topic,
      evidenceNeeded: input.evidenceNeeded,
      dueAt: input.dueAt,
    },
    options
  );

export const createRequestClarification = (input: {
  fromAgentId: string;
  toAgentId: string;
  question: string;
  context?: string;
}, options?: ProtocolFactoryOptions): CooperationProtocol =>
  baseProtocol(
    "request-clarification",
    input.fromAgentId,
    input.toAgentId,
    {
      question: input.question,
      context: input.context,
    },
    options
  );

export const createProposeMerge = (input: {
  fromAgentId: string;
  toAgentId: string;
  proposalIds: string[];
  mergedSummary: string;
}, options?: ProtocolFactoryOptions): CooperationProtocol =>
  baseProtocol(
    "propose-merge",
    input.fromAgentId,
    input.toAgentId,
    {
      proposalIds: input.proposalIds,
      mergedSummary: input.mergedSummary,
    },
    options
  );

export const createEscalateToReferee = (input: {
  fromAgentId: string;
  toAgentId: string;
  disagreementId: string;
  topic: string;
  proposalIds: string[];
}, options?: ProtocolFactoryOptions): CooperationProtocol =>
  baseProtocol(
    "escalate-to-referee",
    input.fromAgentId,
    input.toAgentId,
    {
      disagreementId: input.disagreementId,
      topic: input.topic,
      proposalIds: input.proposalIds,
    },
    options
  );

export const createEscalateToHuman = (input: {
  fromAgentId: string;
  toAgentId: string;
  reason: string;
  disagreementId?: string;
  requiredBy?: string;
}, options?: ProtocolFactoryOptions): CooperationProtocol =>
  baseProtocol(
    "escalate-to-human",
    input.fromAgentId,
    input.toAgentId,
    {
      reason: input.reason,
      disagreementId: input.disagreementId,
      requiredBy: input.requiredBy,
    },
    options
  );

export type DisagreementResolution = {
  status: "selected" | "merged" | "forced_smallest_step" | "escalated";
  decision: RefereeDecision;
  selectedProposalIds: string[];
  requiresHumanReview: boolean;
  protocol?: CooperationProtocol;
  forcedProposalId?: string;
};

export type DisagreementResolutionOptions = {
  timeoutMs?: number;
  now?: string;
  idFactory?: (prefix: string) => string;
  referee?: (record: DisagreementRecord) => RefereeOutcome;
  escalationTargetId?: string;
  trustIndex?: Map<string, number>;
  deadlockScore?: number;
};

const impactRank: Record<ActionImpact, number> = {
  reversible: 0,
  difficult: 1,
  irreversible: 2,
};

const scoreProposal = (proposal: AgentProposal, trustIndex?: Map<string, number>): number => {
  const trustBoost = trustIndex?.get(proposal.agentId) ?? 0;
  return proposal.confidence - proposal.riskLevel * 0.5 + trustBoost * 0.2;
};

const selectSmallestSafeStep = (proposals: AgentProposal[], trustIndex?: Map<string, number>): AgentProposal | null =>
  proposals
    .slice()
    .sort((left, right) => {
      const impactDiff = impactRank[left.impact] - impactRank[right.impact];
      if (impactDiff !== 0) return impactDiff;
      const scoreDiff = scoreProposal(right, trustIndex) - scoreProposal(left, trustIndex);
      if (scoreDiff !== 0) return scoreDiff;
      return left.proposalId.localeCompare(right.proposalId);
    })[0] ?? null;

export const resolveDisagreement = (
  record: DisagreementRecord,
  options: DisagreementResolutionOptions = {}
): DisagreementResolution => {
  const now = options.now ?? nowIso();
  const referee = options.referee ?? runReferee;
  const decision = referee(record).decision;
  const trustIndex = options.trustIndex;

  if (options.deadlockScore !== undefined && options.deadlockScore >= 0.7) {
    const escalationTarget = options.escalationTargetId ?? "human-review";
    const protocol = createEscalateToHuman(
      {
        fromAgentId: record.proposals[0]?.agentId ?? "system",
        toAgentId: escalationTarget,
        reason: "deadlock_predicted",
        disagreementId: record.disagreementId,
      },
      {
        now,
        idFactory: options.idFactory,
        status: "escalated",
      }
    );
    return {
      status: "escalated",
      decision,
      selectedProposalIds: [],
      requiresHumanReview: true,
      protocol,
    };
  }

  if (decision.action === "select" && !decision.requiresHumanReview) {
    return {
      status: "selected",
      decision,
      selectedProposalIds: decision.selectedProposalIds,
      requiresHumanReview: false,
    };
  }

  if (decision.action === "merge" && !decision.requiresHumanReview) {
    return {
      status: "merged",
      decision,
      selectedProposalIds: decision.selectedProposalIds,
      requiresHumanReview: false,
    };
  }

  const timeoutMs = options.timeoutMs ?? 1000 * 60 * 10;
  const ageMs = Math.max(0, Date.parse(now) - Date.parse(record.createdAt));
  if (ageMs >= timeoutMs) {
    const forced = selectSmallestSafeStep(record.proposals, trustIndex);
    if (forced && impactRank[forced.impact] <= impactRank[decision.allowedImpact]) {
      return {
        status: "forced_smallest_step",
        decision,
        selectedProposalIds: [forced.proposalId],
        requiresHumanReview: false,
        forcedProposalId: forced.proposalId,
      };
    }
  }

  const escalationTarget = options.escalationTargetId ?? "human-review";
  const protocol = createEscalateToHuman(
    {
      fromAgentId: record.proposals[0]?.agentId ?? "system",
      toAgentId: escalationTarget,
      reason: decision.rationale,
      disagreementId: record.disagreementId,
    },
    {
      now,
      idFactory: options.idFactory,
      status: "escalated",
    }
  );

  return {
    status: "escalated",
    decision,
    selectedProposalIds: [],
    requiresHumanReview: true,
    protocol,
  };
};
