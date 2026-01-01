import type { SearchEvidenceSummary, SearchResponse } from "./types";
import { slugify, unique } from "./utils";

export type CEOSignalType = "opportunity" | "skill_demand" | "local_gap";

export type CEOSignal = {
  id: string;
  type: CEOSignalType;
  title: string;
  summary: string;
  confidence: number;
  evidence_summary: SearchEvidenceSummary;
};

const signalId = (type: CEOSignalType, label: string) => `${type}-${slugify(label)}`;

export const buildCEOSignals = (response: SearchResponse): CEOSignal[] => {
  const decision = response.decision;
  const primary = decision.status === "failed" ? "local_gap" : "opportunity";
  const signals: CEOSignal[] = [
    {
      id: signalId(primary, decision.decision_id),
      type: primary,
      title: `Decision for "${response.query}"`,
      summary: decision.recommendation,
      confidence: decision.confidence,
      evidence_summary: response.evidence_summary,
    },
  ];

  const uniqueSignals = unique(signals.map((signal) => signal.id)).map(
    (id) => signals.find((signal) => signal.id === id) as CEOSignal
  );

  return uniqueSignals.filter(Boolean);
};
