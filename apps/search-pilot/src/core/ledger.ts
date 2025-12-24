import type { LedgerPage, SearchInteractionType, SearchLedgerEvent, SearchResponse } from "./types";

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const LEDGER_PREFIX = "ppp:searchPilot:ledger:v1::";
const CLOCK_PREFIX = "ppp:searchPilot:ledgerClock:v1::";

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
};

const ledgerKey = (ownerId: string) => `${LEDGER_PREFIX}${ownerId}`;
const clockKey = (ownerId: string) => `${CLOCK_PREFIX}${ownerId}`;

export const nextLedgerId = (ownerId: string, storage?: StorageLike): string => {
  const resolved = resolveStorage(storage);
  if (!resolved) return `search-${ownerId}-1`;
  const raw = resolved.getItem(clockKey(ownerId));
  const current = Number.parseInt(String(raw ?? ""), 10);
  const nextValue = Number.isFinite(current) ? current + 1 : 1;
  resolved.setItem(clockKey(ownerId), String(nextValue));
  return `search-${ownerId}-${nextValue}`;
};

const readLedger = (ownerId: string, storage?: StorageLike): SearchLedgerEvent[] => {
  const resolved = resolveStorage(storage);
  if (!resolved) return [];
  try {
    const raw = resolved.getItem(ledgerKey(ownerId));
    const parsed = raw ? (JSON.parse(raw) as SearchLedgerEvent[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLedger = (ownerId: string, entries: SearchLedgerEvent[], storage?: StorageLike) => {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  try {
    resolved.setItem(ledgerKey(ownerId), JSON.stringify(entries));
  } catch {
    // ignore persistence failures
  }
};

export const appendSearchEvent = (
  ownerId: string,
  response: SearchResponse,
  storage?: StorageLike
): SearchLedgerEvent => {
  const entry: SearchLedgerEvent = {
    eventType: "search",
    entryId: nextLedgerId(ownerId, storage),
    timestamp: new Date().toISOString(),
    query: response.query,
    intent: response.intent,
    domains: response.domains,
    results: response.results,
  };
  const existing = readLedger(ownerId, storage);
  writeLedger(ownerId, [...existing, entry], storage);
  return entry;
};

export const appendInteractionEvent = (
  ownerId: string,
  searchEntryId: string,
  interactionType: SearchInteractionType,
  resultId: string,
  storage?: StorageLike
): SearchLedgerEvent => {
  const entry: SearchLedgerEvent = {
    eventType: "interaction",
    entryId: nextLedgerId(ownerId, storage),
    timestamp: new Date().toISOString(),
    searchEntryId,
    interaction: {
      type: interactionType,
      resultId,
    },
  };
  const existing = readLedger(ownerId, storage);
  writeLedger(ownerId, [...existing, entry], storage);
  return entry;
};

export const loadLedgerPage = (
  ownerId: string,
  limit: number,
  cursor?: string | null,
  storage?: StorageLike
): LedgerPage => {
  const entries = readLedger(ownerId, storage);
  if (entries.length === 0) return { entries: [], nextCursor: null };
  const startIndex = cursor ? entries.findIndex((entry) => entry.entryId === cursor) + 1 : 0;
  const page = entries.slice(startIndex, startIndex + limit);
  const nextCursor = startIndex + limit < entries.length ? page[page.length - 1]?.entryId ?? null : null;
  return { entries: page, nextCursor };
};

export const loadLedgerTail = (
  ownerId: string,
  limit: number,
  cursor?: string | null,
  storage?: StorageLike
): LedgerPage => {
  const entries = readLedger(ownerId, storage);
  if (entries.length === 0) return { entries: [], nextCursor: null };
  const endIndex = cursor ? entries.findIndex((entry) => entry.entryId === cursor) : entries.length;
  const safeEnd = endIndex > 0 ? endIndex : entries.length;
  const startIndex = Math.max(0, safeEnd - limit);
  const page = entries.slice(startIndex, safeEnd);
  const nextCursor = startIndex > 0 ? entries[startIndex - 1]?.entryId ?? null : null;
  return { entries: page, nextCursor };
};

export const createMemoryStorage = (): StorageLike => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
};
