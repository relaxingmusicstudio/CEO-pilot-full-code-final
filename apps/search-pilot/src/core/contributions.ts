import type { Signal, SignalDomainId } from "./types";
import { normalizeText, slugify } from "./utils";

export type ContributionKind = "submission" | "observation";
export type ContributionSource = "upload" | "link" | "csv" | "note";

export type Contribution = {
  id: string;
  timestamp: string;
  kind: ContributionKind;
  source: ContributionSource;
  label: string;
  notes: string;
  tags: string[];
  location?: string;
};

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const CONTRIBUTION_PREFIX = "ppp:searchPilot:contrib:v1::";
const CONTRIBUTION_CLOCK = "ppp:searchPilot:contribClock:v1::";

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
};

const contribKey = (ownerId: string) => `${CONTRIBUTION_PREFIX}${ownerId}`;
const clockKey = (ownerId: string) => `${CONTRIBUTION_CLOCK}${ownerId}`;

export const nextContributionId = (ownerId: string, storage?: StorageLike): string => {
  const resolved = resolveStorage(storage);
  if (!resolved) return `contrib-${ownerId}-1`;
  const raw = resolved.getItem(clockKey(ownerId));
  const current = Number.parseInt(String(raw ?? ""), 10);
  const nextValue = Number.isFinite(current) ? current + 1 : 1;
  resolved.setItem(clockKey(ownerId), String(nextValue));
  return `contrib-${ownerId}-${nextValue}`;
};

export const appendContribution = (
  ownerId: string,
  contribution: Omit<Contribution, "id" | "timestamp">,
  storage?: StorageLike
): Contribution => {
  const resolved = resolveStorage(storage);
  const stamped: Contribution = {
    ...contribution,
    id: nextContributionId(ownerId, storage),
    timestamp: new Date().toISOString(),
  };
  if (!resolved) return stamped;
  try {
    const raw = resolved.getItem(contribKey(ownerId));
    const parsed = raw ? (JSON.parse(raw) as Contribution[]) : [];
    const next = Array.isArray(parsed) ? [...parsed, stamped] : [stamped];
    resolved.setItem(contribKey(ownerId), JSON.stringify(next));
  } catch {
    // ignore persistence failures
  }
  return stamped;
};

export const loadContributions = (ownerId: string, storage?: StorageLike): Contribution[] => {
  const resolved = resolveStorage(storage);
  if (!resolved) return [];
  try {
    const raw = resolved.getItem(contribKey(ownerId));
    const parsed = raw ? (JSON.parse(raw) as Contribution[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const contributionToSignal = (contribution: Contribution, domain: SignalDomainId): Signal => {
  const tags = contribution.tags.length > 0 ? contribution.tags : normalizeText(contribution.label).split(" ");
  const entityId = slugify(contribution.label || "user-contribution");
  const baseTitle = contribution.label || "User contribution";
  const summary = contribution.notes || "User provided submission for review.";
  const timestamp = contribution.timestamp;
  return {
    id: contribution.id,
    domain,
    entityId,
    title: baseTitle,
    summary,
    url: contribution.source === "link" ? contribution.notes : undefined,
    location: contribution.location,
    tags,
    confidence: 0.55,
    timestamp,
    evidence: {
      id: `${domain}:${contribution.id}`,
      domain,
      signalId: contribution.id,
      excerpt: summary,
      timestamp,
    },
  };
};

export const buildContributionSignals = (
  contributions: Contribution[],
  kind: ContributionKind,
  domain: SignalDomainId
): Signal[] =>
  contributions.filter((entry) => entry.kind === kind).map((entry) => contributionToSignal(entry, domain));
