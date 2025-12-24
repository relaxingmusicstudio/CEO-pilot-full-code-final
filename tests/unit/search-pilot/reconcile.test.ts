import { describe, expect, it } from "vitest";
import type { CanonicalFact } from "../../../apps/search-pilot/src/core/types";
import { reconcileFacts } from "../../../apps/search-pilot/src/core/domains";

describe("reconcileFacts", () => {
  it("groups facts by entity and merges evidence", () => {
    const facts: CanonicalFact[] = [
      {
        entityId: "northwind-hvac",
        name: "Northwind HVAC",
        category: "HVAC",
        location: "Austin, TX",
        tags: ["hvac", "austin"],
        claims: ["Listing notes 24/7 dispatch."],
        signals: [
          {
            id: "local:1",
            domain: "local_listings",
            signalId: "local-1",
            excerpt: "24/7 dispatch",
            timestamp: "2024-01-10T12:00:00Z",
          },
        ],
        domain: "local_listings",
        confidence: 0.8,
        timestamp: "2024-01-10T12:00:00Z",
      },
      {
        entityId: "northwind-hvac",
        name: "Northwind HVAC",
        category: "HVAC",
        location: "Austin, TX",
        tags: ["hvac", "maintenance"],
        claims: ["Website lists maintenance plan."],
        signals: [
          {
            id: "web:1",
            domain: "websites",
            signalId: "web-1",
            excerpt: "Maintenance plan",
            timestamp: "2024-01-12T12:00:00Z",
          },
        ],
        domain: "websites",
        confidence: 0.7,
        timestamp: "2024-01-12T12:00:00Z",
      },
    ];

    const results = reconcileFacts(facts);

    expect(results).toHaveLength(1);
    expect(results[0].domains).toContain("local_listings");
    expect(results[0].domains).toContain("websites");
    expect(results[0].evidence.length).toBe(2);
  });
});
