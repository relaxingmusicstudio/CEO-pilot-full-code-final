import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { evaluateAction, type PolicyContext } from "../../src/lib/policyEngine";
import { executeActionPipeline } from "../../src/lib/actionPipeline";
import { computeActionId, type ActionSpec } from "../../src/types/actions";
import { buildTestAgentContext } from "./helpers/agentContext";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

const createMemoryStorage = (): StorageLike => {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};

const buildAction = (overrides: Partial<Omit<ActionSpec, "action_id">> = {}): ActionSpec => {
  const base: Omit<ActionSpec, "action_id"> = {
    action_type: "task",
    description: "Test action",
    intent_id: "intent-test",
    expected_metric: "metric",
    risk_level: "low",
    irreversible: false,
    payload: {},
    ...overrides,
  };
  return { ...base, action_id: computeActionId(base) };
};

describe("policyEngine", () => {
  it("requires confirm and cooldown for high risk", () => {
    const action = buildAction({ risk_level: "high" });
    const ctx: PolicyContext = { mode: "LIVE", trustLevel: 0 };
    const decision = evaluateAction(action, ctx);
    expect(decision.requiresConfirm).toBe(true);
    expect(decision.cooldownSeconds).toBeGreaterThanOrEqual(30);
  });
});

describe("actionPipeline", () => {
  let storage: StorageLike;

  beforeEach(() => {
    storage = createMemoryStorage();
    (globalThis as { localStorage?: StorageLike }).localStorage = storage;
  });

  afterEach(() => {
    storage.clear();
    delete (globalThis as { localStorage?: StorageLike }).localStorage;
  });

  it("blocks offline email actions", async () => {
    const action = buildAction({
      action_type: "email",
      payload: { to: "ops@example.com" },
    });
    const record = await executeActionPipeline(action, {
      identityKey: "tester",
      agentContext: buildTestAgentContext(action.action_type),
    });
    expect(record.status).toBe("blocked");
    expect(record.evidence.value).toContain("OFFLINE");
  });

  it("appends ledger entries without mutating prior records", async () => {
    const action = buildAction();
    const first = await executeActionPipeline(action, {
      identityKey: "tester",
      agentContext: buildTestAgentContext(action.action_type),
    });
    const key = "ppp:execLedger:v1::tester";
    const initial = JSON.parse(storage.getItem(key) || "[]") as unknown[];
    expect(initial).toHaveLength(1);
    const second = await executeActionPipeline(action, {
      identityKey: "tester",
      agentContext: buildTestAgentContext(action.action_type),
    });
    const updated = JSON.parse(storage.getItem(key) || "[]") as unknown[];
    expect(updated).toHaveLength(2);
    expect(updated[0]).toEqual(first);
    expect(updated[1]).toEqual(second);
  });
});
