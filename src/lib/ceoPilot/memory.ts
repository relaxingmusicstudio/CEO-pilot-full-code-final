import {
  MemoryRecord,
  MemoryRecordSchema,
  MemoryScope,
  PermissionTier,
  VerificationReport,
} from "./contracts";
import { clamp } from "./utils";

export type MemoryStore = {
  list: () => MemoryRecord[];
  get: (memoryId: string) => MemoryRecord | undefined;
  write: (record: MemoryRecord) => void;
  remove: (memoryId: string) => void;
};

export const createMemoryStore = (): MemoryStore => {
  const store = new Map<string, MemoryRecord>();
  return {
    list: () => Array.from(store.values()),
    get: (memoryId) => store.get(memoryId),
    write: (record) => {
      store.set(record.memoryId, record);
    },
    remove: (memoryId) => {
      store.delete(memoryId);
    },
  };
};

export type MemoryPolicy = {
  minConfidenceToWrite: number;
  minConfidenceToRetrieve: number;
  expireAfterMs: number;
  decayAfterMs: number;
  decayIntervalMs: number;
  decayFactor: number;
  requireVerificationForKinds: Array<MemoryRecord["kind"]>;
  requireExecuteTierForKinds: Array<MemoryRecord["kind"]>;
  maxRecords: number;
};

export const defaultMemoryPolicy: MemoryPolicy = {
  minConfidenceToWrite: 0.55,
  minConfidenceToRetrieve: 0.35,
  expireAfterMs: 1000 * 60 * 60 * 24 * 30,
  decayAfterMs: 1000 * 60 * 60 * 24 * 7,
  decayIntervalMs: 1000 * 60 * 60 * 24,
  decayFactor: 0.92,
  requireVerificationForKinds: ["decision", "outcome"],
  requireExecuteTierForKinds: ["decision", "outcome"],
  maxRecords: 500,
};

export type MemoryWriteContext = {
  permissionTier: PermissionTier;
  verificationStatus?: VerificationReport["status"] | "unknown";
  source: MemoryRecord["source"];
};

export type MemoryWriteDecision = {
  allowed: boolean;
  reason?: string;
};

export const shouldWriteMemory = (
  record: MemoryRecord,
  context: MemoryWriteContext,
  policy: MemoryPolicy = defaultMemoryPolicy
): MemoryWriteDecision => {
  if (record.confidence < policy.minConfidenceToWrite) {
    return { allowed: false, reason: "confidence_below_threshold" };
  }

  if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) {
    return { allowed: false, reason: "memory_expired" };
  }

  if (
    policy.requireVerificationForKinds.includes(record.kind) &&
    context.verificationStatus !== "pass"
  ) {
    return { allowed: false, reason: "verification_required" };
  }

  if (
    policy.requireExecuteTierForKinds.includes(record.kind) &&
    context.permissionTier !== "execute" &&
    context.source !== "human"
  ) {
    return { allowed: false, reason: "execution_tier_required" };
  }

  return { allowed: true };
};

export type MemoryWriteResult = {
  ok: boolean;
  reason?: string;
};

export const writeMemory = (
  store: MemoryStore,
  record: MemoryRecord,
  context: MemoryWriteContext,
  policy: MemoryPolicy = defaultMemoryPolicy
): MemoryWriteResult => {
  const parsed = MemoryRecordSchema.safeParse(record);
  if (!parsed.success) {
    return { ok: false, reason: "schema_invalid" };
  }

  const decision = shouldWriteMemory(record, context, policy);
  if (!decision.allowed) {
    return { ok: false, reason: decision.reason };
  }

  store.write(parsed.data);

  const all = store.list();
  if (all.length > policy.maxRecords) {
    const sorted = [...all].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    const overflow = sorted.slice(0, Math.max(0, all.length - policy.maxRecords));
    overflow.forEach((entry) => store.remove(entry.memoryId));
  }

  return { ok: true };
};

export type MemoryQuery = {
  scope: MemoryScope;
  kinds?: Array<MemoryRecord["kind"]>;
  subject?: string;
  tags?: string[];
  minConfidence?: number;
  limit?: number;
  allowGlobal?: boolean;
  now?: string;
};

const normalize = (value: string) => value.trim().toLowerCase();

const scopeMatches = (
  recordScope: MemoryScope,
  queryScope: MemoryScope,
  allowGlobal: boolean
): boolean => {
  const checkField = (key: keyof MemoryScope) => {
    const recordValue = recordScope[key];
    const queryValue = queryScope[key];
    if (recordValue) {
      if (!queryValue || recordValue !== queryValue) return false;
    } else if (queryValue && !allowGlobal) {
      return false;
    }
    return true;
  };

  return (
    checkField("tenantId") &&
    checkField("userId") &&
    checkField("sessionId") &&
    checkField("topic")
  );
};

const isExpired = (record: MemoryRecord, nowMs: number, policy: MemoryPolicy): boolean => {
  if (record.expiresAt && Date.parse(record.expiresAt) <= nowMs) return true;
  const ageMs = nowMs - Date.parse(record.createdAt);
  return ageMs > policy.expireAfterMs;
};

export const applyMemoryDecay = (
  record: MemoryRecord,
  nowMs: number,
  policy: MemoryPolicy = defaultMemoryPolicy
): MemoryRecord => {
  const ageMs = nowMs - Date.parse(record.createdAt);
  if (ageMs <= policy.decayAfterMs) return record;

  const steps = Math.floor((ageMs - policy.decayAfterMs) / policy.decayIntervalMs);
  if (steps <= 0) return record;

  const newConfidence = clamp(record.confidence * Math.pow(policy.decayFactor, steps), 0, 1);
  if (newConfidence === record.confidence) return record;

  return {
    ...record,
    confidence: newConfidence,
    updatedAt: new Date(nowMs).toISOString(),
  };
};

export const retrieveMemory = (
  store: MemoryStore,
  query: MemoryQuery,
  policy: MemoryPolicy = defaultMemoryPolicy
): MemoryRecord[] => {
  const nowMs = query.now ? Date.parse(query.now) : Date.now();
  const allowGlobal = query.allowGlobal ?? false;
  const minConfidence = query.minConfidence ?? policy.minConfidenceToRetrieve;
  const normalizedSubject = query.subject ? normalize(query.subject) : null;
  const normalizedTags = query.tags?.map(normalize) ?? [];

  const filtered = store
    .list()
    .filter((record) => scopeMatches(record.scope, query.scope, allowGlobal))
    .filter((record) => (query.kinds ? query.kinds.includes(record.kind) : true))
    .filter((record) => !isExpired(record, nowMs, policy))
    .map((record) => applyMemoryDecay(record, nowMs, policy))
    .filter((record) => record.confidence >= minConfidence)
    .filter((record) => {
      if (!normalizedSubject) return true;
      return normalize(record.subject).includes(normalizedSubject);
    })
    .filter((record) => {
      if (normalizedTags.length === 0) return true;
      const tagSet = new Set(record.tags.map(normalize));
      return normalizedTags.some((tag) => tagSet.has(tag));
    });

  filtered.forEach((record) => store.write(record));

  return filtered
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, query.limit ?? filtered.length);
};

export const pruneExpiredMemory = (
  store: MemoryStore,
  policy: MemoryPolicy = defaultMemoryPolicy,
  nowMs: number = Date.now()
): number => {
  const expired = store.list().filter((record) => isExpired(record, nowMs, policy));
  expired.forEach((record) => store.remove(record.memoryId));
  return expired.length;
};
