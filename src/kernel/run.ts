import { supabase } from "@/integrations/supabase/client";

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
  budgetCents?: number;
  maxBudgetCents?: number;
  isAuthenticated?: boolean;
  requiresAuth?: boolean;
  dryRun?: boolean;
  forceFail?: string;
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
      return supabase.functions.invoke("save-analytics", {
        body: { action: "upsert_visitor", data: context },
      });
    case "analytics.track_event":
      return supabase.functions.invoke("save-analytics", {
        body: { action: "track_event", data: context },
      });
    case "analytics.save_conversation":
      return supabase.functions.invoke("save-analytics", {
        body: { action: "save_conversation", data: context },
      });
    case "analytics.save_lead":
      return supabase.functions.invoke("save-analytics", {
        body: { action: "save_lead", data: context },
      });
    case "analytics.update_lead_status":
      return supabase.functions.invoke("save-analytics", {
        body: { action: "update_lead_status", data: context },
      });
    case "memory.search":
      return supabase.functions.invoke("agent-memory", {
        body: {
          action: "search",
          query: context.query,
          agent_type: context.agentType,
          threshold: context.threshold,
          limit: context.limit,
        },
      });
    case "memory.save":
      return supabase.functions.invoke("agent-memory", {
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
      return supabase.functions.invoke("agent-memory", {
        body: { action: "increment_usage", memory_id: context.memoryId },
      });
    case "memory.stats":
      return supabase.functions.invoke("agent-memory", {
        body: { action: "stats", agent_type: context.agentType },
      });
    case "memory.delete":
      return supabase.functions.invoke("agent-memory", {
        body: { action: "delete", memory_id: context.memoryId },
      });
    case "memory.feedback":
      return supabase.functions.invoke("learn-from-success", {
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
        recordAudit(
          createAuditRecord(intent, false, constraints, proofs, error)
        );
        return { ok: false, result: null, error, auditId, proofs };
      }
    }

    if (typeof constraints.budgetCents === "number" && typeof constraints.maxBudgetCents === "number") {
      const allowed = constraints.budgetCents <= constraints.maxBudgetCents;
      proofs.push({
        check: "budget.limit",
        ok: allowed,
        detail: allowed ? "within_budget" : "exceeded",
      });
      if (!allowed) {
        const error = buildKernelError("budget_exceeded", "Budget exceeded");
        recordAudit(
          createAuditRecord(intent, false, constraints, proofs, error)
        );
        return { ok: false, result: null, error, auditId, proofs };
      }
    }

    if (!envCheck.ok && intent !== "kernel.health") {
      const error = buildKernelError("env_invalid", "Supabase env invalid");
      recordAudit(
        createAuditRecord(intent, false, constraints, proofs, error)
      );
      return { ok: false, result: null, error, auditId, proofs };
    }

    if (constraints.forceFail) {
      const error = buildKernelError("forced_failure", constraints.forceFail);
      recordAudit(
        createAuditRecord(intent, false, constraints, proofs, error)
      );
      return { ok: false, result: null, error, auditId, proofs };
    }

    if (constraints.dryRun) {
      const result = { dryRun: true, intent };
      recordAudit(
        createAuditRecord(intent, true, constraints, proofs)
      );
      return { ok: true, result: result as T, auditId, proofs };
    }

    try {
      const { data, error } = await runIntent(intent, context);
      if (error) {
        const status = getInvokeStatus(error);
        const code = status === 401 || status === 403 ? "unauthorized" : "invoke_failed";
        const kernelError = buildKernelError(
          code,
          (error as { message?: string })?.message ?? "Kernel invoke failed",
          status
        );
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
        recordAudit(createAuditRecord(intent, false, constraints, proofs, error));
        return { ok: false, result: null, error, auditId, proofs };
      }
      recordAudit(createAuditRecord(intent, true, constraints, proofs));
      return { ok: true, result: (data ?? null) as T, auditId, proofs };
    } catch (err) {
      const kernelError = buildKernelError(
        "exception",
        err instanceof Error ? err.message : "Kernel exception"
      );
      recordAudit(
        createAuditRecord(intent, false, constraints, proofs, kernelError)
      );
      return { ok: false, result: null, error: kernelError, auditId, proofs };
    }
  },
};

export { getKernelStatus };
