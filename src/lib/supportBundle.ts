/**
 * Support Bundle - Legacy bundle format for backwards compatibility
 * 
 * For new code, prefer using evidencePack.ts directly.
 * This file re-exports EvidencePack types and provides SupportBundle for Proof Gate.
 */

// Re-export EvidencePack types and functions
export {
  type EvidencePack,
  type EdgeConsoleRun,
  type HumanActionRequired,
  type RoleFlags,
  type ToolSnapshot,
  type RouteGuardSnapshot,
  type MiniQAResult,
  type ValidationResult,
  type ProofRun,
  createEmptyEvidencePack,
  copyEvidencePackToClipboard,
  downloadEvidencePack,
  maskUserId,
  storeEvidencePack,
  loadStoredEvidencePack,
  loadIssueCounts,
  saveIssueCounts,
  resetIssueCounts,
  incrementIssueCounts,
  getRecurringIssues,
  loadLatestEdgeRun,
  saveEdgeRun,
  runMiniQA,
  validateEvidencePack,
  generateProofToken,
  createProofRun,
  completeProofRun,
  captureConsole,
  EVIDENCE_PACK_KEY,
  ISSUE_COUNTS_KEY,
  EDGE_RUNS_KEY,
} from "./evidencePack";

import type { EdgeConsoleRun, HumanActionRequired } from "./evidencePack";

// ============= Legacy Support Bundle Types =============

export interface PreflightReport {
  ok: boolean;
  checked_at?: string;
  types?: Record<string, boolean>;
  functions?: Record<string, boolean>;
  permissions?: Record<string, boolean>;
  tables?: Record<string, boolean>;
  suspects?: Array<{ object: string; type: string; fix_sql: string }>;
  suspect_count?: number;
  error?: string;
  error_code?: string;
  error_detail?: string;
}

export interface RouteNavAuditResult {
  summary: { critical: number; warning: number; passed: number; total_tools?: number; total_checks?: number };
  findings: Array<{
    severity: string;
    issue_code: string;
    tool_id?: string;
    identifier?: string;
    route: string;
    description: string;
  }>;
  counters: Record<string, number>;
}

export interface SupportBundle {
  // Meta
  timestamp: string;
  app_version: string;
  build_timestamp: string;
  
  // User context
  user_id: string | null;
  role: string | null;
  tenant_ids: string[];
  isOwner: boolean;
  isAdmin: boolean;
  
  // Environment
  supabase_url: string;
  edge_base_url: string;
  
  // Diagnostics
  db_doctor_report: PreflightReport | null;
  edge_preflight: PreflightReport | null;
  route_nav_audit: RouteNavAuditResult | null;
  
  // Recent activity
  recent_audit_logs: unknown[];
  edge_console_runs: EdgeConsoleRun[];
  
  // QA
  qa_debug_json: unknown | null;
  
  // Human actions
  human_actions_required: HumanActionRequired[];
  
  // Counts
  ceo_alerts_count: number;
  lead_profiles_count: number;
  
  // Last errors
  last_edge_error: unknown | null;
  
  // URLs used
  urls_used: Record<string, string>;
}

export function createEmptyBundle(): SupportBundle {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "(undefined)";
  const edgeBaseUrl = supabaseUrl !== "(undefined)" ? `${supabaseUrl}/functions/v1` : "(undefined)";
  
  return {
    timestamp: new Date().toISOString(),
    app_version: "1.0.0",
    build_timestamp: new Date().toISOString(),
    user_id: null,
    role: null,
    tenant_ids: [],
    isOwner: false,
    isAdmin: false,
    supabase_url: supabaseUrl,
    edge_base_url: edgeBaseUrl,
    db_doctor_report: null,
    edge_preflight: null,
    route_nav_audit: null,
    recent_audit_logs: [],
    edge_console_runs: [],
    qa_debug_json: null,
    human_actions_required: [],
    ceo_alerts_count: 0,
    lead_profiles_count: 0,
    last_edge_error: null,
    urls_used: {
      lead_normalize: `${edgeBaseUrl}/lead-normalize`,
      ceo_scheduler: `${edgeBaseUrl}/ceo-scheduler`,
    },
  };
}

export async function copyBundleToClipboard(bundle: SupportBundle): Promise<{ success: boolean; fallbackText?: string }> {
  const jsonStr = JSON.stringify(bundle, null, 2);
  try {
    await navigator.clipboard.writeText(jsonStr);
    return { success: true };
  } catch {
    return { success: false, fallbackText: jsonStr };
  }
}

export function downloadBundle(bundle: SupportBundle): void {
  const jsonStr = JSON.stringify(bundle, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `support-bundle-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateSecretValue(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
