import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { detectDrift } from "../../../src/lib/ceoPilot/drift/detectDrift";
import { DEFAULT_VALUE_ANCHORS } from "../../../src/lib/ceoPilot/valueAnchors";
import { hashString, stableStringify } from "../../../src/lib/ceoPilot/utils";

type Fixture = {
  fixtureVersion: string;
  expectedHash: string;
  input: {
    now: string;
    baselineDays: number;
    recentDays: number;
    minSamples: number;
    outcomes: unknown[];
    modelRoutingHistory: unknown[];
    costEvents: unknown[];
    improvementRuns: unknown[];
  };
  expected: Record<string, unknown>;
};

const fixtureUrl = new URL("../../fixtures/value-drift-golden.json", import.meta.url);
const changelogUrl = new URL("../../../docs/governance/value-drift-changelog.md", import.meta.url);

const loadFixture = (): Fixture => {
  const raw = fs.readFileSync(fixtureUrl, "utf8");
  return JSON.parse(raw) as Fixture;
};

const normalizeReport = (report: Record<string, unknown>) => ({
  ...report,
  reportId: "drift-fixture",
  reasons: Array.isArray(report.reasons) ? [...report.reasons].sort() : report.reasons,
});

describe("value drift golden fixture", () => {
  it("matches expected report output and changelog entry", () => {
    const fixture = loadFixture();
    const anchor = DEFAULT_VALUE_ANCHORS[0];

    const report = detectDrift({
      identityKey: "golden:drift",
      anchor,
      outcomes: fixture.input.outcomes,
      modelRoutingHistory: fixture.input.modelRoutingHistory,
      costEvents: fixture.input.costEvents,
      improvementRuns: fixture.input.improvementRuns,
      now: fixture.input.now,
      baselineDays: fixture.input.baselineDays,
      recentDays: fixture.input.recentDays,
      minSamples: fixture.input.minSamples,
    });

    const normalized = normalizeReport(report as Record<string, unknown>);
    const expected = normalizeReport(fixture.expected);

    expect(stableStringify(normalized)).toBe(stableStringify(expected));

    const expectedHash = hashString(stableStringify(expected));
    expect(expectedHash).toBe(fixture.expectedHash);
    expect(anchor.anchorId).toBe(fixture.expected.anchorId);
    expect(anchor.version).toBe(fixture.expected.anchorVersion);

    const changelog = fs.readFileSync(changelogUrl, "utf8");
    expect(changelog).toContain(fixture.fixtureVersion);
    expect(changelog).toContain(fixture.expectedHash);
  });
});
