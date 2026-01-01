export type FoundingIntentRecord = {
  mission: string;
  nonNegotiables: readonly string[];
  values: readonly string[];
  constraints: readonly string[];
};

export type DecisionOutcome = "success" | "failure" | "unknown";

export type DecisionRecord = {
  id: string;
  intent: string;
  decision: string;
  rationale: string;
  timestamp: string;
  initiatingRole: string;
};

export type ActionRecord = {
  id: string;
  decisionId: string;
  action: string;
  timestamp: string;
};

export type OutcomeRecord = {
  id: string;
  decisionId: string;
  actionId: string | null;
  outcome: DecisionOutcome;
  details: string;
  timestamp: string;
  confidence: number;
};

export type MemoryWritePolicy = {
  actor: "kernel" | "ui" | "search";
  rationale: string;
};

export type MemoryRecallMatch = {
  decision: DecisionRecord;
  action: ActionRecord | null;
  outcome: OutcomeRecord;
  matchScore: number;
  weightedScore: number;
  timeWeight: number;
  confidence: number;
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
const actionStore: ActionRecord[] = [];
const outcomeStore: OutcomeRecord[] = [];

let recordCounter = 0;

const DAY_MS = 1000 * 60 * 60 * 24;
const HALF_LIFE_DAYS = 30;

const baseConfidenceByOutcome: Record<DecisionOutcome, number> = {
  success: 0.8,
  unknown: 0.5,
  failure: 0.2,
};

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

const buildMatchText = (decision: DecisionRecord, action: ActionRecord | null, outcome: OutcomeRecord) =>
  [
    decision.intent,
    decision.decision,
    decision.rationale,
    action?.action ?? "",
    outcome.details,
  ]
    .join(" ")
    .trim();

const scoreMatch = (
  intent: string,
  decision: DecisionRecord,
  action: ActionRecord | null,
  outcome: OutcomeRecord
): number => {
  const intentTokens = tokenize(intent);
  if (intentTokens.length === 0) return 0;
  const recordTokens = new Set(tokenize(buildMatchText(decision, action, outcome)));
  let score = 0;
  for (const token of intentTokens) {
    if (recordTokens.has(token)) score += 1;
  }
  if (decision.intent.toLowerCase().includes(intent.toLowerCase())) score += 2;
  if (intent.toLowerCase().includes(decision.intent.toLowerCase())) score += 1;
  return score;
};

const computeTimeWeight = (timestamp: string): number => {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return 1;
  const ageMs = Math.max(0, Date.now() - parsed);
  const ageDays = ageMs / DAY_MS;
  const weight = Math.exp(-Math.LN2 * (ageDays / HALF_LIFE_DAYS));
  return Math.min(1, Math.max(0, weight));
};

const computeConfidence = (outcome: DecisionOutcome, timeWeight: number): number => {
  const base = baseConfidenceByOutcome[outcome] ?? 0.2;
  const weighted = base * timeWeight;
  return Math.max(0.05, Math.min(1, weighted));
};

const outcomeRank: Record<DecisionOutcome, number> = {
  failure: 0,
  unknown: 1,
  success: 2,
};

const createRecordId = (prefix: string) => {
  recordCounter += 1;
  return `${prefix}_${recordCounter}`;
};

const ensureWritePolicy = (policy: MemoryWritePolicy) => {
  if (policy.actor !== "kernel") {
    throw new Error("memory_write_denied");
  }
  if (!policy.rationale || !policy.rationale.trim()) {
    throw new Error("memory_write_rationale_required");
  }
};

const ensureDecisionRecord = (record: Omit<DecisionRecord, "id">) => {
  if (!record.intent.trim()) throw new Error("memory_record_intent_required");
  if (!record.decision.trim()) throw new Error("memory_record_decision_required");
  if (!record.rationale.trim()) throw new Error("memory_record_rationale_required");
  if (!record.timestamp.trim()) throw new Error("memory_record_timestamp_required");
  if (!record.initiatingRole.trim()) throw new Error("memory_record_role_required");
};

const ensureActionRecord = (record: Omit<ActionRecord, "id">) => {
  if (!record.decisionId.trim()) throw new Error("memory_record_decision_required");
  if (!record.action.trim()) throw new Error("memory_record_action_required");
  if (!record.timestamp.trim()) throw new Error("memory_record_timestamp_required");
  const decisionExists = decisionStore.some((item) => item.id === record.decisionId);
  if (!decisionExists) throw new Error("memory_record_decision_missing");
};

const ensureOutcomeRecord = (record: {
  decisionId: string;
  actionId?: string | null;
  outcome: DecisionOutcome;
  details: string;
  timestamp: string;
}) => {
  if (!record.decisionId.trim()) throw new Error("memory_record_decision_required");
  if (!record.details.trim()) throw new Error("memory_record_outcome_details_required");
  if (!record.timestamp.trim()) throw new Error("memory_record_timestamp_required");
  const decisionExists = decisionStore.some((item) => item.id === record.decisionId);
  if (!decisionExists) throw new Error("memory_record_decision_missing");
  if (record.actionId) {
    const actionExists = actionStore.some((item) => item.id === record.actionId);
    if (!actionExists) throw new Error("memory_record_action_missing");
  }
};

export const writeDecisionRecord = (
  record: Omit<DecisionRecord, "id">,
  policy: MemoryWritePolicy
): DecisionRecord => {
  ensureWritePolicy(policy);
  ensureDecisionRecord(record);
  const entry: DecisionRecord = { id: createRecordId("dec"), ...record };
  decisionStore.push(entry);
  return { ...entry };
};

export const writeActionRecord = (
  record: Omit<ActionRecord, "id">,
  policy: MemoryWritePolicy
): ActionRecord => {
  ensureWritePolicy(policy);
  ensureActionRecord(record);
  const entry: ActionRecord = { id: createRecordId("act"), ...record };
  actionStore.push(entry);
  return { ...entry };
};

export const writeOutcomeRecord = (
  record: {
    decisionId: string;
    actionId?: string | null;
    outcome: DecisionOutcome;
    details: string;
    timestamp: string;
  },
  policy: MemoryWritePolicy
): OutcomeRecord => {
  ensureWritePolicy(policy);
  ensureOutcomeRecord(record);
  const timeWeight = computeTimeWeight(record.timestamp);
  const confidence = computeConfidence(record.outcome, timeWeight);
  const entry: OutcomeRecord = {
    id: createRecordId("out"),
    decisionId: record.decisionId,
    actionId: record.actionId ?? null,
    outcome: record.outcome,
    details: record.details,
    timestamp: record.timestamp,
    confidence,
  };
  outcomeStore.push(entry);
  return { ...entry };
};

export const recallDecisions = (intent: string): MemoryRecallResult => {
  const matches = outcomeStore
    .map((outcome) => {
      const decision = decisionStore.find((item) => item.id === outcome.decisionId);
      if (!decision) return null;
      const action = outcome.actionId
        ? actionStore.find((item) => item.id === outcome.actionId) ?? null
        : null;
      const matchScore = scoreMatch(intent, decision, action, outcome);
      if (matchScore <= 0) return null;
      const timeWeight = computeTimeWeight(outcome.timestamp);
      const weightedScore = matchScore * timeWeight;
      const confidence = computeConfidence(outcome.outcome, timeWeight);
      return {
        decision,
        action,
        outcome,
        matchScore,
        weightedScore,
        timeWeight,
        confidence,
      } satisfies MemoryRecallMatch;
    })
    .filter((record): record is MemoryRecallMatch => Boolean(record))
    .sort((a, b) => {
      const outcomeDelta = outcomeRank[a.outcome.outcome] - outcomeRank[b.outcome.outcome];
      if (outcomeDelta !== 0) return outcomeDelta;
      if (b.weightedScore !== a.weightedScore) return b.weightedScore - a.weightedScore;
      return b.outcome.timestamp.localeCompare(a.outcome.timestamp);
    });

  const counts = matches.reduce(
    (acc, record) => {
      acc.total += 1;
      if (record.outcome.outcome === "failure") acc.failures += 1;
      if (record.outcome.outcome === "success") acc.successes += 1;
      if (record.outcome.outcome === "unknown") acc.unknown += 1;
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
  actionStore.length = 0;
  outcomeStore.length = 0;
  recordCounter = 0;
};

export const listDecisionRecords = () => decisionStore.map((record) => ({ ...record }));

export const listActionRecords = () => actionStore.map((record) => ({ ...record }));

export const listOutcomeRecords = () => outcomeStore.map((record) => ({ ...record }));
