import type { ExecutionRecord, ActionSpec } from "../types/actions";
import type { PolicyContext } from "./policyEngine";
import { stableStringify } from "../types/actions";
import type { AgentRuntimeContext } from "./ceoPilot/runtimeGovernance";
import { enforceRuntimeGovernance } from "./ceoPilot/runtimeGovernance";
import { assertUnsafeTestBypass } from "./ceoPilot/runtimeGuards";
import { recordRuntimeOutcome } from "./ceoPilot/outcomes";
import { runSelfImprovementCycle } from "./ceoPilot/improvement";

type RunResult = {
  status: "executed" | "failed";
  evidence: ExecutionRecord["evidence"];
  error?: string;
};

export type GovernanceEnforcementContext = {
  identityKey: string;
  agentContext: AgentRuntimeContext;
  initiator?: "agent" | "human" | "system";
  __unsafeSkipGovernanceForTests?: boolean;
};

const buildMockEvidence = (action: ActionSpec): string => {
  const summary = stableStringify({
    action_id: action.action_id,
    action_type: action.action_type,
    intent_id: action.intent_id,
  });
  return `MOCK_EXEC:${summary}`;
};

export const runAction = async (
  action: ActionSpec,
  ctx: PolicyContext,
  governance?: GovernanceEnforcementContext
): Promise<RunResult> => {
  const start = Date.now();
  const unsafeSkip = governance?.__unsafeSkipGovernanceForTests === true;
  assertUnsafeTestBypass(unsafeSkip, "run_action");
  if (!governance?.agentContext || !governance?.identityKey) {
    if (!unsafeSkip) {
      throw new Error("governance_context_required");
    }
  }
  if (!unsafeSkip && governance?.agentContext && governance.identityKey) {
    const decision = await enforceRuntimeGovernance(
      governance.identityKey,
      {
        ...governance.agentContext,
        tool: governance.agentContext.tool || action.action_type,
        decisionType: governance.agentContext.decisionType || action.action_type,
        impact: governance.agentContext.impact ?? (action.irreversible ? "irreversible" : "reversible"),
      },
      governance.initiator ?? "agent"
    );
    if (!decision.allowed) {
      return {
        status: "failed",
        evidence: { kind: "log", value: `GOVERNANCE_BLOCKED:${decision.reason}` },
        error: `GOVERNANCE_BLOCKED:${decision.reason}`,
      };
    }
  }
  if (ctx.mode === "MOCK" || ctx.mode === "OFFLINE") {
    const result: RunResult = {
      status: "executed",
      evidence: { kind: "mock", value: buildMockEvidence(action) },
    };
    if (governance?.agentContext && governance.identityKey) {
      const durationMs = Date.now() - start;
      const enrichedContext = {
        ...governance.agentContext,
        humanOverride: governance.initiator === "human" || governance.agentContext.humanOverride,
        durationMs,
      };
      recordRuntimeOutcome({
        identityKey: governance.identityKey,
        action,
        context: enrichedContext,
        outcomeType: "executed",
        durationMs,
      });
      try {
        runSelfImprovementCycle(governance.identityKey);
      } catch (error) {
        result.error = `IMPROVEMENT_LOOP_FAILED:${error instanceof Error ? error.message : "unknown"}`;
      }
    }
    return result;
  }

  const result: RunResult = {
    status: "failed",
    evidence: { kind: "log", value: `LIVE_EXEC_NOT_IMPLEMENTED:${action.action_type}` },
    error: "LIVE_EXEC_NOT_IMPLEMENTED",
  };
  if (governance?.agentContext && governance.identityKey) {
    const durationMs = Date.now() - start;
    const enrichedContext = {
      ...governance.agentContext,
      humanOverride: governance.initiator === "human" || governance.agentContext.humanOverride,
      durationMs,
    };
    recordRuntimeOutcome({
      identityKey: governance.identityKey,
      action,
      context: enrichedContext,
      outcomeType: "failed",
      durationMs,
    });
    try {
      runSelfImprovementCycle(governance.identityKey);
    } catch (error) {
      result.error = `IMPROVEMENT_LOOP_FAILED:${error instanceof Error ? error.message : "unknown"}`;
    }
  }
  return result;
};
