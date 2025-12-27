import { describe, expect, it } from "vitest";
import {
  checkRegressionGuard,
  validateTaskRotation,
} from "../../../src/lib/ceoPilot/evaluation";

const coverage = {
  domains: {
    safety: 1,
    memory: 0,
    tooling: 1,
    coordination: 0,
    trust: 0,
    contract: 0,
    system: 0,
  },
  failureClasses: {
    schema: 1,
    policy: 1,
    budget: 0,
    scope: 0,
    regression: 0,
    stability: 0,
    unknown: 0,
  },
};

describe("ceoPilot evaluation drift prevention", () => {
  it("flags regressions between evaluation runs", () => {
    const baseline = {
      runId: "run-1",
      total: 2,
      passed: 2,
      failed: 0,
      passRate: 1,
      results: [
        { taskId: "t1", passed: true, details: "ok" },
        { taskId: "t2", passed: true, details: "ok" },
      ],
      startedAt: "2025-01-01T00:00:00.000Z",
      completedAt: "2025-01-01T00:00:01.000Z",
      coverage,
      rotation: { ok: true, issues: [] },
    };

    const current = {
      runId: "run-2",
      total: 2,
      passed: 1,
      failed: 1,
      passRate: 0.5,
      results: [
        { taskId: "t1", passed: true, details: "ok" },
        { taskId: "t2", passed: false, details: "failed" },
      ],
      startedAt: "2025-01-02T00:00:00.000Z",
      completedAt: "2025-01-02T00:00:01.000Z",
      coverage,
      rotation: { ok: true, issues: [] },
    };

    const guard = checkRegressionGuard(baseline, current);
    expect(guard.allowed).toBe(false);
    expect(guard.reason).toBe("task_regression");
  });

  it("requires replacements for deprecated tasks", () => {
    const report = validateTaskRotation([
      {
        taskId: "legacy-task",
        version: "v1",
        status: "deprecated",
        replacedBy: undefined,
        domain: "system",
        failureClass: "unknown",
        priority: "low",
        type: "contract_validation",
        description: "Legacy",
        input: {},
        expected: {},
        tags: [],
      },
    ]);

    expect(report.ok).toBe(false);
    expect(report.issues[0]?.issue).toBe("deprecated_without_replacement");
  });
});
