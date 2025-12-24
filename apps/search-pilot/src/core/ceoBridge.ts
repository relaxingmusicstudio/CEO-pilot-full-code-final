import type { EvidenceRef, SearchResponse } from "./types";
import { slugify, unique } from "./utils";

export type CEOSignalType = "opportunity" | "skill_demand" | "local_gap";

export type CEOSignal = {
  id: string;
  type: CEOSignalType;
  title: string;
  summary: string;
  confidence: number;
  evidence: EvidenceRef[];
};

const signalId = (type: CEOSignalType, label: string) => `${type}-${slugify(label)}`;

export const buildCEOSignals = (response: SearchResponse): CEOSignal[] => {
  const signals: CEOSignal[] = [];

  response.results.forEach((result) => {
    if (result.tags.includes("gap") || result.tags.includes("after_hours")) {
      signals.push({
        id: signalId("local_gap", result.name),
        type: "local_gap",
        title: `${result.name} gap signal`,
        summary: `Observed gap for ${result.category} coverage in ${result.location ?? "the local market"}.`,
        confidence: result.scores.finalScore,
        evidence: result.evidence,
      });
    }

    if (result.tags.includes("wait_times") || result.tags.includes("response")) {
      signals.push({
        id: signalId("skill_demand", result.name),
        type: "skill_demand",
        title: `${result.name} skill demand`,
        summary: "Signal indicates demand for faster response and scheduling capacity.",
        confidence: result.scores.finalScore,
        evidence: result.evidence,
      });
    }

    if (result.scores.finalScore >= 0.7) {
      signals.push({
        id: signalId("opportunity", result.name),
        type: "opportunity",
        title: `${result.name} opportunity`,
        summary: "High intent result with multi-domain agreement and strong relevance.",
        confidence: result.scores.finalScore,
        evidence: result.evidence,
      });
    }
  });

  const uniqueSignals = unique(signals.map((signal) => signal.id)).map(
    (id) => signals.find((signal) => signal.id === id) as CEOSignal
  );

  return uniqueSignals.filter(Boolean);
};
