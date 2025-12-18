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
  
  // ========== QA ==========
  qa_access_status: "available" | "denied" | "not_run";
  qa_debug_json: unknown | null;
  mini_qa: MiniQAResult | null;
  
  // ========== EDGE ==========
  latest_edge_console_run: EdgeConsoleRun | null;
  
  // ========== RECURRING ==========
  recurring_issue_counts: Record<string, number>;
  
  // ========== BLOCKERS ==========
  human_actions_required: HumanActionRequired[];
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
    
    // QA
    qa_access_status: "not_run",
    qa_debug_json: null,
    mini_qa: null,
    
    // Edge
    latest_edge_console_run: null,
    
    // Recurring
    recurring_issue_counts: {},
    
    // Blockers
    human_actions_required: [],
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
