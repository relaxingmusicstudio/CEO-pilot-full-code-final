import type { EconomicAuditRecord, EconomicBudgetState } from "../contracts";
import { loadEconomicBudgetState, loadEconomicAudits, recordEconomicAudit, saveEconomicBudgetState } from "../runtimeState";
import { createId, nowIso } from "../utils";

export const DEFAULT_TOTAL_BUDGET_UNITS = 1000;
export const DEFAULT_SESSION_BUDGET_UNITS = 250;
export const DEFAULT_WINDOW_DURATION_MS = 24 * 60 * 60 * 1000;

const clampUnits = (value: number): number => Math.max(0, Math.round(value));

const isWindowExpired = (state: EconomicBudgetState, nowValue: string): boolean =>
  Date.parse(nowValue) - Date.parse(state.windowStart) >= state.windowDurationMs;

const buildDefaultBudget = (identityKey: string, nowValue: string): EconomicBudgetState => ({
  budgetId: `budget-${identityKey}-default`,
  identityKey,
  totalBudget: DEFAULT_TOTAL_BUDGET_UNITS,
  remainingBudget: DEFAULT_TOTAL_BUDGET_UNITS,
  sessionId: `session-${identityKey}-default`,
  sessionTotal: DEFAULT_SESSION_BUDGET_UNITS,
  sessionRemaining: DEFAULT_SESSION_BUDGET_UNITS,
  windowStart: nowValue,
  windowDurationMs: DEFAULT_WINDOW_DURATION_MS,
  updatedAt: nowValue,
});

export const ensureEconomicBudgetState = (identityKey: string, nowValue: string = nowIso()): EconomicBudgetState => {
  const existing = loadEconomicBudgetState(identityKey);
  if (!existing) {
    const seeded = buildDefaultBudget(identityKey, nowValue);
    saveEconomicBudgetState(identityKey, seeded);
    return seeded;
  }
  if (isWindowExpired(existing, nowValue)) {
    const refreshed: EconomicBudgetState = {
      ...existing,
      remainingBudget: existing.totalBudget,
      windowStart: nowValue,
      updatedAt: nowValue,
    };
    saveEconomicBudgetState(identityKey, refreshed);
    return refreshed;
  }
  if (existing.updatedAt !== nowValue) {
    const refreshed = { ...existing, updatedAt: nowValue };
    saveEconomicBudgetState(identityKey, refreshed);
    return refreshed;
  }
  return existing;
};

export type BudgetConsumptionResult = {
  allowed: boolean;
  reason: string;
  budget: EconomicBudgetState;
  consumedUnits: number;
};

export const consumeEconomicBudget = (
  identityKey: string,
  costUnits: number,
  nowValue: string = nowIso()
): BudgetConsumptionResult => {
  const normalizedUnits = clampUnits(costUnits);
  const current = ensureEconomicBudgetState(identityKey, nowValue);
  const available = Math.min(current.remainingBudget, current.sessionRemaining);
  if (normalizedUnits <= 0) {
    return {
      allowed: true,
      reason: "zero_cost",
      budget: current,
      consumedUnits: 0,
    };
  }
  if (available <= 0 || normalizedUnits > available) {
    return {
      allowed: false,
      reason: "economic_budget_exhausted",
      budget: current,
      consumedUnits: 0,
    };
  }
  const next: EconomicBudgetState = {
    ...current,
    remainingBudget: clampUnits(current.remainingBudget - normalizedUnits),
    sessionRemaining: clampUnits(current.sessionRemaining - normalizedUnits),
    updatedAt: nowValue,
  };
  saveEconomicBudgetState(identityKey, next);
  return {
    allowed: true,
    reason: "economic_budget_consumed",
    budget: next,
    consumedUnits: normalizedUnits,
  };
};

export const findEconomicAuditByCharge = (
  identityKey: string,
  chargeId?: string
): EconomicAuditRecord | null => {
  if (!chargeId) return null;
  const history = loadEconomicAudits(identityKey);
  return history.find((record) => record.chargeId === chargeId) ?? null;
};

export const recordEconomicDecision = (
  identityKey: string,
  record: Omit<EconomicAuditRecord, "auditId" | "createdAt">,
  nowValue: string = nowIso()
): EconomicAuditRecord => {
  const audit: EconomicAuditRecord = {
    ...record,
    auditId: createId("economic-audit"),
    createdAt: nowValue,
  };
  recordEconomicAudit(identityKey, audit);
  return audit;
};
