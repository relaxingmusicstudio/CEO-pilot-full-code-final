import { beforeEach, describe, expect, it } from "vitest";
import {
  recallDecisions,
  resetDecisionMemory,
  writeActionRecord,
  writeDecisionRecord,
  writeOutcomeRecord,
  type DecisionRecord,
} from "../../src/kernel/memory/collectiveMemory";

const buildDecision = (overrides: Partial<Omit<DecisionRecord, "id">> = {}) => ({
  intent: "review pricing experiment",
  decision: "pause experiment",
  rationale: "Conversion dropped below threshold for three days.",
  timestamp: new Date().toISOString(),
  initiatingRole: "ceo",
  ...overrides,
});

const buildAction = (decisionId: string, overrides: Partial<{ action: string; timestamp: string }> = {}) => ({
  decisionId,
  action: "invoke:pricing-experiment",
  timestamp: new Date().toISOString(),
  ...overrides,
});

const buildOutcome = (
  decisionId: string,
  actionId: string | null,
  overrides: Partial<{
    outcome: "success" | "failure" | "unknown";
    details: string;
    timestamp: string;
  }> = {}
) => ({
  decisionId,
  actionId,
  outcome: "failure" as const,
  details: "Conversion dropped below threshold.",
  timestamp: new Date().toISOString(),
  ...overrides,
});

const kernelPolicy = { actor: "kernel" as const, rationale: "Kernel memory write." };

describe("collective memory", () => {
  beforeEach(() => {
    resetDecisionMemory();
  });

  it("prioritizes failures when recalling repeated intent", () => {
    const failedDecision = writeDecisionRecord(
      buildDecision({
        intent: "launch upsell flow",
        decision: "halt upsell flow",
        rationale: "Chargebacks spiked after launch.",
      }),
      kernelPolicy
    );
    const failedAction = writeActionRecord(buildAction(failedDecision.id), kernelPolicy);
    writeOutcomeRecord(
      buildOutcome(failedDecision.id, failedAction.id, {
        outcome: "failure",
        details: "Chargebacks spiked after launch.",
      }),
      kernelPolicy
    );

    const successDecision = writeDecisionRecord(
      buildDecision({
        intent: "launch upsell flow",
        decision: "retry with new pricing",
        rationale: "New checkout reduced refunds.",
      }),
      kernelPolicy
    );
    const successAction = writeActionRecord(buildAction(successDecision.id), kernelPolicy);
    writeOutcomeRecord(
      buildOutcome(successDecision.id, successAction.id, {
        outcome: "success",
        details: "New checkout reduced refunds.",
      }),
      kernelPolicy
    );

    const recall = recallDecisions("launch upsell flow");
    expect(recall.matches.length).toBe(2);
    expect(recall.counts.failures).toBe(1);
    expect(recall.matches[0].outcome.outcome).toBe("failure");
  });

  it("blocks non-kernel writes to memory", () => {
    const decision = writeDecisionRecord(buildDecision(), kernelPolicy);

    expect(() =>
      writeActionRecord(buildAction(decision.id), { actor: "ui", rationale: "User click." })
    ).toThrow("memory_write_denied");

    expect(() =>
      writeOutcomeRecord(
        buildOutcome(decision.id, null, { outcome: "unknown", details: "UI attempt." }),
        { actor: "search", rationale: "Search attempt." }
      )
    ).toThrow("memory_write_denied");
  });

  it("weights outcomes by recency and reduces confidence on failure", () => {
    const olderTimestamp = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const recentTimestamp = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const olderDecision = writeDecisionRecord(
      buildDecision({
        intent: "review pricing experiment",
        decision: "continue experiment",
        rationale: "Early results positive.",
        timestamp: olderTimestamp,
      }),
      kernelPolicy
    );
    const olderAction = writeActionRecord(
      buildAction(olderDecision.id, { timestamp: olderTimestamp }),
      kernelPolicy
    );
    writeOutcomeRecord(
      buildOutcome(olderDecision.id, olderAction.id, {
        outcome: "success",
        details: "Early results positive.",
        timestamp: olderTimestamp,
      }),
      kernelPolicy
    );

    const recentDecision = writeDecisionRecord(
      buildDecision({
        intent: "review pricing experiment",
        decision: "continue experiment",
        rationale: "Recent results positive.",
        timestamp: recentTimestamp,
      }),
      kernelPolicy
    );
    const recentAction = writeActionRecord(
      buildAction(recentDecision.id, { timestamp: recentTimestamp }),
      kernelPolicy
    );
    writeOutcomeRecord(
      buildOutcome(recentDecision.id, recentAction.id, {
        outcome: "success",
        details: "Recent results positive.",
        timestamp: recentTimestamp,
      }),
      kernelPolicy
    );

    const failedDecision = writeDecisionRecord(
      buildDecision({
        intent: "review pricing experiment",
        decision: "pause experiment",
        rationale: "Conversion slipped again.",
        timestamp: recentTimestamp,
      }),
      kernelPolicy
    );
    const failedAction = writeActionRecord(
      buildAction(failedDecision.id, { action: "invoke:pause", timestamp: recentTimestamp }),
      kernelPolicy
    );
    writeOutcomeRecord(
      buildOutcome(failedDecision.id, failedAction.id, {
        outcome: "failure",
        details: "Conversion slipped again.",
        timestamp: recentTimestamp,
      }),
      kernelPolicy
    );

    const recall = recallDecisions("review pricing experiment");
    const successMatches = recall.matches.filter((match) => match.outcome.outcome === "success");
    expect(successMatches.length).toBe(2);
    expect(successMatches[0].timeWeight).toBeGreaterThan(successMatches[1].timeWeight);

    const failureMatch = recall.matches.find((match) => match.outcome.outcome === "failure");
    expect(failureMatch).toBeTruthy();
    expect(failureMatch?.confidence).toBeLessThan(successMatches[0].confidence);
  });
});
