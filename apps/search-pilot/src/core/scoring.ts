import type { IntentParse, ReconciledResult, ScoreBreakdown } from "./types";
import { clamp, normalizeText } from "./utils";

const SCORE_WEIGHTS = {
  relevance: 0.35,
  confidence: 0.25,
  freshness: 0.2,
  agreement: 0.2,
};

const daysBetween = (fromIso: string, toIso: string): number => {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  const diffMs = Math.max(0, to - from);
  return diffMs / (24 * 60 * 60 * 1000);
};

const scoreFreshness = (timestamp: string, now: string): number => {
  const days = daysBetween(timestamp, now);
  return clamp(1 - days / 180, 0, 1);
};

const scoreAgreement = (domainsCount: number): number => {
  if (domainsCount <= 1) return 0.3;
  return clamp(0.3 + (domainsCount - 1) * 0.35, 0, 1);
};

const scoreRelevance = (intent: IntentParse, tags: string[]): number => {
  const intentTokens = intent.primitives
    .filter((primitive) => primitive.type !== "unknown")
    .map((primitive) => normalizeText(primitive.value));

  if (intentTokens.length === 0) return 0.5;

  const tagSet = new Set(tags.map(normalizeText));
  const matches = intentTokens.filter((token) => tagSet.has(token)).length;
  return clamp(matches / intentTokens.length, 0.2, 1);
};

export const scoreResult = (
  result: ReconciledResult,
  intent: IntentParse,
  now: string
): ScoreBreakdown => {
  const relevance = scoreRelevance(intent, result.tags);
  const confidence = clamp(result.confidence, 0, 1);
  const freshness = scoreFreshness(result.latestTimestamp, now);
  const agreement = scoreAgreement(result.domains.length);

  const finalScore = clamp(
    relevance * SCORE_WEIGHTS.relevance +
      confidence * SCORE_WEIGHTS.confidence +
      freshness * SCORE_WEIGHTS.freshness +
      agreement * SCORE_WEIGHTS.agreement,
    0,
    1
  );

  return { relevance, confidence, freshness, agreement, finalScore };
};

export const buildConfidenceExplanation = (breakdown: ScoreBreakdown, domains: string[]): string => {
  const parts = [
    `Relevance ${Math.round(breakdown.relevance * 100)} percent`,
    `confidence ${Math.round(breakdown.confidence * 100)} percent`,
    `freshness ${Math.round(breakdown.freshness * 100)} percent`,
    `agreement ${Math.round(breakdown.agreement * 100)} percent`,
  ];
  return `${parts.join(", ")}. Sources: ${domains.join(", ")}.`;
};
