import { describe, expect, it } from "vitest";
import { runEvaluationSuite } from "../../../src/lib/ceoPilot/evaluation";

describe("ceoPilot evaluation suite", () => {
  it("passes the default suite", async () => {
    const summary = await runEvaluationSuite();
    expect(summary.failed).toBe(0);
    expect(summary.passed).toBe(summary.total);
  });
});
