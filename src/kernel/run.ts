import {
  recallDecisions,
  writeActionRecord,
  writeDecisionRecord,
  writeOutcomeRecord,
  type DecisionOutcome,
} from "@/kernel/memory/collectiveMemory";
import { getKernelLockState } from "@/kernel/governanceGate";
import {
  requiredApprovalsForRisk,
  type MandateToken,
  validateMandateToken,
} from "@/kernel/mandates";
import { evaluateAssumptions, evaluateRiskGate } from "@/kernel/riskPolicy";

export type KernelIntent =
  | "kernel.health"
  | "analytics.upsert_visitor"
  | "analytics.track_event"
  | "analytics.save_conversation"
  | "analytics.save_lead"
  | "analytics.update_lead_status"
  | "memory.search"
  | "memory.save"
  | "memory.feedback"
  | "memory.increment_usage"
  | "memory.stats"
  | "memory.delete";

export type KernelProof = {
  check: string;
  ok: boolean;
  detail?: string;
};

export type KernelError = {
  code: string;
  message: string;
  status?: number;
};

export type KernelConstraints = {
  role?: string | null;
  allowedRoles?: string[];
  consent?: {
    analytics?: boolean;
    memory?: boolean;
  };
  assumptions?: Array<{
    key: string;
    validatedAt?: string;
    expiresAt?: string;
  }>;
  budgetCents?: number;
  maxBudgetCents?: number;
  riskTolerance?: number;
  allowHighRisk?: boolean;
  kernelLock?: "locked" | "open";
  safeMode?: "normal" | "degraded" | "safe";
  isAuthenticated?: boolean;
  requiresAuth?: boolean;
  dryRun?: boolean;
  forceFail?: string;
  mandateToken?: MandateToken;
  mandateSecret?: string;
};

export type KernelRunResult<T = unknown> = {
  ok: boolean;
  result: T | null;
  error?: KernelError;
  auditId: string;
  proofs: KernelProof[];
};

type KernelAuditRecord = {
  id: string;
  intent: KernelIntent;
  ok: boolean;
  createdAt: string;
  constraints: {
    role?: string | null;
    allowedRoles?: string[];
    budgetCents?: number;
    maxBudgetCents?: number;
    requiresAuth?: boolean;
  };
  errorCode?: string;
  proofs: KernelProof[];
};

const KERNEL_AUDIT_KEY = "ppp:kernel_audit";
const MAX_AUDIT_ENTRIES = 50;

const isBrowser = (): boolean => typeof window !== "undefined";

const safeJsonParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const readAuditTrail = (): KernelAuditRecord[] => {
  if (!isBrowser()) return [];
  return safeJsonParse<KernelAuditRecord[]>(window.localStorage.getItem(KERNEL_AUDIT_KEY), []);
};

const writeAuditTrail = (records: KernelAuditRecord[]) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(KERNEL_AUDIT_KEY, JSON.stringify(records.slice(-MAX_AUDIT_ENTRIES)));
};

const recordAudit = (entry: KernelAuditRecord) => {
  const records = readAuditTrail();
  records.push(entry);
  writeAuditTrail(records);
};

const getSupabaseEnv = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return { url, anonKey };
};

const validateSupabaseEnv = () => {
  const { url, anonKey } = getSupabaseEnv();
  const issues: string[] = [];
  if (!url) {
    issues.push("missing_supabase_url");
  } else if (!url.startsWith("https://") || url.includes("<") || url.includes(">")) {
    issues.push("invalid_supabase_url");
  }
  if (!anonKey) {
    issues.push("missing_supabase_key");
  } else if (!anonKey.startsWith("eyJ")) {
    issues.push("invalid_supabase_key_format");
  }
  return { ok: issues.length === 0, issues };
};

const createAuditId = () => {
  if (isBrowser() && "crypto" in window && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const getRequiredConsent = (intent: KernelIntent): "analytics" | "memory" | null => {
  if (intent.startsWith("analytics.")) return "analytics";
  if (intent.startsWith("memory.")) return "memory";
  return null;
};

const getInvokeStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const maybeStatus = (error as { status?: number }).status;
  if (maybeStatus) return maybeStatus;
  const contextStatus = (error as { context?: { status?: number } }).context?.status;
  return contextStatus;
};

const postApi = async <T>(path: string, payload: Record<string, unknown>) => {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    const raw = await response.text();
    let parsed: { ok?: boolean; data?: T; error?: string; code?: string } | null = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw) as { ok?: boolean; data?: T; error?: string; code?: string };
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      return {
        data: null,
        error: {
          message: parsed?.error ?? response.statusText ?? "Request failed",
          status: response.status,
          code: parsed?.code,
        },
      };
    }
    if (parsed && parsed.ok === false) {
      return {
        data: null,
        error: {
          message: parsed.error ?? "Request failed",
          status: response.status,
          code: parsed.code,
        },
      };
    }

    return { data: (parsed?.data ?? null) as T, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Network error",
      },
    };
  }
};

const buildKernelError = (code: string, message: string, status?: number): KernelError => ({
  code,
  message,
  status,
});

const createAuditRecord = (
  intent: KernelIntent,
  ok: boolean,
  constraints: KernelConstraints,
  proofs: KernelProof[],
  error?: KernelError
): KernelAuditRecord => ({
  id: createAuditId(),
  intent,
  ok,
  createdAt: new Date().toISOString(),
  constraints: {
    role: constraints.role,
    allowedRoles: constraints.allowedRoles,
    budgetCents: constraints.budgetCents,
    maxBudgetCents: constraints.maxBudgetCents,
    requiresAuth: constraints.requiresAuth,
  },
  errorCode: error?.code,
  proofs,
});

const getKernelStatus = () => {
  const env = validateSupabaseEnv();
  const auditTrail = readAuditTrail();
  const lastAudit = auditTrail[auditTrail.length - 1] ?? null;
  return {
    envOk: env.ok,
    envIssues: env.issues,
    lastAudit,
  };
};

const runIntent = async (intent: KernelIntent, context: Record<string, unknown>) => {
  switch (intent) {
    case "kernel.health":
      return { data: { ok: true, timestamp: new Date().toISOString() }, error: null };
    case "analytics.upsert_visitor":
      return postApi("/api/save-analytics", { action: "upsert_visitor", data: context });
    case "analytics.track_event":
      return postApi("/api/save-analytics", { action: "track_event", data: context });
    case "analytics.save_conversation":
      return postApi("/api/save-analytics", { action: "save_conversation", data: context });
    case "analytics.save_lead":
      return postApi("/api/save-analytics", { action: "save_lead", data: context });
    case "analytics.update_lead_status":
      return postApi("/api/save-analytics", { action: "update_lead_status", data: context });
    case "memory.search":
      return postApi("/api/alex-chat", {
        function: "agent-memory",
        body: {
          action: "search",
          query: context.query,
          agent_type: context.agentType,
          threshold: context.threshold,
          limit: context.limit,
        },
      });
    case "memory.save":
      return postApi("/api/alex-chat", {
        function: "agent-memory",
        body: {
          action: "save",
          agent_type: context.agentType,
          query: context.query,
          response: context.response,
          metadata: context.metadata,
          is_summary: context.isSummary,
        },
      });
    case "memory.increment_usage":
      return postApi("/api/alex-chat", {
        function: "agent-memory",
        body: { action: "increment_usage", memory_id: context.memoryId },
      });
    case "memory.stats":
      return postApi("/api/alex-chat", {
        function: "agent-memory",
        body: { action: "stats", agent_type: context.agentType },
      });
    case "memory.delete":
      return postApi("/api/alex-chat", {
        function: "agent-memory",
        body: { action: "delete", memory_id: context.memoryId },
      });
    case "memory.feedback":
      return postApi("/api/alex-chat", {
        function: "learn-from-success",
        body: {
          memory_id: context.memoryId,
          agent_type: context.agentType,
          query: context.query,
          response: context.response,
          feedback_type: context.feedbackType,
          feedback_value: context.feedbackValue,
          feedback_source: context.feedbackSource ?? "user",
        },
      });
    default:
      return { data: null, error: buildKernelError("unknown_intent", "Unknown intent") };
  }
};

const isFailureResponse = (intent: KernelIntent, data: unknown): boolean => {
  if (!intent.startsWith("analytics.")) return false;
  if (!data || typeof data !== "object") return false;
  const maybeSuccess = (data as { success?: boolean }).success;
  return maybeSuccess === false;
};

export const Kernel = {
  getStatus: getKernelStatus,
  run: async <T = unknown>(
    intent: KernelIntent,
    context: Record<string, unknown>,
    constraints: KernelConstraints = {}
  ): Promise<KernelRunResult<T>> => {
    const auditId = createAuditId();
    const proofs: KernelProof[] = [];
    const recall = recallDecisions(intent);
    proofs.push({
      check: "memory.recall",
      ok: true,
      detail: `matches=${recall.matches.length};failures=${recall.counts.failures};unknown=${recall.counts.unknown}`,
    });

    let decisionRecordId: string | null = null;

    const recordDecision = (decision: string, rationale: string) => {
      if (decisionRecordId) return decisionRecordId;
      try {
        const record = writeDecisionRecord(
          {
            intent,
            decision,
            rationale,
            timestamp: new Date().toISOString(),
            initiatingRole: constraints.role ?? "unknown",
          },
          {
            actor: "kernel",
            rationale: "Kernel recorded decision.",
          }
        );
        decisionRecordId = record.id;
        proofs.push({
          check: "memory.decision",
          ok: true,
          detail: record.id,
        });
      } catch (err) {
        proofs.push({
          check: "memory.decision",
          ok: false,
          detail: err instanceof Error ? err.message : "memory_write_failed",
        });
      }
      return decisionRecordId;
    };

    const recordAction = (decisionId: string | null, action: string, rationale: string) => {
      if (!decisionId) {
        proofs.push({
          check: "memory.action",
          ok: false,
          detail: "missing_decision_record",
        });
        return null;
      }
      try {
        const record = writeActionRecord(
          {
            decisionId,
            action,
            timestamp: new Date().toISOString(),
          },
          {
            actor: "kernel",
            rationale,
          }
        );
        proofs.push({
          check: "memory.action",
          ok: true,
          detail: record.id,
        });
        return record.id;
      } catch (err) {
        proofs.push({
          check: "memory.action",
          ok: false,
          detail: err instanceof Error ? err.message : "memory_write_failed",
        });
        return null;
      }
    };

    const recordOutcome = (
      decisionId: string | null,
      actionId: string | null,
      outcome: DecisionOutcome,
      details: string
    ) => {
      if (!decisionId) {
        proofs.push({
          check: "memory.outcome",
          ok: false,
          detail: "missing_decision_record",
        });
        return;
      }
      try {
        const record = writeOutcomeRecord(
          {
            decisionId,
            actionId,
            outcome,
            details,
            timestamp: new Date().toISOString(),
          },
          {
            actor: "kernel",
            rationale: "Kernel recorded outcome.",
          }
        );
        proofs.push({
          check: "memory.outcome",
          ok: true,
          detail: `${record.outcome}:${record.id}`,
        });
      } catch (err) {
        proofs.push({
          check: "memory.outcome",
          ok: false,
          detail: err instanceof Error ? err.message : "memory_write_failed",
        });
      }
    };

    const returnNoop = (reasonCode: string, detail: string) => {
      const decisionId = recordDecision(`noop:${reasonCode}`, detail);
      recordOutcome(decisionId, null, "unknown", reasonCode);
      recordAudit(createAuditRecord(intent, true, constraints, proofs));
      return {
        ok: true,
        result: {
          status: "noop",
          reason_code: reasonCode,
          detail,
        } as T,
        auditId,
        proofs,
      };
    };

    const assumptionCheck = evaluateAssumptions(constraints);
    proofs.push({
      check: "assumptions",
      ok: assumptionCheck.ok,
      detail: assumptionCheck.detail ?? assumptionCheck.reasonCode,
    });
    if (!assumptionCheck.ok) {
      return returnNoop(assumptionCheck.reasonCode, assumptionCheck.detail ?? "assumption_unverified");
    }

    const lockState = getKernelLockState({
      isProduction: import.meta.env.PROD,
      override: constraints.kernelLock,
    });
    proofs.push({
      check: "kernel.lock",
      ok: !lockState.locked,
      detail: lockState.reason,
    });
    if (lockState.locked && intent !== "kernel.health") {
      return returnNoop("kernel_locked", lockState.reason);
    }

    const safeMode = constraints.safeMode ?? "normal";
    proofs.push({
      check: "safe.mode",
      ok: safeMode === "normal",
      detail: safeMode,
    });
    if (safeMode === "safe" && intent !== "kernel.health") {
      return returnNoop("safe_mode", "safe_mode_active");
    }
    if (safeMode === "degraded" && intent.startsWith("memory.")) {
      return returnNoop("degraded_mode", "memory_ops_blocked");
    }

    const envCheck = validateSupabaseEnv();
    proofs.push({
      check: "env.supabase",
      ok: envCheck.ok,
      detail: envCheck.ok ? "ok" : envCheck.issues.join(","),
    });

    const consentKey = getRequiredConsent(intent);
    if (consentKey) {
      const allowed = constraints.consent?.[consentKey] !== false;
      proofs.push({
        check: `consent.${consentKey}`,
        ok: allowed,
        detail: allowed ? "granted" : "denied",
      });
      if (!allowed) {
        const error = buildKernelError("consent_denied", "Consent denied");
        const decisionId = recordDecision("blocked:consent_denied", "Consent denied.");
        recordOutcome(decisionId, null, "failure", "consent_denied");
        recordAudit(
          createAuditRecord(intent, false, constraints, proofs, error)
        );
        return { ok: false, result: null, error, auditId, proofs };
      }
    }

    if (constraints.allowedRoles && constraints.role) {
      const allowed = constraints.allowedRoles.includes(constraints.role);
      proofs.push({
        check: "role.allowed",
        ok: allowed,
        detail: allowed ? "ok" : "blocked",
      });
      if (!allowed) {
        const error = buildKernelError("role_blocked", "Role not authorized");
        const decisionId = recordDecision("blocked:role_blocked", "Role not authorized.");
        recordOutcome(decisionId, null, "failure", "role_blocked");
        recordAudit(
          createAuditRecord(intent, false, constraints, proofs, error)
        );
        return { ok: false, result: null, error, auditId, proofs };
      }
    }

    if (constraints.requiresAuth) {
      const authed = constraints.isAuthenticated === true;
      proofs.push({
        check: "auth.required",
        ok: authed,
        detail: authed ? "ok" : "missing",
      });
      if (!authed) {
        const error = buildKernelError("auth_required", "Authentication required");
        const decisionId = recordDecision("blocked:auth_required", "Authentication required.");
        recordOutcome(decisionId, null, "failure", "auth_required");
        recordAudit(
          createAuditRecord(intent, false, constraints, proofs, error)
        );
        return { ok: false, result: null, error, auditId, proofs };
      }
    }

    const riskGate = evaluateRiskGate(intent, context, constraints);
    proofs.push({
      check: "risk.score",
      ok: riskGate.action === "allow",
      detail: `score=${riskGate.assessment.score};level=${riskGate.assessment.level};reason=${riskGate.assessment.reason}`,
    });

    const effectiveMaxBudget =
      typeof constraints.maxBudgetCents === "number" ? constraints.maxBudgetCents : riskGate.assessment.budgetCents;
    if (typeof constraints.budgetCents === "number") {
      const allowed = constraints.budgetCents <= effectiveMaxBudget;
      proofs.push({
        check: "budget.limit",
        ok: allowed,
        detail: allowed ? "within_budget" : `exceeded:max=${effectiveMaxBudget}`,
      });
      if (!allowed) {
        const error = buildKernelError("budget_exceeded", "Budget exceeded");
        const decisionId = recordDecision("blocked:budget_exceeded", "Budget exceeded.");
        recordOutcome(decisionId, null, "failure", "budget_exceeded");
        recordAudit(
          createAuditRecord(intent, false, constraints, proofs, error)
        );
        return { ok: false, result: null, error, auditId, proofs };
      }
    }

    if (riskGate.action === "noop") {
      return returnNoop(
        riskGate.reasonCode,
        `score=${riskGate.assessment.score};level=${riskGate.assessment.level}`
      );
    }

    const requiredApprovals = requiredApprovalsForRisk(riskGate.assessment.level);
    if (requiredApprovals > 0) {
      const mandateResult = await validateMandateToken(constraints.mandateToken, {
        expectedIntent: intent,
        minApprovals: requiredApprovals,
        minRiskLevel: riskGate.assessment.level,
        secret: constraints.mandateSecret,
      });
      proofs.push({
        check: "mandate.required",
        ok: mandateResult.ok,
        detail: `${mandateResult.code};approvals=${mandateResult.approvals.unique}/${mandateResult.approvals.required}`,
      });
      if (!mandateResult.ok) {
        const error = buildKernelError("mandate_required", `Mandate required: ${mandateResult.code}`);
        const decisionId = recordDecision("blocked:mandate_required", error.message);
        recordOutcome(decisionId, null, "failure", "mandate_required");
        recordAudit(createAuditRecord(intent, false, constraints, proofs, error));
        return { ok: false, result: null, error, auditId, proofs };
      }
    }

    if (!envCheck.ok && intent !== "kernel.health") {
      const error = buildKernelError("env_invalid", "Supabase env invalid");
      const decisionId = recordDecision("blocked:env_invalid", "Supabase environment invalid.");
      recordOutcome(decisionId, null, "failure", "env_invalid");
      recordAudit(
        createAuditRecord(intent, false, constraints, proofs, error)
      );
      return { ok: false, result: null, error, auditId, proofs };
    }

    if (constraints.forceFail) {
      const error = buildKernelError("forced_failure", constraints.forceFail);
      const decisionId = recordDecision("blocked:forced_failure", constraints.forceFail);
      recordOutcome(decisionId, null, "failure", "forced_failure");
      recordAudit(
        createAuditRecord(intent, false, constraints, proofs, error)
      );
      return { ok: false, result: null, error, auditId, proofs };
    }

    if (constraints.dryRun) {
      const result = { dryRun: true, intent };
      const decisionId = recordDecision("dry_run", "Dry run requested; no action executed.");
      recordOutcome(decisionId, null, "unknown", "dry_run");
      recordAudit(
        createAuditRecord(intent, true, constraints, proofs)
      );
      return { ok: true, result: result as T, auditId, proofs };
    }

    try {
      const decisionId = recordDecision("allow:execute", "Constraints satisfied; executing intent.");
      const actionId = recordAction(decisionId, `invoke:${intent}`, "Kernel invoked intent.");
      const { data, error } = await runIntent(intent, context);
      if (error) {
        const status = getInvokeStatus(error);
        const code = status === 401 || status === 403 ? "unauthorized" : "invoke_failed";
        const kernelError = buildKernelError(
          code,
          (error as { message?: string })?.message ?? "Kernel invoke failed",
          status
        );
        recordOutcome(decisionId, actionId, "failure", `invoke_failed:${code}`);
        recordAudit(
          createAuditRecord(intent, false, constraints, proofs, kernelError)
        );
        return { ok: false, result: null, error: kernelError, auditId, proofs };
      }
      if (isFailureResponse(intent, data)) {
        const error = buildKernelError(
          "analytics_failed",
          (data as { error?: string })?.error ?? "Analytics failed"
        );
        recordOutcome(decisionId, actionId, "failure", "analytics_failed");
        recordAudit(createAuditRecord(intent, false, constraints, proofs, error));
        return { ok: false, result: null, error, auditId, proofs };
      }
      recordOutcome(decisionId, actionId, "success", "executed");
      recordAudit(createAuditRecord(intent, true, constraints, proofs));
      return { ok: true, result: (data ?? null) as T, auditId, proofs };
    } catch (err) {
      const kernelError = buildKernelError(
        "exception",
        err instanceof Error ? err.message : "Kernel exception"
      );
      const decisionId = recordDecision("blocked:exception", kernelError.message);
      recordOutcome(decisionId, null, "failure", "exception");
      recordAudit(
        createAuditRecord(intent, false, constraints, proofs, kernelError)
      );
      return { ok: false, result: null, error: kernelError, auditId, proofs };
    }
  },
};

export { getKernelStatus };
