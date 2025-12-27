import {
  AgentProfile,
  AgentProfileSchema,
  AgentProposal,
  AgentProposalSchema,
  DisagreementRecord,
  DisagreementRecordSchema,
  HandoffContract,
  HandoffContractSchema,
  PermissionTier,
} from "./contracts";
import { createId, nowIso } from "./utils";

export type AgentRegistry = {
  register: (profile: AgentProfile) => void;
  get: (agentId: string) => AgentProfile | undefined;
  list: () => AgentProfile[];
};

export const createAgentRegistry = (): AgentRegistry => {
  const agents = new Map<string, AgentProfile>();
  return {
    register: (profile) => {
      const parsed = AgentProfileSchema.safeParse(profile);
      if (!parsed.success) {
        throw new Error("agent_profile_schema_invalid");
      }
      agents.set(parsed.data.agentId, parsed.data);
    },
    get: (agentId) => agents.get(agentId),
    list: () => Array.from(agents.values()),
  };
};

export type AgentActionRequest = {
  tool: string;
  domain: string;
  decisionType: string;
  permissionTier: PermissionTier;
};

export type ScopeDecision = {
  allowed: boolean;
  reason?: string;
};

const tierOrder: Record<PermissionTier, number> = {
  draft: 0,
  suggest: 1,
  execute: 2,
};

// Enforce that agents only operate within declared scope and tier.
export const evaluateAgentScope = (agent: AgentProfile, request: AgentActionRequest): ScopeDecision => {
  if (!agent.scope.domains.includes(request.domain)) {
    return { allowed: false, reason: "domain_out_of_scope" };
  }
  if (!agent.scope.allowedTools.includes(request.tool)) {
    return { allowed: false, reason: "tool_not_allowed" };
  }
  if (!agent.scope.decisionScopes.includes(request.decisionType)) {
    return { allowed: false, reason: "decision_scope_denied" };
  }
  if (tierOrder[request.permissionTier] > tierOrder[agent.maxPermissionTier]) {
    return { allowed: false, reason: "tier_exceeds_agent_limit" };
  }
  return { allowed: true };
};

export const assertAgentScope = (agent: AgentProfile, request: AgentActionRequest): void => {
  const decision = evaluateAgentScope(agent, request);
  if (!decision.allowed) {
    throw new Error(decision.reason || "agent_scope_denied");
  }
};

export type DisagreementInput = {
  topic: string;
  proposals: AgentProposal[];
};

export const recordDisagreement = (input: DisagreementInput): DisagreementRecord => {
  const proposals = input.proposals.map((proposal) => {
    const parsed = AgentProposalSchema.safeParse(proposal);
    if (!parsed.success) {
      throw new Error("agent_proposal_schema_invalid");
    }
    return parsed.data;
  });

  const record: DisagreementRecord = {
    disagreementId: createId("disagree"),
    topic: input.topic,
    proposals,
    status: "open",
    createdAt: nowIso(),
  };

  const parsedRecord = DisagreementRecordSchema.safeParse(record);
  if (!parsedRecord.success) {
    throw new Error("disagreement_record_schema_invalid");
  }

  return parsedRecord.data;
};

export type HandoffDecision = {
  allowed: boolean;
  reason?: string;
};

// Prevent silent overrides; require referee or human approval for overrides.
export const validateHandoff = (handoff: HandoffContract): HandoffDecision => {
  const parsed = HandoffContractSchema.safeParse(handoff);
  if (!parsed.success) {
    return { allowed: false, reason: "handoff_schema_invalid" };
  }

  if (handoff.overrideAgentId) {
    const governance = handoff.governance;
    const hasReferee = Boolean(governance?.refereeDecisionId);
    const hasHuman = Boolean(governance?.approvedByHuman && governance?.approvedAt);
    if (!hasReferee && !hasHuman) {
      return { allowed: false, reason: "override_requires_governance" };
    }
  }

  return { allowed: true };
};
