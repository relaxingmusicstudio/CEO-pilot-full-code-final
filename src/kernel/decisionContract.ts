export type DecisionStatus = "proposed" | "acted" | "confirmed" | "failed";

export type Decision = {
  decision_id: string;
  input_hash: string;
  recommendation: string;
  reasoning: string;
  assumptions: string[];
  confidence: number;
  status: DecisionStatus;
  created_at: string;
};

export const clampConfidence = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};
