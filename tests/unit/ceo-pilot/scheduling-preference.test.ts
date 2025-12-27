import { describe, expect, it } from "vitest";
import { enforceRuntimeGovernance } from "../../../src/lib/ceoPilot/runtimeGovernance";
import { upsertSchedulingPreference, loadScheduledTasks } from "../../../src/lib/ceoPilot/runtimeState";
import { buildTestAgentContext } from "../helpers/agentContext";

describe("ceoPilot scheduling preferences", () => {
  it("defers tasks when a scheduling preference is active", async () => {
    const identityKey = "test:scheduling:pref";
    upsertSchedulingPreference(identityKey, {
      preferenceId: "sched-pref-1",
      identityKey,
      taskType: "action:task",
      policy: {
        policyId: "policy-deferred",
        mode: "deferred",
        urgency: "low",
        batchWindowMinutes: 60,
        createdAt: "2025-01-01T00:00:00.000Z",
      },
      reason: "batch low urgency",
      status: "active",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });

    const context = buildTestAgentContext("task", {
      taskType: "action:task",
      taskId: "task-sched",
      permissionTier: "suggest",
    });

    const decision = await enforceRuntimeGovernance(identityKey, context, "agent");
    expect(decision.allowed).toBe(false);
    expect(decision.details.scheduling?.executeNow).toBe(false);

    const scheduled = loadScheduledTasks(identityKey);
    expect(scheduled.length).toBeGreaterThan(0);
    expect(scheduled[0]?.taskType).toBe("action:task");
  });
});
