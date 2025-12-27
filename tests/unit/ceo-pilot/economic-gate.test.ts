import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EconomicBudgetState } from "../../../src/lib/ceoPilot/contracts";
import { getRuntimeSnapshot } from "../../../src/lib/ceoPilot/controlRoomApi";
import {
  loadEconomicAudits,
  loadEconomicBudgetState,
  loadTaskOutcomes,
  saveEconomicBudgetState,
} from "../../../src/lib/ceoPilot/runtimeState";
import { runAction } from "../../../src/lib/actionRunner";
import { computeActionId, type ActionSpec } from "../../../src/types/actions";
import { buildTestAgentContext } from "../helpers/agentContext";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

const FIXED_NOW = "2025-01-01T00:00:00.000Z";
const WINDOW_MS = 24 * 60 * 60 * 1000;

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

const buildBudget = (
  identityKey: string,
  nowValue: string,
  overrides: Partial<EconomicBudgetState> = {}
): EconomicBudgetState => ({
  budgetId: `budget-${identityKey}`,
  identityKey,
  totalBudget: 10,
  remainingBudget: 10,
  sessionId: `session-${identityKey}`,
  sessionTotal: 10,
  sessionRemaining: 10,
  windowStart: nowValue,
  windowDurationMs: WINDOW_MS,
  updatedAt: nowValue,
  ...overrides,
});

const buildAction = (overrides: Partial<Omit<ActionSpec, "action_id">> = {}): ActionSpec => {
  const base: Omit<ActionSpec, "action_id"> = {
    action_type: "task",
    description: "Economic test action",
    intent_id: "intent-economic",
    expected_metric: "metric",
    risk_level: "low",
    irreversible: false,
    payload: {},
    costUnits: 3,
    costCategory: "compute",
    ...overrides,
  };
  return { ...base, action_id: computeActionId(base) };
};

describe("economic gate", () => {
  let storage: StorageLike;

  beforeEach(() => {
    storage = createMemoryStorage();
    (globalThis as { localStorage?: StorageLike }).localStorage = storage;
  });

  afterEach(() => {
    storage.clear();
    delete (globalThis as { localStorage?: StorageLike }).localStorage;
  });

  it("consumes budget for allowed actions", async () => {
    const identityKey = "test:economic-allowed";
    const nowValue = new Date().toISOString();
    saveEconomicBudgetState(identityKey, buildBudget(identityKey, nowValue));

    const action = buildAction({ costUnits: 3 });
    const agentContext = buildTestAgentContext(action.action_type, {
      taskId: action.action_id,
      taskType: `action:${action.action_type}`,
      costUnits: action.costUnits,
      costCategory: action.costCategory,
      costChargeId: `charge:${action.action_id}`,
      costSource: "action",
    });

    const result = await runAction(
      action,
      { mode: "MOCK", trustLevel: 1 },
      { identityKey, agentContext }
    );

    expect(result.status).toBe("executed");
    const budget = loadEconomicBudgetState(identityKey);
    expect(budget?.remainingBudget).toBe(7);
    expect(budget?.sessionRemaining).toBe(7);
    const audits = loadEconomicAudits(identityKey);
    expect(audits).toHaveLength(1);
    expect(audits[0].decision).toBe("allowed");
  });

  it("blocks execution when budget is exhausted and records audit", async () => {
    const identityKey = "test:economic-blocked";
    const nowValue = new Date().toISOString();
    saveEconomicBudgetState(
      identityKey,
      buildBudget(identityKey, nowValue, {
        totalBudget: 1,
        remainingBudget: 0,
        sessionTotal: 1,
        sessionRemaining: 0,
      })
    );

    const action = buildAction({ costUnits: 2 });
    const agentContext = buildTestAgentContext(action.action_type, {
      taskId: action.action_id,
      taskType: `action:${action.action_type}`,
      costUnits: action.costUnits,
      costCategory: action.costCategory,
      costChargeId: `charge:${action.action_id}`,
      costSource: "action",
    });

    const result = await runAction(
      action,
      { mode: "MOCK", trustLevel: 1 },
      { identityKey, agentContext }
    );

    expect(result.status).toBe("failed");
    expect(result.error ?? "").toContain("economic_budget_exhausted");
    expect(loadTaskOutcomes(identityKey)).toHaveLength(0);
    const audits = loadEconomicAudits(identityKey);
    expect(audits).toHaveLength(1);
    expect(audits[0].decision).toBe("blocked");
  });

  it("exposes economic budget in the control room snapshot", () => {
    const identityKey = "test:economic-snapshot";
    saveEconomicBudgetState(identityKey, buildBudget(identityKey, FIXED_NOW, { totalBudget: 42, remainingBudget: 24 }));

    const snapshot = getRuntimeSnapshot(identityKey, FIXED_NOW);
    expect(snapshot.data.economicBudget?.totalBudget).toBe(42);
    expect(snapshot.data.economicBudget?.remainingBudget).toBe(24);
  });
});
