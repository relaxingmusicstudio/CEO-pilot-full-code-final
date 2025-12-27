import { describe, expect, it } from "vitest";
import {
  applyMemoryDecay,
  createMemoryStore,
  retrieveMemory,
  writeMemory,
} from "../../../src/lib/ceoPilot/memory";

const FIXED_NOW = "2025-01-01T00:00:00.000Z";

describe("ceoPilot memory", () => {
  it("enforces tenant scoping", () => {
    const store = createMemoryStore();
    const record = {
      memoryId: "mem-1",
      kind: "fact" as const,
      subject: "Scoped note",
      data: { value: "only tenant 1" },
      confidence: 0.8,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      scope: { tenantId: "tenant-1", userId: "user-1" },
      source: "system" as const,
      tags: [],
    };

    writeMemory(store, record, {
      permissionTier: "execute",
      verificationStatus: "pass",
      source: "system",
    });

    const mismatched = retrieveMemory(store, {
      scope: { tenantId: "tenant-2", userId: "user-1" },
      now: FIXED_NOW,
    });
    const matched = retrieveMemory(store, {
      scope: { tenantId: "tenant-1", userId: "user-1" },
      now: FIXED_NOW,
    });

    expect(mismatched).toHaveLength(0);
    expect(matched).toHaveLength(1);
  });

  it("decays confidence over time", () => {
    const oldRecord = {
      memoryId: "mem-2",
      kind: "fact" as const,
      subject: "Old fact",
      data: { value: "old" },
      confidence: 0.9,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      scope: { tenantId: "tenant-1" },
      source: "system" as const,
      tags: [],
    };

    const decayed = applyMemoryDecay(oldRecord, Date.parse(FIXED_NOW), {
      minConfidenceToWrite: 0.5,
      minConfidenceToRetrieve: 0.3,
      expireAfterMs: 1000 * 60 * 60 * 24 * 365,
      decayAfterMs: 0,
      decayIntervalMs: 1000 * 60 * 60 * 24,
      decayFactor: 0.5,
      requireVerificationForKinds: [],
      requireExecuteTierForKinds: [],
      maxRecords: 100,
    });

    expect(decayed.confidence).toBeLessThan(oldRecord.confidence);
  });
});
