import { getOnboardingData } from "./onboarding";
import { loadCEOPlan } from "./ceoPlan";
import type { DecisionOutcome } from "./decisionOutcome";
import { executed, halted, transformed } from "./decisionOutcome";
import { ensureOutcome } from "./loopGuard";

export type ChecklistItem = {
  id: string;
  text: string;
  section?: string;
  order: number;
};

export type ChecklistState = {
  completedIds: string[];
  updatedAt: string | null;
};

const CHECKLIST_PREFIX = "ppp:ceoPlanChecklist:v1::";
const DO_NEXT_PREFIX = "ppp:ceoDoNext:v1::";
const DO_NEXT_HISTORY_PREFIX = "ppp:ceoDoNextHistory:v1::";

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

export const parsePlanToChecklist = (planMarkdown?: string): ChecklistItem[] => {
  if (!planMarkdown) return [];
  const lines = planMarkdown.split(/\r?\n/);
  let currentSection: string | undefined;
  const items: ChecklistItem[] = [];

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;

    if (/^(#+\s+|Week\s+\d+|Day\s+\d+)/i.test(line)) {
      currentSection = line.replace(/^#+\s*/, "");
      return;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    const orderedMatch = line.match(/^\d+\.\s+(.*)/);
    const text = bulletMatch?.[1] || orderedMatch?.[1] || null;
    if (text) {
      const id = `ck-${idx}-${hashString(text)}`;
      items.push({ id, text: text.trim(), section: currentSection, order: items.length });
    }
  });

  return items;
};

export const loadChecklistState = (userId?: string | null, email?: string | null): ChecklistState => {
  const key = makeKey(CHECKLIST_PREFIX, userId, email);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { completedIds: [], updatedAt: null };
    return JSON.parse(raw) as ChecklistState;
  } catch {
    return { completedIds: [], updatedAt: null };
  }
};

export const saveChecklistState = (
  state: ChecklistState,
  userId?: string | null,
  email?: string | null
) => {
  const key = makeKey(CHECKLIST_PREFIX, userId, email);
  localStorage.setItem(key, JSON.stringify(state));
};

export type DoNextState = {
  taskId: string;
  responseMarkdown: string;
  parsedJson: DoNextPayload | null;
  updatedAt: string;
  agentIntent?: string;
  checklistItemText?: string;
  rawResponse?: string;
  decisionOutcome: DecisionOutcome;
};

export const loadDoNextState = (userId?: string | null, email?: string | null): DoNextState | null => {
  const key = makeKey(DO_NEXT_PREFIX, userId, email);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DoNextState;
    const responseMarkdown = parsed.responseMarkdown || parsed.rawResponse || "";
    const parsedJson = parsed.parsedJson ?? parseDoNextPayload(responseMarkdown);
    const decisionOutcome = resolveDecisionOutcome(parsed.decisionOutcome, responseMarkdown, parsedJson);
    const agentIntent = parsed.agentIntent || "ceo_do_next";
    return {
      ...parsed,
      responseMarkdown,
      parsedJson,
      decisionOutcome,
      agentIntent,
    };
  } catch {
    return null;
  }
};

export const saveDoNextState = (
  state: DoNextState,
  userId?: string | null,
  email?: string | null
) => {
  const key = makeKey(DO_NEXT_PREFIX, userId, email);
  localStorage.setItem(key, JSON.stringify(state));
};

export const getPlanChecklist = (userId?: string | null, email?: string | null): ChecklistItem[] => {
  const plan = loadCEOPlan(userId, email);
  if (!plan) return [];
  return parsePlanToChecklist(plan.planMarkdown);
};

export const getOnboardingSnapshotHash = (userId?: string | null, email?: string | null) =>
  hashString(JSON.stringify(getOnboardingData(userId, email)));

export type DoNextStep = {
  label: string;
  expectedOutcome: string;
  estimatedMinutes?: number;
};

export type DoNextPayload = {
  title: string;
  objective: string;
  steps: DoNextStep[];
  successCriteria: string[];
  blockers: string[];
  escalationPrompt: string;
};

export type DoNextHistoryEntry = {
  createdAt: string;
  checklistItemId: string;
  checklistItemText: string;
  agentIntent: string;
  rawResponse: string;
  parsedJson: DoNextPayload | null;
  decisionOutcome: DecisionOutcome;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const coerceMinutes = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const num = Number.parseFloat(value);
    if (Number.isFinite(num)) return num;
  }
  return undefined;
};

const buildDoNextOutcome = (rawResponse: string, payload: DoNextPayload | null): DecisionOutcome => {
  if (payload) {
    return executed(payload.title || "Do Next executed", { payload, rawResponse });
  }
  if (rawResponse.trim().length > 0) {
    return transformed("Do Next captured", { markdown: rawResponse });
  }
  return halted("MISSING_RESPONSE", { receivedType: typeof rawResponse, receivedKeys: [] });
};

const resolveDecisionOutcome = (
  outcome: DecisionOutcome | null | undefined,
  rawResponse: string,
  payload: DoNextPayload | null
): DecisionOutcome => ensureOutcome(outcome ?? buildDoNextOutcome(rawResponse, payload), "INVALID_OUTCOME");

const normalizeDoNextPayload = (value: unknown): DoNextPayload | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  const steps: DoNextStep[] = Array.isArray(record.steps)
    ? record.steps
        .map((step) => {
          if (!step || typeof step !== "object") return null;
          const stepRecord = step as Record<string, unknown>;
          const label = isNonEmptyString(stepRecord.label) ? stepRecord.label.trim() : null;
          const expectedOutcome = isNonEmptyString(stepRecord.expectedOutcome)
            ? stepRecord.expectedOutcome.trim()
            : null;
          if (!label || !expectedOutcome) return null;
          const estimatedMinutes = coerceMinutes(stepRecord.estimatedMinutes);
          return estimatedMinutes !== undefined
            ? { label, expectedOutcome, estimatedMinutes }
            : { label, expectedOutcome };
        })
        .filter(Boolean) as DoNextStep[]
    : [];

  const payload: DoNextPayload = {
    title: isNonEmptyString(record.title) ? record.title.trim() : "",
    objective: isNonEmptyString(record.objective) ? record.objective.trim() : "",
    steps,
    successCriteria: Array.isArray(record.successCriteria)
      ? record.successCriteria.filter(isNonEmptyString).map((item) => item.trim())
      : [],
    blockers: Array.isArray(record.blockers)
      ? record.blockers.filter(isNonEmptyString).map((item) => item.trim())
      : [],
    escalationPrompt: isNonEmptyString(record.escalationPrompt)
      ? record.escalationPrompt.trim()
      : "",
  };

  if (!payload.title || !payload.objective || payload.steps.length === 0 || !payload.escalationPrompt) {
    return null;
  }

  return payload;
};

export const parseDoNextPayload = (rawResponse: string): DoNextPayload | null => {
  if (!rawResponse) return null;

  const fenceMatch =
    rawResponse.match(/```json\s*([\s\S]*?)```/i) ||
    rawResponse.match(/```\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenceMatch?.[1]) {
    candidates.push(fenceMatch[1]);
  }
  candidates.push(rawResponse);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim());
      const normalized = normalizeDoNextPayload(parsed);
      if (normalized) return normalized;
    } catch {
      continue;
    }
  }

  return null;
};

export const loadDoNextHistory = (userId?: string | null, email?: string | null): DoNextHistoryEntry[] => {
  const key = makeKey(DO_NEXT_HISTORY_PREFIX, userId, email);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DoNextHistoryEntry[];
    return parsed.map((entry) => {
      const rawResponse = entry.rawResponse || "";
      const parsedJson = entry.parsedJson ?? parseDoNextPayload(rawResponse);
      return {
        ...entry,
        parsedJson,
        decisionOutcome: resolveDecisionOutcome(entry.decisionOutcome, rawResponse, parsedJson),
        agentIntent: entry.agentIntent || "ceo_do_next",
      };
    });
  } catch {
    return [];
  }
};

export const saveDoNextHistory = (
  history: DoNextHistoryEntry[],
  userId?: string | null,
  email?: string | null
) => {
  const key = makeKey(DO_NEXT_HISTORY_PREFIX, userId, email);
  localStorage.setItem(key, JSON.stringify(history.slice(0, 20)));
};

export const recordDoNextHistoryEntry = (
  entry: DoNextHistoryEntry,
  userId?: string | null,
  email?: string | null
): DoNextHistoryEntry[] => {
  const existing = loadDoNextHistory(userId, email);
  const nextHistory = [entry, ...existing].slice(0, 20);
  saveDoNextHistory(nextHistory, userId, email);
  return nextHistory;
};
