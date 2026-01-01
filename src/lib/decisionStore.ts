import { clampConfidence, type Decision, type DecisionStatus } from "../kernel/decisionContract";

export type DecisionOutcome = "worked" | "didnt_work" | "unknown";

export type DecisionOutcomeRecord = {
  decision_id: string;
  outcome: DecisionOutcome;
  notes?: string;
  updated_at: string;
  status: DecisionStatus;
  confidence_base: number;
  confidence_delta: number;
  confidence_current: number;
};

const decisionStore = new Map<string, Decision>();
const outcomeStore = new Map<string, DecisionOutcomeRecord>();

const outcomeStatusMap: Record<DecisionOutcome, DecisionStatus> = {
  worked: "confirmed",
  didnt_work: "failed",
  unknown: "acted",
};

const outcomeConfidenceDelta: Record<DecisionOutcome, number> = {
  worked: 0.05,
  didnt_work: -0.2,
  unknown: 0,
};

export const recordDecision = (decision: Decision): Decision => {
  decisionStore.set(decision.decision_id, decision);
  return decision;
};

export const getDecision = (decisionId: string): Decision | null =>
  decisionStore.get(decisionId) ?? null;

export const recordOutcome = (
  decisionId: string,
  outcome: DecisionOutcome,
  notes?: string
): { decision: Decision; outcome: DecisionOutcomeRecord } | null => {
  const existing = decisionStore.get(decisionId);
  if (!existing) return null;
  const status = outcomeStatusMap[outcome];
  const delta = outcomeConfidenceDelta[outcome];
  const current = clampConfidence(existing.confidence + delta);
  const updatedDecision: Decision = {
    ...existing,
    status,
    confidence: current,
  };
  decisionStore.set(decisionId, updatedDecision);

  const record: DecisionOutcomeRecord = {
    decision_id: decisionId,
    outcome,
    notes: notes?.trim() ? notes.trim() : undefined,
    updated_at: new Date().toISOString(),
    status,
    confidence_base: existing.confidence,
    confidence_delta: delta,
    confidence_current: current,
  };
  outcomeStore.set(decisionId, record);
  return { decision: updatedDecision, outcome: record };
};

export const getOutcome = (decisionId: string): DecisionOutcomeRecord | null =>
  outcomeStore.get(decisionId) ?? null;

export const resetDecisionStore = () => {
  decisionStore.clear();
  outcomeStore.clear();
};
