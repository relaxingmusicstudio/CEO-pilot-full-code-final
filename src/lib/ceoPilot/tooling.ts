import { z } from "zod";
import {
  ActionImpact,
  AgentProposal,
  CachePreference,
  CachePolicy,
  FailureType,
  TaskClass,
  ToolCall,
  ToolCallSchema,
  ToolResult,
  ToolResultSchema,
  ToolUsageEvent,
} from "./contracts";
import { createId, nowIso } from "./utils";
import { ApprovalGate, BudgetTracker, evaluateSafetyGate } from "./safety";
import { getAgentProfile } from "./agents";
import type { AgentRuntimeContext, RuntimeGovernanceDecision } from "./runtimeGovernance";
import { assertUnsafeTestBypass } from "./runtimeGuards";
import { assertCostContext } from "./costUtils";
import {
  type CacheStore,
  buildCacheKey,
  createCacheEntry,
  createCacheStore,
  evaluateCachePolicy,
  getCacheEntry,
  hashCacheInput,
  recordCacheHit,
} from "./cache";
import { loadCachePreferences, loadGoals } from "./runtimeState";

const INVOKE_TOOL_GUARD: unique symbol = Symbol("invokeToolGuard");
const GOVERNED_TOOL: unique symbol = Symbol("governedTool");

type InvokeToolGuard = { [INVOKE_TOOL_GUARD]?: true };

export type ToolExecuteContext = {
  governance: {
    identityKey: string;
    agentContext: AgentRuntimeContext;
    initiator?: "agent" | "human" | "system";
    __unsafeSkipGovernanceForTests?: boolean;
  };
} & InvokeToolGuard;

export type ToolDefinition<Input, Output> = {
  name: string;
  version: string;
  description?: string;
  domains?: string[];
  inputSchema: z.ZodSchema<Input>;
  outputSchema: z.ZodSchema<Output>;
  impact: ActionImpact;
  permissionTiers: Array<ToolCall["permissionTier"]>;
  execute: (input: Input, context: ToolExecuteContext) => Promise<Output> | Output;
};

export type ToolDefinitionInput<Input, Output> = Omit<ToolDefinition<Input, Output>, "execute"> & {
  execute: (input: Input, context?: ToolExecuteContext) => Promise<Output> | Output;
};

const assertToolExecutionContext = (context?: ToolExecuteContext): void => {
  if (!context?.governance) {
    throw new Error("tool_governance_context_required");
  }
  if (context.governance.__unsafeSkipGovernanceForTests) {
    assertUnsafeTestBypass(true, "tool_execute");
    return;
  }
  if (context[INVOKE_TOOL_GUARD] !== true) {
    throw new Error("tool_execute_requires_invokeTool");
  }
};

export const createGovernedTool = <Input, Output>(
  tool: ToolDefinitionInput<Input, Output>
): ToolDefinition<Input, Output> => {
  const guardedExecute = async (input: Input, context?: ToolExecuteContext) => {
    assertToolExecutionContext(context);
    return tool.execute(input, context as ToolExecuteContext);
  };
  const governed = { ...tool, execute: guardedExecute } as ToolDefinition<Input, Output> & {
    [GOVERNED_TOOL]: true;
  };
  (governed as { [GOVERNED_TOOL]: true })[GOVERNED_TOOL] = true;
  return governed;
};

const isGovernedTool = (tool: ToolDefinition<unknown, unknown>): boolean =>
  Boolean((tool as { [GOVERNED_TOOL]?: true })[GOVERNED_TOOL]);

const ensureGovernedTool = <Input, Output>(
  tool: ToolDefinition<Input, Output> | ToolDefinitionInput<Input, Output>
): ToolDefinition<Input, Output> => {
  if (isGovernedTool(tool as ToolDefinition<unknown, unknown>)) {
    return tool as ToolDefinition<Input, Output>;
  }
  return createGovernedTool(tool as ToolDefinitionInput<Input, Output>);
};

export type ToolRegistry = {
  register: <Input, Output>(tool: ToolDefinition<Input, Output>) => void;
  get: (name: string) => ToolDefinition<unknown, unknown> | undefined;
  list: () => Array<ToolDefinition<unknown, unknown>>;
};

export const createToolRegistry = (): ToolRegistry => {
  const registry = new Map<string, ToolDefinition<unknown, unknown>>();
  return {
    register: (tool) => {
      const governed = ensureGovernedTool(tool as ToolDefinitionInput<unknown, unknown>);
      registry.set(governed.name, governed);
    },
    get: (name) => registry.get(name),
    list: () => Array.from(registry.values()),
  };
};

export type ToolInvokeContext = {
  permissionTier: ToolCall["permissionTier"];
  approval?: ApprovalGate;
  budget: BudgetTracker;
  timeoutMs?: number;
  identityKey: string;
  agentContext: AgentRuntimeContext;
  initiator?: "agent" | "human" | "system";
  conflictProposals?: AgentProposal[];
  activeProposalId?: string;
  disagreementTopic?: string;
  cache?: {
    store: CacheStore;
    policy: CachePolicy;
    goalId: string;
    goalVersion: string;
    taskType: string;
    taskClass?: TaskClass;
    noveltyScore?: number;
    explorationMode?: boolean;
  };
  __unsafeSkipGovernanceForTests?: boolean;
};

export type ToolUsageRecorder = (event: ToolUsageEvent) => void;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs?: number): Promise<T> => {
  if (!timeoutMs) return promise;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), timeoutMs)
    ),
  ]);
};

const buildFailure = (
  requestId: string,
  tool: string,
  type: FailureType,
  message: string,
  latencyMs: number,
  costCents: number,
  tokens: number,
  sideEffects: number
): ToolResult => ({
  requestId,
  tool,
  status: "failure",
  failure: {
    type,
    message,
    retryable: type === "timeout" || type === "tool_runtime_error",
  },
  metrics: {
    latencyMs,
    costCents,
    tokens,
    sideEffects,
  },
  completedAt: nowIso(),
});

const mapSafetyFailure = (reason: string): FailureType => {
  if (reason.includes("budget")) return "budget_exceeded";
  if (reason.includes("token") || reason.includes("cost") || reason.includes("side_effect")) {
    return "budget_exceeded";
  }
  if (reason.includes("approval") || reason.includes("draft") || reason.includes("suggestion")) {
    return "permission_denied";
  }
  return "policy_blocked";
};

const resolveCachePreference = (
  identityKey: string,
  taskType: string,
  goalId?: string
): CachePreference | null => {
  const prefs = loadCachePreferences(identityKey).filter((pref) => pref.status === "active");
  const now = Date.now();
  const matched = prefs.find((pref) => {
    if (pref.taskType !== taskType) return false;
    if (pref.goalId && goalId && pref.goalId !== goalId) return false;
    if (pref.expiresAt && Date.parse(pref.expiresAt) <= now) return false;
    return true;
  });
  return matched ?? null;
};

export const invokeTool = async <Input, Output>(
  tool: ToolDefinition<Input, Output>,
  call: ToolCall,
  context: ToolInvokeContext,
  recordUsage?: ToolUsageRecorder
): Promise<ToolResult> => {
  const start = Date.now();
  if (context.__unsafeSkipGovernanceForTests) {
    assertUnsafeTestBypass(true, "invoke_tool");
  }
  const parsedCall = ToolCallSchema.safeParse(call);
  if (!parsedCall.success) {
    const result = buildFailure(call.requestId || "unknown", tool.name, "schema_validation_error", "invalid_tool_call", 0, 0, 0, 0);
    recordUsage?.({
      eventId: createId("tool"),
      tool: tool.name,
      status: "failure",
      failureType: "schema_validation_error",
      latencyMs: 0,
      costCents: 0,
      timestamp: nowIso(),
    });
    return result;
  }

  if (call.tool !== tool.name) {
    const result = buildFailure(call.requestId, tool.name, "policy_blocked", "tool_name_mismatch", Date.now() - start, 0, 0, 0);
    recordUsage?.({
      eventId: createId("tool"),
      tool: tool.name,
      status: "failure",
      failureType: "policy_blocked",
      latencyMs: Date.now() - start,
      costCents: 0,
      timestamp: nowIso(),
    });
    return result;
  }

  if (!tool.permissionTiers.includes(call.permissionTier)) {
    const result = buildFailure(call.requestId, tool.name, "permission_denied", "tier_not_allowed", Date.now() - start, 0, 0, 0);
    recordUsage?.({
      eventId: createId("tool"),
      tool: tool.name,
      status: "failure",
      failureType: "permission_denied",
      latencyMs: Date.now() - start,
      costCents: 0,
      timestamp: nowIso(),
    });
    return result;
  }

  if (!context.identityKey || !context.agentContext) {
    const result = buildFailure(call.requestId, tool.name, "policy_blocked", "governance_context_required", Date.now() - start, 0, 0, 0);
    recordUsage?.({
      eventId: createId("tool"),
      tool: tool.name,
      status: "failure",
      failureType: "policy_blocked",
      latencyMs: Date.now() - start,
      costCents: 0,
      timestamp: nowIso(),
    });
    return result;
  }

  const governanceContext: AgentRuntimeContext = {
    ...context.agentContext,
    tool: context.agentContext.tool || tool.name,
    decisionType: context.agentContext.decisionType || tool.name,
    impact: context.agentContext.impact ?? call.impact,
    proposals: context.agentContext.proposals ?? context.conflictProposals,
    activeProposalId: context.agentContext.activeProposalId ?? context.activeProposalId,
    disagreementTopic: context.agentContext.disagreementTopic ?? context.disagreementTopic,
    permissionTier: context.agentContext.permissionTier || call.permissionTier,
  };
  assertCostContext(governanceContext);

  if (!governanceContext.actionDomain) {
    const result = buildFailure(call.requestId, tool.name, "policy_blocked", "domain_required", Date.now() - start, 0, 0, 0);
    recordUsage?.({
      eventId: createId("tool"),
      tool: tool.name,
      status: "failure",
      failureType: "policy_blocked",
      latencyMs: Date.now() - start,
      costCents: 0,
      timestamp: nowIso(),
    });
    return result;
  }
  if (!governanceContext.decisionType) {
    const result = buildFailure(call.requestId, tool.name, "policy_blocked", "decision_type_required", Date.now() - start, 0, 0, 0);
    recordUsage?.({
      eventId: createId("tool"),
      tool: tool.name,
      status: "failure",
      failureType: "policy_blocked",
      latencyMs: Date.now() - start,
      costCents: 0,
      timestamp: nowIso(),
    });
    return result;
  }

  const agentProfile = getAgentProfile(governanceContext.agentId);
  if (!agentProfile) {
    const result = buildFailure(call.requestId, tool.name, "policy_blocked", "agent_unregistered", Date.now() - start, 0, 0, 0);
    recordUsage?.({
      eventId: createId("tool"),
      tool: tool.name,
      status: "failure",
      failureType: "policy_blocked",
      latencyMs: Date.now() - start,
      costCents: 0,
      timestamp: nowIso(),
    });
    return result;
  }

  if (tool.domains && !tool.domains.includes(governanceContext.actionDomain)) {
    const result = buildFailure(
      call.requestId,
      tool.name,
      "policy_blocked",
      "tool_domain_mismatch",
      Date.now() - start,
      0,
      0,
      0
    );
    recordUsage?.({
      eventId: createId("tool"),
      tool: tool.name,
      status: "failure",
      failureType: "policy_blocked",
      latencyMs: Date.now() - start,
      costCents: 0,
      timestamp: nowIso(),
    });
    return result;
  }

  if (governanceContext.permissionTier !== call.permissionTier) {
    const result = buildFailure(
      call.requestId,
      tool.name,
      "policy_blocked",
      "permission_tier_mismatch",
      Date.now() - start,
      0,
      0,
      0
    );
    recordUsage?.({
      eventId: createId("tool"),
      tool: tool.name,
      status: "failure",
      failureType: "policy_blocked",
      latencyMs: Date.now() - start,
      costCents: 0,
      timestamp: nowIso(),
    });
    return result;
  }

  if (call.impact !== tool.impact) {
    const result = buildFailure(call.requestId, tool.name, "policy_blocked", "impact_mismatch", Date.now() - start, 0, 0, 0);
    recordUsage?.({
      eventId: createId("tool"),
      tool: tool.name,
      status: "failure",
      failureType: "policy_blocked",
      latencyMs: Date.now() - start,
      costCents: 0,
      timestamp: nowIso(),
    });
    return result;
  }

  const inputParsed = tool.inputSchema.safeParse(call.input);
  if (!inputParsed.success) {
    const result = buildFailure(
      call.requestId,
      tool.name,
      "schema_validation_error",
      "input_schema_invalid",
      Date.now() - start,
      0,
      0,
      0
    );
    recordUsage?.({
      eventId: createId("tool"),
      tool: tool.name,
      status: "failure",
      failureType: "schema_validation_error",
      latencyMs: Date.now() - start,
      costCents: 0,
      timestamp: nowIso(),
    });
    return result;
  }

  const goalId = context.agentContext.goalId;
  const taskType = context.agentContext.taskType ?? call.tool;
  const cachePreference =
    !context.cache && context.identityKey ? resolveCachePreference(context.identityKey, taskType, goalId) : null;
  const goalVersion = (() => {
    if (!goalId) return "v1";
    const goal = loadGoals(context.identityKey).find((entry) => entry.goalId === goalId);
    return goal?.version ?? "v1";
  })();

  const cacheContext =
    context.cache ??
    (cachePreference
      ? {
          store: createCacheStore(context.identityKey),
          policy: cachePreference.policy,
          goalId: cachePreference.goalId ?? goalId ?? "goal:unknown",
          goalVersion,
          taskType,
          taskClass: context.agentContext.taskClass,
          noveltyScore: context.agentContext.noveltyScore,
          explorationMode: context.agentContext.explorationMode,
        }
      : undefined);
  const inputHash = cacheContext ? hashCacheInput(inputParsed.data) : null;
  const cacheKey = cacheContext
    ? buildCacheKey({
        kind: "tool",
        taskType: cacheContext.taskType,
        goalId: cacheContext.goalId,
        goalVersion: cacheContext.goalVersion,
        inputHash: inputHash ?? "missing",
      })
    : null;
  const cacheEligibility = cacheContext
    ? evaluateCachePolicy(cacheContext.policy, {
        taskClass: cacheContext.taskClass,
        noveltyScore: cacheContext.noveltyScore ?? context.agentContext.noveltyScore,
        explorationMode: cacheContext.explorationMode ?? context.agentContext.explorationMode,
        impact: call.impact,
      })
    : null;

  let governanceDecision: RuntimeGovernanceDecision | null = null;
  if (!context.__unsafeSkipGovernanceForTests) {
    const { enforceRuntimeGovernance } = await import("./runtimeGovernance");
    governanceDecision = await enforceRuntimeGovernance(
      context.identityKey,
      governanceContext,
      context.initiator ?? "agent"
    );
    if (!governanceDecision.allowed) {
      const result = buildFailure(
        call.requestId,
        tool.name,
        "policy_blocked",
        `governance_blocked:${governanceDecision.reason}`,
        Date.now() - start,
        0,
        0,
        0
      );
      recordUsage?.({
        eventId: createId("tool"),
        tool: tool.name,
        status: "failure",
        failureType: "policy_blocked",
        latencyMs: Date.now() - start,
        costCents: 0,
        timestamp: nowIso(),
      });
      return result;
    }
  }

  const safetyDecision = evaluateSafetyGate({
    permissionTier: call.permissionTier,
    impact: call.impact,
    estimatedCostCents: call.estimatedCostCents,
    estimatedTokens: call.estimatedTokens,
    sideEffectCount: call.sideEffectCount,
    approval: context.approval,
    budget: context.budget,
  });

  if (!safetyDecision.allowed) {
    const failureType = mapSafetyFailure(safetyDecision.reason);
    const result = buildFailure(
      call.requestId,
      tool.name,
      failureType,
      safetyDecision.reason,
      Date.now() - start,
      0,
      0,
      0
    );
    recordUsage?.({
      eventId: createId("tool"),
      tool: tool.name,
      status: "failure",
      failureType,
      latencyMs: Date.now() - start,
      costCents: 0,
      timestamp: nowIso(),
    });
    return result;
  }

  if (cacheContext && cacheKey && cacheEligibility?.allowed) {
    const cached = getCacheEntry(cacheContext.store, cacheKey);
    if (cached.hit && cached.entry) {
      const cachedOutput = tool.outputSchema.safeParse(cached.entry.payload);
      if (cachedOutput.success) {
        recordCacheHit(cacheContext.store, cached.entry);
        const success: ToolResult = {
          requestId: call.requestId,
          tool: tool.name,
          status: "success",
          output: cachedOutput.data as Record<string, unknown>,
          metrics: {
            latencyMs: Date.now() - start,
            costCents: 0,
            tokens: 0,
            sideEffects: 0,
          },
          completedAt: nowIso(),
        };
        recordUsage?.({
          eventId: createId("tool"),
          tool: tool.name,
          status: "success",
          latencyMs: success.metrics.latencyMs,
          costCents: 0,
          timestamp: nowIso(),
        });
        return success;
      }
    }
  }

  try {
    const governedTool = ensureGovernedTool(tool);
    const execContext: ToolExecuteContext = {
      governance: {
        identityKey: context.identityKey,
        agentContext: governanceContext,
        initiator: context.initiator,
        __unsafeSkipGovernanceForTests: context.__unsafeSkipGovernanceForTests,
      },
      [INVOKE_TOOL_GUARD]: true,
    };
    const output = await withTimeout(
      Promise.resolve(governedTool.execute(inputParsed.data, execContext)),
      context.timeoutMs
    );
    const outputParsed = tool.outputSchema.safeParse(output);
    if (!outputParsed.success) {
      const result = buildFailure(
        call.requestId,
        tool.name,
        "schema_validation_error",
        "output_schema_invalid",
        Date.now() - start,
        call.estimatedCostCents,
        call.estimatedTokens,
        call.sideEffectCount
      );
      recordUsage?.({
        eventId: createId("tool"),
        tool: tool.name,
        status: "failure",
        failureType: "schema_validation_error",
        latencyMs: Date.now() - start,
        costCents: call.estimatedCostCents,
        timestamp: nowIso(),
      });
      return result;
    }

    if (cacheContext && cacheEligibility?.allowed && inputHash) {
      const entry = createCacheEntry({
        kind: "tool",
        taskType: cacheContext.taskType,
        goalId: cacheContext.goalId,
        goalVersion: cacheContext.goalVersion,
        inputHash,
        policy: cacheContext.policy,
        payload: outputParsed.data as Record<string, unknown>,
        now: nowIso(),
      });
      cacheContext.store.upsert(entry);
    }

    context.budget.recordUsage({
      costCents: call.estimatedCostCents,
      tokens: call.estimatedTokens,
      sideEffects: call.sideEffectCount,
    });

    const success: ToolResult = {
      requestId: call.requestId,
      tool: tool.name,
      status: "success",
      output: outputParsed.data as Record<string, unknown>,
      metrics: {
        latencyMs: Date.now() - start,
        costCents: call.estimatedCostCents,
        tokens: call.estimatedTokens,
        sideEffects: call.sideEffectCount,
      },
      completedAt: nowIso(),
    };

    const validated = ToolResultSchema.safeParse(success);
    const finalResult = validated.success ? validated.data : success;

    recordUsage?.({
      eventId: createId("tool"),
      tool: tool.name,
      status: "success",
      latencyMs: finalResult.metrics.latencyMs,
      costCents: finalResult.metrics.costCents,
      timestamp: nowIso(),
    });

    return finalResult;
  } catch (error) {
    const type = error instanceof Error && error.message === "timeout" ? "timeout" : "tool_runtime_error";
    const result = buildFailure(
      call.requestId,
      tool.name,
      type,
      error instanceof Error ? error.message : "execution_failed",
      Date.now() - start,
      call.estimatedCostCents,
      call.estimatedTokens,
      call.sideEffectCount
    );
    recordUsage?.({
      eventId: createId("tool"),
      tool: tool.name,
      status: "failure",
      failureType: type,
      latencyMs: Date.now() - start,
      costCents: call.estimatedCostCents,
      timestamp: nowIso(),
    });
    return result;
  }
};
