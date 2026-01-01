import { describe, expect, it } from "vitest";
import {
  appendInteractionEvent,
  appendSearchEvent,
  createMemoryStorage,
  loadLedgerPage,
} from "../../../apps/search-pilot/src/core/ledger";
import type { SearchResponse } from "../../../apps/search-pilot/src/core/types";

describe("search ledger", () => {
  it("appends search and interaction events without mutation", () => {
    const storage = createMemoryStorage();
    const ownerId = "test";

    const response: SearchResponse = {
      query: "HVAC in Austin",
      intent: {
        raw: "HVAC in Austin",
        normalized: "hvac in austin",
        primitives: [],
        ambiguity: { level: "high", reasons: [] },
      },
      domains: ["local_listings"],
      decision: {
        decision_id: "dec-test",
        input_hash: "input-test",
        recommendation: "Run a small outreach test.",
        reasoning: "Test reasoning.",
        assumptions: ["Test assumption."],
        confidence: 0.4,
        status: "proposed",
        created_at: "2024-01-10T12:00:00Z",
      },
      explanation: "Test explanation",
      evidence_summary: {
        resultCount: 1,
        domainCounts: [{ domain: "local_listings", count: 1 }],
        categoryHighlights: ["HVAC"],
        notes: ["Test note"],
      },
    };

    const searchEntry = appendSearchEvent(ownerId, response, storage);
    appendInteractionEvent(ownerId, searchEntry.entryId, "save", "dec-test", storage);

    const page = loadLedgerPage(ownerId, 10, undefined, storage);

    expect(page.entries.length).toBe(2);
    expect(page.entries[0].eventType).toBe("search");
    expect(page.entries[1].eventType).toBe("interaction");
  });
});
