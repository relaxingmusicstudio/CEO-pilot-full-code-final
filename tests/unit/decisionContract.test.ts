import { describe, expect, it } from "vitest";
import { clampConfidence, nowIso } from "../../src/contracts/decision";
import { buildDecision } from "../../api/resolve-decision";

describe("decision contract helpers", () => {
  it("clamps confidence between 0 and 100", () => {
    expect(clampConfidence(-10)).toBe(0);
    expect(clampConfidence(110)).toBe(100);
    expect(clampConfidence(42)).toBe(42);
  });

  it("nowIso returns a parseable ISO timestamp", () => {
    const value = nowIso();
    expect(Number.isNaN(Date.parse(value))).toBe(false);
  });
});

describe("resolve decision output", () => {
  it("returns required fields and uncertainty notes when confidence is low", () => {
    const decision = buildDecision("test query", "");
    expect(decision.decision_id).toBeTruthy();
    expect(decision.query).toBe("test query");
    expect(decision.recommendation).toBeTruthy();
    expect(decision.reasoning).toBeTruthy();
    expect(decision.assumptions.length).toBeGreaterThan(0);
    expect(decision.next_action).toBeTruthy();
    expect(decision.status).toBe("proposed");
    expect(Number.isNaN(Date.parse(decision.created_at))).toBe(false);

    if (decision.confidence < 60) {
      expect(decision.uncertainty_notes.length).toBeGreaterThan(0);
    }
  });
});
