import type { ActionSpec, ExecutionRecord } from "../types/actions";
import { computeIdentityKey } from "./spine";
import { evaluateAction, type PolicyContext, type PolicyMode } from "./policyEngine";
import { runAction } from "./actionRunner";
import { enforceRuntimeGovernance, type AgentRuntimeContext } from "./ceoPilot/runtimeGovernance";
import { assertCostContext } from "./ceoPilot/costUtils";
import { scheduleDueToCost } from "./ceoPilot/scheduling";
import { recordCostEvent } from "./ceoPilot/runtimeState";
import { createId, nowIso } from "./ceoPilot/utils";
import { ensureActionEconomics } from "./ceoPilot/economics/costModel";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

type ExecuteActionOptions = {
  requireUserConfirm?: boolean;
  identityKey?: string;
  policyContext?: PolicyContext;
  initiator?: "agent" | "human" | "system";
  agentContext?: AgentRuntimeContext;
};

const LEDGER_PREFIX = "ppp:execLedger:v1::";
const CLOCK_PREFIX = "ppp:execLedgerClock:v1::";

const createMemoryStorage = (): StorageLike => {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
};

const memoryStorage = createMemoryStorage();

const getStorage = (): StorageLike => {
  const globalStorage = (globalThis as { localStorage?: StorageLike }).localStorage;
  if (globalStorage) return globalStorage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return memoryStorage;
};

const readFlag = (storage: StorageLike, key: string): boolean => {
  try {
    return storage.getItem(key) === "true";
  } catch {
    return false;
  }
};

const resolveMode = (storage: StorageLike): PolicyMode => {
  const envMock = import.meta.env?.VITE_MOCK_AUTH === "true";
  if (envMock || readFlag(storage, "VITE_MOCK_AUTH")) return "MOCK";
  if (readFlag(storage, "__DEV_OFFLINE")) return "OFFLINE";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "OFFLINE";
  if (typeof window === "undefined") return "OFFLINE";
  return "LIVE";
};

const resolveTrustLevel = (mode: PolicyMode): number => {
  if (mode === "MOCK") return 1;
  return 0;
};

const readLedger = (storage: StorageLike, identityKey: string): ExecutionRecord[] => {
  const raw = storage.getItem(`${LEDGER_PREFIX}${identityKey}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ExecutionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLedger = (storage: StorageLike, identityKey: string, entries: ExecutionRecord[]) => {
  try {
    storage.setItem(`${LEDGER_PREFIX}${identityKey}`, JSON.stringify(entries));
  } catch {
    // ignore persistence errors
  }
};

const nextClock = (storage: StorageLike, identityKey: string): string => {
  const key = `${CLOCK_PREFIX}${identityKey}`;
  const raw = storage.getItem(key);
  const current = raw ? Number.parseInt(raw, 10) : 0;
  const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
  storage.setItem(key, String(next));
  return `s${next}`;
};

const buildRecord = (
  base: Pick<ExecutionRecord, "action_id" | "intent_id">,
  status: ExecutionRecord["status"],
  evidence: ExecutionRecord["evidence"],
  timestamp: string
): ExecutionRecord => ({
  execution_id: `exec-${timestamp}`,
  action_id: base.action_id,
  intent_id: base.intent_id,
  status,
  evidence,
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const executeActionPipeline = async (
  action: ActionSpec,
  opts: ExecuteActionOptions = {}
): Promise<ExecutionRecord> => {
  const storage = getStorage();
  const mode = opts.policyContext?.mode ?? resolveMode(storage);
  const trustLevel = opts.policyContext?.trustLevel ?? resolveTrustLevel(mode);
  const ctx: PolicyContext = { mode, trustLevel };
  const identityKey = opts.identityKey || computeIdentityKey(undefined, undefined);
  const actionWithCost = ensureActionEconomics(action);
  const governanceContext = opts.agentContext
    ? {
        ...opts.agentContext,
        tool: opts.agentContext.tool || actionWithCost.action_type,
        decisionType: opts.agentContext.decisionType || actionWithCost.action_type,
        impact: opts.agentContext.impact ?? (actionWithCost.irreversible ? "irreversible" : "reversible"),
        costUnits: opts.agentContext.costUnits ?? actionWithCost.costUnits,
        costCategory: opts.agentContext.costCategory ?? actionWithCost.costCategory,
        costChargeId: opts.agentContext.costChargeId ?? `action:${actionWithCost.action_id}`,
        costSource: opts.agentContext.costSource ?? "action",
      }
    : undefined;
  if (governanceContext) {
    assertCostContext(governanceContext);
  }
  const governance = await enforceRuntimeGovernance(identityKey, governanceContext, opts.initiator ?? "agent");
  const safeIntentId =
    actionWithCost.intent_id && actionWithCost.intent_id.trim().length > 0
      ? actionWithCost.intent_id
      : mode === "MOCK"
        ? "intent:default"
        : "intent:missing";
  const timestamp = nextClock(storage, identityKey);

  if (!governance.allowed) {
    if (
      governance.details.cost?.hardLimitExceeded &&
      governanceContext?.goalId &&
      governanceContext.taskType
    ) {
      const schedulingDecision = scheduleDueToCost({
        identityKey,
        taskId: actionWithCost.action_id,
        goalId: governanceContext.goalId,
        agentId: governanceContext.agentId,
        taskType: governanceContext.taskType,
        action: actionWithCost,
        agentContext: governanceContext,
        initiator: opts.initiator ?? "agent",
        reason: "cost_budget_exceeded",
      });
      if (schedulingDecision.scheduledTask) {
        recordCostEvent(identityKey, {
          eventId: createId("cost-event"),
          type: "scheduled_due_to_cost",
          identityKey,
          goalId: governanceContext.goalId,
          agentId: governanceContext.agentId,
          taskType: governanceContext.taskType,
          taskClass: governanceContext.taskClass,
          reason: "scheduled_due_to_cost",
          justification: governanceContext.taskDescription,
          createdAt: nowIso(),
          metadata: { scheduleId: schedulingDecision.scheduledTask.scheduleId },
        });
        const deferred = buildRecord(
          { action_id: actionWithCost.action_id, intent_id: safeIntentId },
          "cooldown",
          { kind: "log", value: `SCHEDULED_DUE_TO_COST:${schedulingDecision.scheduledTask.scheduleId}` },
          timestamp
        );
        const nextEntries = [...readLedger(storage, identityKey), deferred];
        writeLedger(storage, identityKey, nextEntries);
        return deferred;
      }
    }
    const blocked = buildRecord(
      { action_id: actionWithCost.action_id, intent_id: safeIntentId },
      "blocked",
      { kind: "log", value: `GOVERNANCE_BLOCKED:${governance.reason}` },
      timestamp
    );
    const nextEntries = [...readLedger(storage, identityKey), blocked];
    writeLedger(storage, identityKey, nextEntries);
    return blocked;
  }

  const policy = evaluateAction({ ...actionWithCost, intent_id: safeIntentId }, ctx);

  if (!policy.allowed) {
    const blocked = buildRecord(
      { action_id: actionWithCost.action_id, intent_id: safeIntentId },
      "blocked",
      { kind: "log", value: policy.reason ?? "POLICY_BLOCKED" },
      timestamp
    );
    const nextEntries = [...readLedger(storage, identityKey), blocked];
    writeLedger(storage, identityKey, nextEntries);
    return blocked;
  }

  if (policy.requiresConfirm && !opts.requireUserConfirm) {
    const cooldown = buildRecord(
      { action_id: actionWithCost.action_id, intent_id: safeIntentId },
      "cooldown",
      { kind: "log", value: `CONFIRM_REQUIRED:${policy.cooldownSeconds}s` },
      timestamp
    );
    const nextEntries = [...readLedger(storage, identityKey), cooldown];
    writeLedger(storage, identityKey, nextEntries);
    return cooldown;
  }

  if (!opts.agentContext) {
    throw new Error("governance_context_missing_for_execution");
  }
  const result = await runAction({ ...actionWithCost, intent_id: safeIntentId }, ctx, {
    identityKey,
    agentContext: governanceContext,
    initiator: opts.initiator,
  });
  const status: ExecutionRecord["status"] = result.status === "executed" ? "executed" : "failed";
  const executed = buildRecord({ action_id: action.action_id, intent_id: safeIntentId }, status, result.evidence, timestamp);
  const nextEntries = [...readLedger(storage, identityKey), executed];
  writeLedger(storage, identityKey, nextEntries);
  return executed;
};
