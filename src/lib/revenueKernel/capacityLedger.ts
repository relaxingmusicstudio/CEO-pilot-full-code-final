import type { EvidenceRef } from "./evidence";
import { computeActionId, type ActionSpec } from "../../types/actions";
import { deriveActionCost } from "../ceoPilot/economics/costModel";

export type CoolingState = "normal" | "cooling" | "repair";

export type CapacityState = {
  max_concurrent_actions: number;
  active_load: number;
  recovery_rate: number;
  cooling_state: CoolingState;
};

export type CapacityEventType =
  | "configure"
  | "load_inc"
  | "load_dec"
  | "defer"
  | "cooling_enter"
  | "cooling_exit"
  | "repair_enter"
  | "repair_exit"
  | "pause"
  | "resume";

export type CapacityEvent = {
  event_id: string;
  pod_id: string;
  timestamp: string;
  type: CapacityEventType;
  reason: string;
  delta?: number;
  config?: Pick<CapacityState, "max_concurrent_actions" | "recovery_rate">;
  evidence_ref: EvidenceRef;
};

export type CapacityConfig = {
  max_concurrent_actions: number;
  recovery_rate: number;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const LEDGER_PREFIX = "ppp:capacityLedger:v1::";
const CLOCK_PREFIX = "ppp:capacityClock:v1::";

const defaultConfig: CapacityConfig = {
  max_concurrent_actions: 3,
  recovery_rate: 1,
};

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
};

const ledgerKey = (podId: string) => `${LEDGER_PREFIX}${podId}`;
const clockKey = (podId: string) => `${CLOCK_PREFIX}${podId}`;

export const nextCapacityTimestamp = (podId: string, storage?: StorageLike): string => {
  const resolved = resolveStorage(storage);
  if (!resolved) return "s0";
  const raw = resolved.getItem(clockKey(podId));
  const current = Number.parseInt(String(raw ?? ""), 10);
  const nextValue = Number.isFinite(current) ? current + 1 : 1;
  resolved.setItem(clockKey(podId), String(nextValue));
  return `s${nextValue}`;
};

const readLedger = (podId: string, storage?: StorageLike): CapacityEvent[] => {
  const resolved = resolveStorage(storage);
  if (!resolved) return [];
  try {
    const raw = resolved.getItem(ledgerKey(podId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CapacityEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLedger = (podId: string, entries: CapacityEvent[], storage?: StorageLike) => {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  try {
    resolved.setItem(ledgerKey(podId), JSON.stringify(entries));
  } catch {
    // ignore persistence errors
  }
};

const applyEvent = (state: CapacityState, event: CapacityEvent): CapacityState => {
  switch (event.type) {
    case "configure":
      return {
        ...state,
        max_concurrent_actions: event.config?.max_concurrent_actions ?? state.max_concurrent_actions,
        recovery_rate: event.config?.recovery_rate ?? state.recovery_rate,
      };
    case "load_inc":
      return { ...state, active_load: state.active_load + (event.delta || 1) };
    case "load_dec":
      return { ...state, active_load: Math.max(0, state.active_load - (event.delta || 1)) };
    case "cooling_enter":
      return { ...state, cooling_state: "cooling" };
    case "repair_enter":
      return { ...state, cooling_state: "repair" };
    case "cooling_exit":
    case "repair_exit":
    case "resume":
      return { ...state, cooling_state: "normal" };
    case "pause":
      return { ...state, cooling_state: "cooling" };
    default:
      return state;
  }
};

export const getCapacityState = (
  podId: string,
  config: CapacityConfig = defaultConfig,
  storage?: StorageLike
): { state: CapacityState; events: CapacityEvent[] } => {
  const base: CapacityState = {
    max_concurrent_actions: config.max_concurrent_actions,
    active_load: 0,
    recovery_rate: config.recovery_rate,
    cooling_state: "normal",
  };
  const events = readLedger(podId, storage);
  const state = events.reduce(applyEvent, base);
  return { state, events };
};

export const appendCapacityEvent = (
  podId: string,
  event: Omit<CapacityEvent, "event_id">,
  storage?: StorageLike
): CapacityEvent => {
  const stamped: CapacityEvent = {
    ...event,
    event_id: `cap-${podId}-${event.timestamp}-${event.type}`,
  };
  const existing = readLedger(podId, storage);
  const next = [...existing, stamped];
  writeLedger(podId, next, storage);
  return stamped;
};

export const ensureCapacityConfig = (
  podId: string,
  config: CapacityConfig,
  evidence_ref: EvidenceRef,
  storage?: StorageLike
): void => {
  const existing = readLedger(podId, storage);
  if (existing.length > 0) return;
  const timestamp = nextCapacityTimestamp(podId, storage);
  appendCapacityEvent(
    podId,
    {
      pod_id: podId,
      timestamp,
      type: "configure",
      reason: "init",
      config,
      evidence_ref,
    },
    storage
  );
};

export const buildCapacityEvidenceAction = (podId: string, reason: string): ActionSpec => {
  const base: Omit<ActionSpec, "action_id"> = {
    action_type: "note",
    description: `capacity:${reason}`,
    intent_id: `intent:capacity:${podId}`,
    expected_metric: "capacity",
    risk_level: "low",
    irreversible: false,
    payload: { pod_id: podId, reason },
    costUnits: 0,
    costCategory: "compute",
  };
  const cost = deriveActionCost({ ...base, action_id: "action-temp" });
  const withCost = { ...base, costUnits: cost.costUnits, costCategory: cost.costCategory };
  return { ...withCost, action_id: computeActionId(withCost) };
};

export const checkCapacity = (
  state: CapacityState
): { ok: boolean; reason?: string } => {
  if (state.active_load >= state.max_concurrent_actions) {
    return { ok: false, reason: "CAPACITY_EXCEEDED" };
  }
  return { ok: true };
};
