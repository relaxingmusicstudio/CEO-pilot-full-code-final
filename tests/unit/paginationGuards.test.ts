import { describe, expect, it } from "vitest";
import { appendRevenueLedger, loadRevenueLedgerPage, nextRevenueTimestamp } from "../../src/lib/revenueKernel/ledger";
import { createThreadStoreState, appendThreadEntry, createThread, getThreadEntriesPage } from "../../src/lib/lifelongThreads";
import { executed } from "../../src/lib/decisionOutcome";
import type { ActionSpec } from "../../src/types/actions";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const makeStorage = (): StorageLike => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
};

describe("pagination guards", () => {
  it("paginates revenue ledger entries", () => {
    const storage = makeStorage();
    const identity = "tester";
    for (let i = 0; i < 25; i += 1) {
      const timestamp = nextRevenueTimestamp(identity, storage);
      const action: ActionSpec = {
        action_id: `act-${i}`,
        action_type: "note",
        description: "ledger event",
        intent_id: `intent-${i}`,
        expected_metric: "metric",
        risk_level: "low",
        irreversible: false,
        payload: {},
        costUnits: 2,
        costCategory: "compute",
      };
      appendRevenueLedger(
        identity,
        {
          timestamp,
          identity,
          action,
          outcome: executed("ok"),
          evidence_ref: {
            provider: "mock",
            mode: "MOCK",
            request_hash: `req-${i}`,
            status: "mock",
            timestamp,
          },
        },
        storage
      );
    }

    const page = loadRevenueLedgerPage(identity, 10, null, storage);
    expect(page.entries).toHaveLength(10);
    expect(page.nextCursor).not.toBeNull();
  });

  it("paginates thread entries", () => {
    let state = createThreadStoreState();
    const threadResult = createThread(state, { owner_id: "owner-1" });
    state = threadResult.state;
    for (let i = 0; i < 30; i += 1) {
      const res = appendThreadEntry(state, {
        thread_id: threadResult.thread.thread_id,
        author_type: "user",
        content_text: `entry-${i}`,
      });
      state = res.state;
    }

    const page = getThreadEntriesPage(state, {
      thread_id: threadResult.thread.thread_id,
      requester: { owner_id: "owner-1" },
      limit: 10,
    });
    expect(page.entries).toHaveLength(10);
    expect(page.nextCursor).not.toBeNull();
  });
});
