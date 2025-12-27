import { AgentProfile } from "./contracts";
import { createAgentRegistry } from "./coordination";
import { nowIso } from "./utils";

export const DEFAULT_AGENT_IDS = {
  ceo: "ceo_agent",
  revenue: "revenue_agent",
  evaluation: "evaluation_agent",
} as const;

const baseTimestamp = nowIso();

const DEFAULT_AGENT_PROFILES: AgentProfile[] = [
  {
    agentId: DEFAULT_AGENT_IDS.ceo,
    displayName: "CEO Pilot",
    role: "ceo",
    scope: {
      domains: ["ceo", "revenue", "ops"],
      decisionScopes: ["task", "note", "message", "email", "sms", "voice", "webhook"],
      allowedTools: ["task", "note", "message", "email", "sms", "voice", "webhook"],
      prohibitedActions: [],
    },
    maxPermissionTier: "suggest",
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
  },
  {
    agentId: DEFAULT_AGENT_IDS.revenue,
    displayName: "Revenue Operator",
    role: "revenue_ops",
    scope: {
      domains: ["revenue", "ops"],
      decisionScopes: ["task", "note", "message", "email", "sms", "voice", "webhook"],
      allowedTools: ["task", "note", "message", "email", "sms", "voice", "webhook"],
      prohibitedActions: [],
    },
    maxPermissionTier: "execute",
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
  },
  {
    agentId: DEFAULT_AGENT_IDS.evaluation,
    displayName: "Evaluation Harness",
    role: "system_eval",
    scope: {
      domains: ["system", "evaluation", "tooling"],
      decisionScopes: ["tool_validation", "tool_adaptation", "contract_validation", "safety_gate", "memory_scope"],
      allowedTools: ["echo"],
      prohibitedActions: [],
    },
    maxPermissionTier: "execute",
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
  },
];

const registry = createAgentRegistry();
DEFAULT_AGENT_PROFILES.forEach((profile) => registry.register(profile));

export const getAgentProfile = (agentId: string): AgentProfile | undefined => registry.get(agentId);

export const registerAgentProfile = (profile: AgentProfile): void => {
  registry.register(profile);
};

export const listAgentProfiles = (): AgentProfile[] => registry.list();
