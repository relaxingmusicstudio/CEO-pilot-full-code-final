import type { CanonicalFact, IntentParse, ReconciledResult, Signal, SignalDomainId } from "./types";
import { FIXTURE_DOMAIN_ORDER, FIXTURE_SIGNALS } from "./fixtures";
import { clamp, normalizeText, unique, simulateLatency } from "./utils";

export const DOMAIN_LABELS: Record<SignalDomainId, string> = {
  local_listings: "Local Listings",
  websites: "Websites",
  social_signals: "Social Signals",
  user_submissions: "User Submissions",
  observations: "Observations",
};

export const DEFAULT_DOMAINS: SignalDomainId[] = [...FIXTURE_DOMAIN_ORDER];

const categoryForTags = (tags: string[]): string => {
  if (tags.includes("hvac")) return "HVAC";
  if (tags.includes("plumbing")) return "Plumbing";
  if (tags.includes("roofing")) return "Roofing";
  if (tags.includes("electrical")) return "Electrical";
  if (tags.includes("landscaping")) return "Landscaping";
  if (tags.includes("gap")) return "Market Gap";
  return "General";
};

const matchIntent = (signal: Signal, intent: IntentParse): boolean => {
  const intentServices = intent.primitives.filter((p) => p.type === "service").map((p) => p.value);
  const intentLocations = intent.primitives.filter((p) => p.type === "location").map((p) => p.value);

  const tagSet = new Set(signal.tags.map(normalizeText));
  const locationText = normalizeText(signal.location ?? "");

  const serviceMatch =
    intentServices.length === 0 || intentServices.some((service) => tagSet.has(normalizeText(service)));
  const locationMatch =
    intentLocations.length === 0 ||
    intentLocations.some((location) => locationText.includes(normalizeText(location)) || tagSet.has(location));

  return serviceMatch && locationMatch;
};

export const queryDomain = async (
  domain: SignalDomainId,
  intent: IntentParse,
  options: {
    latencyMs: number;
    extraSignals?: Partial<Record<SignalDomainId, Signal[]>>;
  }
): Promise<Signal[]> => {
  const fixtures = FIXTURE_SIGNALS[domain] || [];
  const extras = options.extraSignals?.[domain] ?? [];
  const signals = [...fixtures, ...extras];

  await simulateLatency(options.latencyMs);

  const filtered = signals.filter((signal) => matchIntent(signal, intent));
  if (filtered.length > 0) return filtered;
  return signals.slice(0, 3);
};

export const normalizeSignal = (signal: Signal): CanonicalFact => ({
  entityId: signal.entityId,
  name: signal.title,
  category: categoryForTags(signal.tags),
  location: signal.location,
  tags: signal.tags,
  claims: [signal.summary],
  signals: [signal.evidence],
  domain: signal.domain,
  confidence: signal.confidence,
  timestamp: signal.timestamp,
});

export const reconcileFacts = (facts: CanonicalFact[]): ReconciledResult[] => {
  const grouped = new Map<string, CanonicalFact[]>();
  facts.forEach((fact) => {
    const bucket = grouped.get(fact.entityId) ?? [];
    bucket.push(fact);
    grouped.set(fact.entityId, bucket);
  });

  return Array.from(grouped.entries()).map(([entityId, entries]) => {
    const name = entries[0]?.name ?? "Unknown";
    const tags = unique(entries.flatMap((entry) => entry.tags));
    const claims = unique(entries.flatMap((entry) => entry.claims));
    const evidence = entries.flatMap((entry) => entry.signals);
    const domains = unique(entries.map((entry) => entry.domain));
    const confidence = clamp(
      entries.reduce((sum, entry) => sum + entry.confidence, 0) / Math.max(entries.length, 1),
      0,
      1
    );
    const latestTimestamp = entries
      .map((entry) => entry.timestamp)
      .sort((a, b) => (a < b ? 1 : -1))[0];

    return {
      entityId,
      name,
      category: entries[0]?.category ?? categoryForTags(tags),
      location: entries[0]?.location,
      tags,
      claims,
      evidence,
      domains,
      confidence,
      latestTimestamp,
    };
  });
};
