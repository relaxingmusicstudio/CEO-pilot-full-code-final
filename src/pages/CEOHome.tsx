// src/pages/CEOHome.tsx
/**
 * PHASE 1 LOCK ?
 * - [LOCKED] Page renders without crashing
 * - [LOCKED] Helmet works because main.tsx provides <HelmetProvider>
 * - [TODO-P2] Mount CEO agent chat + onboarding panels once Phase 1 stable
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useNavigate } from "react-router-dom";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { useUserRole } from "@/hooks/useUserRole";
import { getOnboardingData } from "@/lib/onboarding";
import { useCEOAgent } from "@/hooks/useCEOAgent";
import { CEOPlan, computeOnboardingHash, loadCEOPlan, saveCEOPlan } from "@/lib/ceoPlan";
import { DEFAULT_GOAL_IDS } from "@/lib/ceoPilot/goals";
import {
  ChecklistItem,
  ChecklistState,
  DoNextPayload,
  DoNextState,
  DoNextHistoryEntry,
  getPlanChecklist,
  loadChecklistState,
  loadDoNextState,
  loadDoNextHistory,
  parseDoNextPayload,
  parsePlanToChecklist,
  saveChecklistState,
  saveDoNextState,
  recordDoNextHistoryEntry,
} from "@/lib/ceoChecklist";
import { executed, halted, summarizeOutcome, transformed } from "@/lib/decisionOutcome";
import { ensureOutcome } from "@/lib/loopGuard";
import { computeIdentityKey } from "@/lib/spine";
import { runPipelineStep, type PipelineResult } from "@/lib/revenueKernel/pipeline";
import { loadRevenueLedgerTail, type RevenueLedgerEntry } from "@/lib/revenueKernel/ledger";
import { evaluateCoolingState, getCoolingState } from "@/lib/revenueKernel/cooling";
import { getCapacityState, type CapacityState } from "@/lib/revenueKernel/capacityLedger";
import { getOpportunityQueue, getOpportunityQueueConfig } from "@/lib/revenueKernel/opportunityQueue";
import { computeActionId, type ActionSpec } from "@/types/actions";
import {
  computePlanHash,
  DailyBriefState,
  loadDailyBrief,
  parseDailyBriefPayload,
  saveDailyBrief,
} from "@/lib/ceoDailyBrief";
import { getSystemModeDescription, loadSystemMode, saveSystemMode, SystemMode } from "@/lib/systemMode";
import { buildMaintenanceReport, type MaintenanceReport } from "@/lib/maintenanceBot";
import { loadThreadStoreState } from "@/lib/lifelongThreadsStorage";
import { getLatestSnapshot, getThreadSummary, type ThreadSnapshotSummaryFields } from "@/lib/lifelongThreads";
import { ActionImpact } from "@/lib/irreversibilityMap";
import { appendManualOverrideEvent, loadManualOverrideHistory, type ManualOverrideEvent } from "@/lib/manualOverrideLedger";
import { derivePodState, loadPodLedger, type PodStateSnapshot } from "@/lib/pods";
import {
  clearPreflightIntent,
  loadPreflightIntent,
  savePreflightIntent,
  type PreflightIntent,
} from "@/lib/preflightIntent";
import { loadFlightMode, type FlightMode } from "@/lib/flightMode";
import { clearPreflightTeam, loadPreflightTeam, savePreflightTeam, type TeamSelection } from "@/lib/preflightTeam";
import { BRAND } from "@/config/brand";
import { DEFAULT_AGENT_IDS } from "@/lib/ceoPilot/agents";
import { deriveTaskClass, estimateActionCostCents } from "@/lib/ceoPilot/costUtils";

export default function CEOHome() {
  const { email, role, signOut, userId } = useAuth();
  const { isOwner, isAdmin } = useUserRole();
  const { status, isOnboardingComplete } = useOnboardingStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const context = getOnboardingData(userId, email);
  const { askCEO, getDailyBrief, isLoading: agentLoading } = useCEOAgent();

  const [systemMode, setSystemMode] = useState<SystemMode>(() => loadSystemMode(userId, email));
  const [switchModeOpen, setSwitchModeOpen] = useState(false);
  const [switchModeTarget, setSwitchModeTarget] = useState<SystemMode>(SystemMode.EXECUTION);
  const [switchModeConfirm, setSwitchModeConfirm] = useState("");
  const [modeBlockReason, setModeBlockReason] = useState<string | null>(null);

  const [plan, setPlan] = useState<CEOPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checklistState, setChecklistState] = useState<ChecklistState>({ completedIds: [], updatedAt: null });
  const [actionPlan, setActionPlan] = useState<DoNextState | null>(null);
  const [doNextLoading, setDoNextLoading] = useState(false);
  const [doNextHistory, setDoNextHistory] = useState<DoNextHistoryEntry[]>([]);
  const [lastPipelineResult, setLastPipelineResult] = useState<PipelineResult | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedHistoryKey, setSelectedHistoryKey] = useState<string | null>(null);
  const [isMockMode, setIsMockMode] = useState(
    () =>
      import.meta.env.VITE_MOCK_AUTH === "true" ||
      (typeof window !== "undefined" && window.localStorage.getItem("VITE_MOCK_AUTH") === "true")
  );
  const [dailyBrief, setDailyBrief] = useState<DailyBriefState | null>(null);
  const [dailyBriefLoading, setDailyBriefLoading] = useState(false);
  const [revenueLedgerEntries, setRevenueLedgerEntries] = useState<RevenueLedgerEntry[]>([]);
  const [revenueLedgerCursor, setRevenueLedgerCursor] = useState<string | null>(null);
  const [capacityState, setCapacityState] = useState<CapacityState | null>(null);
  const [coolingSummary, setCoolingSummary] = useState<{ state: string; reason: string | null } | null>(null);
  const [opportunitySummary, setOpportunitySummary] = useState<{ size: number; max: number } | null>(null);
  const [podSnapshot, setPodSnapshot] = useState<PodStateSnapshot | null>(null);
  const [threadSummary, setThreadSummary] = useState<{
    threadId: string;
    summary: ThreadSnapshotSummaryFields;
    snapshotDigest: string | null;
  } | null>(null);
  const [maintenanceReport, setMaintenanceReport] = useState<MaintenanceReport | null>(null);
  const [manualOverrideHistory, setManualOverrideHistory] = useState<ManualOverrideEvent[]>([]);
  const [manualOverrideReason, setManualOverrideReason] = useState("");
  const [manualOverrideImpact, setManualOverrideImpact] = useState<ActionImpact>(ActionImpact.REVERSIBLE);
  const [manualOverrideConfirm, setManualOverrideConfirm] = useState("");
  const [manualOverrideStatus, setManualOverrideStatus] = useState<string | null>(null);
  const [flightMode, setFlightMode] = useState<FlightMode>(() => loadFlightMode(userId, email));
  const [intentSelection, setIntentSelection] = useState<PreflightIntent | null>(() =>
    loadPreflightIntent(userId, email)
  );
  const [intentNotice, setIntentNotice] = useState<string | null>(null);
  const [teamSelection, setTeamSelection] = useState<TeamSelection | null>(() =>
    loadPreflightTeam(userId, email)
  );
  const [teamNotice, setTeamNotice] = useState<string | null>(null);
  const [exitNotice, setExitNotice] = useState<string | null>(null);

  const hasContext =
    !!context.businessName ||
    !!context.industry ||
    !!context.serviceArea ||
    !!context.primaryGoal ||
    !!context.offerPricing;

  const ceoGovernanceContext = useMemo(
    () => ({
      agentId: DEFAULT_AGENT_IDS.ceo,
      actionDomain: "ceo",
      goalId: DEFAULT_GOAL_IDS.ceoPilot,
      taskId: "ceo-action",
      taskDescription: "CEO Pilot decision support task.",
      taskType: "ceo:dashboard",
      taskClass: "routine" as const,
      estimatedCostCents: 3,
      explorationMode: true,
      actionTags: [],
      permissionTier: "suggest" as const,
      confidence: {
        confidenceScore: 0.72,
        uncertaintyExplanation: "Simulation-only guidance with limited live feedback.",
        knownBlindSpots: ["live execution data", "provider outages"],
        evidenceRefs: ["onboarding:context"],
      },
      metrics: {
        uncertaintyVariance: 0.02,
        rollbackRate: 0.01,
        stableRuns: 6,
      },
    }),
    []
  );

  const onboardingHash = useMemo(() => computeOnboardingHash(userId, email), [userId, email]);
  const identityKey = useMemo(() => computeIdentityKey(userId, email), [userId, email]);
  const allowPlanSections = isOnboardingComplete || isMockMode;
  const planHash = useMemo(() => computePlanHash(plan?.planMarkdown || ""), [plan?.planMarkdown]);
  const briefNeedsRefresh =
    dailyBrief && (dailyBrief.onboardingHash !== onboardingHash || dailyBrief.planHash !== planHash);
  const showStandalonePreflightBanner = location.pathname === "/ceo";
  const effectiveIntent: PreflightIntent = intentSelection ?? "business";
  const showIntentGate = intentSelection === null;
  const showExploreFlow = effectiveIntent === "explore";
  const showPodFlow = effectiveIntent === "pod";
  const showBusinessFlow = effectiveIntent === "business";
  const canControlFlight = isOwner || isAdmin;
  const flightModeLabel = flightMode === "LIVE" ? "Live Mode" : "Sim Mode";
  const flightModeDescription =
    flightMode === "LIVE"
      ? "Live Mode is locked behind explicit confirmation and verified providers; real-world execution stays blocked until approved."
      : "Sim Mode is simulation-only with no real-world effects.";
  const teamSelectionLabel = teamSelection
    ? teamSelection === "solo"
      ? "I'm working solo"
      : teamSelection === "join"
        ? "I'm working with a team"
        : "I'm starting a team"
    : "Not selected";
  const intentSelectionLabel = intentSelection
    ? intentSelection === "explore"
      ? "I'm exploring"
      : intentSelection === "pod"
        ? "Build or Join a Pod"
        : "I Own a Business"
    : "Not selected";

  useEffect(() => {
    const mockFlag =
      import.meta.env.VITE_MOCK_AUTH === "true" ||
      (typeof window !== "undefined" && window.localStorage.getItem("VITE_MOCK_AUTH") === "true");
    setIsMockMode(mockFlag);
  }, []);

  useEffect(() => {
    setFlightMode(loadFlightMode(userId, email));
  }, [userId, email]);

  useEffect(() => {
    const update = () => setFlightMode(loadFlightMode(userId, email));
    window.addEventListener("ppp:flightmode", update);
    return () => window.removeEventListener("ppp:flightmode", update);
  }, [userId, email]);

  useEffect(() => {
    const loaded = loadSystemMode(userId, email);
    setSystemMode(loaded);
    setSwitchModeTarget(loaded);
  }, [userId, email]);

  useEffect(() => {
    setIntentSelection(loadPreflightIntent(userId, email));
  }, [userId, email]);

  useEffect(() => {
    setTeamSelection(loadPreflightTeam(userId, email));
  }, [userId, email]);

  const handleApplySystemMode = () => {
    if (switchModeConfirm.trim().toUpperCase() !== switchModeTarget) return;
    saveSystemMode(switchModeTarget, userId, email);
    setSystemMode(switchModeTarget);
    setSwitchModeOpen(false);
    setSwitchModeConfirm("");
    setModeBlockReason(null);
  };

  useEffect(() => {
    let existingPlan = loadCEOPlan(userId, email);
    if (!existingPlan && isMockMode) {
      existingPlan = {
        planMarkdown: getMockPlanMarkdown(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        onboardingSnapshotHash: onboardingHash,
      };
      saveCEOPlan(existingPlan, userId, email);
    }
    setPlan(existingPlan);
    setChecklist(existingPlan ? parsePlanToChecklist(existingPlan.planMarkdown) : getPlanChecklist(userId, email));
    setChecklistState(loadChecklistState(userId, email));
    setActionPlan(loadDoNextState(userId, email));
    setDoNextHistory(loadDoNextHistory(userId, email));
    setDailyBrief(loadDailyBrief(userId, email));
  }, [userId, email, isMockMode, onboardingHash]);

  useEffect(() => {
    if (plan?.planMarkdown) {
      setChecklist(parsePlanToChecklist(plan.planMarkdown));
    }
  }, [plan]);

  const refreshStatus = useCallback(() => {
    if (!identityKey) return;
    const ledgerPage = loadRevenueLedgerTail(identityKey, 5);
    setRevenueLedgerEntries(ledgerPage.entries);
    setRevenueLedgerCursor(ledgerPage.nextCursor);

    const pods = derivePodState(identityKey, loadPodLedger(identityKey));
    setPodSnapshot(pods);

    setManualOverrideHistory(loadManualOverrideHistory(identityKey, 5));

    const capacity = getCapacityState(identityKey).state;
    setCapacityState(capacity);

    const coolingWindowId = "window:default";
    const cooling = getCoolingState(identityKey, coolingWindowId);
    const coolingEval = evaluateCoolingState(cooling.state);
    setCoolingSummary({ state: cooling.state.cooling_state, reason: coolingEval.reason ?? null });

    const opportunityConfig = getOpportunityQueueConfig();
    const opportunityQueue = getOpportunityQueue(identityKey);
    setOpportunitySummary({ size: opportunityQueue.entries.length, max: opportunityConfig.max_size });

    const threadState = loadThreadStoreState(userId, email);
    const latestThread = threadState.threads[threadState.threads.length - 1];
    if (latestThread) {
      const snapshot = getLatestSnapshot(threadState.snapshots, latestThread.thread_id);
      const summary = getThreadSummary(latestThread.thread_id, threadState.entries, snapshot);
      setThreadSummary({
        threadId: latestThread.thread_id,
        summary,
        snapshotDigest: snapshot?.digest ?? null,
      });
    } else {
      setThreadSummary(null);
    }

    const latestTimestamp = ledgerPage.entries[ledgerPage.entries.length - 1]?.timestamp ?? "s0";
    const report = buildMaintenanceReport({
      featureName: "ceo_home",
      timestamp: latestTimestamp,
      declaredOptimizationTargets: [],
      intentsPresent: true,
      appendOnlyPreserved: true,
      requiresHumanApprovalForR3: true,
      mockMode: isMockMode,
      allowIntentlessInMock: true,
    });
    setMaintenanceReport(report);
  }, [identityKey, userId, email, isMockMode]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus, lastPipelineResult, doNextHistory.length]);

  const handleGeneratePlan = async () => {
    setPlanLoading(true);
    try {
      const resp = await askCEO(
        "Generate a concise CEO plan using the provided onboarding context. Return markdown with sections: Goals, Offers, ICP, Lead Sources, Next 7 Days.",
        "30d",
        [],
        undefined,
        "generate_ceo_plan"
      );
      if (resp?.response) {
        const next: CEOPlan = {
          planMarkdown: resp.response,
          createdAt: plan?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          onboardingSnapshotHash: onboardingHash,
        };
        saveCEOPlan(next, userId, email);
        setPlan(next);
        const parsed = parsePlanToChecklist(next.planMarkdown);
        setChecklist(parsed);
        saveChecklistState({ completedIds: [], updatedAt: new Date().toISOString() }, userId, email);
        setChecklistState({ completedIds: [], updatedAt: new Date().toISOString() });
      }
    } catch {
      // keep existing plan if generation fails
    } finally {
      setPlanLoading(false);
    }
  };

  const planOutOfDate = plan && plan.onboardingSnapshotHash !== onboardingHash;

  const toggleChecklist = (id: string) => {
    if (systemMode !== SystemMode.EXECUTION) {
      setModeBlockReason(
        systemMode === SystemMode.VALIDATION
          ? "Checklist edits are blocked in VALIDATION mode. Switch to EXECUTION to update progress."
          : "Checklist is read-only in SHAPE mode. Switch to EXECUTION to update progress."
      );
      return;
    }
    const completed = new Set(checklistState.completedIds);
    if (completed.has(id)) {
      completed.delete(id);
    } else {
      completed.add(id);
    }
    const nextState: ChecklistState = { completedIds: Array.from(completed), updatedAt: new Date().toISOString() };
    setChecklistState(nextState);
    saveChecklistState(nextState, userId, email);
  };

  const incompleteItems = checklist.filter((item) => !checklistState.completedIds.includes(item.id));
  const todaysTop3 = incompleteItems.slice(0, 3);
  const nextTask = incompleteItems[0];
  const doNextIntentLabel = actionPlan?.agentIntent ?? "ceo_do_next";
  const ledgerDisplay = useMemo(
    () => [...revenueLedgerEntries].slice().reverse(),
    [revenueLedgerEntries]
  );
  const latestLedgerEntry = ledgerDisplay[0] ?? null;
  const stalledPipelines = useMemo(
    () =>
      ledgerDisplay.filter((entry) =>
        ["blocked", "deferred", "retry", "halted"].includes(entry.outcome.type)
      ).length,
    [ledgerDisplay]
  );
  const overrideIsIrreversible = manualOverrideImpact === ActionImpact.IRREVERSIBLE;
  const overrideNeedsConfirm = manualOverrideConfirm.trim().toUpperCase() === "OVERRIDE";
  const overrideCanSubmit = manualOverrideReason.trim().length > 0 && overrideNeedsConfirm;
  const intentOptions: { id: PreflightIntent; title: string; description: string }[] = [
    {
      id: "explore",
      title: "I'm exploring",
      description: "Read-only walkthrough. Does not execute actions. Does not trigger Live Mode. Change anytime in Sim Mode.",
    },
    {
      id: "pod",
      title: "Build or Join a Pod",
      description:
        "Pod setup in preflight. Does not execute actions. Does not trigger Live Mode or outreach. Change anytime in Sim Mode.",
    },
    {
      id: "business",
      title: "I Own a Business",
      description:
        "Business onboarding in preflight. Does not execute actions. Does not trigger Live Mode. Change anytime in Sim Mode.",
    },
  ];
  const teamOptions: { id: TeamSelection; title: string; description: string }[] = [
    {
      id: "solo",
      title: "I'm working solo",
      description:
        "You work alone. Does not execute actions or invite others. Does not trigger Live Mode. Change anytime in Sim Mode.",
    },
    {
      id: "join",
      title: "I'm working with a team",
      description:
        "Coordinate with an existing pod. Does not execute actions or notify others. Does not trigger Live Mode. Change anytime in Sim Mode.",
    },
    {
      id: "create",
      title: "I'm starting a team",
      description:
        "Set up a new pod container. Does not execute actions or invite others. Does not trigger Live Mode. Change anytime in Sim Mode.",
    },
  ];
  const intentGuideMap: Record<PreflightIntent, { next: string; cta: string }> = {
    explore: {
      next: "Review system health and run simulation-only actions (no execution).",
      cta: "Run Simulation",
    },
    pod: {
      next: "Pick a team path, review roles, and simulate revenue flow (no live execution).",
      cta: "Run Simulation",
    },
    business: {
      next: "Finish onboarding, generate a plan, and run Do Next (simulation-first).",
      cta: "Generate CEO Plan",
    },
  };

  const buildDoNextOutcome = (raw: string, payload: DoNextPayload | null) => {
    if (payload) {
      return executed(payload.title || "Do Next executed", { payload, rawResponse: raw });
    }
    if (raw.trim().length > 0) {
      return transformed("Do Next captured", { markdown: raw });
    }
    return halted("MISSING_RESPONSE", { receivedType: typeof raw, receivedKeys: [] });
  };

  const handleDoNext = async () => {
    if (systemMode !== SystemMode.EXECUTION) {
      setModeBlockReason(
        systemMode === SystemMode.VALIDATION
          ? "Do Next is blocked in VALIDATION mode. Switch to EXECUTION to run the next action."
          : "Do Next is disabled in SHAPE mode. Switch to EXECUTION to run the next action."
      );
      return;
    }
    if (!nextTask) return;
    setDoNextLoading(true);
    const agentIntent = "ceo_do_next";
    const intentId = `intent-${agentIntent}-${nextTask.id}`;
    const baseAction: Omit<ActionSpec, "action_id"> = {
      action_type: "task",
      description: `Complete checklist item: ${nextTask.text}`,
      intent_id: intentId,
      expected_metric: "checklist_progress",
      risk_level: "low",
      irreversible: false,
      payload: {
        title: nextTask.text,
        source: "ceo_do_next",
        checklistItemId: nextTask.id,
      },
    };
    const actionSpec: ActionSpec = {
      ...baseAction,
      action_id: computeActionId(baseAction),
    };

    setModeBlockReason(null);
    let nextState: DoNextState | null = null;
    let historyEntry: DoNextHistoryEntry | null = null;

    try {
      let rawResponse = "";
      if (!isMockMode) {
        const resp = await askCEO(
          `You are PipelinePRO's CEO execution coach. For the task "${nextTask.text}", return a JSON block wrapped in \`\`\`json ... \`\`\` with fields: title, objective, steps[{label, expectedOutcome, estimatedMinutes}], successCriteria[], blockers[], escalationPrompt. If you cannot format JSON, fall back to concise markdown bullets with expected outcomes.`,
          "7d",
          [],
          undefined,
          agentIntent
        );
        rawResponse = resp?.response ?? "";
      }

      if (!rawResponse) {
        rawResponse = buildMockDoNextResponse(nextTask.text);
      }

      const parsedPayload = parseDoNextPayload(rawResponse);
      const outcome = ensureOutcome(buildDoNextOutcome(rawResponse, parsedPayload), "Do Next outcome invalid");
      const outcomeSummary = summarizeOutcome(outcome);
      nextState = {
        taskId: nextTask.id,
        responseMarkdown: rawResponse || outcomeSummary,
        parsedJson: parsedPayload,
        updatedAt: new Date().toISOString(),
        agentIntent,
        checklistItemText: nextTask.text,
        rawResponse,
        decisionOutcome: outcome,
      };
      historyEntry = {
        createdAt: nextState.updatedAt,
        checklistItemId: nextTask.id,
        checklistItemText: nextTask.text,
        agentIntent,
        rawResponse,
        parsedJson: parsedPayload,
        decisionOutcome: outcome,
      };
    } catch {
      const rawResponse = "";
      const parsedPayload = null;
      const outcome = ensureOutcome(buildDoNextOutcome(rawResponse, parsedPayload), "Do Next execution failed");
      const outcomeSummary = summarizeOutcome(outcome);
      nextState = {
        taskId: nextTask.id,
        responseMarkdown: outcomeSummary,
        parsedJson: parsedPayload,
        updatedAt: new Date().toISOString(),
        agentIntent,
        checklistItemText: nextTask.text,
        rawResponse,
        decisionOutcome: outcome,
      };
      historyEntry = {
        createdAt: nextState.updatedAt,
        checklistItemId: nextTask.id,
        checklistItemText: nextTask.text,
        agentIntent,
        rawResponse,
        parsedJson: parsedPayload,
        decisionOutcome: outcome,
      };
    } finally {
      if (nextState && historyEntry) {
        setActionPlan(nextState);
        try {
          saveDoNextState(nextState, userId, email);
        } catch {
          // keep in-memory state even if persistence fails
        }

        try {
          const nextHistory = recordDoNextHistoryEntry(historyEntry, userId, email);
          setDoNextHistory(nextHistory);
          setSelectedHistoryKey(`${historyEntry.checklistItemId}-${historyEntry.createdAt}`);
          setHistoryOpen(true);
        } catch {
          // ignore history persistence errors
        }

        try {
          const result = await runPipelineStep({
            action: actionSpec,
            identity: { userId, email },
            provider: "ceo_agent",
            agentContext: {
              ...ceoGovernanceContext,
              tool: actionSpec.action_type,
              decisionType: actionSpec.action_type,
              impact: actionSpec.irreversible ? "irreversible" : "reversible",
              taskId: actionSpec.action_id,
              taskDescription: actionSpec.description,
              taskType: `action:${actionSpec.action_type}`,
              taskClass: deriveTaskClass({
                impact: actionSpec.irreversible ? "irreversible" : "reversible",
                riskLevel: actionSpec.risk_level,
              }),
              estimatedCostCents: estimateActionCostCents(actionSpec),
            },
          });
          setLastPipelineResult(result);
        } catch {
          // ignore pipeline failures
        }
      }
      setDoNextLoading(false);
    }
  };

  const handleGenerateDailyBrief = async () => {
    if (dailyBriefLoading) return;
    setDailyBriefLoading(true);
    try {
      const planSummary = plan?.planMarkdown ? plan.planMarkdown.slice(0, 800) : "No CEO plan has been generated.";
      const checklistProgress = { completed: checklistState.completedIds.length, total: checklist.length };
      const lastEntry = actionPlan || (doNextHistory.length > 0 ? doNextHistory[0] : null);
      const lastDoNextContext = lastEntry
        ? (() => {
            const typedEntry = lastEntry as {
              taskId?: string;
              checklistItemId?: string;
              checklistItemText?: string;
              parsedJson?: { steps?: Array<{ label?: string; expectedOutcome?: string }> };
              responseMarkdown?: string;
              rawResponse?: string;
            };
            const summary =
              typedEntry.parsedJson?.steps
                ?.map((step) => `${step.label}: ${step.expectedOutcome}`)
                .join("; ") ||
              typedEntry.responseMarkdown ||
              typedEntry.rawResponse ||
              "";
            return {
              taskId: typedEntry.taskId || typedEntry.checklistItemId,
              text: typedEntry.checklistItemText || typedEntry.taskId || nextTask?.text || "",
              summary,
            };
          })()
        : null;

      let rawResponse = "";
      if (!isMockMode) {
        const resp = await getDailyBrief?.({
          onboarding: context,
          planSummary,
          checklistProgress,
          lastDoNext: lastDoNextContext,
        });
        rawResponse = resp?.response ?? "";
      }

      if (!rawResponse) {
        rawResponse = buildMockDailyBrief(planSummary, checklistProgress, lastDoNextContext);
      }

      const parsed = parseDailyBriefPayload(rawResponse);
      const next: DailyBriefState = {
        payload: parsed,
        rawResponse,
        createdAt: new Date().toISOString(),
        onboardingHash,
        planHash,
      };
      setDailyBrief(next);
      saveDailyBrief(next, userId, email);
    } catch {
      // keep previous daily brief on failure
    } finally {
      setDailyBriefLoading(false);
    }
  };

  const handleIntentSelect = (intent: PreflightIntent) => {
    savePreflightIntent(intent, userId, email);
    setIntentSelection(intent);
    setIntentNotice(`Intent set: ${intent}. You can change this anytime.`);
  };

  const handleIntentClear = () => {
    clearPreflightIntent(userId, email);
    setIntentSelection(null);
    setIntentNotice(null);
  };

  const handleSimulationNote = (message: string) => {
    setIntentNotice(message);
  };

  const handleTeamSelect = (team: TeamSelection) => {
    savePreflightTeam(team, userId, email);
    setTeamSelection(team);
    const label =
      team === "solo" ? "Solo Team" : team === "join" ? "Join a Team" : "Create a Team";
    setTeamNotice(`Team path set: ${label}`);
  };

  const handleTeamClear = () => {
    clearPreflightTeam(userId, email);
    setTeamSelection(null);
    setTeamNotice(null);
  };

  const handlePauseOps = () => {
    setExitNotice("Operations paused in preflight. No live actions will run.");
  };

  const handleReturnToSim = () => {
    setExitNotice("Use the Flight Mode switcher in the header to confirm Sim Mode.");
  };

  const handleLeaveTeam = () => {
    clearPreflightTeam(userId, email);
    setTeamSelection(null);
    setExitNotice("Team selection cleared. No live actions executed.");
  };

  const handleArchiveBusiness = () => {
    setExitNotice("Business archived locally (simulation only).");
  };

  const handleDownloadRecords = () => {
    setExitNotice("Record export prepared locally (simulation only).");
  };

  const handleLoadMoreLedger = () => {
    if (!revenueLedgerCursor) return;
    const nextPage = loadRevenueLedgerTail(identityKey, 5, revenueLedgerCursor);
    setRevenueLedgerEntries((prev) => [...nextPage.entries, ...prev]);
    setRevenueLedgerCursor(nextPage.nextCursor);
  };

  const handleManualOverrideSubmit = () => {
    setManualOverrideStatus(null);
    if (!overrideCanSubmit) {
      setManualOverrideStatus("Confirmation phrase or reason missing.");
      return;
    }
    const entry = appendManualOverrideEvent(identityKey, {
      actor_id: identityKey,
      reason: manualOverrideReason.trim(),
      action_impact: manualOverrideImpact,
      confirmation: "CONFIRMED",
      action_key: "manual_override",
    });
    setManualOverrideReason("");
    setManualOverrideConfirm("");
    setManualOverrideStatus(`Override logged: ${entry.override_id}`);
    refreshStatus();
  };

  const handleSelectHistory = (entry: DoNextHistoryEntry) => {
    const selected: DoNextState = {
      taskId: entry.checklistItemId,
      responseMarkdown: entry.rawResponse || entry.decisionOutcome.summary,
      parsedJson: entry.parsedJson,
      updatedAt: entry.createdAt,
      agentIntent: entry.agentIntent,
      checklistItemText: entry.checklistItemText,
      rawResponse: entry.rawResponse,
      decisionOutcome: entry.decisionOutcome,
    };
    setActionPlan(selected);
    setSelectedHistoryKey(`${entry.checklistItemId}-${entry.createdAt}`);
    saveDoNextState(selected, userId, email);
  };

  return (
    <div data-testid="dashboard-home" style={{ padding: 24, fontFamily: "system-ui" }}>
      <Helmet>
        <title>PipelinePRO - CEO</title>
      </Helmet>

      <details
        open
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid rgba(15,23,42,0.15)",
          background: "rgba(15,23,42,0.04)",
          color: "#0f172a",
          marginBottom: 12,
        }}
        data-testid="test-mode-banner"
      >
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12, listStyle: "none" }}>
          Dismiss safety banner
        </summary>
        <div style={{ fontWeight: 800, marginTop: 6 }}>
          Youâ€™re in TEST MODE. Nothing here affects the real world.
        </div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
          CEO Pilot dashboard. Buttons simulate or preview only; live execution requires explicit confirmation.
        </div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
          Nothing runs without you. You can pause anytime. This system explains itself.
        </div>
      </details>

      {showStandalonePreflightBanner && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #fcd34d",
            background: "#fffbeb",
            color: "#92400e",
            fontWeight: 700,
            marginBottom: 12,
        }}
        data-testid="preflight-banner-standalone"
      >
        {flightMode === "LIVE"
          ? "Live Mode armed â€” real-world execution stays blocked until explicit confirmation and verified providers."
          : "Sim Mode â€” actions are simulated; no real-world effects."}
      </div>
      )}

      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>{BRAND.ceo.headline}</h1>
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>{BRAND.ceo.subline}</div>
      <div style={{ opacity: 0.8, marginBottom: 16 }}>
        Signed in as <b>{email ?? "unknown"}</b> - role: <b>{role}</b>
      </div>

      <div
        style={{
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.1)",
          background: "rgba(0,0,0,0.02)",
          marginBottom: 16,
        }}
        data-testid="system-mode-card"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>System Mode</div>
            <span
              style={{
                padding: "2px 10px",
                borderRadius: 999,
                background: "white",
                border: "1px solid rgba(0,0,0,0.12)",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 0.6,
              }}
            >
              {systemMode}
            </span>
          </div>
          <button
            onClick={() => {
              setSwitchModeTarget(systemMode);
              setSwitchModeConfirm("");
              setSwitchModeOpen(true);
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.15)",
              cursor: "pointer",
              fontWeight: 700,
            }}
            data-testid="switch-mode"
          >
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                Switch Mode <ModePill mode={flightMode} />
              </span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                No execution. Reversible. Affects this workspace only.
              </span>
            </div>
          </button>
        </div>
        <div style={{ marginTop: 8, opacity: 0.85 }}>{getSystemModeDescription(systemMode)}</div>
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
          Flight Mode: <b>{flightModeLabel}</b> - {flightModeDescription}
        </div>
        {modeBlockReason && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.08)",
              background: "#fef3c7",
              color: "#92400e",
              fontWeight: 700,
            }}
            data-testid="system-mode-block"
          >
            {modeBlockReason}
          </div>
        )}
        {switchModeOpen && (
          <div
            style={{
              marginTop: 12,
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 10,
              padding: 12,
              background: "white",
            }}
            data-testid="system-mode-switcher"
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Switch mode (intentional)</div>
            <div style={{ display: "grid", gap: 6 }}>
              {[SystemMode.SHAPE, SystemMode.EXECUTION, SystemMode.VALIDATION].map((mode) => (
                <label key={mode} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="radio"
                    name="systemMode"
                    checked={switchModeTarget === mode}
                    onChange={() => setSwitchModeTarget(mode)}
                  />
                  <span style={{ fontWeight: 700 }}>{mode}</span>
                  <span style={{ opacity: 0.75, fontSize: 12 }}>{getSystemModeDescription(mode)}</span>
                </label>
              ))}
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                Type <b>{switchModeTarget}</b> to confirm
              </div>
              <input
                value={switchModeConfirm}
                onChange={(e) => setSwitchModeConfirm(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.15)",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={handleApplySystemMode}
                disabled={switchModeConfirm.trim().toUpperCase() !== switchModeTarget}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.15)",
                  cursor: switchModeConfirm.trim().toUpperCase() !== switchModeTarget ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  opacity: switchModeConfirm.trim().toUpperCase() !== switchModeTarget ? 0.6 : 1,
                }}
                data-testid="system-mode-apply"
              >
                <div style={{ display: "grid", gap: 2 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    Apply mode <ModePill mode={flightMode} />
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>
                    No execution. Reversible. Affects this workspace only.
                  </span>
                </div>
              </button>
              <button
                onClick={() => {
                  setSwitchModeOpen(false);
                  setSwitchModeConfirm("");
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.15)",
                  cursor: "pointer",
                  fontWeight: 700,
                  background: "white",
                }}
                data-testid="system-mode-cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.1)",
          background: "rgba(0,0,0,0.02)",
          marginBottom: 16,
        }}
        data-testid="intent-gate"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Intent Gate (Preflight)</div>
          {!showIntentGate && (
            <button
              onClick={handleIntentClear}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.15)",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                Change intent <ModePill mode={flightMode} />
              </span>
            </button>
          )}
        </div>
        <div style={{ opacity: 0.75, marginBottom: 10 }}>
          Choose your intent so the dashboard stays safe and contextual. This does not execute actions or trigger Live
          Mode, and you can change it anytime in Sim Mode.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
          {intentOptions.map((option) => {
            const isSelected = effectiveIntent === option.id;
            return (
              <button
                key={option.id}
                onClick={() => handleIntentSelect(option.id)}
                style={{
                  textAlign: "left",
                  padding: 12,
                  borderRadius: 10,
                  border: isSelected ? "2px solid #2563eb" : "1px solid rgba(0,0,0,0.1)",
                  background: isSelected ? "rgba(37,99,235,0.08)" : "white",
                  cursor: "pointer",
                }}
                data-testid={`intent-${option.id}`}
              >
                <div style={{ fontWeight: 800, marginBottom: 4 }}>{option.title}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>{option.description}</div>
              </button>
            );
          })}
        </div>
        {intentNotice && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: "#1f2937" }}>{intentNotice}</div>
        )}
      </div>

      <div
        style={{
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.1)",
          background: "rgba(0,0,0,0.02)",
          marginBottom: 16,
        }}
        data-testid="first-time-guide"
      >
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>First-time path guide</div>
        <div style={{ opacity: 0.75, marginBottom: 10 }}>
          Choose a path, see what happens next, and switch anytime. Nothing auto-starts. {flightModeLabel} means{" "}
          {flightModeDescription}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
          {intentOptions.map((option) => {
            const guide = intentGuideMap[option.id];
            return (
              <div
                key={option.id}
                style={{
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.1)",
                  padding: 12,
                  background: "white",
                }}
              >
                <div style={{ fontWeight: 800 }}>{option.title}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{option.description}</div>
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  <span style={{ fontWeight: 700 }}>Next:</span> {guide.next}
                </div>
                <div style={{ marginTop: 4, fontSize: 12 }}>
                  <span style={{ fontWeight: 700 }}>CTA:</span> {guide.cta}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          Safe return: change intent or team any time in Sim Mode; live execution never runs without explicit confirmation.
        </div>
      </div>

      <div
        style={{
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.1)",
          background: "rgba(0,0,0,0.02)",
          marginBottom: 16,
        }}
        data-testid="intent-team-flow"
      >
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Intent → Team → Business → Execution (read-only map)</div>
        <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
          <div>
            <span style={{ fontWeight: 700 }}>Intent:</span> {intentSelectionLabel}{" "}
            <span style={{ opacity: 0.6 }}>(changeable anytime)</span>
          </div>
          <div>
            <span style={{ fontWeight: 700 }}>Team:</span> {teamSelectionLabel}{" "}
            <span style={{ opacity: 0.6 }}>(changeable until Live Mode)</span>
          </div>
          <div>
            <span style={{ fontWeight: 700 }}>Business:</span> {hasContext ? "Context captured" : "Not set"}{" "}
            <span style={{ opacity: 0.6 }}>(required for Live Mode)</span>
          </div>
          <div>
            <span style={{ fontWeight: 700 }}>Execution:</span> {systemMode}{" "}
            <span style={{ opacity: 0.6 }}>(controls checklist + Do Next)</span>
          </div>
        </div>
        <div style={{ marginTop: 12, fontWeight: 800 }}>Team selection</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          Teams are coordination units, not hierarchy. Selecting a path does not notify anyone or trigger Live Mode, and
          you can change it anytime in Sim Mode.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8 }}>
          {teamOptions.map((option) => {
            const isSelected = teamSelection === option.id;
            return (
              <button
                key={option.id}
                onClick={() => handleTeamSelect(option.id)}
                style={{
                  textAlign: "left",
                  padding: 12,
                  borderRadius: 10,
                  border: isSelected ? "2px solid #2563eb" : "1px solid rgba(0,0,0,0.1)",
                  background: isSelected ? "rgba(37,99,235,0.08)" : "white",
                  cursor: "pointer",
                }}
                data-testid={`team-${option.id}`}
              >
                <div style={{ fontWeight: 800, marginBottom: 4 }}>{option.title}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>{option.description}</div>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={handleTeamClear}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.15)",
              cursor: "pointer",
              fontWeight: 700,
              background: "white",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Clear team selection <ModePill mode={flightMode} />
            </span>
          </button>
        </div>
        {teamNotice && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: "#1f2937" }}>{teamNotice}</div>
        )}
        <div style={{ marginTop: 10, display: "grid", gap: 4, fontSize: 12, opacity: 0.75 }}>
          <div>
            <span style={{ fontWeight: 700 }}>Who does what:</span> Operator runs execution, Outreach handles lead
            flow, Fulfillment delivers.
          </div>
          <div>
            <span style={{ fontWeight: 700 }}>Money flow:</span> Revenue → pod ledger → revenue share splits (read-only
            in Sim Mode).
          </div>
          <div>
            <span style={{ fontWeight: 700 }}>Leave safely:</span> Leaving pauses assignments; ledger remains intact.
          </div>
          <div>
            <span style={{ fontWeight: 700 }}>Dissolve:</span> Pod closes; history and evidence stay read-only.
          </div>
        </div>
      </div>

      <div
        style={{
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.1)",
          background: "rgba(0,0,0,0.02)",
          marginBottom: 16,
        }}
        data-testid="user-test-readiness"
      >
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>User test readiness</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>5-step first-time walkthrough</div>
        <ol style={{ marginLeft: 18, marginBottom: 12 }}>
          <li>Pick an intent (I&apos;m exploring, Pod, or Business) to set your path.</li>
          <li>Select a team path (I&apos;m working solo, I&apos;m working with a team, or I&apos;m starting a team).</li>
          <li>Review the mode banner: Sim Mode for safety; Live Mode only after preflight.</li>
          <li>Complete onboarding and generate a CEO plan if you own a business.</li>
          <li>Run Do Next in Sim Mode, then review evidence and ledger snapshots.</li>
        </ol>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
          <div style={{ borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", padding: 12, background: "white" }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>What this is</div>
            <ul style={{ marginLeft: 18, fontSize: 12 }}>
              <li>Private execution engine with evidence and policy gates.</li>
              <li>Simulation-first dashboard for safe testing.</li>
              <li>Intent-led actions with ledgered accountability.</li>
            </ul>
          </div>
          <div style={{ borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", padding: 12, background: "white" }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>What this is not</div>
            <ul style={{ marginLeft: 18, fontSize: 12 }}>
              <li>Not a growth hack or persuasion engine.</li>
              <li>Not a black box that executes without consent.</li>
              <li>Not a replacement for human judgment.</li>
            </ul>
          </div>
          <div style={{ borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", padding: 12, background: "white" }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>How this works</div>
            <ul style={{ marginLeft: 18, fontSize: 12 }}>
              <li>
                <span style={{ fontWeight: 700 }}>You:</span> choose intent and confirm every action.
              </li>
              <li>
                <span style={{ fontWeight: 700 }}>Teams:</span> containers for coordination, not autonomous actors.
              </li>
              <li>
                <span style={{ fontWeight: 700 }}>System:</span> never acts without explicit intent and confirmation.
              </li>
            </ul>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
              Nothing runs without you. You can pause anytime. This system explains itself.
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Glossary</div>
          <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
            <div>
              <span style={{ fontWeight: 700 }}>Intent:</span> why an action happens and the metric it moves.
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Team:</span> coordination unit of independent participants.
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Sim Mode:</span> no real-world effects; evidence is stubbed.
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Ledger:</span> append-only history of actions and outcomes.
            </div>
          </div>
        </div>
      </div>

      {showExploreFlow && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.1)",
            background: "rgba(0,0,0,0.02)",
            marginBottom: 16,
          }}
          data-testid="intent-explore-panel"
        >
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Explore / Learn Checklist</div>
          <ul style={{ marginLeft: 18, marginBottom: 10 }}>
            <li>Review system health, pods, and ledger snapshots.</li>
            <li>Run a simulated pipeline step and inspect evidence.</li>
            <li>Practice preflight decisions without executing real actions.</li>
          </ul>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => handleSimulationNote("Simulation queued. No live actions executed.")}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.15)",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              <div style={{ display: "grid", gap: 2 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  Run Simulation <ModePill mode={flightMode} />
                </span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  No execution now. Reversible. Affects this workspace only.
                </span>
              </div>
            </button>
            <button
              onClick={() => handleSimulationNote("Predicted outcome ready (simulation only).")}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.15)",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              <div style={{ display: "grid", gap: 2 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  View Predicted Outcome <ModePill mode={flightMode} />
                </span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  Read-only preview. Reversible. Affects this workspace only.
                </span>
              </div>
            </button>
            <button
              disabled
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.15)",
                cursor: "not-allowed",
                fontWeight: 700,
                opacity: 0.5,
              }}
            >
              <div style={{ display: "grid", gap: 2 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  Queue for Live Flight <ModePill mode={flightMode} />
                </span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  Blocked in TEST MODE. No execution now. Reversible; affects real-world only after approval.
                </span>
              </div>
            </button>
          </div>
        </div>
      )}

      {showPodFlow && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.1)",
            background: "rgba(0,0,0,0.02)",
            marginBottom: 16,
          }}
          data-testid="intent-pod-panel"
        >
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Pod Setup (Simulation)</div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontWeight: 700 }}>Roles:</span> Operator, Outreach, Fulfillment, Finance
          </div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontWeight: 700 }}>Skills:</span> Lead intake, pipeline hygiene, evidence capture
          </div>
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontWeight: 700 }}>Simulated revenue:</span> $12,500 / month (preflight)
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => handleSimulationNote("Pod simulation queued. No live actions executed.")}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.15)",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              <div style={{ display: "grid", gap: 2 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  Run Simulation <ModePill mode={flightMode} />
                </span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  No execution now. Reversible. Affects this workspace only.
                </span>
              </div>
            </button>
            <button
              onClick={() => handleSimulationNote("Predicted pod outcome ready (simulation only).")}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.15)",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              <div style={{ display: "grid", gap: 2 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  View Predicted Outcome <ModePill mode={flightMode} />
                </span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  Read-only preview. Reversible. Affects this workspace only.
                </span>
              </div>
            </button>
            <button
              disabled
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.15)",
                cursor: "not-allowed",
                fontWeight: 700,
                opacity: 0.5,
              }}
            >
              <div style={{ display: "grid", gap: 2 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  Queue for Live Flight <ModePill mode={flightMode} />
                </span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  Blocked in TEST MODE. No execution now. Reversible; affects real-world only after approval.
                </span>
              </div>
            </button>
          </div>
        </div>
      )}

      {showBusinessFlow && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #fcd34d",
            background: "#fffbeb",
            color: "#92400e",
            fontWeight: 700,
            marginBottom: 16,
        }}
        data-testid="business-preflight-banner"
      >
        {flightMode === "LIVE"
          ? "Live Mode armed — real-world execution stays blocked until explicit confirmation and verified providers."
          : "Preflight only — business actions are simulated until Live Mode requirements are met."}
      </div>
      )}

      <div
        style={{
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.1)",
          background: "rgba(0,0,0,0.02)",
          marginBottom: 16,
        }}
        data-testid="ceo-status-overview"
      >
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>System Health</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          <StatusCard title="Active Pipelines" testId="ceo-active-pipelines">
            <div>
              <span style={{ fontWeight: 700 }}>Active load:</span>{" "}
              {capacityState ? `${capacityState.active_load}/${capacityState.max_concurrent_actions}` : "n/a"}
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Latest action:</span>{" "}
              {latestLedgerEntry
                ? `${latestLedgerEntry.action.action_type} - ${latestLedgerEntry.outcome.type}`
                : "No pipeline actions yet"}
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Stalled:</span> {stalledPipelines}
            </div>
          </StatusCard>

          <StatusCard title="Pods & Roles" testId="ceo-pods">
            <div>
              <span style={{ fontWeight: 700 }}>Primary pod:</span>{" "}
              {podSnapshot?.pods[0]?.pod_id || identityKey}
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Role:</span> {role || "unknown"}
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Revenue share:</span>{" "}
              {podSnapshot?.pods[0]?.revenue_share != null
                ? `${Math.round(podSnapshot.pods[0].revenue_share * 100)}%`
                : "100%"}
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Status:</span> {podSnapshot?.pods[0]?.status || "active"}
            </div>
          </StatusCard>

          <StatusCard title="Risk / Cooldown" testId="ceo-risk-cooldown">
            <div>
              <span style={{ fontWeight: 700 }}>Cooling:</span>{" "}
              {coolingSummary ? coolingSummary.state : "normal"}
              {coolingSummary?.reason ? ` (${coolingSummary.reason})` : ""}
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Opportunity queue:</span>{" "}
              {opportunitySummary ? `${opportunitySummary.size}/${opportunitySummary.max}` : "0/0"}
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Capacity load:</span>{" "}
              {capacityState ? capacityState.active_load : 0}
            </div>
          </StatusCard>

          <StatusCard title="Maintenance Bot" testId="ceo-maintenance-report">
            <div>
              <span style={{ fontWeight: 700 }}>Drift score:</span>{" "}
              {maintenanceReport ? maintenanceReport.drift_score.score : 100}
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Violations:</span>{" "}
              {maintenanceReport ? maintenanceReport.invariant_violations.length : 0}
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Warnings:</span>{" "}
              {maintenanceReport ? maintenanceReport.warnings.length : 0}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Advisory only; cannot execute revenue actions.
            </div>
          </StatusCard>

          {canControlFlight && (
            <StatusCard title="System State" testId="ceo-system-state">
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="radio" checked={flightMode === "SIM"} readOnly />
                <span style={{ fontWeight: 700 }}>Preflight</span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", opacity: 0.6 }}>
                <input type="radio" checked={flightMode === "LIVE"} disabled />
                <span style={{ fontWeight: 700 }}>Live Flight</span>
              </label>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Live Flight is locked until verified providers and explicit approvals.
              </div>
            </StatusCard>
          )}

          <StatusCard title="Decision Visibility (Read-only)" testId="ceo-decision-visibility">
            {latestLedgerEntry ? (
              <>
                <div>
                  <span style={{ fontWeight: 700 }}>Intent:</span>{" "}
                  {latestLedgerEntry.action.intent_id || "intent:unknown"}
                </div>
                <div>
                  <span style={{ fontWeight: 700 }}>Status:</span> {latestLedgerEntry.outcome.type}
                </div>
                <div>
                  <span style={{ fontWeight: 700 }}>Reason:</span>{" "}
                  {flightMode === "LIVE"
                    ? "Live Mode — policy + consent gates; explicit confirmation required."
                    : "TEST MODE — policy checks only; consent/evidence are simulated."}
                </div>
                <div>
                  <span style={{ fontWeight: 700 }}>Evidence:</span> {latestLedgerEntry.evidence_ref.status} -{" "}
                  {latestLedgerEntry.evidence_ref.request_hash}{" "}
                  <span style={{ opacity: 0.6 }}>{flightMode === "LIVE" ? "(provider)" : "(mock)"}</span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Read-only log; reviewing decisions never executes actions.
                </div>
              </>
            ) : (
              <div style={{ opacity: 0.7 }}>No decisions yet. Read-only until a simulated action is logged.</div>
            )}
          </StatusCard>

          <StatusCard title="Ledger Snapshot (read-only)" testId="ceo-ledger-snapshot">
            {ledgerDisplay.length === 0 && <div style={{ opacity: 0.7 }}>No ledger entries yet.</div>}
            {ledgerDisplay.length > 0 && (
              <div style={{ display: "grid", gap: 4 }}>
                {ledgerDisplay.slice(0, 3).map((entry) => (
                  <div key={entry.entry_id}>
                    <span style={{ fontWeight: 700 }}>{entry.action.action_type}</span>{" "}
                    <span style={{ opacity: 0.7 }}>({entry.outcome.type})</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={handleLoadMoreLedger}
              disabled={!revenueLedgerCursor}
              style={{
                marginTop: 8,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.15)",
                cursor: revenueLedgerCursor ? "pointer" : "not-allowed",
                fontWeight: 700,
                opacity: revenueLedgerCursor ? 1 : 0.5,
              }}
            >
              Load older ledger entries
            </button>
          </StatusCard>

          <StatusCard title="Thread Snapshot" testId="ceo-thread-snapshot">
            {threadSummary ? (
              <div style={{ display: "grid", gap: 4 }}>
                <div>
                  <span style={{ fontWeight: 700 }}>Thread:</span> {threadSummary.threadId}
                </div>
                <div>
                  <span style={{ fontWeight: 700 }}>Entries:</span> {threadSummary.summary.entry_count}
                </div>
                <div>
                  <span style={{ fontWeight: 700 }}>Last updated:</span> {threadSummary.summary.last_updated}
                </div>
                <div>
                  <span style={{ fontWeight: 700 }}>Snapshot:</span>{" "}
                  {threadSummary.snapshotDigest || "none"}
                </div>
              </div>
            ) : (
              <div style={{ opacity: 0.7 }}>No thread snapshots yet.</div>
            )}
          </StatusCard>
        </div>
      </div>

      <div
        style={{
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.1)",
          background: "rgba(0,0,0,0.02)",
          marginBottom: 16,
        }}
        data-testid="manual-override-card"
      >
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Manual Override (human-confirmed)</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          Overrides require a reason, typed confirmation, and are logged immutably.
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 700 }}>Impact classification</span>
            <select
              value={manualOverrideImpact}
              onChange={(e) => setManualOverrideImpact(e.target.value as ActionImpact)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.15)",
              }}
            >
              <option value={ActionImpact.REVERSIBLE}>Reversible</option>
              <option value={ActionImpact.DIFFICULT_TO_REVERSE}>Difficult to reverse</option>
              <option value={ActionImpact.IRREVERSIBLE}>Irreversible</option>
            </select>
          </label>
          {overrideIsIrreversible && (
            <div style={{ padding: 8, borderRadius: 8, background: "#fee2e2", color: "#991b1b", fontWeight: 700 }}>
              Irreversible override selected. Proceed only with explicit human approval and rationale.
            </div>
          )}
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 700 }}>Reason (required)</span>
            <textarea
              value={manualOverrideReason}
              onChange={(e) => setManualOverrideReason(e.target.value)}
              rows={3}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.15)",
                resize: "vertical",
              }}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 700 }}>Type OVERRIDE to confirm</span>
            <input
              value={manualOverrideConfirm}
              onChange={(e) => setManualOverrideConfirm(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.15)",
              }}
            />
          </label>
          <button
            onClick={handleManualOverrideSubmit}
            disabled={!overrideCanSubmit}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.15)",
              cursor: overrideCanSubmit ? "pointer" : "not-allowed",
              fontWeight: 700,
              opacity: overrideCanSubmit ? 1 : 0.6,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Log manual override <ModePill mode={flightMode} />
            </span>
          </button>
          {manualOverrideStatus && (
            <div style={{ padding: 8, borderRadius: 8, background: "#ecfccb", color: "#365314", fontWeight: 700 }}>
              {manualOverrideStatus}
            </div>
          )}
          <div style={{ fontWeight: 700 }}>Recent overrides</div>
          {manualOverrideHistory.length === 0 && <div style={{ opacity: 0.7 }}>No overrides logged.</div>}
          {manualOverrideHistory.length > 0 && (
            <div style={{ display: "grid", gap: 4 }}>
              {manualOverrideHistory.map((entry) => (
                <div key={entry.override_id} style={{ fontSize: 12 }}>
                  <span style={{ fontWeight: 700 }}>{entry.action_impact}</span> - {entry.reason}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showBusinessFlow && status === "in_progress" && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.1)",
            background: "rgba(0,0,0,0.02)",
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Finish onboarding</div>
          <p style={{ marginBottom: 10, opacity: 0.8 }}>
            You started onboarding. Resume to finalize the CEO Agent setup.
          </p>
          <button
            data-testid="resume-onboarding"
            onClick={() => navigate("/app/onboarding")}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.15)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Resume onboarding <ModePill mode={flightMode} />
            </span>
          </button>
        </div>
      )}

      {showBusinessFlow && allowPlanSections && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.1)",
            background: "rgba(0,0,0,0.02)",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Business Context</div>
            {!hasContext && (
              <button
                onClick={() => navigate("/app/onboarding")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.15)",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  Re-run onboarding <ModePill mode={flightMode} />
                </span>
              </button>
            )}
          </div>
          {!hasContext && (
            <div style={{ marginBottom: 8, color: "#b7791f", fontWeight: 600 }}>
              Onboarding data is missing or incomplete. Re-run onboarding to fill it in.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
            <ContextField label="Business name" value={context.businessName} />
            <ContextField label="Industry" value={context.industry} />
            <ContextField label="Service area" value={context.serviceArea} />
            <ContextField label="Primary goal" value={context.primaryGoal} />
            <ContextField label="Offer & pricing" value={context.offerPricing} />
          </div>
        </div>
      )}

      {showBusinessFlow && allowPlanSections && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.1)",
            background: "rgba(0,0,0,0.02)",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 16, display: "flex", gap: 8, alignItems: "center" }}>
              CEO Plan
              {planOutOfDate && (
                <span style={{ padding: "2px 8px", borderRadius: 999, background: "#fef3c7", color: "#92400e", fontSize: 12 }}>
                  Plan out of date
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleGeneratePlan}
                disabled={agentLoading || planLoading}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.15)",
                  cursor: "pointer",
                  fontWeight: 700,
                  opacity: agentLoading || planLoading ? 0.6 : 1,
                }}
              >
                <div style={{ display: "grid", gap: 2 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {plan ? "Regenerate" : "Generate CEO Plan"} <ModePill mode={flightMode} />
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>
                    Draft only. No execution now. Reversible. Affects this workspace only.
                  </span>
                </div>
              </button>
            </div>
          </div>
          {plan && (
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 8,
                padding: 12,
                background: "white",
                whiteSpace: "pre-wrap",
                lineHeight: 1.5,
                fontFamily: "Inter, system-ui, sans-serif",
              }}
            >
              {plan.planMarkdown}
            </div>
          )}
          {!plan && (
            <div style={{ opacity: 0.7 }}>No plan generated yet. Use your onboarding data to draft a CEO action plan.</div>
          )}
        </div>
      )}

      {showBusinessFlow && allowPlanSections && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.1)",
            background: "rgba(0,0,0,0.02)",
            marginBottom: 16,
          }}
          data-testid="daily-brief-card"
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Daily CEO Brief</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {briefNeedsRefresh && (
                <span style={{ padding: "2px 8px", borderRadius: 999, background: "#fef3c7", color: "#92400e", fontSize: 12 }}>
                  Refresh recommended
                </span>
              )}
              <button
                onClick={handleGenerateDailyBrief}
                disabled={dailyBriefLoading || agentLoading}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.15)",
                  cursor: "pointer",
                  fontWeight: 700,
                  opacity: dailyBriefLoading || agentLoading ? 0.6 : 1,
                }}
              >
                <div style={{ display: "grid", gap: 2 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {dailyBrief ? "Regenerate" : "Generate Daily Brief"} <ModePill mode={flightMode} />
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>
                    Read-only brief. No execution now. Reversible. Affects this workspace only.
                  </span>
                </div>
              </button>
            </div>
          </div>
          {dailyBrief && dailyBrief.payload ? (
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 8,
                padding: 12,
                background: "white",
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{dailyBrief.payload.primaryFocus}</div>
              <div style={{ opacity: 0.8, marginBottom: 8 }}>{dailyBrief.payload.whyItMatters}</div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Next action</div>
              <ol style={{ marginLeft: 16, display: "grid", gap: 4 }}>
                {dailyBrief.payload.nextActions.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
          ) : (
            <div style={{ opacity: 0.7 }}>No daily brief yet. Generate one to focus today&apos;s effort.</div>
          )}
        </div>
      )}

      {showBusinessFlow && allowPlanSections && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.1)",
            background: "rgba(0,0,0,0.02)",
            marginBottom: 16,
          }}
          data-testid="execution-confidence"
        >
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Execution confidence</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
            Every action is intent-bound, policy-checked, and evidence-tracked.
          </div>
          <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
            <div>
              <span style={{ fontWeight: 700 }}>Intent:</span> {doNextIntentLabel}
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Policy check:</span>{" "}
              {flightMode === "LIVE"
                ? "Live preflight + confirmation required."
                : "Sim Mode only; no real-world effects."}{" "}
              <span style={{ opacity: 0.7 }}>(System Mode: {systemMode})</span>
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Evidence required:</span>{" "}
              {flightMode === "LIVE" ? "Provider response id + ledger entry." : "Mock evidence stub + ledger entry."}
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Cooldown / irreversibility:</span>{" "}
              {nextTask ? "Reversible task (no cooldown)." : "No action queued."}
            </div>
          </div>
        </div>
      )}

      {showBusinessFlow && allowPlanSections && plan && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.1)",
            background: "rgba(0,0,0,0.02)",
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Execution Checklist</div>
          <div style={{ marginBottom: 8, fontWeight: 700 }}>Today's Top 3</div>
          {todaysTop3.length === 0 ? (
            <div style={{ opacity: 0.7, marginBottom: 12 }}>All caught up for today.</div>
          ) : (
            <ul style={{ marginBottom: 12, paddingLeft: 18 }}>
              {todaysTop3.map((item) => (
                <li key={item.id}>{item.text}</li>
              ))}
            </ul>
          )}
          <div style={{ marginBottom: 8, fontWeight: 700 }}>Full checklist</div>
          <div style={{ display: "grid", gap: 6 }}>
            {checklist.length === 0 && <div style={{ opacity: 0.7 }}>No checklist items parsed from the plan.</div>}
            {checklist.map((item) => (
              <label key={item.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={checklistState.completedIds.includes(item.id)}
                  onChange={() => toggleChecklist(item.id)}
                  disabled={systemMode !== SystemMode.EXECUTION}
                />
                <span>{item.text}</span>
                {item.section && <span style={{ opacity: 0.6, fontSize: 12 }}>({item.section})</span>}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <button
              onClick={handleDoNext}
              disabled={!nextTask || doNextLoading || agentLoading || systemMode !== SystemMode.EXECUTION}
              data-testid="do-next-button"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.15)",
                cursor: nextTask && systemMode === SystemMode.EXECUTION ? "pointer" : "not-allowed",
                fontWeight: 700,
                opacity: !nextTask || doNextLoading || agentLoading || systemMode !== SystemMode.EXECUTION ? 0.6 : 1,
              }}
            >
              <div style={{ display: "grid", gap: 2 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {nextTask ? "Do Next" : "All tasks complete"} <ModePill mode={flightMode} />
                </span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  Guidance only. No execution now. Reversible. Affects this workspace only.
                </span>
              </div>
            </button>
          </div>
          {actionPlan && (
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 8,
                padding: 12,
                background: "white",
                marginTop: 12,
              }}
              data-testid="do-next-output"
            >
              {actionPlan.parsedJson ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{actionPlan.parsedJson.title}</div>
                    <div style={{ opacity: 0.75 }}>{actionPlan.parsedJson.objective}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Steps</div>
                    <ol style={{ marginLeft: 18, display: "grid", gap: 6 }}>
                      {actionPlan.parsedJson.steps.map((step, idx) => (
                        <li key={idx}>
                          <div style={{ fontWeight: 700 }}>{step.label}</div>
                          <div style={{ opacity: 0.8 }}>{step.expectedOutcome}</div>
                          {typeof step.estimatedMinutes === "number" && (
                            <div style={{ opacity: 0.65, fontSize: 12 }}>~{step.estimatedMinutes} min</div>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                  {actionPlan.parsedJson.successCriteria.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Success criteria</div>
                      <ul style={{ marginLeft: 16 }}>
                        {actionPlan.parsedJson.successCriteria.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {actionPlan.parsedJson.blockers.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Potential blockers</div>
                      <ul style={{ marginLeft: 16 }}>
                        {actionPlan.parsedJson.blockers.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>If blocked</div>
                    <div style={{ opacity: 0.8 }}>{actionPlan.parsedJson.escalationPrompt}</div>
                  </div>
                </div>
              ) : (
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontFamily: "Inter, system-ui, sans-serif" }}>
                  {actionPlan.responseMarkdown}
                </div>
              )}
            </div>
          )}
          {lastPipelineResult && (
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 8,
                padding: 12,
                background: "white",
                marginTop: 12,
              }}
              data-testid="do-next-action-pipeline"
            >
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Action Pipeline</div>
              <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
                <div>
                  <span style={{ fontWeight: 700 }}>Intent:</span>{" "}
                  {lastPipelineResult.ledgerEntry.action.intent_id || "intent:unknown"}
                </div>
                <div>
                  <span style={{ fontWeight: 700 }}>Status:</span> {lastPipelineResult.outcome.type}
                </div>
                <div>
                  <span style={{ fontWeight: 700 }}>Reason:</span>{" "}
                  {flightMode === "LIVE"
                    ? "Live Mode — policy + consent gates; explicit confirmation required."
                    : "TEST MODE — policy checks only; consent/evidence are simulated."}
                </div>
                <div>
                  <span style={{ fontWeight: 700 }}>Evidence:</span> {lastPipelineResult.proof.evidence_ref.status}
                  {lastPipelineResult.proof.evidence_ref.request_hash
                    ? ` - ${lastPipelineResult.proof.evidence_ref.request_hash}`
                    : ""}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Read-only pipeline snapshot; no action executes from this panel.
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setHistoryOpen((open) => !open)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.15)",
                cursor: "pointer",
                fontWeight: 700,
                background: historyOpen ? "rgba(0,0,0,0.05)" : "white",
              }}
              data-testid="do-next-history-toggle"
            >
              Do Next Log (read-only) ({doNextHistory.length})
            </button>
            {historyOpen && (
              <div
                style={{
                  marginTop: 8,
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 8,
                  padding: 10,
                  background: "white",
                }}
                data-testid="do-next-history-list"
              >
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                  Read-only log; selecting an entry only previews what happened.
                </div>
                {doNextHistory.length === 0 && <div style={{ opacity: 0.7 }}>No history yet.</div>}
                {doNextHistory.length > 0 && (
                  <div style={{ display: "grid", gap: 6 }}>
                    {doNextHistory.map((entry) => {
                      const key = `${entry.checklistItemId}-${entry.createdAt}`;
                      const title = entry.parsedJson?.title || entry.checklistItemText || "Do Next run";
                      return (
                        <button
                          key={key}
                          onClick={() => handleSelectHistory(entry)}
                          style={{
                            textAlign: "left",
                            borderRadius: 8,
                            border: "1px solid rgba(0,0,0,0.08)",
                            padding: "8px 10px",
                            background: selectedHistoryKey === key ? "rgba(0,0,0,0.05)" : "white",
                            cursor: "pointer",
                          }}
                          data-testid="do-next-history-item"
                        >
                          <div style={{ fontWeight: 700 }}>{title}</div>
                          <div style={{ opacity: 0.7, fontSize: 12 }}>
                            {new Date(entry.createdAt).toLocaleString()}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.1)",
          background: "rgba(0,0,0,0.02)",
          marginBottom: 16,
        }}
        data-testid="exit-controls"
      >
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Pause, exit, or reset</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
          These controls are safe and simulation-only. Use the header to confirm any mode change.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            onClick={handlePauseOps}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.15)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                Pause operations <ModePill mode={flightMode} />
              </span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                No execution now. Reversible. Affects this pod only.
              </span>
            </div>
          </button>
          <button
            onClick={handleReturnToSim}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.15)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                Return to Sim Mode <ModePill mode={flightMode} />
              </span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                No execution now. Reversible. Affects this workspace only.
              </span>
            </div>
          </button>
          <button
            onClick={handleLeaveTeam}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.15)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                Leave team <ModePill mode={flightMode} />
              </span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                No execution now. Reversible. Affects only your team access.
              </span>
            </div>
          </button>
          <button
            onClick={handleArchiveBusiness}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.15)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                Archive business <ModePill mode={flightMode} />
              </span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                Simulation only. Reversible. Affects this workspace only.
              </span>
            </div>
          </button>
          <button
            onClick={handleDownloadRecords}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.15)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                Download records <ModePill mode={flightMode} />
              </span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                Read-only export. Reversible. Affects this workspace only.
              </span>
            </div>
          </button>
        </div>
        {exitNotice && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: "#1f2937" }}>{exitNotice}</div>
        )}
      </div>

      <button
        data-testid="sign-out"
        onClick={() => signOut()}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.15)",
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        Sign out
      </button>

      <button
        data-testid="go-integrations"
        onClick={() => navigate("/app/integrations")}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.15)",
          cursor: "pointer",
          fontWeight: 700,
          marginLeft: 12,
        }}
      >
        Integrations
      </button>

      <hr style={{ margin: "24px 0", opacity: 0.2 }} />

      <div style={{ opacity: 0.85 }}>
        ? Phase 1: routing + auth + stability is the mission.  
        Next: we plug in the CEO Agent panel without breaking the app.
      </div>
    </div>
  );
}

const buildMockDoNextResponse = (taskText: string) => {
  const payload = {
    title: `Next step: ${taskText}`,
    objective: `Make clear progress on "${taskText}" today.`,
    steps: [
      {
        label: "Define the outcome",
        expectedOutcome: `Document what "done" means for ${taskText}.`,
        estimatedMinutes: 10,
      },
      {
        label: "Prepare resources",
        expectedOutcome: "List assets, people, and access needed to execute.",
        estimatedMinutes: 15,
      },
      {
        label: "Execute first move",
        expectedOutcome: "Complete the first concrete deliverable and share status.",
        estimatedMinutes: 20,
      },
    ],
    successCriteria: [
      "Outcome definition is shared and agreed",
      "Blockers and dependencies are documented",
      "Owner and timeline for next checkpoint are set",
    ],
    blockers: ["Waiting on approvals", "Missing access or assets"],
    escalationPrompt: "If blocked, ask: What decision or resource do we need to unblock this task today?",
  };

  return ["```json", JSON.stringify(payload, null, 2), "```"].join("\n");
};

const buildMockDailyBrief = (
  planSummary: string,
  checklistProgress: { completed: number; total: number },
  lastDoNext?: { taskId?: string; text?: string; summary?: string } | null
) => {
  const focus = lastDoNext?.text || "Push the highest impact revenue task forward today";
  const steps = lastDoNext?.summary
    ? [`Confirm progress on "${lastDoNext.text}"`, "Unblock owners and set ETA", "Send status update by EOD"]
    : ["Pick the top revenue task", "Schedule one customer touchpoint", "Ship one tangible deliverable"];
  const payload = {
    primaryFocus: focus,
    whyItMatters: `Keeps the go-to-market plan moving while ${checklistProgress.completed}/${checklistProgress.total} items are complete. Plan snapshot: ${planSummary.slice(0, 120)}`,
    nextActions: steps.slice(0, 3),
  };
  return ["```json", JSON.stringify(payload, null, 2), "```"].join("\n");
};

const getMockPlanMarkdown = () =>
  [
    "## Goals",
    "- Draft landing page for spring promo",
    "- Launch Google Ads test",
    "- Follow up with warm leads",
    "",
    "## Next 7 Days",
    "1. Publish landing page with offer and booking form",
    "2. Set up two ad groups with $50/day budget",
    "3. Send follow-up emails to warm leads and book calls",
  ].join("\n");

const StatusCard = ({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
}) => (
  <div
    style={{
      padding: 12,
      borderRadius: 10,
      border: "1px solid rgba(0,0,0,0.08)",
      background: "white",
      minHeight: 120,
    }}
    data-testid={testId}
  >
    <div style={{ fontWeight: 800, marginBottom: 6 }}>{title}</div>
    <div style={{ display: "grid", gap: 4, fontSize: 13 }}>{children}</div>
  </div>
);

const ContextField = ({ label, value }: { label: string; value?: string }) => (
  <div
    style={{
      padding: 10,
      borderRadius: 8,
      border: "1px solid rgba(0,0,0,0.1)",
      background: "white",
      minHeight: 64,
    }}
  >
    <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.6 }}>{label}</div>
    <div style={{ fontWeight: 700, marginTop: 4 }}>{value || "Not set"}</div>
  </div>
);

const ModePill = ({ mode }: { mode: FlightMode }) => (
  <span
    style={{
      padding: "2px 6px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.15)",
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      background: mode === "LIVE" ? "#dcfce7" : "#fffbeb",
      color: mode === "LIVE" ? "#166534" : "#92400e",
    }}
  >
    {mode}
  </span>
);



