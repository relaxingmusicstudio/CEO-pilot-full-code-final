import { computeIdentityKey } from "./spine";

export type TeamSelection = "solo" | "join" | "create";

const TEAM_PREFIX = "ppp:preflightTeam:v1::";

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

const teamKey = (identity: string) => `${TEAM_PREFIX}${identity}`;

export const loadPreflightTeam = (
  userId?: string | null,
  email?: string | null,
  storage?: StorageLike
): TeamSelection | null => {
  const resolved = resolveStorage(storage);
  if (!resolved) return null;
  const identity = computeIdentityKey(userId, email);
  const raw = resolved.getItem(teamKey(identity));
  if (raw === "solo" || raw === "join" || raw === "create") return raw;
  return null;
};

export const savePreflightTeam = (
  team: TeamSelection,
  userId?: string | null,
  email?: string | null,
  storage?: StorageLike
): void => {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  const identity = computeIdentityKey(userId, email);
  resolved.setItem(teamKey(identity), team);
};

export const clearPreflightTeam = (
  userId?: string | null,
  email?: string | null,
  storage?: StorageLike
): void => {
  const resolved = resolveStorage(storage);
  if (!resolved || !resolved.removeItem) return;
  const identity = computeIdentityKey(userId, email);
  resolved.removeItem(teamKey(identity));
};
