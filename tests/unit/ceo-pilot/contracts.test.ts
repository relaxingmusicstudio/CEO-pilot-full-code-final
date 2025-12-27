import { describe, expect, it } from "vitest";
import { validateContract } from "../../../src/lib/ceoPilot/contracts";

const FIXED_NOW = "2025-01-01T00:00:00.000Z";

describe("ceoPilot contracts", () => {
  it("accepts a valid execution plan", () => {
    const plan = {
      planId: "plan-1",
      objective: "Test plan",
      tasks: [
        {
          taskId: "task-1",
          description: "Do the thing",
          intent: "test",
          expectedOutcome: "plan passes",
          constraints: [],
          requiresApproval: false,
        },
      ],
      createdAt: FIXED_NOW,
      source: "planner",
    };

    const parsed = validateContract("plan", plan);
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown fields", () => {
    const plan = {
      planId: "plan-2",
      objective: "Test plan",
      tasks: [
        {
          taskId: "task-1",
          description: "Do the thing",
          intent: "test",
          expectedOutcome: "plan passes",
          constraints: [],
          requiresApproval: false,
        },
      ],
      createdAt: FIXED_NOW,
      source: "planner",
      extraField: "not allowed",
    };

    const parsed = validateContract("plan", plan);
    expect(parsed.success).toBe(false);
  });
});
