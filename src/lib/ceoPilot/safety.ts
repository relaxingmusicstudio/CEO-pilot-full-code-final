import { ActionImpact, PermissionTier } from "./contracts";

export type BudgetLimits = {
  maxCostCents: number;
  maxTokens: number;
  maxSideEffects: number;
};

export type BudgetUsage = {
  costCents: number;
  tokens: number;
  sideEffects: number;
};

export type BudgetDecision = {
  allowed: boolean;
  reason?: string;
  remaining: BudgetUsage;
};

export type BudgetTracker = {
  limits: BudgetLimits;
  usage: BudgetUsage;
  canAfford: (delta: BudgetUsage) => BudgetDecision;
  recordUsage: (delta: BudgetUsage) => BudgetDecision;
};

export const createBudgetTracker = (limits: BudgetLimits): BudgetTracker => {
  const usage: BudgetUsage = { costCents: 0, tokens: 0, sideEffects: 0 };

  const canAfford = (delta: BudgetUsage): BudgetDecision => {
    const remaining: BudgetUsage = {
      costCents: limits.maxCostCents - usage.costCents - delta.costCents,
      tokens: limits.maxTokens - usage.tokens - delta.tokens,
      sideEffects: limits.maxSideEffects - usage.sideEffects - delta.sideEffects,
    };

    if (remaining.costCents < 0) return { allowed: false, reason: "cost_limit_exceeded", remaining };
    if (remaining.tokens < 0) return { allowed: false, reason: "token_limit_exceeded", remaining };
    if (remaining.sideEffects < 0) {
      return { allowed: false, reason: "side_effect_limit_exceeded", remaining };
    }

    return { allowed: true, remaining };
  };

  const recordUsage = (delta: BudgetUsage): BudgetDecision => {
    const decision = canAfford(delta);
    if (!decision.allowed) return decision;
    usage.costCents += delta.costCents;
    usage.tokens += delta.tokens;
    usage.sideEffects += delta.sideEffects;
    return decision;
  };

  return { limits, usage, canAfford, recordUsage };
};

export type ApprovalGate = {
  approved: boolean;
  approvedBy?: string;
  approvedAt?: string;
};

export type ActionSafetyRequest = {
  permissionTier: PermissionTier;
  impact: ActionImpact;
  estimatedCostCents: number;
  estimatedTokens: number;
  sideEffectCount: number;
  approval?: ApprovalGate;
  budget: BudgetTracker;
};

export type SafetyDecision = {
  allowed: boolean;
  reason: string;
  requiredApproval: boolean;
  budgetRemaining: BudgetUsage;
};

export const evaluateSafetyGate = (request: ActionSafetyRequest): SafetyDecision => {
  if (request.permissionTier === "draft") {
    return {
      allowed: false,
      reason: "draft_only",
      requiredApproval: false,
      budgetRemaining: request.budget.canAfford({ costCents: 0, tokens: 0, sideEffects: 0 }).remaining,
    };
  }

  if (request.permissionTier === "suggest" && request.sideEffectCount > 0) {
    return {
      allowed: false,
      reason: "suggestion_no_side_effects",
      requiredApproval: false,
      budgetRemaining: request.budget.canAfford({ costCents: 0, tokens: 0, sideEffects: 0 }).remaining,
    };
  }

  const requiresApproval = request.impact !== "reversible";
  if (requiresApproval && (!request.approval || !request.approval.approved)) {
    return {
      allowed: false,
      reason: "approval_required",
      requiredApproval: true,
      budgetRemaining: request.budget.canAfford({ costCents: 0, tokens: 0, sideEffects: 0 }).remaining,
    };
  }

  const budgetDecision = request.budget.canAfford({
    costCents: request.estimatedCostCents,
    tokens: request.estimatedTokens,
    sideEffects: request.sideEffectCount,
  });

  if (!budgetDecision.allowed) {
    return {
      allowed: false,
      reason: budgetDecision.reason || "budget_exceeded",
      requiredApproval: false,
      budgetRemaining: budgetDecision.remaining,
    };
  }

  return {
    allowed: true,
    reason: "allowed",
    requiredApproval: false,
    budgetRemaining: budgetDecision.remaining,
  };
};
