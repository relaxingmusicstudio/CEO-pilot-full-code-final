import { computeIdentityKey } from "./spine";

export type FlightMode = "SIM" | "LIVE";

const MODE_PREFIX = "ppp:flightMode:v1::";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
};

const modeKey = (identity: string) => `${MODE_PREFIX}${identity}`;

export const loadFlightMode = (
  userId?: string | null,
  email?: string | null,
  storage?: StorageLike
): FlightMode => {
  const resolved = resolveStorage(storage);
  if (!resolved) return "SIM";
  const identity = computeIdentityKey(userId, email);
  const raw = resolved.getItem(modeKey(identity));
  if (raw === "LIVE") return "LIVE";
  return "SIM";
};

export const saveFlightMode = (
  mode: FlightMode,
  userId?: string | null,
  email?: string | null,
  storage?: StorageLike
): void => {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  const identity = computeIdentityKey(userId, email);
  resolved.setItem(modeKey(identity), mode);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ppp:flightmode", { detail: { mode, identity } }));
  }
};

export const describeFlightMode = (mode: FlightMode): string =>
  mode === "LIVE" ? "Live Mode (requires confirmation + preflight)" : "Sim Mode (no real-world effects)";
