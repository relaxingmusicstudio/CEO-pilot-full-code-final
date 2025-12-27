import { CostShockEvent, EmergencyModeState } from "./contracts";
import { buildEmergencyCausalChain } from "./interpretability";
import { recordCostShockEvent, recordCausalChain, saveEmergencyMode, loadEmergencyMode, clearEmergencyMode } from "./runtimeState";
import { createId, nowIso } from "./utils";

export type CostShockInput = {
  identityKey: string;
  type: CostShockEvent["type"];
  severity: CostShockEvent["severity"];
  description: string;
  simulated?: boolean;
  expiresAt?: string;
  now?: string;
};

const defaultExpiry = (now: string, hours: number): string => {
  const date = new Date(now);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
};

const modeForSeverity = (severity: CostShockEvent["severity"]): EmergencyModeState["mode"] => {
  if (severity === "high") return "emergency";
  if (severity === "medium") return "constrained";
  return "constrained";
};

export const simulateCostShock = (input: CostShockInput): { event: CostShockEvent; mode: EmergencyModeState } => {
  const now = input.now ?? nowIso();
  const event: CostShockEvent = {
    shockId: createId("shock"),
    identityKey: input.identityKey,
    type: input.type,
    severity: input.severity,
    description: input.description,
    simulated: input.simulated ?? true,
    createdAt: now,
    expiresAt: input.expiresAt ?? defaultExpiry(now, 12),
  };
  recordCostShockEvent(input.identityKey, event);

  const mode: EmergencyModeState = {
    mode: modeForSeverity(input.severity),
    reason: input.description,
    triggeredBy: "simulation",
    maxModelTier: input.severity === "high" ? "economy" : "standard",
    scheduleNonCritical: true,
    blockHighRisk: input.severity === "high",
    createdAt: now,
    expiresAt: event.expiresAt,
  };
  saveEmergencyMode(input.identityKey, mode);
  recordCausalChain(input.identityKey, buildEmergencyCausalChain({ identityKey: input.identityKey, mode, event, now }));
  return { event, mode };
};

export const setEmergencyMode = (identityKey: string, mode: EmergencyModeState): EmergencyModeState | null => {
  const saved = saveEmergencyMode(identityKey, mode);
  if (saved) {
    recordCausalChain(identityKey, buildEmergencyCausalChain({ identityKey, mode: saved, now: nowIso() }));
  }
  return saved;
};

export const getEmergencyMode = (identityKey: string): EmergencyModeState | null => loadEmergencyMode(identityKey);

export const clearEmergencyModeState = (identityKey: string): void => clearEmergencyMode(identityKey);
