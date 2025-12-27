import { describe, expect, it } from "vitest";
import { createToolUsageStore } from "../../../src/lib/ceoPilot/adaptation";
import { buildToolSkillProfile } from "../../../src/lib/ceoPilot/toolSkills";

const FIXED_NOW = "2025-01-01T00:00:00.000Z";
const LATER = "2025-01-01T00:00:10.000Z";

describe("ceoPilot tool skills", () => {
  it("improves reliability after successful runs", () => {
    const store = createToolUsageStore();

    store.record({
      eventId: "evt-1",
      tool: "tool-a",
      status: "failure",
      failureType: "timeout",
      latencyMs: 900,
      costCents: 2,
      timestamp: FIXED_NOW,
    });
    store.record({
      eventId: "evt-2",
      tool: "tool-a",
      status: "failure",
      failureType: "tool_runtime_error",
      latencyMs: 1100,
      costCents: 2,
      timestamp: FIXED_NOW,
    });

    const baseline = buildToolSkillProfile("tool-a", store, { now: FIXED_NOW });

    store.record({
      eventId: "evt-3",
      tool: "tool-a",
      status: "success",
      latencyMs: 240,
      costCents: 1,
      timestamp: LATER,
    });
    store.record({
      eventId: "evt-4",
      tool: "tool-a",
      status: "success",
      latencyMs: 220,
      costCents: 1,
      timestamp: LATER,
    });
    store.record({
      eventId: "evt-5",
      tool: "tool-a",
      status: "success",
      latencyMs: 210,
      costCents: 1,
      timestamp: LATER,
    });

    store.record({
      eventId: "evt-b1",
      tool: "tool-b",
      status: "success",
      latencyMs: 120,
      costCents: 1,
      timestamp: LATER,
    });
    store.record({
      eventId: "evt-c1",
      tool: "tool-c",
      status: "failure",
      failureType: "tool_runtime_error",
      latencyMs: 450,
      costCents: 2,
      timestamp: LATER,
    });

    const improved = buildToolSkillProfile("tool-a", store, {
      now: LATER,
      fallbackTools: ["tool-b", "tool-c"],
    });

    expect(improved.reliabilityScore).toBeGreaterThan(baseline.reliabilityScore);
    expect(improved.fallbackOrder).toEqual(["tool-b", "tool-c"]);
  });
});
