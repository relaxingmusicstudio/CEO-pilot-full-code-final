import { RolePolicy, RolePolicySchema } from "./contracts";
import { DEFAULT_AGENT_IDS } from "./agents";

const DEFAULT_CREATED_AT = "2025-01-01T00:00:00.000Z";

const baseAuditRequirements = {
  requiredFields: ["roleId", "action", "decision", "reasonCode", "policyId", "policyVersion", "createdAt"],
};

export const DEFAULT_ROLE_POLICIES: RolePolicy[] = [
  RolePolicySchema.parse({
    policyId: "role-policy-ceo-v1",
    roleId: "ceo",
    roleName: "CEO Pilot",
    version: "v1",
    jurisdiction: {
      domains: ["ceo", "revenue", "ops"],
      actions: ["task", "note", "message", "email", "sms", "voice", "webhook"],
    },
    authorityCeiling: {
      maxPermissionTier: "suggest",
      maxTaskClass: "novel",
      maxImpact: "difficult",
      maxEstimatedCostCents: 500,
    },
    deniedActions: [],
    escalationRules: {
      alwaysEscalateActions: ["webhook"],
      alwaysEscalateDomains: ["system"],
      escalateAboveTaskClass: "high_risk",
      escalateAboveImpact: "irreversible",
      escalateAboveCostCents: 400,
    },
    chainOfCommand: {
      canRequestFromRoles: ["revenue_ops", "system_eval"],
      canApproveForRoles: ["revenue_ops"],
    },
    dataAccess: {
      allowedCategories: ["public", "customer", "internal"],
    },
    toolAccess: {
      allowedTools: ["task", "note", "message", "email", "sms", "voice", "webhook"],
      allowedContracts: [],
    },
    economics: {
      allowedCostCategories: ["compute", "reasoning", "io", "human_attention", "risk"],
    },
    auditRequirements: baseAuditRequirements,
    createdAt: DEFAULT_CREATED_AT,
    updatedAt: DEFAULT_CREATED_AT,
  }),
  RolePolicySchema.parse({
    policyId: "role-policy-revenue-v1",
    roleId: "revenue_ops",
    roleName: "Revenue Operator",
    version: "v1",
    jurisdiction: {
      domains: ["revenue", "ops"],
      actions: ["task", "note", "message", "email", "sms", "voice", "webhook"],
    },
    authorityCeiling: {
      maxPermissionTier: "execute",
      maxTaskClass: "high_risk",
      maxImpact: "irreversible",
      maxEstimatedCostCents: 2000,
    },
    deniedActions: ["system_override"],
    escalationRules: {
      alwaysEscalateActions: ["voice"],
      alwaysEscalateDomains: ["system"],
      escalateAboveTaskClass: "high_risk",
      escalateAboveImpact: "irreversible",
      escalateAboveCostCents: 1500,
    },
    chainOfCommand: {
      canRequestFromRoles: ["ceo"],
      canApproveForRoles: [],
    },
    dataAccess: {
      allowedCategories: ["public", "customer", "internal", "finance"],
    },
    toolAccess: {
      allowedTools: ["task", "note", "message", "email", "sms", "voice", "webhook"],
      allowedContracts: [],
    },
    economics: {
      allowedCostCategories: ["compute", "reasoning", "io", "human_attention", "risk"],
    },
    auditRequirements: baseAuditRequirements,
    createdAt: DEFAULT_CREATED_AT,
    updatedAt: DEFAULT_CREATED_AT,
  }),
  RolePolicySchema.parse({
    policyId: "role-policy-eval-v1",
    roleId: "system_eval",
    roleName: "Evaluation Harness",
    version: "v1",
    jurisdiction: {
      domains: ["system", "evaluation", "tooling"],
      actions: ["tool_validation", "tool_adaptation", "contract_validation", "safety_gate", "memory_scope"],
    },
    authorityCeiling: {
      maxPermissionTier: "execute",
      maxTaskClass: "routine",
      maxImpact: "reversible",
      maxEstimatedCostCents: 200,
    },
    deniedActions: ["email", "sms", "voice", "webhook"],
    escalationRules: {
      alwaysEscalateActions: ["tool_adaptation"],
      alwaysEscalateDomains: ["ops", "revenue", "ceo"],
      escalateAboveTaskClass: "novel",
      escalateAboveImpact: "difficult",
      escalateAboveCostCents: 150,
    },
    chainOfCommand: {
      canRequestFromRoles: ["ceo"],
      canApproveForRoles: [],
    },
    dataAccess: {
      allowedCategories: ["public", "internal", "system"],
    },
    toolAccess: {
      allowedTools: ["echo"],
      allowedContracts: [],
    },
    economics: {
      allowedCostCategories: ["compute", "reasoning", "risk"],
    },
    auditRequirements: baseAuditRequirements,
    createdAt: DEFAULT_CREATED_AT,
    updatedAt: DEFAULT_CREATED_AT,
  }),
];

export const findRolePolicy = (policies: RolePolicy[], roleId: string): RolePolicy | undefined =>
  policies.find((policy) => policy.roleId === roleId);

export const resolveRoleIdForAgent = (agentId: string): string => {
  if (agentId === DEFAULT_AGENT_IDS.ceo) return "ceo";
  if (agentId === DEFAULT_AGENT_IDS.revenue) return "revenue_ops";
  if (agentId === DEFAULT_AGENT_IDS.evaluation) return "system_eval";
  return "unknown";
};
