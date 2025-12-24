import { parseIntent } from "./intent";
import { DEFAULT_DOMAINS, normalizeSignal, queryDomain, reconcileFacts } from "./domains";
import type { SearchOptions, SearchResponse, SearchResult, SignalDomainId } from "./types";
import { buildConfidenceExplanation, scoreResult } from "./scoring";
import { unique } from "./utils";

const buildSummary = (claims: string[], max = 2): string => {
  const trimmed = claims.filter(Boolean).slice(0, max);
  return trimmed.length > 0 ? trimmed.join(" ") : "No summary available.";
};

const buildExplanation = (intentAmbiguity: string, domains: SignalDomainId[]): string => {
  const domainList = domains.map((domain) => domain.replace(/_/g, " ")).join(", ");
  return `Search is mock-first and provider agnostic. Domains used: ${domainList}. ${intentAmbiguity}`;
};

export const runSearch = async (query: string, options: SearchOptions = {}): Promise<SearchResponse> => {
  const intent = parseIntent(query);
  const domains = options.domains && options.domains.length > 0 ? options.domains : DEFAULT_DOMAINS;
  const now = options.now ?? new Date().toISOString();
  const latencyMs = options.latencyMs ?? 180;
  const extraSignals = options.extraSignals ?? {};

  const domainSignals = await Promise.all(
    domains.map(async (domain) => ({
      domain,
      signals: await queryDomain(domain, intent, { latencyMs, extraSignals }),
    }))
  );

  const facts = domainSignals.flatMap((entry) => entry.signals.map(normalizeSignal));
  const reconciled = reconcileFacts(facts);

  const results: SearchResult[] = reconciled
    .map((entry) => {
      const scores = scoreResult(entry, intent, now);
      const confidenceExplanation = buildConfidenceExplanation(scores, entry.domains);
      return {
        id: entry.entityId,
        name: entry.name,
        category: entry.category,
        location: entry.location,
        summary: buildSummary(entry.claims),
        tags: entry.tags,
        evidence: entry.evidence,
        domains: entry.domains,
        scores,
        confidenceExplanation,
      };
    })
    .sort((a, b) => b.scores.finalScore - a.scores.finalScore);

  const ambiguityNote =
    intent.ambiguity.level === "low"
      ? "Intent looks clear."
      : intent.ambiguity.level === "medium"
        ? "Intent is partially specified; results are framed safely."
        : "Intent is ambiguous; results are framed safely and remain read-only.";

  return {
    query,
    intent,
    domains: unique(domains),
    results,
    explanation: buildExplanation(ambiguityNote, domains),
  };
};
