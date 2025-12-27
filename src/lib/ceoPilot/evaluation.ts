import { z } from "zod";
import {
  EvaluationDomain,
  EvaluationPriority,
  EvaluationResult,
  EvaluationResultSchema,
  EvaluationTask,
  EvaluationTaskSchema,
  FailureClass,
  FailureType,
  ExecutionPlan,
  validateContract,
} from "./contracts";
import { createMemoryStore, retrieveMemory, writeMemory } from "./memory";
import { createBudgetTracker, evaluateSafetyGate } from "./safety";
import { createToolUsageStore, recommendTool } from "./adaptation";
import { createGovernedTool, invokeTool, ToolDefinition } from "./tooling";
import { DEFAULT_AGENT_IDS, getAgentProfile } from "./agents";
import { DEFAULT_GOAL_IDS } from "./goals";
import { createId } from "./utils";

const FIXED_NOW = "2025-01-01T00:00:00.000Z";

const parseVersion = (value: string): number => {
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
};

export const EVALUATION_TASKS: EvaluationTask[] = [
  {
    taskId: "safety-irreversible-approval",
    version: "v1",
    status: "active",
    domain: "safety",
    failureClass: "policy",
    priority: "critical",
    type: "safety_gate",
    description: "Irreversible actions require approval before execution.",
    input: {
      permissionTier: "execute",
      impact: "irreversible",
      estimatedCostCents: 10,
      estimatedTokens: 100,
      sideEffectCount: 1,
      approval: { approved: false },
      limits: { maxCostCents: 100, maxTokens: 1000, maxSideEffects: 2 },
    },
    expected: { allowed: false, requiredApproval: true },
    tags: ["safety", "approval"],
  },
  {
    taskId: "memory-scope-tenant",
    version: "v1",
    status: "active",
    domain: "memory",
    failureClass: "scope",
    priority: "high",
    type: "memory_scope",
    description: "Memory retrieval must be scoped to tenant.",
    input: {
      recordScope: { tenantId: "t-1", userId: "u-1" },
      queryScope: { tenantId: "t-2", userId: "u-1" },
    },
    expected: { count: 0 },
    tags: ["memory", "scope"],
  },
  {
    taskId: "tool-input-validation",
    version: "v1",
    status: "active",
    domain: "tooling",
    failureClass: "schema",
    priority: "high",
    type: "tool_validation",
    description: "Tool input schema violations return schema_validation_error.",
    input: {
      invalidInput: { name: 42 },
    },
    expected: { failureType: "schema_validation_error" },
    tags: ["tool", "schema"],
  },
  {
    taskId: "tool-adaptation-disable",
    version: "v1",
    status: "active",
    domain: "tooling",
    failureClass: "stability",
    priority: "medium",
    type: "tool_adaptation",
    description: "Recurring failures disable a tool recommendation.",
    input: {
      failureCount: 5,
      failureType: "tool_runtime_error",
    },
    expected: { status: "disabled" },
    tags: ["tool", "adaptation"],
  },
  {
    taskId: "contract-plan-validation",
    version: "v1",
    status: "active",
    domain: "contract",
    failureClass: "schema",
    priority: "critical",
    type: "contract_validation",
    description: "Execution plan schema validates a compliant payload.",
    input: {
      contract: "plan",
      payload: {
        planId: "plan-1",
        objective: "Verify plan schema",
        tasks: [
          {
            taskId: "task-1",
            description: "Validate contract",
            intent: "verify",
            expectedOutcome: "schema passes",
            constraints: [],
            requiresApproval: false,
          },
        ],
        createdAt: FIXED_NOW,
        source: "planner",
      },
    },
    expected: { valid: true },
    tags: ["contract"],
  },
];

const toEvaluationResult = (result: EvaluationResult): EvaluationResult => {
  const parsed = EvaluationResultSchema.safeParse(result);
  if (!parsed.success) {
    return {
      taskId: result.taskId,
      passed: false,
      details: "evaluation_result_schema_invalid",
    };
  }
  return parsed.data;
};

const runSafetyGate = (task: EvaluationTask): EvaluationResult => {
  const input = task.input as {
    permissionTier: "draft" | "suggest" | "execute";
    impact: "reversible" | "difficult" | "irreversible";
    estimatedCostCents: number;
    estimatedTokens: number;
    sideEffectCount: number;
    approval?: { approved: boolean };
    limits: { maxCostCents: number; maxTokens: number; maxSideEffects: number };
  };

  const budget = createBudgetTracker(input.limits);
  const decision = evaluateSafetyGate({
    permissionTier: input.permissionTier,
    impact: input.impact,
    estimatedCostCents: input.estimatedCostCents,
    estimatedTokens: input.estimatedTokens,
    sideEffectCount: input.sideEffectCount,
    approval: input.approval,
    budget,
  });

  const expected = task.expected as { allowed: boolean; requiredApproval: boolean };
  const passed = decision.allowed === expected.allowed && decision.requiredApproval === expected.requiredApproval;

  return toEvaluationResult({
    taskId: task.taskId,
    passed,
    details: passed ? "ok" : "safety_gate_mismatch",
    artifacts: { decision },
  });
};

const runMemoryScope = (task: EvaluationTask): EvaluationResult => {
  const input = task.input as {
    recordScope: { tenantId: string; userId: string };
    queryScope: { tenantId: string; userId: string };
  };

  const store = createMemoryStore();
  const record = {
    memoryId: createId("mem"),
    kind: "fact" as const,
    subject: "tenant-specific knowledge",
    data: { note: "scoped" },
    confidence: 0.8,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    scope: input.recordScope,
    source: "system" as const,
    tags: ["scope"],
  };

  writeMemory(store, record, {
    permissionTier: "execute",
    verificationStatus: "pass",
    source: "system",
  });

  const results = retrieveMemory(store, {
    scope: input.queryScope,
    now: FIXED_NOW,
  });

  const expected = task.expected as { count: number };
  const passed = results.length === expected.count;

  return toEvaluationResult({
    taskId: task.taskId,
    passed,
    details: passed ? "ok" : "memory_scope_mismatch",
    artifacts: { resultsCount: results.length },
  });
};

const runToolValidation = async (task: EvaluationTask): Promise<EvaluationResult> => {
  const input = task.input as { invalidInput: Record<string, unknown> };
  const agentProfile = getAgentProfile(DEFAULT_AGENT_IDS.evaluation);
  if (!agentProfile) {
    return toEvaluationResult({
      taskId: task.taskId,
      passed: false,
      details: "evaluation_agent_missing",
    });
  }

  const tool: ToolDefinition<{ name: string }, { ok: boolean }> = createGovernedTool({
    name: "echo",
    version: "1",
    inputSchema: z.object({ name: z.string() }).strict(),
    outputSchema: z.object({ ok: z.boolean() }).strict(),
    impact: "reversible",
    permissionTiers: ["suggest", "execute"],
    execute: () => ({ ok: true }),
  });

  const call = {
    requestId: "req-1",
    tool: "echo",
    intent: "test",
    permissionTier: "suggest",
    input: input.invalidInput,
    costUnits: 1,
    costCategory: "compute",
    estimatedCostCents: 0,
    estimatedTokens: 0,
    sideEffectCount: 0,
    impact: "reversible",
    createdAt: FIXED_NOW,
  };

  const result = await invokeTool(tool, call, {
    permissionTier: "suggest",
    budget: createBudgetTracker({ maxCostCents: 10, maxTokens: 100, maxSideEffects: 0 }),
    identityKey: "eval:system",
    initiator: "system",
    agentContext: {
      agentId: agentProfile.agentId,
      actionDomain: "system",
      decisionType: "tool_validation",
      tool: tool.name,
      goalId: DEFAULT_GOAL_IDS.systemIntegrity,
      taskId: "task-tool-validation",
      taskDescription: "Evaluate tool schema validation behavior.",
      taskType: "tool:echo",
      taskClass: "routine",
      estimatedCostCents: 1,
      explorationMode: true,
      actionTags: [],
      permissionTier: "suggest",
      impact: "reversible",
      confidence: {
        confidenceScore: 0.9,
        uncertaintyExplanation: "Synthetic evaluation input.",
        knownBlindSpots: ["no live provider data"],
        evidenceRefs: ["test:evidence"],
      },
      metrics: { uncertaintyVariance: 0.01, rollbackRate: 0.01, stableRuns: 6 },
    },
  });

  const expected = task.expected as { failureType: string };
  const passed = result.failure?.type === expected.failureType;

  return toEvaluationResult({
    taskId: task.taskId,
    passed,
    details: passed ? "ok" : "tool_validation_mismatch",
    artifacts: { failureType: result.failure?.type },
  });
};

const runToolAdaptation = (task: EvaluationTask): EvaluationResult => {
  const input = task.input as { failureCount: number; failureType: FailureType };
  const store = createToolUsageStore();

  for (let idx = 0; idx < input.failureCount; idx += 1) {
    store.record({
      eventId: createId("evt"),
      tool: "tool-a",
      status: "failure",
      failureType: input.failureType,
      latencyMs: 12,
      costCents: 0,
      timestamp: FIXED_NOW,
    });
  }

  const recommendation = recommendTool("tool-a", store);
  const expected = task.expected as { status: string };
  const passed = recommendation.status === expected.status;

  return toEvaluationResult({
    taskId: task.taskId,
    passed,
    details: passed ? "ok" : "tool_adaptation_mismatch",
    artifacts: { recommendation },
  });
};

const runContractValidation = (task: EvaluationTask): EvaluationResult => {
  const input = task.input as { contract: string; payload: ExecutionPlan };
  const parsed = validateContract<ExecutionPlan>(input.contract as "plan", input.payload);
  const expected = task.expected as { valid: boolean };
  const passed = parsed.success === expected.valid;

  return toEvaluationResult({
    taskId: task.taskId,
    passed,
    details: passed ? "ok" : "contract_validation_mismatch",
    artifacts: { contract: input.contract, success: parsed.success },
  });
};

export const runEvaluationTask = async (task: EvaluationTask): Promise<EvaluationResult> => {
  const parsed = EvaluationTaskSchema.safeParse(task);
  if (!parsed.success) {
    return toEvaluationResult({
      taskId: task.taskId,
      passed: false,
      details: "evaluation_task_schema_invalid",
    });
  }

  switch (task.type) {
    case "safety_gate":
      return runSafetyGate(task);
    case "memory_scope":
      return runMemoryScope(task);
    case "tool_validation":
      return runToolValidation(task);
    case "tool_adaptation":
      return runToolAdaptation(task);
    case "contract_validation":
      return runContractValidation(task);
    default:
      return toEvaluationResult({
        taskId: task.taskId,
        passed: false,
        details: "unsupported_task_type",
      });
  }
};

export type EvaluationCoverage = {
  domains: Record<EvaluationDomain, number>;
  failureClasses: Record<FailureClass, number>;
};

export const buildCoverageReport = (tasks: EvaluationTask[]): EvaluationCoverage => {
  const domains: Record<EvaluationDomain, number> = {
    safety: 0,
    memory: 0,
    tooling: 0,
    coordination: 0,
    trust: 0,
    contract: 0,
    system: 0,
  };
  const failureClasses: Record<FailureClass, number> = {
    schema: 0,
    policy: 0,
    budget: 0,
    scope: 0,
    regression: 0,
    stability: 0,
    unknown: 0,
  };

  tasks.forEach((task) => {
    domains[task.domain] = (domains[task.domain] || 0) + 1;
    failureClasses[task.failureClass] = (failureClasses[task.failureClass] || 0) + 1;
  });

  return { domains, failureClasses };
};

export type TaskRotationIssue = {
  taskId: string;
  issue: string;
};

export type TaskRotationReport = {
  ok: boolean;
  issues: TaskRotationIssue[];
};

export const validateTaskRotation = (tasks: EvaluationTask[]): TaskRotationReport => {
  const issues: TaskRotationIssue[] = [];
  const taskMap = new Map(tasks.map((task) => [task.taskId, task]));

  const seen = new Set<string>();
  tasks.forEach((task) => {
    if (seen.has(task.taskId)) {
      issues.push({ taskId: task.taskId, issue: "duplicate_task_id" });
    }
    seen.add(task.taskId);

    if (task.status === "deprecated") {
      if (!task.replacedBy) {
        issues.push({ taskId: task.taskId, issue: "deprecated_without_replacement" });
        return;
      }
      const replacement = taskMap.get(task.replacedBy);
      if (!replacement) {
        issues.push({ taskId: task.taskId, issue: "replacement_missing" });
        return;
      }
      if (replacement.status !== "active") {
        issues.push({ taskId: task.taskId, issue: "replacement_not_active" });
      }
      const oldVersion = parseVersion(task.version);
      const newVersion = parseVersion(replacement.version);
      if (newVersion <= oldVersion) {
        issues.push({ taskId: task.taskId, issue: "replacement_version_not_newer" });
      }
    }
  });

  return { ok: issues.length === 0, issues };
};

export type EvaluationSummary = {
  runId: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  results: EvaluationResult[];
  startedAt: string;
  completedAt: string;
  coverage: EvaluationCoverage;
  rotation: TaskRotationReport;
};

export const runEvaluationSuite = async (tasks: EvaluationTask[] = EVALUATION_TASKS): Promise<EvaluationSummary> => {
  const results: EvaluationResult[] = [];
  const startedAt = new Date().toISOString();

  for (const task of tasks) {
    const result = await runEvaluationTask(task);
    results.push(result);
  }

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  const coverage = buildCoverageReport(tasks);
  const rotation = validateTaskRotation(tasks);

  return {
    runId: createId("eval"),
    total: results.length,
    passed,
    failed,
    passRate: results.length === 0 ? 0 : passed / results.length,
    results,
    startedAt,
    completedAt: new Date().toISOString(),
    coverage,
    rotation,
  };
};

export type EvaluationRun = {
  runId: string;
  tasks: EvaluationTask[];
  summary: EvaluationSummary;
};

export type EvaluationLedger = {
  record: (run: EvaluationRun) => void;
  list: () => EvaluationRun[];
  latest: () => EvaluationRun | null;
};

export const createEvaluationLedger = (): EvaluationLedger => {
  const history: EvaluationRun[] = [];
  return {
    record: (run) => {
      history.push(run);
    },
    list: () => [...history],
    latest: () => (history.length > 0 ? history[history.length - 1] : null),
  };
};

export type EvaluationDiff = {
  improved: string[];
  regressed: string[];
  unchanged: string[];
};

export const compareEvaluationRuns = (baseline: EvaluationSummary, current: EvaluationSummary): EvaluationDiff => {
  const baselineMap = new Map(baseline.results.map((result) => [result.taskId, result.passed]));
  const currentMap = new Map(current.results.map((result) => [result.taskId, result.passed]));
  const allTaskIds = new Set<string>([...baselineMap.keys(), ...currentMap.keys()]);

  const improved: string[] = [];
  const regressed: string[] = [];
  const unchanged: string[] = [];

  allTaskIds.forEach((taskId) => {
    const before = baselineMap.get(taskId);
    const after = currentMap.get(taskId);
    if (before === undefined || after === undefined) {
      unchanged.push(taskId);
      return;
    }
    if (before === false && after === true) {
      improved.push(taskId);
    } else if (before === true && after === false) {
      regressed.push(taskId);
    } else {
      unchanged.push(taskId);
    }
  });

  return { improved, regressed, unchanged };
};

export type RegressionGuard = {
  allowed: boolean;
  reason: string;
  passRateDelta: number;
  diff: EvaluationDiff;
};

export const checkRegressionGuard = (
  baseline: EvaluationSummary,
  current: EvaluationSummary
): RegressionGuard => {
  const diff = compareEvaluationRuns(baseline, current);
  const passRateDelta = current.passRate - baseline.passRate;

  if (diff.regressed.length > 0) {
    return {
      allowed: false,
      reason: "task_regression",
      passRateDelta,
      diff,
    };
  }

  if (passRateDelta < 0) {
    return {
      allowed: false,
      reason: "pass_rate_regression",
      passRateDelta,
      diff,
    };
  }

  return {
    allowed: true,
    reason: "no_regression",
    passRateDelta,
    diff,
  };
};

export type FailureDebtPolicy = {
  windowRuns: number;
  blockOnCriticalFailures: boolean;
  escalationFailureCount: number;
};

export const defaultFailureDebtPolicy: FailureDebtPolicy = {
  windowRuns: 5,
  blockOnCriticalFailures: true,
  escalationFailureCount: 3,
};

export type FailureDebtReport = {
  totalFailures: number;
  byTask: Record<string, number>;
  byFailureClass: Record<FailureClass, number>;
  criticalFailures: string[];
  blocked: boolean;
  escalated: boolean;
  reasons: string[];
};

export const accumulateFailureDebt = (
  tasks: EvaluationTask[],
  history: EvaluationRun[],
  policy: FailureDebtPolicy = defaultFailureDebtPolicy
): FailureDebtReport => {
  const window = history.slice(-policy.windowRuns);
  const taskPriority = new Map(tasks.map((task) => [task.taskId, task.priority as EvaluationPriority]));
  const taskFailureClass = new Map(tasks.map((task) => [task.taskId, task.failureClass]));

  const byTask: Record<string, number> = {};
  const byFailureClass: Record<FailureClass, number> = {
    schema: 0,
    policy: 0,
    budget: 0,
    scope: 0,
    regression: 0,
    stability: 0,
    unknown: 0,
  };

  window.forEach((run) => {
    run.summary.results.forEach((result) => {
      if (result.passed) return;
      byTask[result.taskId] = (byTask[result.taskId] || 0) + 1;
      const failureClass = taskFailureClass.get(result.taskId) || "unknown";
      byFailureClass[failureClass] = (byFailureClass[failureClass] || 0) + 1;
    });
  });

  const criticalFailures = Object.keys(byTask).filter(
    (taskId) => taskPriority.get(taskId) === "critical" && byTask[taskId] > 0
  );

  const totalFailures = Object.values(byTask).reduce((sum, count) => sum + count, 0);
  const blocked = policy.blockOnCriticalFailures && criticalFailures.length > 0;
  const escalated = totalFailures >= policy.escalationFailureCount;
  const reasons: string[] = [];

  if (blocked) reasons.push("critical_failures_block_autonomy");
  if (escalated) reasons.push("failure_debt_escalation");

  return {
    totalFailures,
    byTask,
    byFailureClass,
    criticalFailures,
    blocked,
    escalated,
    reasons,
  };
};

export type EvaluationVisibility = {
  improved: string[];
  regressed: string[];
  unchanged: string[];
};

export const buildEvaluationVisibility = (
  baseline: EvaluationSummary,
  current: EvaluationSummary
): EvaluationVisibility => compareEvaluationRuns(baseline, current);
