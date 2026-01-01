import type { Decision } from "../../../../src/kernel/decisionContract";

export type SignalDomainId =
  | "local_listings"
  | "websites"
  | "social_signals"
  | "user_submissions"
  | "observations";

export type IntentPrimitiveType =
  | "service"
  | "industry"
  | "location"
  | "goal"
  | "urgency"
  | "entity"
  | "unknown";

export type IntentPrimitive = {
  type: IntentPrimitiveType;
  value: string;
  confidence: number;
  source: "keyword" | "pattern";
};

export type IntentAmbiguity = {
  level: "low" | "medium" | "high";
  reasons: string[];
};

export type IntentParse = {
  raw: string;
  normalized: string;
  primitives: IntentPrimitive[];
  ambiguity: IntentAmbiguity;
};

export type EvidenceRef = {
  id: string;
  domain: SignalDomainId;
  signalId: string;
  excerpt: string;
  timestamp: string;
};

export type Signal = {
  id: string;
  domain: SignalDomainId;
  entityId: string;
  title: string;
  summary: string;
  url?: string;
  location?: string;
  tags: string[];
  confidence: number;
  timestamp: string;
  evidence: EvidenceRef;
};

export type CanonicalFact = {
  entityId: string;
  name: string;
  category: string;
  location?: string;
  tags: string[];
  claims: string[];
  signals: EvidenceRef[];
  domain: SignalDomainId;
  confidence: number;
  timestamp: string;
};

export type ReconciledResult = {
  entityId: string;
  name: string;
  category: string;
  location?: string;
  tags: string[];
  claims: string[];
  evidence: EvidenceRef[];
  domains: SignalDomainId[];
  confidence: number;
  latestTimestamp: string;
};

export type ScoreBreakdown = {
  relevance: number;
  confidence: number;
  freshness: number;
  agreement: number;
  finalScore: number;
};

export type SearchResult = {
  id: string;
  name: string;
  category: string;
  location?: string;
  summary: string;
  tags: string[];
  evidence: EvidenceRef[];
  domains: SignalDomainId[];
  scores: ScoreBreakdown;
  confidenceExplanation: string;
};

export type SearchAnalyticsMeta = {
  ok: boolean;
  error?: string;
};

export type SearchEvidenceSummary = {
  resultCount: number;
  domainCounts: DomainResultSummary[];
  categoryHighlights: string[];
  notes: string[];
};

export type SearchResponse = {
  query: string;
  intent: IntentParse;
  domains: SignalDomainId[];
  decision: Decision;
  explanation: string;
  evidence_summary: SearchEvidenceSummary;
  analytics?: SearchAnalyticsMeta;
};

export type SearchInteractionType = "click" | "save" | "ignore";

export type SearchLedgerEvent =
  | {
      eventType: "search";
      entryId: string;
      timestamp: string;
      query: string;
      intent: IntentParse;
      domains: SignalDomainId[];
      decision: Decision;
      evidence_summary: SearchEvidenceSummary;
    }
  | {
      eventType: "interaction";
      entryId: string;
      timestamp: string;
      searchEntryId: string;
      interaction: {
        type: SearchInteractionType;
        decisionId: string;
      };
    };

export type LedgerPage = {
  entries: SearchLedgerEvent[];
  nextCursor: string | null;
};

export type DomainResultSummary = {
  domain: SignalDomainId;
  count: number;
};

export type SearchAnalyticsEvent = {
  query: string;
  decision_id: string;
  status: Decision["status"];
  confidence: number;
};

export type SearchOptions = {
  domains?: SignalDomainId[];
  mode?: "mock" | "live";
  now?: string;
  latencyMs?: number;
  extraSignals?: Partial<Record<SignalDomainId, Signal[]>>;
  analytics?: (event: SearchAnalyticsEvent) => Promise<void> | void;
};
