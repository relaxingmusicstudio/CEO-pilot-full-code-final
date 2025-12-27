import type { EconomicAuditRecord, EconomicBudgetState } from "../contracts";
import { getAgentProfile } from "../agents";
import { loadRolePolicies } from "../runtimeState";
import { nowIso } from "../utils";
import type { AgentRuntimeContext } from "../runtimeGovernance";
import { ensureContextEconomics } from "./costModel";
import {
  consumeEconomicBudget,
  ensureEconomicBudgetState,
  findEconomicAuditByCharge,
  recordEconomicDecision,
} from "./budgetState";

export type EconomicGateDecision = {
  allowed: boolean;
  reason: string;
  requiresHumanReview: boolean;
  budget: EconomicBudgetState;
  audit: EconomicAuditRecord;
};

export const enforceEconomicGate = (
  identityKey: string,
  context: AgentRuntimeContext,
  initiator: "agent" | "human" | "system" = "agent",
  nowValue: string = nowIso()
): EconomicGateDecision => {
  const enriched = ensureContextEconomics(context);
  const costUnits = enriched.costUnits;
  const costCategory = enriched.costCategory;
  const costSource = enriched.costSource ?? "action";
  const chargeId = enriched.costChargeId ?? `${costSource}:${enriched.taskId ?? enriched.decisionType}`;

  const existing = findEconomicAuditByCharge(identityKey, chargeId);
  if (existing) {
    if (existing.decision === "blocked" && initiator !== "human") {
      return {
        allowed: false,
        reason: existing.reason,
        requiresHumanReview: true,
        budget: ensureEconomicBudgetState(identityKey, nowValue),
        audit: existing,
      };
    }
    return {
      allowed: existing.decision === "allowed",
      reason: existing.reason,
      requiresHumanReview: existing.decision === "blocked",
      budget: ensureEconomicBudgetState(identityKey, nowValue),
      audit: existing,
    };
  }

  const agentProfile = getAgentProfile(enriched.agentId);
  const roleId = agentProfile?.role;
  const policies = loadRolePolicies(identityKey);
  const policy = roleId ? policies.find((entry) => entry.roleId === roleId) : undefined;

  const budgetState = ensureEconomicBudgetState(identityKey, nowValue);

  if (!policy) {
    const audit = recordEconomicDecision(identityKey, {
      identityKey,
      roleId,
      actionId: enriched.taskId,
      taskId: enriched.taskId,
      taskType: enriched.taskType,
      tool: enriched.tool,
      costUnits,
      costCategory,
      costSource,
      chargeId,
      decision: "blocked",
      reason: "economic_role_policy_missing",
      remainingBudget: budgetState.remainingBudget,
      sessionRemaining: budgetState.sessionRemaining,
    });
    return {
      allowed: false,
      reason: "economic_role_policy_missing",
      requiresHumanReview: true,
      budget: budgetState,
      audit,
    };
  }

  if (!policy.economics.allowedCostCategories.includes(costCategory)) {
    const audit = recordEconomicDecision(identityKey, {
      identityKey,
      roleId: policy.roleId,
      actionId: enriched.taskId,
      taskId: enriched.taskId,
      taskType: enriched.taskType,
      tool: enriched.tool,
      costUnits,
      costCategory,
      costSource,
      chargeId,
      decision: "blocked",
      reason: "economic_category_denied",
      remainingBudget: budgetState.remainingBudget,
      sessionRemaining: budgetState.sessionRemaining,
    });
    return {
      allowed: false,
      reason: "economic_category_denied",
      requiresHumanReview: true,
      budget: budgetState,
      audit,
    };
  }

  const budgetDecision = consumeEconomicBudget(identityKey, costUnits, nowValue);
  const audit = recordEconomicDecision(identityKey, {
    identityKey,
    roleId: policy.roleId,
    actionId: enriched.taskId,
    taskId: enriched.taskId,
    taskType: enriched.taskType,
    tool: enriched.tool,
    costUnits,
    costCategory,
    costSource,
    chargeId,
    decision: budgetDecision.allowed ? "allowed" : "blocked",
    reason: budgetDecision.reason,
    remainingBudget: budgetDecision.budget.remainingBudget,
    sessionRemaining: budgetDecision.budget.sessionRemaining,
  });

  return {
    allowed: budgetDecision.allowed,
    reason: budgetDecision.reason,
    requiresHumanReview: !budgetDecision.allowed,
    budget: budgetDecision.budget,
    audit,
  };
};
