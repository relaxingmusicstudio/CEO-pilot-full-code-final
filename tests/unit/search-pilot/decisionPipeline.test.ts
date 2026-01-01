import { afterEach, describe, expect, it, vi } from "vitest";
import { runSearch } from "../../../apps/search-pilot/src/core/engine";
import * as domains from "../../../apps/search-pilot/src/core/domains";

describe("search decision pipeline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a decision object for each search", async () => {
    const response = await runSearch("HVAC response times in Austin", { latencyMs: 0 });

    expect(response.decision.decision_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.decision.input_hash).toBeTruthy();
    expect(response.decision.recommendation).toBeTruthy();
    expect(response.decision.reasoning).toBeTruthy();
    expect(response.decision.assumptions.length).toBeGreaterThan(0);
    expect(response.decision.confidence).toBeGreaterThanOrEqual(0);
    expect(response.decision.confidence).toBeLessThanOrEqual(1);
    expect(response.decision.status).toBe("proposed");
  });

  it("returns a failed decision when the upstream search fails", async () => {
    vi.spyOn(domains, "queryDomain").mockRejectedValue(new Error("upstream_down"));

    const response = await runSearch("HVAC response times in Austin", { latencyMs: 0 });

    expect(response.decision.status).toBe("failed");
    expect(response.decision.confidence).toBeLessThanOrEqual(0.2);
    expect(response.evidence_summary.resultCount).toBe(0);
  });

  it("returns analytics metadata when analytics is offline", async () => {
    const response = await runSearch("HVAC response times in Austin", {
      latencyMs: 0,
      analytics: () => {
        throw new Error("analytics_down");
      },
    });

    expect(response.decision).toBeTruthy();
    expect(response.analytics?.ok).toBe(false);
    expect(response.analytics?.error).toContain("analytics_down");
  });
});
