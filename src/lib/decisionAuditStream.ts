export type DecisionAuditScope = "decision_input" | "decision_output" | "confidence_bounds";

export type DecisionAuditEntry = {
  id: string;
  timestamp: string;
  source: string;
  scope: DecisionAuditScope;
  code: string;
  message: string;
  decision_id?: string;
  context?: Record<string, unknown>;
};

export type DecisionAuditInput = Omit<DecisionAuditEntry, "id" | "timestamp">;

const STREAM_KEY = "ppp:decision_audit_stream:v1";
const GLOBAL_KEY = "__pppDecisionAuditStream";

const createAuditId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const safeParse = (raw: string | null): DecisionAuditEntry[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DecisionAuditEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const appendToMemory = (entry: DecisionAuditEntry) => {
  const store = globalThis as typeof globalThis & { [GLOBAL_KEY]?: DecisionAuditEntry[] };
  if (!store[GLOBAL_KEY]) {
    store[GLOBAL_KEY] = [];
  }
  store[GLOBAL_KEY]?.push(entry);
};

const appendToLocalStorage = (entry: DecisionAuditEntry): boolean => {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    const existing = safeParse(window.localStorage.getItem(STREAM_KEY));
    existing.push(entry);
    window.localStorage.setItem(STREAM_KEY, JSON.stringify(existing));
    return true;
  } catch {
    return false;
  }
};

export const appendDecisionAudit = (input: DecisionAuditInput): DecisionAuditEntry => {
  const entry: DecisionAuditEntry = {
    id: createAuditId(),
    timestamp: new Date().toISOString(),
    ...input,
  };
  const persisted = appendToLocalStorage(entry);
  if (!persisted) {
    appendToMemory(entry);
  }
  return entry;
};
