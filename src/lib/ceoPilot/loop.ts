import {
  ExecutionPlan,
  ExecutionReport,
  LoopResult,
  VerificationReport,
  assertContract,
} from "./contracts";
import { createId, nowIso } from "./utils";

export type PlannerContext = Record<string, unknown>;

export type Planner = (context: PlannerContext) => ExecutionPlan;
export type Executor = (
  plan: ExecutionPlan,
  context: PlannerContext
) => Promise<ExecutionReport> | ExecutionReport;
export type Verifier = (
  plan: ExecutionPlan,
  execution: ExecutionReport,
  context: PlannerContext
) => Promise<VerificationReport> | VerificationReport;
export type Replanner = (
  plan: ExecutionPlan,
  execution: ExecutionReport,
  verification: VerificationReport,
  context: PlannerContext
) => Promise<ExecutionPlan | null> | ExecutionPlan | null;

export type LoopOptions = {
  maxIterations?: number;
};

export const runShortLoop = async (
  planner: Planner,
  executor: Executor,
  verifier: Verifier,
  replanner: Replanner,
  context: PlannerContext = {},
  options: LoopOptions = {}
): Promise<LoopResult> => {
  const loopId = createId("loop");
  const maxIterations = options.maxIterations ?? 1;
  let currentPlan = assertContract<ExecutionPlan>("plan", planner(context));

  let execution: ExecutionReport | null = null;
  let verification: VerificationReport | null = null;
  let nextPlan: ExecutionPlan | null = null;

  try {
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      execution = assertContract<ExecutionReport>("executionReport", await executor(currentPlan, context));
      verification = assertContract<VerificationReport>("verificationReport", await verifier(currentPlan, execution, context));

      if (verification.status === "pass") {
        return {
          loopId,
          plan: currentPlan,
          execution,
          verification,
          status: "complete",
        };
      }

      nextPlan = await replanner(currentPlan, execution, verification, context);
      if (!nextPlan) {
        return {
          loopId,
          plan: currentPlan,
          execution,
          verification,
          status: "blocked",
          error: {
            code: "REPLAN_REQUIRED",
            message: "replanner did not return a next plan",
          },
        };
      }

      currentPlan = assertContract<ExecutionPlan>("plan", nextPlan);
    }

    if (!execution || !verification) {
      return {
        loopId,
        plan: currentPlan,
        execution: {
          executionId: createId("exec"),
          planId: currentPlan.planId,
          taskId: currentPlan.tasks[0]?.taskId || "unknown",
          toolCalls: [],
          toolResults: [],
          startedAt: nowIso(),
          completedAt: nowIso(),
        },
        verification: {
          reportId: createId("verify"),
          planId: currentPlan.planId,
          taskId: currentPlan.tasks[0]?.taskId || "unknown",
          status: "fail",
          checks: [
            {
              checkId: "loop_incomplete",
              description: "Loop did not reach execution/verification",
              passed: false,
              evidenceRefs: [],
            },
          ],
          verifiedAt: nowIso(),
        },
        status: "blocked",
        error: {
          code: "LOOP_INCOMPLETE",
          message: "execution or verification missing",
        },
      };
    }

    return {
      loopId,
      plan: currentPlan,
      execution,
      verification,
      nextPlan: currentPlan,
      status: "replan_required",
      error: {
        code: "MAX_ITERATIONS",
        message: "max iterations reached without passing verification",
      },
    };
  } catch (error) {
    return {
      loopId,
      plan: currentPlan,
      execution: execution || {
        executionId: createId("exec"),
        planId: currentPlan.planId,
        taskId: currentPlan.tasks[0]?.taskId || "unknown",
        toolCalls: [],
        toolResults: [],
        startedAt: nowIso(),
        completedAt: nowIso(),
      },
      verification: verification || {
        reportId: createId("verify"),
        planId: currentPlan.planId,
        taskId: currentPlan.tasks[0]?.taskId || "unknown",
        status: "fail",
        checks: [
          {
            checkId: "loop_exception",
            description: "Loop failed during execution",
            passed: false,
            evidenceRefs: [],
            details: { message: error instanceof Error ? error.message : "unknown_error" },
          },
        ],
        verifiedAt: nowIso(),
      },
      status: "blocked",
      error: {
        code: "LOOP_EXCEPTION",
        message: error instanceof Error ? error.message : "unknown_error",
      },
    };
  }
};
