import type { ActionSpec } from "../../types/actions";
import { TaskOutcomeRecord } from "./contracts";
import { deriveTaskClass } from "./costUtils";
import { recordTaskOutcome } from "./runtimeState";
import { hashString, nowIso, stableStringify, createId } from "./utils";
import type { AgentRuntimeContext } from "./runtimeGovernance";

export type OutcomeInput = {
  identityKey: string;
  action: ActionSpec;
  context: AgentRuntimeContext;
  outcomeType: "executed" | "failed" | "deferred";
  durationMs?: number;
};

const buildInputHash = (action: ActionSpec, context: AgentRuntimeContext): string => {
  const payload = {
    action_type: action.action_type,
    description: action.description,
    intent_id: action.intent_id,
    task_description: context.taskDescription,
    payload: action.payload ?? {},
  };
  return hashString(stableStringify(payload));
};

export const recordRuntimeOutcome = (input: OutcomeInput): TaskOutcomeRecord => {
  const taskType = input.context.taskType ?? input.context.decisionType ?? input.action.action_type;
  const taskClass = input.context.taskClass ?? deriveTaskClass(input.context);
  const qualityScore =
    typeof input.context.qualityScore === "number"
      ? input.context.qualityScore
      : input.outcomeType === "executed"
        ? 0.85
        : 0.2;
  const evaluationPassed =
    typeof input.context.evaluationPassed === "boolean"
      ? input.context.evaluationPassed
      : input.outcomeType === "executed";

  const record: TaskOutcomeRecord = {
    outcomeId: createId("outcome"),
    taskId: input.context.taskId ?? input.action.action_id,
    taskType,
    inputHash: buildInputHash(input.action, input.context),
    output: input.context.output,
    taskClass,
    goalId: input.context.goalId ?? "goal:unknown",
    agentId: input.context.agentId,
    modelTier: input.context.modelTier ?? "economy",
    modelId: input.context.modelId ?? "model-unknown",
    cacheHit: input.context.cacheHit ?? false,
    ruleUsed: input.context.ruleUsed ?? false,
    evaluationPassed,
    qualityScore,
    costCents: Math.max(input.context.estimatedCostCents ?? 0, 0),
    modelCostCents: Math.max(input.context.estimatedCostCents ?? 0, 0),
    toolCostCents: 0,
    durationMs: input.durationMs ?? input.context.durationMs ?? 0,
    outcomeType: input.outcomeType,
    retryCount: input.context.retryCount ?? 0,
    humanOverride: input.context.humanOverride ?? false,
    createdAt: nowIso(),
  };

  recordTaskOutcome(input.identityKey, record);
  return record;
};
