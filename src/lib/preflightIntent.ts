import { computeIdentityKey } from "./spine";

export type PreflightIntent = "explore" | "pod" | "business";

const INTENT_PREFIX = "ppp:preflightIntent:v1::";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
};

const intentKey = (identity: string) => `${INTENT_PREFIX}${identity}`;

export const loadPreflightIntent = (
  userId?: string | null,
  email?: string | null,
  storage?: StorageLike
): PreflightIntent | null => {
  const resolved = resolveStorage(storage);
  if (!resolved) return null;
  const identity = computeIdentityKey(userId, email);
  const raw = resolved.getItem(intentKey(identity));
  if (raw === "explore" || raw === "pod" || raw === "business") return raw;
  return null;
};

export const savePreflightIntent = (
  intent: PreflightIntent,
  userId?: string | null,
  email?: string | null,
  storage?: StorageLike
): void => {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  const identity = computeIdentityKey(userId, email);
  resolved.setItem(intentKey(identity), intent);
};

export const clearPreflightIntent = (
  userId?: string | null,
  email?: string | null,
  storage?: StorageLike
): void => {
  const resolved = resolveStorage(storage);
  if (!resolved || !resolved.removeItem) return;
  const identity = computeIdentityKey(userId, email);
  resolved.removeItem(intentKey(identity));
};
