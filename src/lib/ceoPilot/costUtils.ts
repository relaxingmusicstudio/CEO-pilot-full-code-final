import { ActionImpact, ModelRisk, TaskClass } from "./contracts";
import { isTestEnv } from "./runtimeGuards";
import type { ActionSpec } from "../../types/actions";

export type CostContextInput = {
  taskType?: string;
  taskClass?: TaskClass;
  estimatedCostCents?: number;
  noveltyScore?: number;
  impact?: ActionImpact;
  riskLevel?: ModelRisk | "low" | "medium" | "high";
};

export const deriveTaskClass = (input: CostContextInput): TaskClass => {
  if (input.impact === "irreversible" || input.impact === "difficult") {
    return "high_risk";
  }
  if (input.riskLevel === "high" || input.riskLevel === "critical") {
    return "high_risk";
  }
  if (input.riskLevel === "medium") {
    return "novel";
  }
  if (typeof input.noveltyScore === "number" && input.noveltyScore >= 0.6) {
    return "novel";
  }
  return "routine";
};

export type EnsureCostContextOptions = {
  taskType?: string;
  taskClass?: TaskClass;
  estimatedCostCents?: number;
  strict?: boolean;
};

const isValidCost = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export const ensureCostContext = <T extends CostContextInput>(
  context: T,
  options: EnsureCostContextOptions = {}
): T & Required<Pick<CostContextInput, "taskType" | "taskClass" | "estimatedCostCents">> => {
  const strict = options.strict ?? !isTestEnv();
  const taskType = context.taskType ?? options.taskType;
  const taskClass = context.taskClass ?? options.taskClass ?? deriveTaskClass(context);
  const estimatedCostCents =
    isValidCost(context.estimatedCostCents) ? context.estimatedCostCents : options.estimatedCostCents;

  if (strict && (!taskType || !taskClass || !isValidCost(estimatedCostCents))) {
    throw new Error("cost_context_required");
  }

  return {
    ...context,
    taskType: taskType ?? "task:unknown",
    taskClass,
    estimatedCostCents: isValidCost(estimatedCostCents) ? estimatedCostCents : 0,
  };
};

export const assertCostContext = (context: CostContextInput, strict: boolean = !isTestEnv()): void => {
  if (!strict) return;
  if (!context.taskType || !context.taskClass || !isValidCost(context.estimatedCostCents)) {
    throw new Error("cost_context_required");
  }
};

export const estimateActionCostCents = (action: Pick<ActionSpec, "action_type" | "risk_level" | "irreversible">): number => {
  let base = 1;
  switch (action.action_type) {
    case "voice":
      base = 6;
      break;
    case "sms":
      base = 4;
      break;
    case "email":
      base = 3;
      break;
    case "message":
      base = 2;
      break;
    case "webhook":
      base = 2;
      break;
    case "note":
    case "task":
    case "wait":
    case "update_state":
    default:
      base = 1;
      break;
  }
  if (action.risk_level === "high") base += 3;
  if (action.risk_level === "medium") base += 1;
  if (action.irreversible) base += 2;
  return base;
};
