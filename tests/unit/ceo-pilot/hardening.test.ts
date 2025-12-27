import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runAction } from "../../../src/lib/actionRunner";
import { createGovernedTool } from "../../../src/lib/ceoPilot/tooling";
import { runPipelineStep } from "../../../src/lib/revenueKernel/pipeline";
import { computeActionId, type ActionSpec } from "../../../src/types/actions";
import { buildTestAgentContext } from "../helpers/agentContext";

const buildAction = (overrides: Partial<Omit<ActionSpec, "action_id">> = {}): ActionSpec => {
  const base: Omit<ActionSpec, "action_id"> = {
    action_type: "task",
    description: "Hardening test action",
    intent_id: "intent-hardening",
    expected_metric: "metric",
    risk_level: "low",
    irreversible: false,
    payload: {},
    ...overrides,
  };
  return { ...base, action_id: computeActionId(base) };
};

describe("governance hardening", () => {
  it("runAction throws without governance context", async () => {
    const action = buildAction();
    await expect(runAction(action, { mode: "MOCK", trustLevel: 1 })).rejects.toThrow(
      "governance_context_required"
    );
  });

  it("tool execute throws without invokeTool context", async () => {
    const tool = createGovernedTool({
      name: "echo",
      version: "1",
      inputSchema: z.object({ name: z.string() }).strict(),
      outputSchema: z.object({ ok: z.boolean() }).strict(),
      impact: "reversible" as const,
      permissionTiers: ["suggest", "execute"],
      execute: () => ({ ok: true }),
    });

    await expect(tool.execute({ name: "test" }, undefined as never)).rejects.toThrow(
      "tool_governance_context_required"
    );
  });

  it("pipeline path still executes with governance context", async () => {
    const action = buildAction();
    const result = await runPipelineStep({
      action,
      identity: { userId: "u-hardening" },
      policyContext: { mode: "MOCK", trustLevel: 1 },
      agentContext: buildTestAgentContext(action.action_type),
    });
    expect(result.outcome.type).toBe("executed");
  });
});
