/**
 * Evidence Pack - Canonical JSON Receipt System
 * 
 * This module provides the definitive Evidence Pack structure and utilities.
 * "This is how we prove what's true."
 * 
 * Storage key: platform_evidence_pack_v1
 */

import type { RouteNavAuditResult } from "./routeNavAudit";

// ============= Types =============

export interface RoleFlags {
  isAuthenticated: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isClient: boolean;
}

export interface ToolSnapshot {
  id: string;
  name: string;
  route: string;
  requires: string;
  category: string;
}

export interface RouteGuardSnapshot {
  path: string;
  requires: string;
}

export interface EdgeConsoleRun {
  timestamp: string;
  function_name: string;
  request: {
    method: string;
    headers: Record<string, string>;
    body: unknown;
  };
  response: {
    status: number;
    headers: Record<string, string>;
    body: unknown;
  };
  duration_ms: number;
}

export interface HumanActionRequired {
  action: string;
  location: string;
  value?: string;
  validation_endpoint?: string;
  completed?: boolean;
}

export interface MiniQAResult {
  auth_present: boolean;
  tool_registry_valid: boolean;
  route_audit_runnable: boolean;
  errors: string[];
}

// Import FS Reality Check type
import type { FSRealityCheckResult } from "./fsRealityCheck";

// ============= Run History Types =============

export interface ProofRun {
  id: string;
  tool_id: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  ok: boolean;
  error?: string;
  console_warnings: string[];
  console_errors: string[];
}

// ============= Validation Types =============

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  proof_token: string;
}

/**
 * Evidence Pack - Comprehensive diagnostic snapshot
 * Proves what's true at runtime, no guessing.
 */
export interface EvidencePack {
  // ========== META ==========
  timestamp: string;
  app_version: string;
  build_timestamp: string;
  current_route: string;
  proof_token: string;
  
  // ========== USER CONTEXT ==========
  user_id_masked: string;
  role_flags: RoleFlags;
  tenant_ids: string[];
  
  // ========== ROUTING & NAV ==========
  nav_routes_visible: string[];
  tool_registry_snapshot: ToolSnapshot[];
  platform_routes_snapshot: string[];
  route_guard_snapshot: RouteGuardSnapshot[];
  
  // ========== AUDIT RESULTS ==========
  route_nav_audit: RouteNavAuditResult | null;
  
  // ========== FS REALITY CHECK ==========
  fs_reality_check: FSRealityCheckResult | null;
  
  // ========== BUILD OUTPUT ==========
  build_output: { present: boolean; text: string | null };
  
  // ========== QA ==========
  qa_access_status: "available" | "denied" | "not_run";
  qa_debug_json: unknown | null;
  mini_qa: MiniQAResult | null;
  
  // ========== EDGE ==========
  latest_edge_console_run: EdgeConsoleRun | null;
  
  // ========== RUN HISTORY ==========
  runs: ProofRun[];
  
  // ========== RECURRING ==========
  recurring_issue_counts: Record<string, number>;
  
  // ========== BLOCKERS ==========
  human_actions_required: HumanActionRequired[];
  
  // ========== VALIDATION ==========
  validation_result: ValidationResult | null;
}

// ============= Storage Keys =============
export const EVIDENCE_PACK_KEY = "platform_evidence_pack_v1";
export const ISSUE_COUNTS_KEY = "platform_issue_counts_v1";
export const EDGE_RUNS_KEY = "platform_edge_console_runs_v1";

// ============= Factory Functions =============

/**
 * Create an empty Evidence Pack for runtime population.
 */
export function createEmptyEvidencePack(): EvidencePack {
  return {
    // Meta
    timestamp: new Date().toISOString(),
    app_version: "1.0.0",
    build_timestamp: new Date().toISOString(),
    current_route: typeof window !== "undefined" ? window.location.pathname : "",
    proof_token: "",
    
    // User context
    user_id_masked: "",
    role_flags: {
      isAuthenticated: false,
      isOwner: false,
      isAdmin: false,
      isClient: false,
    },
    tenant_ids: [],
    
    // Routing & Nav
    nav_routes_visible: [],
    tool_registry_snapshot: [],
    platform_routes_snapshot: [],
    route_guard_snapshot: [],
    
    // Audit
    route_nav_audit: null,
    
    // FS Reality Check
    fs_reality_check: null,
    
    // Build Output
    build_output: { present: false, text: null },
    
    // QA
    qa_access_status: "not_run",
    qa_debug_json: null,
    mini_qa: null,
    
    // Edge
    latest_edge_console_run: null,
    
    // Run History
    runs: [],
    
    // Recurring
    recurring_issue_counts: {},
    
    // Blockers
    human_actions_required: [],
    
    // Validation
    validation_result: null,
  };
}

// ============= Utility Functions =============

/**
 * Mask a user ID for privacy (show first 8 chars + ellipsis).
 */
export function maskUserId(id: string | null): string {
  if (!id) return "(unauthenticated)";
  if (id.length <= 8) return id;
  return `${id.substring(0, 8)}...`;
}

/**
 * Copy Evidence Pack to clipboard.
 */
export async function copyEvidencePackToClipboard(
  pack: EvidencePack
): Promise<{ success: boolean; fallbackText?: string }> {
  const jsonStr = JSON.stringify(pack, null, 2);
  try {
    await navigator.clipboard.writeText(jsonStr);
    return { success: true };
  } catch {
    return { success: false, fallbackText: jsonStr };
  }
}

/**
 * Download Evidence Pack as JSON file.
 */
export function downloadEvidencePack(pack: EvidencePack): void {
  const jsonStr = JSON.stringify(pack, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `evidence-pack-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Store Evidence Pack in localStorage.
 */
export function storeEvidencePack(pack: EvidencePack): void {
  try {
    localStorage.setItem(EVIDENCE_PACK_KEY, JSON.stringify(pack));
  } catch (err) {
    console.error("Failed to store Evidence Pack:", err);
  }
}

/**
 * Load Evidence Pack from localStorage.
 */
export function loadStoredEvidencePack(): EvidencePack | null {
  try {
    const stored = localStorage.getItem(EVIDENCE_PACK_KEY);
    if (stored) return JSON.parse(stored) as EvidencePack;
  } catch {}
  return null;
}

// ============= Issue Counter Functions =============

/**
 * Load issue counts from localStorage.
 */
export function loadIssueCounts(): Record<string, number> {
  try {
    const stored = localStorage.getItem(ISSUE_COUNTS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {};
}

/**
 * Save issue counts to localStorage.
 */
export function saveIssueCounts(counts: Record<string, number>): void {
  try {
    localStorage.setItem(ISSUE_COUNTS_KEY, JSON.stringify(counts));
  } catch {}
}

/**
 * Reset issue counts.
 */
export function resetIssueCounts(): void {
  try {
    localStorage.removeItem(ISSUE_COUNTS_KEY);
  } catch {}
}

/**
 * Increment issue counts based on findings.
 */
export function incrementIssueCounts(
  findings: Array<{ issue_code: string }>,
  existingCounts: Record<string, number> = {}
): Record<string, number> {
  const newCounts = { ...existingCounts };
  for (const finding of findings) {
    newCounts[finding.issue_code] = (newCounts[finding.issue_code] || 0) + 1;
  }
  return newCounts;
}

/**
 * Get recurring issues (count >= 2).
 */
export function getRecurringIssues(counts: Record<string, number>): string[] {
  return Object.entries(counts)
    .filter(([_, count]) => count >= 2)
    .map(([code]) => code);
}

// ============= Edge Console Functions =============

/**
 * Load latest edge console run from localStorage.
 */
export function loadLatestEdgeRun(): EdgeConsoleRun | null {
  try {
    const stored = localStorage.getItem(EDGE_RUNS_KEY);
    if (stored) {
      const runs = JSON.parse(stored) as EdgeConsoleRun[];
      if (runs.length > 0) return runs[runs.length - 1];
    }
  } catch {}
  return null;
}

/**
 * Save an edge console run to localStorage.
 */
export function saveEdgeRun(run: EdgeConsoleRun): void {
  try {
    const stored = localStorage.getItem(EDGE_RUNS_KEY);
    const runs: EdgeConsoleRun[] = stored ? JSON.parse(stored) : [];
    runs.push(run);
    // Keep only last 10 runs
    const trimmed = runs.slice(-10);
    localStorage.setItem(EDGE_RUNS_KEY, JSON.stringify(trimmed));
  } catch {}
}

// ============= Mini QA Runner =============

/**
 * Run a minimal QA check (fallback when /platform/qa-tests is inaccessible).
 */
export function runMiniQA(context: {
  isAuthenticated: boolean;
  toolRegistryLength: number;
  auditRunnable: boolean;
}): MiniQAResult {
  const errors: string[] = [];
  
  if (!context.isAuthenticated) {
    errors.push("User is not authenticated");
  }
  
  if (context.toolRegistryLength < 5) {
    errors.push(`Tool registry has only ${context.toolRegistryLength} tools (expected 5+)`);
  }
  
  if (!context.auditRunnable) {
    errors.push("Route audit function is not runnable");
  }
  
  return {
    auth_present: context.isAuthenticated,
    tool_registry_valid: context.toolRegistryLength >= 5,
    route_audit_runnable: context.auditRunnable,
    errors,
  };
}

// ============= Proof Token Generation =============

/**
 * Generate a stable hash from an object for proof token.
 * Uses a simple but deterministic hash function.
 */
function stableHash(obj: unknown): string {
  const str = JSON.stringify(obj, Object.keys(obj as object).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to hex and pad
  const hexHash = Math.abs(hash).toString(16).padStart(8, '0');
  return hexHash.toUpperCase();
}

/**
 * Normalize an EvidencePack for hashing (remove volatile fields).
 */
function normalizeForHash(pack: EvidencePack): Record<string, unknown> {
  return {
    user_id_masked: pack.user_id_masked,
    role_flags: pack.role_flags,
    fs_imports_ok: pack.fs_reality_check?.all_imports_ok ?? false,
    fs_failed_imports: pack.fs_reality_check?.failed_imports ?? [],
    build_output_present: pack.build_output.present,
    mini_qa_errors: pack.mini_qa?.errors ?? [],
    route_audit_critical: pack.route_nav_audit?.summary.critical ?? 0,
    human_actions_count: pack.human_actions_required.length,
    recurring_issues: Object.keys(pack.recurring_issue_counts).filter(
      k => pack.recurring_issue_counts[k] >= 2
    ),
  };
}

/**
 * Generate proof token from EvidencePack.
 */
export function generateProofToken(pack: EvidencePack): string {
  const normalized = normalizeForHash(pack);
  const hash = stableHash(normalized);
  const timestamp = pack.timestamp.replace(/[-:TZ.]/g, '').substring(0, 14);
  return `PROOF-${timestamp}-${hash}`;
}

// ============= Evidence Pack Validation =============

/**
 * Validate an EvidencePack - PASS requires ok=true.
 * This is the HARD enforcement gate.
 */
export function validateEvidencePack(pack: EvidencePack): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // CRITICAL: Must have FS Reality Check
  if (!pack.fs_reality_check) {
    errors.push("FS Reality Check not run - cannot verify file existence");
  } else if (!pack.fs_reality_check.all_imports_ok) {
    errors.push(`FS Reality Check FAIL: ${pack.fs_reality_check.failed_imports.join(", ")}`);
  }
  
  // CRITICAL: Must have build output OR explicit human action
  if (!pack.build_output.present) {
    const hasBuildAction = pack.human_actions_required.some(
      a => a.action.toLowerCase().includes("build output")
    );
    if (!hasBuildAction) {
      errors.push("Build output missing - paste raw build output in Ops Center or add human_action_required");
    }
  }
  
  // CRITICAL: No unresolved contradictions
  const contradictionCount = pack.recurring_issue_counts["proof_contradiction"] || 0;
  if (contradictionCount > 0) {
    errors.push(`Unresolved contradictions detected (${contradictionCount}x) - resolve before PASS`);
  }
  
  // CRITICAL: Mini QA must pass
  if (pack.mini_qa && pack.mini_qa.errors.length > 0) {
    errors.push(`Mini QA errors: ${pack.mini_qa.errors.join("; ")}`);
  }
  
  // CRITICAL: Route audit must have no critical issues
  if (pack.route_nav_audit && pack.route_nav_audit.summary.critical > 0) {
    errors.push(`Route audit has ${pack.route_nav_audit.summary.critical} critical issue(s)`);
  }
  
  // CRITICAL: Must have at least one run recorded
  if (pack.runs.length === 0) {
    errors.push("No proof runs recorded - Evidence Pack appears fabricated");
  }
  
  // WARNING: Unresolved human actions
  const unresolvedActions = pack.human_actions_required.filter(a => !a.completed);
  if (unresolvedActions.length > 0) {
    warnings.push(`${unresolvedActions.length} unresolved human action(s) required`);
  }
  
  // WARNING: Role not authenticated
  if (!pack.role_flags.isAuthenticated) {
    warnings.push("User not authenticated - some checks may be incomplete");
  }
  
  // Generate proof token
  const proof_token = generateProofToken(pack);
  
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    proof_token,
  };
}

// ============= Run History Helpers =============

/**
 * Create a new proof run entry.
 */
export function createProofRun(toolId: string): ProofRun {
  return {
    id: `run-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    tool_id: toolId,
    started_at: new Date().toISOString(),
    ended_at: "",
    duration_ms: 0,
    ok: false,
    console_warnings: [],
    console_errors: [],
  };
}

/**
 * Complete a proof run.
 */
export function completeProofRun(
  run: ProofRun, 
  ok: boolean, 
  error?: string,
  consoleCapture?: { warnings: string[]; errors: string[] }
): ProofRun {
  const ended_at = new Date().toISOString();
  const duration_ms = new Date(ended_at).getTime() - new Date(run.started_at).getTime();
  
  return {
    ...run,
    ended_at,
    duration_ms,
    ok,
    error,
    console_warnings: consoleCapture?.warnings ?? [],
    console_errors: consoleCapture?.errors ?? [],
  };
}

/**
 * Capture console warnings and errors during a function execution.
 */
export async function captureConsole<T>(
  fn: () => Promise<T>
): Promise<{ result: T; warnings: string[]; errors: string[] }> {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  const originalWarn = console.warn;
  const originalError = console.error;
  
  console.warn = (...args) => {
    warnings.push(args.map(String).join(" "));
    originalWarn.apply(console, args);
  };
  
  console.error = (...args) => {
    errors.push(args.map(String).join(" "));
    originalError.apply(console, args);
  };
  
  try {
    const result = await fn();
    return { result, warnings, errors };
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
}
