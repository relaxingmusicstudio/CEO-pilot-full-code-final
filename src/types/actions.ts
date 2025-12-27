export type ActionType =
  | "message"
  | "email"
  | "sms"
  | "voice"
  | "note"
  | "task"
  | "webhook"
  | "wait"
  | "update_state";

export type CostCategory = "compute" | "reasoning" | "io" | "human_attention" | "risk";

export type ActionSpec = {
  action_id: string;
  action_type: ActionType;
  description: string;
  intent_id: string;
  expected_metric?: string;
  risk_level: "low" | "medium" | "high";
  irreversible: boolean;
  payload: Record<string, unknown>;
  costUnits: number;
  costCategory: CostCategory;
};

export type ExecutionRecord = {
  execution_id: string;
  action_id: string;
  intent_id: string;
  status: "planned" | "blocked" | "cooldown" | "confirmed" | "executed" | "failed";
  evidence: { kind: "mock" | "log" | "receipt" | "none"; value?: string };
  createdAt: string;
  updatedAt: string;
};

const normalizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const next: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      next[key] = normalizeValue(record[key]);
    }
    return next;
  }
  return value;
};

export const stableStringify = (value: unknown): string => JSON.stringify(normalizeValue(value));

export const hashString = (input: string): string => {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

export const computeActionId = (spec: Omit<ActionSpec, "action_id">): string => {
  const base = stableStringify({
    action_type: spec.action_type,
    payload: spec.payload,
    intent_id: spec.intent_id,
  });
  return `act_${hashString(base)}`;
};
