const DAILY_BRIEF_PREFIX = "ppp:ceoDailyBrief:v1::";

const makeKey = (prefix: string, userId?: string | null, email?: string | null) =>
  `${prefix}${userId || email || "anonymous"}`;

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
};

export type DailyBriefPayload = {
  primaryFocus: string;
  whyItMatters: string;
  nextActions: string[];
};

export type DailyBriefState = {
  payload: DailyBriefPayload | null;
  rawResponse: string;
  createdAt: string;
  onboardingHash: string;
  planHash: string;
};

const isNonEmptyString = (val: unknown): val is string => typeof val === "string" && val.trim().length > 0;

const normalizeDailyBrief = (value: unknown): DailyBriefPayload | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  const primaryFocus = isNonEmptyString(record.primaryFocus) ? record.primaryFocus.trim() : "";
  const whyItMatters = isNonEmptyString(record.whyItMatters) ? record.whyItMatters.trim() : "";
  const actions = Array.isArray(record.nextActions)
    ? record.nextActions.filter(isNonEmptyString).map((item) => item.trim()).slice(0, 3)
    : [];

  if (!primaryFocus || !whyItMatters || actions.length === 0) return null;

  return { primaryFocus, whyItMatters, nextActions: actions };
};

export const parseDailyBriefPayload = (rawResponse: string): DailyBriefPayload | null => {
  if (!rawResponse) return null;
  const fenceMatch =
    rawResponse.match(/```json\s*([\s\S]*?)```/i) ||
    rawResponse.match(/```\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenceMatch?.[1]) candidates.push(fenceMatch[1]);
  candidates.push(rawResponse);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim());
      const normalized = normalizeDailyBrief(parsed);
      if (normalized) return normalized;
    } catch {
      continue;
    }
  }
  return null;
};

export const loadDailyBrief = (userId?: string | null, email?: string | null): DailyBriefState | null => {
  const key = makeKey(DAILY_BRIEF_PREFIX, userId, email);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyBriefState;
    return {
      ...parsed,
      payload: parsed.payload ?? parseDailyBriefPayload(parsed.rawResponse),
    };
  } catch {
    return null;
  }
};

export const saveDailyBrief = (state: DailyBriefState, userId?: string | null, email?: string | null) => {
  const key = makeKey(DAILY_BRIEF_PREFIX, userId, email);
  localStorage.setItem(key, JSON.stringify(state));
};

export const computePlanHash = (planMarkdown?: string) => hashString(planMarkdown || "");
