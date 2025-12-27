import {
  ActionImpact,
  CacheEntry,
  CacheEntrySchema,
  CachePolicy,
  CachePolicySchema,
  TaskClass,
} from "./contracts";
import { loadCacheEntries, upsertCacheEntry } from "./runtimeState";
import { hashString, nowIso, stableStringify } from "./utils";

export type CacheStore = {
  get: (cacheKey: string) => CacheEntry | null;
  list: () => CacheEntry[];
  upsert: (entry: CacheEntry) => CacheEntry;
};

export const createCacheStore = (identityKey: string): CacheStore => ({
  get: (cacheKey) => loadCacheEntries(identityKey).find((entry) => entry.cacheKey === cacheKey) ?? null,
  list: () => loadCacheEntries(identityKey),
  upsert: (entry) => {
    upsertCacheEntry(identityKey, entry);
    return entry;
  },
});

export const createInMemoryCacheStore = (): CacheStore => {
  const store = new Map<string, CacheEntry>();
  return {
    get: (cacheKey) => store.get(cacheKey) ?? null,
    list: () => Array.from(store.values()),
    upsert: (entry) => {
      store.set(entry.cacheKey, entry);
      return entry;
    },
  };
};

export type CacheKeyParams = {
  kind: CacheEntry["kind"];
  taskType: string;
  goalId: string;
  goalVersion: string;
  inputHash: string;
};

export const normalizeCacheInput = (input: unknown): string => stableStringify(input);

export const hashCacheInput = (input: unknown): string => hashString(normalizeCacheInput(input));

export const buildCacheKey = (params: CacheKeyParams): string =>
  [params.kind, params.taskType, params.goalId, params.goalVersion, params.inputHash].join(":");

export type CacheEligibilityContext = {
  taskClass?: TaskClass;
  noveltyScore?: number;
  explorationMode?: boolean;
  impact?: ActionImpact;
};

export type CacheEligibility = {
  allowed: boolean;
  reason: string;
};

export const evaluateCachePolicy = (
  policy: CachePolicy,
  context: CacheEligibilityContext = {}
): CacheEligibility => {
  if (context.taskClass === "high_risk") {
    return { allowed: false, reason: "high_risk_blocked" };
  }
  if (context.noveltyScore !== undefined && context.noveltyScore > policy.maxNoveltyScore) {
    return { allowed: false, reason: "novelty_exceeded" };
  }
  if (context.explorationMode && !policy.allowExploration) {
    return { allowed: false, reason: "exploration_blocked" };
  }
  if (
    (context.impact === "irreversible" || context.impact === "difficult") &&
    !policy.allowIrreversible
  ) {
    return { allowed: false, reason: "irreversible_blocked" };
  }
  return { allowed: true, reason: "ok" };
};

export type CacheLookupResult = {
  hit: boolean;
  reason: string;
  entry?: CacheEntry;
};

export const getCacheEntry = (
  store: CacheStore,
  cacheKey: string,
  now: string = nowIso()
): CacheLookupResult => {
  const entry = store.get(cacheKey);
  if (!entry) {
    return { hit: false, reason: "miss" };
  }
  if (Date.parse(entry.expiresAt) <= Date.parse(now)) {
    return { hit: false, reason: "expired" };
  }
  return { hit: true, reason: "hit", entry };
};

export const recordCacheHit = (store: CacheStore, entry: CacheEntry): CacheEntry => {
  const updated: CacheEntry = { ...entry, hitCount: entry.hitCount + 1 };
  store.upsert(updated);
  return updated;
};

export type CacheEntryParams = {
  kind: CacheEntry["kind"];
  taskType: string;
  goalId: string;
  goalVersion: string;
  inputHash: string;
  policy: CachePolicy;
  payload: Record<string, unknown>;
  now?: string;
};

export const createCacheEntry = (params: CacheEntryParams): CacheEntry => {
  const policyParsed = CachePolicySchema.safeParse(params.policy);
  if (!policyParsed.success) {
    throw new Error("cache_policy_invalid");
  }
  const createdAt = params.now ?? nowIso();
  const expiresAt = new Date(Date.parse(createdAt) + policyParsed.data.ttlMs).toISOString();
  const entry: CacheEntry = {
    cacheKey: buildCacheKey({
      kind: params.kind,
      taskType: params.taskType,
      goalId: params.goalId,
      goalVersion: params.goalVersion,
      inputHash: params.inputHash,
    }),
    kind: params.kind,
    taskType: params.taskType,
    goalId: params.goalId,
    goalVersion: params.goalVersion,
    inputHash: params.inputHash,
    policy: policyParsed.data,
    payload: params.payload,
    createdAt,
    expiresAt,
    hitCount: 0,
  };

  const parsed = CacheEntrySchema.safeParse(entry);
  if (!parsed.success) {
    throw new Error("cache_entry_invalid");
  }
  return parsed.data;
};
