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
      results: [
        {
          id: "northwind-hvac",
          name: "Northwind HVAC",
          category: "HVAC",
          summary: "Test summary",
          tags: ["hvac"],
          evidence: [],
          domains: ["local_listings"],
          scores: { relevance: 1, confidence: 1, freshness: 1, agreement: 1, finalScore: 1 },
          confidenceExplanation: "Test",
        },
      ],
      explanation: "Test explanation",
    };

    const searchEntry = appendSearchEvent(ownerId, response, storage);
    appendInteractionEvent(ownerId, searchEntry.entryId, "save", "northwind-hvac", storage);

    const page = loadLedgerPage(ownerId, 10, undefined, storage);

    expect(page.entries.length).toBe(2);
    expect(page.entries[0].eventType).toBe("search");
    expect(page.entries[1].eventType).toBe("interaction");
  });
});
