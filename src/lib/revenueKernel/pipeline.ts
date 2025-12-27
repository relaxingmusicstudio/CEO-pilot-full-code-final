import { executed, deferred, halted, type DecisionOutcome } from "../decisionOutcome";
import { computeIdentityKey } from "../spine";
import { evaluateAction, type PolicyContext, type PolicyMode } from "../policyEngine";
import { runAction } from "../actionRunner";
import type { ActionSpec } from "../../types/actions";
import { buildEvidenceRef, type EvidenceRef } from "./evidence";
import { buildGuardOutcome } from "./guardFailures";
import type { LeadConsentState } from "./consent";
import { canOutreach } from "./consent";
import type { ReachabilityProfile, Channel } from "./reachability";
import { canUseChannel, selectChannel } from "./reachability";
import type { ThrottleState, ThrottleResult } from "./throttle";
import { checkThrottle } from "./throttle";
import { appendActionChainEvent, checkActionChainDepth, nextActionChainTimestamp } from "./actionChain";
import { appendAutoHelpEvent, hasUnackedAutoHelp } from "./autoHelp";
import {
  appendCapacityEnergyEvent,
  checkCapacityEnergy,
  getCapacityEnergyConfig,
  getCapacityEnergyState,
  type CapacityEnergyConfig,
  type EnergyChannel,
} from "./capacityEnergy";
import {
  appendCapacityEvent,
  buildCapacityEvidenceAction,
  checkCapacity,
  ensureCapacityConfig,
  getCapacityState,
  nextCapacityTimestamp,
  type CapacityConfig,
  type CoolingState,
} from "./capacityLedger";
import {
  appendCoolingEvent,
  canExitRepair,
  evaluateCoolingState,
  getCoolingState,
  nextCoolingTimestamp,
  type CoolingConfig,
} from "./cooling";
import { appendOpportunityEvent, getOpportunityQueue, getOpportunityQueueConfig, nextOpportunityTimestamp, type OpportunityQueueConfig } from "./opportunityQueue";
import { appendRetryEvent, getRetryState } from "./retryDecay";
import { evaluateSensitiveContext, type SensitiveContext } from "./sensitiveData";
import { appendSoftLockEvent, getSoftLockState } from "./softLocks";
import { appendRevenueLedger, nextRevenueTimestamp, type RevenueLedgerEntry } from "./ledger";
import type { StageTransition } from "./stages";
import { enforceRuntimeGovernance } from "../ceoPilot/runtimeGovernance";
import type { AgentRuntimeContext, RuntimeGovernanceDecision } from "../ceoPilot/runtimeTypes";
import { assertCostContext } from "../ceoPilot/costUtils";
import { scheduleDueToCost } from "../ceoPilot/scheduling";
import { recordCostEvent } from "../ceoPilot/runtimeState";
import { createId, nowIso } from "../ceoPilot/utils";
import { ensureActionEconomics } from "../ceoPilot/economics/costModel";

export type ProofBundle = {
  evidence_ref: EvidenceRef;
  policy: ReturnType<typeof evaluateAction>;
  throttle?: ThrottleResult;
  reachability?: { ok: boolean; reason?: string };
  consent?: { ok: boolean; reason?: string };
  channel?: Channel;
  capacity?: { ok: boolean; reason?: string };
  energy_capacity?: { ok: boolean; reason?: string; required_units: number; channel: EnergyChannel; day_id: string };
  cooling_state?: CoolingState;
  chain?: { ok: boolean; depth: number; maxDepth: number };
  handoff?: { ok: boolean; reason?: string };
  retry?: { ok: boolean; failures: number; required_cooldown_steps: number };
  auto_help?: { ok: boolean; reason?: string };
  soft_lock?: { ok: boolean; holder?: string };
  opportunity_queue?: { status: "none" | "queued" | "blocked" | "ready"; size: number; max_size: number; reason?: string; opportunity_id?: string };
  sensitive?: { ok: boolean; reason?: string; categories: string[] };
  governance?: RuntimeGovernanceDecision;
  execution_status?: "executed" | "failed";
  error?: string;
};

export type PipelineInput = {
  action: ActionSpec;
  identity?: { userId?: string | null; email?: string | null };
  podId?: string;
  humanId?: string;
  initiator?: "agent" | "human" | "system";
  agentContext?: AgentRuntimeContext;
  policyContext?: PolicyContext;
  consent?: LeadConsentState;
  reachability?: ReachabilityProfile;
  throttleState?: ThrottleState;
  provider?: string;
  response_id?: string;
  requireUserConfirm?: boolean;
  opportunity?: { window_id: string; is_new: boolean; opportunity_id?: string; cooldown_satisfied?: boolean };
  opportunityQueueConfig?: OpportunityQueueConfig;
  capacityConfig?: CapacityConfig;
  energyConfig?: CapacityEnergyConfig;
  energyWindowId?: string;
  coolingConfig?: CoolingConfig;
  actionClass?: "growth" | "fulfillment" | "maintenance";
  cooldownSatisfied?: boolean;
  coolingSignal?: "pause" | "resume" | "burnout" | "repair";
  threadId?: string;
  chainMaxDepth?: number;
  chainReset?: boolean;
  handoffRequired?: boolean;
  handoffToken?: string;
  retryKey?: string;
  retryCooldownSatisfied?: boolean;
  autoHelp?: boolean;
  autoHelpAcknowledged?: boolean;
  resourceId?: string;
  resourceAutoRelease?: boolean;
  sensitive?: SensitiveContext;
  stage_transition?: StageTransition;
};

export type PipelineResult = {
  outcome: DecisionOutcome;
  proof: ProofBundle;
  ledgerEntry: RevenueLedgerEntry;
};

const readFlag = (key: string): boolean => {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
};

const resolveMode = (): PolicyMode => {
  if (import.meta.env?.VITE_MOCK_AUTH === "true" || readFlag("VITE_MOCK_AUTH")) return "MOCK";
  if (readFlag("__DEV_OFFLINE")) return "OFFLINE";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "OFFLINE";
  if (typeof window === "undefined") return "OFFLINE";
  return "LIVE";
};

const resolveTrustLevel = (mode: PolicyMode): number => (mode === "MOCK" ? 1 : 0);

const channelForAction = (action: ActionSpec): Channel | null => {
  switch (action.action_type) {
    case "sms":
      return "sms";
    case "voice":
      return "voice";
    case "email":
      return "email";
    case "message":
      return "sms";
    default:
      return null;
  }
};

const isOutbound = (action: ActionSpec): boolean => {
  const channel = channelForAction(action);
  return channel !== null || action.action_type === "webhook";
};

const getPayloadString = (payload: Record<string, unknown> | undefined, keys: string[]): string | undefined => {
  if (!payload) return undefined;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

const resolveThreadId = (payload: Record<string, unknown> | undefined, explicit?: string): string | undefined =>
  explicit || getPayloadString(payload, ["thread_id", "threadId"]);

const resolveResourceId = (payload: Record<string, unknown> | undefined, explicit?: string): string | undefined =>
  explicit || getPayloadString(payload, ["lead_id", "leadId", "resource_id", "resourceId"]);

const resolveOpportunityId = (payload: Record<string, unknown> | undefined, explicit?: string): string | undefined =>
  explicit || getPayloadString(payload, ["opportunity_id", "opportunityId", "lead_id", "leadId"]);

const resolveEnergyChannel = (action: ActionSpec, channel: Channel | null): EnergyChannel => {
  if (channel) return channel;
  switch (action.action_type) {
    case "webhook":
      return "webhook";
    case "task":
      return "task";
    case "note":
      return "internal";
    default:
      return "unknown";
  }
};

export const runPipelineStep = async (input: PipelineInput): Promise<PipelineResult> => {
  const mode = input.policyContext?.mode ?? resolveMode();
  const trustLevel = input.policyContext?.trustLevel ?? resolveTrustLevel(mode);
  const policyContext: PolicyContext = { mode, trustLevel };
  const identityKey = computeIdentityKey(input.identity?.userId, input.identity?.email);
  const podId = input.podId || identityKey;
  const capacityConfig: CapacityConfig = input.capacityConfig || { max_concurrent_actions: 3, recovery_rate: 1 };
  const energyConfig = getCapacityEnergyConfig(input.energyConfig);
  const energyDayId = input.energyWindowId || input.opportunity?.window_id || "day:default";
  const coolingConfig: CoolingConfig = input.coolingConfig || { max_new: 5, deferral_threshold: 3, repair_threshold: 6 };
  const actionClass = input.actionClass || (isOutbound(input.action) ? "growth" : "fulfillment");
  const timestamp = nextRevenueTimestamp(identityKey);
  const capacityTimestamp = nextCapacityTimestamp(podId);
  const coolingTimestamp = nextCoolingTimestamp(podId);

  const actionWithIntent =
    input.action.intent_id && input.action.intent_id.trim().length > 0
      ? input.action
      : { ...input.action, intent_id: mode === "MOCK" ? "intent:default" : "intent:missing" };

  const actionWithCost = ensureActionEconomics(actionWithIntent);

  const payload = actionWithCost.payload as Record<string, unknown>;
  const governanceContext = input.agentContext
    ? {
        ...input.agentContext,
        tool: input.agentContext.tool || actionWithCost.action_type,
        decisionType: input.agentContext.decisionType || actionWithCost.action_type,
        impact: input.agentContext.impact ?? (actionWithCost.irreversible ? "irreversible" : "reversible"),
        costUnits: input.agentContext.costUnits ?? actionWithCost.costUnits,
        costCategory: input.agentContext.costCategory ?? actionWithCost.costCategory,
        costChargeId: input.agentContext.costChargeId ?? `action:${actionWithCost.action_id}`,
        costSource: input.agentContext.costSource ?? "pipeline",
      }
    : undefined;
  if (governanceContext) {
    assertCostContext(governanceContext);
  }
  const governance = await enforceRuntimeGovernance(identityKey, governanceContext, input.initiator ?? "agent");
  const threadId = resolveThreadId(payload, input.threadId);
  const chainMaxDepth = input.chainMaxDepth ?? 5;
  if (input.chainReset && threadId) {
    appendActionChainEvent(threadId, {
      thread_id: threadId,
      timestamp: nextActionChainTimestamp(threadId),
      type: "reset",
      action_id: actionWithCost.action_id,
      reason: "chain_reset",
    });
  }

  const chainCheck = threadId
    ? checkActionChainDepth(threadId, chainMaxDepth)
    : { ok: true, depth: 0, maxDepth: chainMaxDepth };
  const handoffRequired =
    input.handoffRequired === true || payload.handoff_required === true || payload.handoffRequired === true;
  const handoffOk = !handoffRequired || (input.handoffToken && input.handoffToken.trim().length > 0);
  const autoHelpEnabled = input.autoHelp === true || payload.auto_help === true || payload.autoHelp === true;
  const autoHelpBlocked = autoHelpEnabled && threadId ? hasUnackedAutoHelp(threadId) && !input.autoHelpAcknowledged : false;
  const resourceId = resolveResourceId(payload, input.resourceId);
  const lockState = resourceId ? getSoftLockState(resourceId) : undefined;
  const lockOk = !resourceId || !lockState?.holder || lockState.holder === podId;
  const sensitiveCheck = evaluateSensitiveContext(input.sensitive);
  const retryKey = input.retryKey || actionWithCost.action_id;
  const retryBaseSteps = 1;
  const retryState = getRetryState(retryKey, retryBaseSteps);
  const retryOk = retryState.required_cooldown_steps === 0 || input.retryCooldownSatisfied === true;

  const policy = evaluateAction(actionWithCost, policyContext);
  const channel = channelForAction(actionWithCost);
  const provider = input.provider || (mode === "MOCK" ? "mock" : "unknown");
  const evidence_ref = buildEvidenceRef({
    action: actionWithCost,
    provider,
    mode,
    timestamp,
    response_id: input.response_id,
  });
  const energyChannel = resolveEnergyChannel(actionWithCost, channel);
  const humanId = input.humanId || input.identity?.userId || identityKey || "human:unknown";
  const energyRequiredUnits = actionWithCost.irreversible ? energyConfig.minUnits : 0;
  const energyState = getCapacityEnergyState(podId, humanId, energyChannel, energyDayId, energyConfig);
  const energyCheck = checkCapacityEnergy(energyState, energyRequiredUnits);
  const capacityEvidence = buildEvidenceRef({
    action: buildCapacityEvidenceAction(podId, "capacity_check"),
    provider: "capacity",
    mode,
    timestamp: capacityTimestamp,
  });

  ensureCapacityConfig(podId, capacityConfig, capacityEvidence);
  const capacityState = getCapacityState(podId, capacityConfig).state;
  const capacityCheck = checkCapacity(capacityState);

  const coolingWindowId = input.opportunity?.window_id || "window:default";
  const initialCooling = getCoolingState(podId, coolingWindowId, coolingConfig);
  if (initialCooling.events.length === 0) {
    appendCoolingEvent(podId, {
      pod_id: podId,
      window_id: coolingWindowId,
      timestamp: coolingTimestamp,
      type: "window_init",
      reason: "init",
      evidence_ref: capacityEvidence,
    });
  }

  if (input.coolingSignal) {
    const signalType =
      input.coolingSignal === "pause"
        ? "pause"
        : input.coolingSignal === "resume"
          ? "resume"
          : input.coolingSignal === "repair"
            ? "repair_enter"
            : "burnout_signal";
    appendCoolingEvent(podId, {
      pod_id: podId,
      window_id: coolingWindowId,
      timestamp: coolingTimestamp,
      type: signalType,
      reason: input.coolingSignal,
      evidence_ref: capacityEvidence,
    });
    if (input.coolingSignal === "pause" || input.coolingSignal === "resume" || input.coolingSignal === "repair") {
      appendCapacityEvent(podId, {
        pod_id: podId,
        timestamp: capacityTimestamp,
        type: input.coolingSignal === "repair" ? "repair_enter" : input.coolingSignal === "pause" ? "pause" : "resume",
        reason: input.coolingSignal,
        evidence_ref: capacityEvidence,
      });
    }
  }

  let coolingStateSnapshot = getCoolingState(podId, coolingWindowId, coolingConfig).state;
  let coolingAssessment = evaluateCoolingState(coolingStateSnapshot, coolingConfig);
  let coolingState: CoolingState = coolingAssessment.nextState;
  if (input.coolingSignal === "repair") {
    coolingState = "repair";
  }
  if (input.coolingSignal === "resume" && canExitRepair(coolingStateSnapshot, capacityState.active_load)) {
    coolingState = "normal";
  }

  const syncCoolingState = (state: typeof coolingStateSnapshot, nextState: CoolingState, reason: string) => {
    if (state.cooling_state === nextState) return;
    const exitType = state.cooling_state === "repair" ? "repair_exit" : "cooling_exit";
    const enterType = nextState === "repair" ? "repair_enter" : nextState === "cooling" ? "cooling_enter" : exitType;
    appendCoolingEvent(podId, {
      pod_id: podId,
      window_id: coolingWindowId,
      timestamp: coolingTimestamp,
      type: enterType,
      reason,
      evidence_ref: capacityEvidence,
    });
    appendCapacityEvent(podId, {
      pod_id: podId,
      timestamp: capacityTimestamp,
      type: enterType,
      reason,
      evidence_ref: capacityEvidence,
    });
  };

  syncCoolingState(coolingStateSnapshot, coolingState, coolingAssessment.reason || "COOLING_STATE_UPDATE");
  coolingStateSnapshot = getCoolingState(podId, coolingWindowId, coolingConfig).state;

  const opportunityConfig = getOpportunityQueueConfig(input.opportunityQueueConfig);
  const opportunityId = input.opportunity ? resolveOpportunityId(payload, input.opportunity.opportunity_id) : undefined;
  const opportunityQueue = input.opportunity ? getOpportunityQueue(podId) : { entries: [], events: [] };
  const queueSize = opportunityQueue.entries.length;
  const queueMax = opportunityConfig.max_size;
  let opportunityStatus: "none" | "queued" | "blocked" | "ready" = "none";
  let opportunityReason: string | undefined;
  let shouldResolveOpportunity = false;

  if (input.opportunity) {
    const inQueue = opportunityId
      ? opportunityQueue.entries.find((entry) => entry.opportunity_id === opportunityId)
      : undefined;
    const atFront = opportunityId ? opportunityQueue.entries[0]?.opportunity_id === opportunityId : false;
    if (input.opportunity.is_new) {
      if (queueSize >= queueMax) {
        opportunityStatus = "blocked";
        opportunityReason = "QUEUE_FULL";
      } else {
        if (opportunityId) {
          appendOpportunityEvent(podId, {
            pod_id: podId,
            opportunity_id: opportunityId,
            timestamp: nextOpportunityTimestamp(podId),
            type: "enqueue",
            reason: "new_opportunity",
            evidence_ref,
          });
        }
        opportunityStatus = "queued";
        opportunityReason = "QUEUED";
      }
    } else if (!opportunityId) {
      opportunityStatus = "blocked";
      opportunityReason = "MISSING_OPPORTUNITY_ID";
    } else if (!inQueue) {
      opportunityStatus = "blocked";
      opportunityReason = "NOT_QUEUED";
    } else if (!atFront) {
      opportunityStatus = "blocked";
      opportunityReason = "OUT_OF_ORDER";
    } else if (!input.opportunity.cooldown_satisfied) {
      opportunityStatus = "blocked";
      opportunityReason = "COOLDOWN_REQUIRED";
    } else {
      opportunityStatus = "ready";
      shouldResolveOpportunity = true;
    }
  }

  if (input.opportunity?.is_new && opportunityStatus === "queued") {
    appendCoolingEvent(podId, {
      pod_id: podId,
      window_id: coolingWindowId,
      timestamp: coolingTimestamp,
      type: "opportunity_added",
      reason: "new_opportunity",
      evidence_ref: capacityEvidence,
    });
    coolingStateSnapshot = getCoolingState(podId, coolingWindowId, coolingConfig).state;
    coolingAssessment = evaluateCoolingState(coolingStateSnapshot, coolingConfig);
    coolingState = coolingAssessment.nextState;
    syncCoolingState(coolingStateSnapshot, coolingState, coolingAssessment.reason || "OPPORTUNITY_UPDATE");
  }

  if (threadId && !chainCheck.ok) {
    appendActionChainEvent(threadId, {
      thread_id: threadId,
      timestamp: nextActionChainTimestamp(threadId),
      type: "blocked",
      action_id: actionWithCost.action_id,
      reason: "chain_depth_exceeded",
    });
  }

  if (threadId && chainCheck.ok) {
    appendActionChainEvent(threadId, {
      thread_id: threadId,
      timestamp: nextActionChainTimestamp(threadId),
      type: "attempt",
      action_id: actionWithCost.action_id,
      reason: "chain_attempt",
    });
  }

  if (autoHelpEnabled && threadId && input.autoHelpAcknowledged) {
    appendAutoHelpEvent(threadId, "ack", "auto_help_acknowledged");
  }

  if (autoHelpEnabled && threadId && !autoHelpBlocked) {
    appendAutoHelpEvent(threadId, "auto_help", "auto_help_invoked");
  }

  let lockAcquired = false;
  if (resourceId && lockOk && !lockState?.holder) {
    appendSoftLockEvent(resourceId, podId, "acquire", "soft_lock_acquire");
    lockAcquired = true;
  }

  const consentCheck: { ok: boolean; reason?: string } = (() => {
    if (!channel) return { ok: true };
    if (!input.consent) return { ok: false, reason: "CONSENT_REQUIRED" };
    if (input.consent.do_not_contact) return { ok: false, reason: "DO_NOT_CONTACT" };
    if (canOutreach(input.consent)) return { ok: true };
    return { ok: false, reason: "CONSENT_REQUIRED" };
  })();

  if (
    channel === "voice" &&
    input.consent &&
    input.consent.consent_evidence_ref &&
    input.consent.consent_status !== "denied"
  ) {
    consentCheck.ok = true;
    delete consentCheck.reason;
  }

  const reachabilityCheck =
    channel && input.reachability ? canUseChannel(input.reachability, channel) : { ok: true };

  const throttleCheck = input.throttleState && channel ? checkThrottle(input.throttleState, `${channel}:default`) : undefined;

  let outcome: DecisionOutcome;
  let execution_status: ProofBundle["execution_status"];
  let error: string | undefined;

  const blockGrowth = actionClass === "growth" && coolingState === "repair";
  const handoffCheck = { ok: handoffOk, reason: handoffOk ? undefined : "HANDOFF_TOKEN_REQUIRED" };
  const autoHelpCheck = { ok: !autoHelpBlocked, reason: autoHelpBlocked ? "AUTO_HELP_REPEAT" : undefined };
  const softLockCheck = { ok: lockOk, holder: lockState?.holder };

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
        initiator: input.initiator ?? "agent",
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
        outcome = buildGuardOutcome({
          code: "FAIL_COOLDOWN_ACTIVE",
          cause: `Cost budget exceeded; scheduled ${schedulingDecision.scheduledTask.scheduleId}.`,
          action: "wait",
          defer: true,
          details: { schedule_id: schedulingDecision.scheduledTask.scheduleId },
        });
      } else {
        outcome = buildGuardOutcome({
          code: "FAIL_POLICY_CONFLICT",
          cause: `Governance blocked: ${governance.reason}.`,
          action: governance.requiresHumanReview ? "human_decision" : "review",
          details: {
            governance_reason: governance.reason,
            governance_requires_human_review: governance.requiresHumanReview,
          },
        });
      }
    } else {
      outcome = buildGuardOutcome({
        code: "FAIL_POLICY_CONFLICT",
        cause: `Governance blocked: ${governance.reason}.`,
        action: governance.requiresHumanReview ? "human_decision" : "review",
        details: {
          governance_reason: governance.reason,
          governance_requires_human_review: governance.requiresHumanReview,
        },
      });
    }
  } else if (!policy.allowed) {
    outcome = buildGuardOutcome({
      code: "FAIL_POLICY_CONFLICT",
      cause: `Policy blocked: ${policy.reason || "UNKNOWN"}.`,
      action: "review",
    });
  } else if (!handoffOk) {
    outcome = buildGuardOutcome({
      code: "FAIL_POLICY_CONFLICT",
      cause: "Cross-module handoff token required before execution.",
      action: "review",
    });
  } else if (!chainCheck.ok) {
    outcome = buildGuardOutcome({
      code: "FAIL_SAFE_OVERLOAD",
      cause: `Action chain depth ${chainCheck.depth}/${chainCheck.maxDepth} exceeded.`,
      action: "human_decision",
    });
  } else if (autoHelpBlocked) {
    outcome = buildGuardOutcome({
      code: "FAIL_POLICY_CONFLICT",
      cause: "Auto-help already issued; waiting for explicit acknowledgment.",
      action: "review",
    });
  } else if (!lockOk) {
    outcome = buildGuardOutcome({
      code: "FAIL_POLICY_CONFLICT",
      cause: `Resource is locked by ${lockState?.holder || "another pod"}.`,
      action: "review",
    });
  } else if (!sensitiveCheck.ok) {
    outcome = buildGuardOutcome({
      code: "FAIL_POLICY_CONFLICT",
      cause: `Sensitive data guard: ${sensitiveCheck.reason || "blocked"}.`,
      action: "human_decision",
      details: { sensitive_categories: sensitiveCheck.categories },
    });
  } else if (opportunityStatus === "blocked") {
    const isCooldown = opportunityReason === "COOLDOWN_REQUIRED";
    const isOverload = opportunityReason === "QUEUE_FULL";
    outcome = buildGuardOutcome({
      code: isOverload ? "FAIL_SAFE_OVERLOAD" : isCooldown ? "FAIL_COOLDOWN_ACTIVE" : "FAIL_POLICY_CONFLICT",
      cause: `Opportunity gate: ${opportunityReason || "blocked"}.`,
      action: isCooldown ? "wait" : isOverload ? "human_decision" : "review",
      defer: isCooldown,
      details: { queue_size: queueSize, max_size: queueMax, opportunity_id: opportunityId },
    });
  } else if (opportunityStatus === "queued") {
    outcome = buildGuardOutcome({
      code: "FAIL_COOLDOWN_ACTIVE",
      cause: "Opportunity queued; cooling required before execution.",
      action: "wait",
      defer: true,
      details: { queue_size: queueSize + 1, max_size: queueMax, opportunity_id: opportunityId },
    });
  } else if (!retryOk) {
    outcome = buildGuardOutcome({
      code: "FAIL_COOLDOWN_ACTIVE",
      cause: `Retry cooldown active (${retryState.required_cooldown_steps} step(s)).`,
      action: "wait",
      defer: true,
      details: { required_cooldown_steps: retryState.required_cooldown_steps },
    });
  } else if (blockGrowth) {
    outcome = buildGuardOutcome({
      code: "FAIL_SAFE_OVERLOAD",
      cause: "Repair mode active; growth actions paused.",
      action: "human_decision",
    });
  } else if (!energyCheck.ok) {
    outcome = buildGuardOutcome({
      code: "FAIL_CAPACITY_EXCEEDED",
      cause: `Capacity energy limit reached (${energyCheck.reason || "LIMIT"}).`,
      action: "wait",
      defer: true,
      details: { required_units: energyRequiredUnits, day_id: energyDayId, channel: energyChannel },
    });
  } else if (!capacityCheck.ok) {
    appendCapacityEvent(podId, {
      pod_id: podId,
      timestamp: capacityTimestamp,
      type: "defer",
      reason: capacityCheck.reason || "CAPACITY_EXCEEDED",
      evidence_ref: capacityEvidence,
    });
    appendCoolingEvent(podId, {
      pod_id: podId,
      window_id: coolingWindowId,
      timestamp: coolingTimestamp,
      type: "deferral",
      reason: "capacity_deferral",
      evidence_ref,
    });
    const updatedCooling = getCoolingState(podId, coolingWindowId, coolingConfig).state;
    const updatedAssessment = evaluateCoolingState(updatedCooling, coolingConfig);
    syncCoolingState(updatedCooling, updatedAssessment.nextState, updatedAssessment.reason || "COOLING_TRIGGERED");
    coolingState = updatedAssessment.nextState;
    outcome = buildGuardOutcome({
      code: "FAIL_CAPACITY_EXCEEDED",
      cause: `Concurrent capacity exceeded (${capacityCheck.reason || "CAPACITY_EXCEEDED"}).`,
      action: "wait",
      defer: true,
      details: { capacity_reason: capacityCheck.reason || "CAPACITY_EXCEEDED" },
    });
  } else if (!consentCheck.ok) {
    outcome = buildGuardOutcome({
      code: "FAIL_POLICY_CONFLICT",
      cause: `Consent blocked: ${consentCheck.reason || "UNKNOWN"}.`,
      action: "review",
    });
  } else if (!reachabilityCheck.ok) {
    outcome = buildGuardOutcome({
      code: "FAIL_POLICY_CONFLICT",
      cause: `Reachability blocked: ${reachabilityCheck.reason || "UNKNOWN"}.`,
      action: "review",
    });
  } else if (throttleCheck && !throttleCheck.allowed) {
    outcome = buildGuardOutcome({
      code: "FAIL_COOLDOWN_ACTIVE",
      cause: `Throttle blocked: ${throttleCheck.reason || "UNKNOWN"}.`,
      action: "wait",
      defer: true,
      details: { cooldown_remaining: throttleCheck.cooldownRemaining ?? 0 },
    });
  } else if (actionWithCost.irreversible && input.cooldownSatisfied === false) {
    outcome = buildGuardOutcome({
      code: "FAIL_COOLDOWN_ACTIVE",
      cause: "Irreversible cooldown required before execution.",
      action: "wait",
      defer: true,
    });
  } else if (policy.requiresConfirm && !input.requireUserConfirm) {
    outcome = buildGuardOutcome({
      code: "FAIL_COOLDOWN_ACTIVE",
      cause: "Confirmation required before execution.",
      action: "human_decision",
      defer: true,
      details: { cooldownSeconds: policy.cooldownSeconds, confirmation_required: true },
    });
  } else if (mode === "LIVE" && isOutbound(actionWithCost) && !evidence_ref.response_id) {
    outcome = buildGuardOutcome({
      code: "FAIL_POLICY_CONFLICT",
      cause: "Live execution missing provider response id.",
      action: "review",
    });
  } else {
    appendCapacityEvent(podId, {
      pod_id: podId,
      timestamp: capacityTimestamp,
      type: "load_inc",
      reason: "execution_start",
      delta: 1,
      evidence_ref: capacityEvidence,
    });
    if (!governanceContext) {
      throw new Error("governance_context_missing_for_execution");
    }
    const exec = await runAction(actionWithCost, policyContext, {
      identityKey,
      agentContext: governanceContext,
      initiator: input.initiator ?? "agent",
    });
    execution_status = exec.status;
    error = exec.error;
    outcome =
      exec.status === "executed"
        ? executed("PIPELINE_EXECUTED")
        : buildGuardOutcome({
            code: "FAIL_POLICY_CONFLICT",
            cause: "Execution failed; action did not complete.",
            action: "review",
          });
    appendCapacityEvent(podId, {
      pod_id: podId,
      timestamp: capacityTimestamp,
      type: "load_dec",
      reason: "execution_end",
      delta: 1,
      evidence_ref: capacityEvidence,
    });
  }

  if (shouldResolveOpportunity && outcome.type === "executed" && opportunityId) {
    appendOpportunityEvent(podId, {
      pod_id: podId,
      opportunity_id: opportunityId,
      timestamp: nextOpportunityTimestamp(podId),
      type: "resolve",
      reason: "opportunity_executed",
      evidence_ref,
    });
  }

  if (actionWithCost.irreversible && outcome.type === "executed" && energyRequiredUnits > 0) {
    appendCapacityEnergyEvent({
      pod_id: podId,
      human_id: humanId,
      channel: energyChannel,
      day_id: energyDayId,
      units: energyRequiredUnits,
      reason: "irreversible_effort",
      evidence_ref,
    });
  }

  if (lockAcquired && resourceId && input.resourceAutoRelease !== false && outcome.type !== "deferred") {
    appendSoftLockEvent(resourceId, podId, "release", "soft_lock_release");
  }

  appendRetryEvent(
    retryKey,
    outcome.type === "executed" ? "executed" : outcome.type === "deferred" ? "deferred" : "halted",
    outcome.summary
  );

  const proof: ProofBundle = {
    evidence_ref,
    policy,
    throttle: throttleCheck,
    reachability: reachabilityCheck,
    consent: consentCheck,
    channel: channel || (input.reachability ? selectChannel(input.reachability).channel : "none"),
    capacity: capacityCheck,
    energy_capacity: {
      ok: energyCheck.ok,
      reason: energyCheck.reason,
      required_units: energyRequiredUnits,
      channel: energyChannel,
      day_id: energyDayId,
    },
    cooling_state: coolingState,
    chain: chainCheck,
    handoff: handoffCheck,
    retry: {
      ok: retryOk,
      failures: retryState.failures,
      required_cooldown_steps: retryState.required_cooldown_steps,
    },
    auto_help: autoHelpCheck,
    soft_lock: { ok: softLockCheck.ok, holder: softLockCheck.holder },
    opportunity_queue: {
      status: opportunityStatus,
      reason: opportunityReason,
      size: queueSize,
      max_size: queueMax,
      opportunity_id: opportunityId,
    },
    sensitive: { ok: sensitiveCheck.ok, reason: sensitiveCheck.reason, categories: sensitiveCheck.categories },
    governance,
    execution_status,
    error,
  };

  const ledgerEntry = appendRevenueLedger(identityKey, {
    timestamp,
    identity: identityKey,
    action: actionWithCost,
    outcome,
    evidence_ref,
    stage_transition: input.stage_transition,
    notes: outcome.summary,
  });

  return { outcome, proof, ledgerEntry };
};
