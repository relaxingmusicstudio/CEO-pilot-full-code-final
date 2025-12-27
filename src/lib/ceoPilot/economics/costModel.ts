import type { ActionSpec, CostCategory } from "../../../types/actions";
import type { ToolCall } from "../contracts";
import type { AgentRuntimeContext } from "../runtimeGovernance";

export type CostAttribution = {
  costUnits: number;
  costCategory: CostCategory;
  reason: string;
};

const clampUnits = (value: number): number => Math.max(0, Math.round(value));

const baseUnitsForAction = (actionType: ActionSpec["action_type"]): number => {
  switch (actionType) {
    case "voice":
      return 6;
    case "sms":
      return 4;
    case "email":
      return 3;
    case "message":
      return 3;
    case "webhook":
      return 2;
    case "task":
      return 3;
    case "note":
      return 1;
    case "update_state":
      return 1;
    case "wait":
    default:
      return 1;
  }
};

const resolveActionCategory = (action: ActionSpec): CostCategory => {
  if (action.irreversible || action.risk_level === "high") return "risk";
  if (["message", "email", "sms", "voice", "webhook"].includes(action.action_type)) return "io";
  if (action.action_type === "task") return "human_attention";
  if (action.action_type === "note") return "reasoning";
  return "compute";
};

const baseUnitsForContext = (context: AgentRuntimeContext): number => {
  const typeHint = context.decisionType ?? context.taskType ?? "task";
  if (typeHint.includes("voice")) return 6;
  if (typeHint.includes("sms")) return 4;
  if (typeHint.includes("email")) return 3;
  if (typeHint.includes("message")) return 3;
  if (typeHint.includes("webhook")) return 2;
  if (typeHint.includes("task")) return 3;
  if (typeHint.includes("note")) return 1;
  if (typeHint.includes("wait")) return 1;
  return 2;
};

const resolveContextCategory = (context: AgentRuntimeContext): CostCategory => {
  if (context.impact === "irreversible" || context.taskClass === "high_risk") return "risk";
  const typeHint = context.decisionType ?? context.taskType ?? "";
  if (["message", "email", "sms", "voice", "webhook"].some((item) => typeHint.includes(item))) return "io";
  if (typeHint.includes("task")) return "human_attention";
  if (typeHint.includes("note")) return "reasoning";
  return "compute";
};

export const deriveActionCost = (action: ActionSpec): CostAttribution => {
  let units = baseUnitsForAction(action.action_type);
  if (action.risk_level === "medium") units += 1;
  if (action.risk_level === "high") units += 2;
  if (action.irreversible) units += 2;
  return {
    costUnits: clampUnits(units),
    costCategory: resolveActionCategory(action),
    reason: "action_cost_model",
  };
};

export const deriveToolCallCost = (call: ToolCall): CostAttribution => {
  let units = 1;
  if (call.estimatedCostCents > 0) {
    units = Math.max(1, Math.ceil(call.estimatedCostCents / 10));
  }
  if (call.sideEffectCount > 0) {
    units += 1;
  }
  if (call.impact === "irreversible") units += 2;
  if (call.impact === "difficult") units += 1;
  const toolName = call.tool.toLowerCase();
  const costCategory: CostCategory =
    call.impact !== "reversible"
      ? "risk"
      : ["message", "email", "sms", "voice", "webhook"].some((item) => toolName.includes(item))
        ? "io"
        : "compute";
  return {
    costUnits: clampUnits(units),
    costCategory,
    reason: "tool_cost_model",
  };
};

export const deriveContextCost = (context: AgentRuntimeContext): CostAttribution => {
  let units = baseUnitsForContext(context);
  if (context.taskClass === "novel") units += 1;
  if (context.taskClass === "high_risk") units += 2;
  if (context.impact === "irreversible") units += 2;
  if (context.impact === "difficult") units += 1;
  return {
    costUnits: clampUnits(units),
    costCategory: resolveContextCategory(context),
    reason: "context_cost_model",
  };
};

export const ensureActionEconomics = (action: ActionSpec): ActionSpec => {
  if (typeof action.costUnits === "number" && action.costCategory) {
    return action;
  }
  const derived = deriveActionCost(action);
  return {
    ...action,
    costUnits: derived.costUnits,
    costCategory: derived.costCategory,
  };
};

export const ensureToolCallEconomics = (call: ToolCall): ToolCall => {
  if (typeof call.costUnits === "number" && call.costCategory) {
    return call;
  }
  const derived = deriveToolCallCost(call);
  return {
    ...call,
    costUnits: derived.costUnits,
    costCategory: derived.costCategory,
  };
};

export const ensureContextEconomics = (context: AgentRuntimeContext): AgentRuntimeContext => {
  if (typeof context.costUnits === "number" && context.costCategory) {
    return context;
  }
  const derived = deriveContextCost(context);
  return {
    ...context,
    costUnits: derived.costUnits,
    costCategory: derived.costCategory,
  };
};
