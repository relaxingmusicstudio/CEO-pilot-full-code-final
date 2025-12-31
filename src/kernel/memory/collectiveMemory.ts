export type FoundingIntentRecord = {
  mission: string;
  nonNegotiables: readonly string[];
  values: readonly string[];
  constraints: readonly string[];
};

export type DecisionOutcome = "success" | "failure" | "unknown";

export type DecisionRecord = {
  intent: string;
  decision: string;
  rationale: string;
  timestamp: string;
  initiatingRole: string;
  outcome: DecisionOutcome;
};

export type MemoryWritePolicy = {
  actor: "kernel" | "ui" | "search";
  rationale: string;
};

export type MemoryRecallMatch = DecisionRecord & {
  matchScore: number;
};

export type MemoryRecallResult = {
  intent: string;
  matches: MemoryRecallMatch[];
  counts: {
    total: number;
    failures: number;
    successes: number;
    unknown: number;
  };
};

const freezeArray = <T>(values: T[]): readonly T[] => Object.freeze([...values]);

export const foundingIntent: FoundingIntentRecord = Object.freeze({
  mission:
    "Provide reliable CEO-level decision support that grows revenue without violating consent, safety, or governance.",
  nonNegotiables: freezeArray([
    "Respect consent, privacy, and authorization boundaries.",
    "Avoid deceptive or coercive tactics.",
    "Never bypass policy, audit, or security controls.",
    "Fail safely and visibly when constraints are violated.",
  ]),
  values: freezeArray([
    "Clarity over ambiguity.",
    "Accountability for outcomes.",
    "User trust and transparency.",
    "Operational reliability.",
  ]),
  constraints: freezeArray([
    "No storage of secrets in client code.",
    "No unbounded retries or runaway actions.",
    "Operate within defined budget and rate limits.",
    "Prefer deterministic decisions over speculative execution.",
  ]),
});

const decisionStore: DecisionRecord[] = [];

const sanitizeText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value: string): string[] => {
  const cleaned = sanitizeText(value);
  if (!cleaned) return [];
  return cleaned.split(" ").filter((token) => token.length > 2);
};

const scoreMatch = (intent: string, record: DecisionRecord): number => {
  const intentTokens = tokenize(intent);
  if (intentTokens.length === 0) return 0;
  const recordTokens = new Set(
    tokenize([record.intent, record.decision, record.rationale].join(" "))
  );
  let score = 0;
  for (const token of intentTokens) {
    if (recordTokens.has(token)) score += 1;
  }
  if (record.intent.toLowerCase().includes(intent.toLowerCase())) score += 2;
  if (intent.toLowerCase().includes(record.intent.toLowerCase())) score += 1;
  return score;
};

const outcomeRank: Record<DecisionOutcome, number> = {
  failure: 0,
  unknown: 1,
  success: 2,
};

const ensureWritePolicy = (policy: MemoryWritePolicy) => {
  if (policy.actor !== "kernel") {
    throw new Error("memory_write_denied");
  }
  if (!policy.rationale || !policy.rationale.trim()) {
    throw new Error("memory_write_rationale_required");
  }
};

const ensureRecord = (record: DecisionRecord) => {
  if (!record.intent.trim()) throw new Error("memory_record_intent_required");
  if (!record.decision.trim()) throw new Error("memory_record_decision_required");
  if (!record.rationale.trim()) throw new Error("memory_record_rationale_required");
  if (!record.timestamp.trim()) throw new Error("memory_record_timestamp_required");
  if (!record.initiatingRole.trim()) throw new Error("memory_record_role_required");
};

export const writeDecisionRecord = (record: DecisionRecord, policy: MemoryWritePolicy) => {
  ensureWritePolicy(policy);
  ensureRecord(record);
  decisionStore.push({ ...record });
};

export const recallDecisions = (intent: string): MemoryRecallResult => {
  const matches = decisionStore
    .map((record) => ({ ...record, matchScore: scoreMatch(intent, record) }))
    .filter((record) => record.matchScore > 0)
    .sort((a, b) => {
      const outcomeDelta = outcomeRank[a.outcome] - outcomeRank[b.outcome];
      if (outcomeDelta !== 0) return outcomeDelta;
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return b.timestamp.localeCompare(a.timestamp);
    });

  const counts = matches.reduce(
    (acc, record) => {
      acc.total += 1;
      if (record.outcome === "failure") acc.failures += 1;
      if (record.outcome === "success") acc.successes += 1;
      if (record.outcome === "unknown") acc.unknown += 1;
      return acc;
    },
    { total: 0, failures: 0, successes: 0, unknown: 0 }
  );

  return {
    intent,
    matches,
    counts,
  };
};

export const resetDecisionMemory = () => {
  decisionStore.length = 0;
};

export const listDecisionRecords = () => decisionStore.map((record) => ({ ...record }));
