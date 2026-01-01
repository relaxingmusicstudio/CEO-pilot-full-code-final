import { parseIntent } from "./intent";
import { DEFAULT_DOMAINS, normalizeSignal, queryDomain, reconcileFacts } from "./domains";
import { clampConfidence, type Decision } from "../../../../src/kernel/decisionContract";
import type {
  SearchAnalyticsMeta,
  SearchEvidenceSummary,
  SearchOptions,
  SearchResponse,
  SearchResult,
  SignalDomainId,
} from "./types";
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

const hashString = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

const buildDecisionId = (inputHash: string, createdAt: string): string => {
  const seed = `${inputHash}|${createdAt}`;
  const hex = [0, 1, 2, 3].map((idx) => hashString(`${seed}|${idx}`)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const buildEvidenceSummary = (
  results: SearchResult[],
  domains: SignalDomainId[]
): SearchEvidenceSummary => {
  const domainCounts = domains.map((domain) => ({
    domain,
    count: results.filter((result) => result.domains.includes(domain)).length,
  }));
  const categoryCounts = new Map<string, number>();
  results.forEach((result) => {
    categoryCounts.set(result.category, (categoryCounts.get(result.category) ?? 0) + 1);
  });
  const categoryHighlights = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category]) => category);
  const notes: string[] = [];
  if (results.length === 0) {
    notes.push("No reconciled entities matched the query.");
  } else {
    notes.push(`Aggregated ${results.length} reconciled entities.`);
  }
  const coveredDomains = domainCounts.filter((entry) => entry.count > 0).length;
  notes.push(`Coverage across ${coveredDomains}/${domains.length} domains.`);
  return {
    resultCount: results.length,
    domainCounts,
    categoryHighlights,
    notes,
  };
};

const buildRecommendation = (query: string, evidence: SearchEvidenceSummary): string => {
  const lower = query.toLowerCase();
  const primaryCategory = evidence.categoryHighlights[0];
  if (lower.includes("prospect") || lower.includes("lead") || lower.includes("scrape")) {
    return `Run a small outreach test for "${query}" and refine the targeting before scaling.`;
  }
  if (lower.includes("ad") || lower.includes("ads") || lower.includes("campaign")) {
    return `Focus on one "${query}" campaign, measure ROAS for 7 days, then reallocate budget.`;
  }
  if (primaryCategory) {
    return `Prioritize one ${primaryCategory.toLowerCase()} action tied to "${query}" and validate it this week.`;
  }
  return `Clarify the intent behind "${query}" and rerun the search with one concrete goal.`;
};

const buildReasoning = (intent: SearchResponse["intent"], evidence: SearchEvidenceSummary): string => {
  const ambiguity =
    intent.ambiguity.level === "low"
      ? "Intent is clear."
      : intent.ambiguity.level === "medium"
        ? "Intent is partially specified."
        : "Intent is ambiguous.";
  const evidenceNote =
    evidence.resultCount > 0
      ? `Signals reconciled: ${evidence.resultCount}.`
      : "No matched signals were found.";
  return `${evidenceNote} ${ambiguity} Recommendation favors a low-risk next step.`;
};

const buildAssumptions = (intent: SearchResponse["intent"], evidence: SearchEvidenceSummary): string[] => [
  "Signals are mock-first and indicate direction, not execution.",
  intent.ambiguity.level === "high"
    ? "Intent needs clarification before scaling any action."
    : "Intent is sufficient for a small validation step.",
  evidence.resultCount > 0
    ? "Top signals are representative of the query."
    : "Clarifying the query should improve coverage.",
];

const buildDecision = (
  query: string,
  intent: SearchResponse["intent"],
  domains: SignalDomainId[],
  evidence: SearchEvidenceSummary,
  createdAt: string
): Decision => {
  const inputHash = hashString(`${intent.normalized}|${query}|${domains.join(",")}`);
  const base = 0.5;
  const ambiguityAdjustment =
    intent.ambiguity.level === "low" ? 0.2 : intent.ambiguity.level === "medium" ? 0.1 : -0.2;
  const evidenceAdjustment = evidence.resultCount > 0 ? 0.1 : -0.15;
  const coveredDomains = evidence.domainCounts.filter((entry) => entry.count > 0).length;
  const coverageAdjustment = domains.length > 0 ? (coveredDomains / domains.length) * 0.1 : 0;
  const confidence = clampConfidence(base + ambiguityAdjustment + evidenceAdjustment + coverageAdjustment);

  return {
    decision_id: buildDecisionId(inputHash, createdAt),
    input_hash: inputHash,
    recommendation: buildRecommendation(query, evidence),
    reasoning: buildReasoning(intent, evidence),
    assumptions: buildAssumptions(intent, evidence),
    confidence,
    status: "proposed",
    created_at: createdAt,
  };
};

const buildFailureDecision = (
  query: string,
  intent: SearchResponse["intent"],
  domains: SignalDomainId[],
  createdAt: string,
  message: string
): Decision => {
  const inputHash = hashString(`${intent.normalized}|${query}|${domains.join(",")}|failed`);
  return {
    decision_id: buildDecisionId(inputHash, createdAt),
    input_hash: inputHash,
    recommendation: `Retry "${query}" after the search upstream recovers.`,
    reasoning: `Search upstream failed: ${message}. Returning a safe fallback decision.`,
    assumptions: [
      "Upstream coverage is required to validate signals.",
      "Retrying after recovery should restore evidence.",
    ],
    confidence: 0.15,
    status: "failed",
    created_at: createdAt,
  };
};

export const runSearch = async (query: string, options: SearchOptions = {}): Promise<SearchResponse> => {
  const intent = parseIntent(query);
  const domains = options.domains && options.domains.length > 0 ? options.domains : DEFAULT_DOMAINS;
  const now = options.now ?? new Date().toISOString();
  const latencyMs = options.latencyMs ?? 180;
  const extraSignals = options.extraSignals ?? {};
  const ambiguityNote =
    intent.ambiguity.level === "low"
      ? "Intent looks clear."
      : intent.ambiguity.level === "medium"
        ? "Intent is partially specified; results are framed safely."
        : "Intent is ambiguous; results are framed safely and remain read-only.";

  const runAnalytics = async (decision: Decision): Promise<SearchAnalyticsMeta | undefined> => {
    if (!options.analytics) return undefined;
    try {
      await options.analytics({
        query,
        decision_id: decision.decision_id,
        status: decision.status,
        confidence: decision.confidence,
      });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "analytics_failed";
      console.warn("[search-pilot] Analytics failed.", message);
      return { ok: false, error: message };
    }
  };

  if (options.mode === "live") {
    const message = "live_search_unavailable";
    const evidence: SearchEvidenceSummary = {
      resultCount: 0,
      domainCounts: domains.map((domain) => ({ domain, count: 0 })),
      categoryHighlights: [],
      notes: ["Live search is unavailable in mock-first mode."],
    };
    const decision = buildFailureDecision(query, intent, domains, now, message);
    const analytics = await runAnalytics(decision);
    return {
      query,
      intent,
      domains: unique(domains),
      decision,
      explanation: buildExplanation(`Upstream failure: ${message}`, domains),
      evidence_summary: evidence,
      analytics,
    };
  }

  try {
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

    const evidence = buildEvidenceSummary(results, domains);
    const decision = buildDecision(query, intent, domains, evidence, now);
    const analytics = await runAnalytics(decision);

    return {
      query,
      intent,
      domains: unique(domains),
      decision,
      explanation: buildExplanation(ambiguityNote, domains),
      evidence_summary: evidence,
      analytics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "upstream_failed";
    const evidence: SearchEvidenceSummary = {
      resultCount: 0,
      domainCounts: domains.map((domain) => ({ domain, count: 0 })),
      categoryHighlights: [],
      notes: [`Upstream failure: ${message}`],
    };
    const decision = buildFailureDecision(query, intent, domains, now, message);
    const analytics = await runAnalytics(decision);

    return {
      query,
      intent,
      domains: unique(domains),
      decision,
      explanation: buildExplanation(`Upstream failure: ${message}`, domains),
      evidence_summary: evidence,
      analytics,
    };
  }
};
