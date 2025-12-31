import { beforeEach, describe, expect, it } from "vitest";
import {
  recallDecisions,
  resetDecisionMemory,
  writeDecisionRecord,
  type DecisionRecord,
} from "../../src/kernel/memory/collectiveMemory";

const buildRecord = (overrides: Partial<DecisionRecord> = {}): DecisionRecord => ({
  intent: "review pricing experiment",
  decision: "pause experiment",
  rationale: "Conversion dropped below threshold for three days.",
  timestamp: new Date().toISOString(),
  initiatingRole: "ceo",
  outcome: "failure",
  ...overrides,
});

describe("collective memory", () => {
  beforeEach(() => {
    resetDecisionMemory();
  });

  it("prioritizes failures when recalling repeated intent", () => {
    writeDecisionRecord(
      buildRecord({
        intent: "launch upsell flow",
        outcome: "failure",
        decision: "halt upsell flow",
        rationale: "Chargebacks spiked after launch.",
      }),
      { actor: "kernel", rationale: "Record failed launch." }
    );
    writeDecisionRecord(
      buildRecord({
        intent: "launch upsell flow",
        outcome: "success",
        decision: "retry with new pricing",
        rationale: "New checkout reduced refunds.",
      }),
      { actor: "kernel", rationale: "Record successful retry." }
    );

    const recall = recallDecisions("launch upsell flow");
    expect(recall.matches.length).toBe(2);
    expect(recall.counts.failures).toBe(1);
    expect(recall.matches[0].outcome).toBe("failure");
  });

  it("blocks UI writes to memory", () => {
    expect(() =>
      writeDecisionRecord(buildRecord(), { actor: "ui", rationale: "User click." })
    ).toThrow("memory_write_denied");
  });

  it("allows kernel writes with explicit rationale", () => {
    writeDecisionRecord(buildRecord({ intent: "approve budget", outcome: "success" }), {
      actor: "kernel",
      rationale: "Kernel approved budget decision.",
    });

    const recall = recallDecisions("approve budget");
    expect(recall.matches.length).toBe(1);
    expect(recall.matches[0].outcome).toBe("success");
  });
});
