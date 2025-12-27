/**
 * FS Reality Check - Browser-safe existence verification
 * 
 * Since we can't use Node fs in browser, we use dynamic imports
 * to verify modules actually exist and are importable.
 * 
 * Storage keys:
 * - platform_fs_reality_check_v1
 * - platform_build_output_v1
 * - platform_claim_log_v1
 */

// ============= Storage Keys =============
export const FS_REALITY_CHECK_KEY = "platform_fs_reality_check_v1";
export const BUILD_OUTPUT_KEY = "platform_build_output_v1";
export const CLAIM_LOG_KEY = "platform_claim_log_v1";

// ============= Types =============

export interface ImportCheckResult {
  id: string;
  specifier: string;
  ok: boolean;
  error_message?: string;
}

export interface FSEnvInfo {
  app_version: string;
  build_timestamp: string;
  commit_sha: string;
  supabase_url_present: boolean;
  supabase_key_present: boolean;
}

export interface FSRealityCheckResult {
  timestamp: string;
  critical_paths: string[];
  import_checks: ImportCheckResult[];
  env: FSEnvInfo;
  build_output_present: boolean;
  build_output_text_preview: string;
  all_imports_ok: boolean;
  failed_imports: string[];
}

// ============= Critical Paths Manifest =============
// These are the files we need to verify exist

export const CRITICAL_PATHS = [
  "src/lib/evidencePack.ts",
  "src/lib/toolRegistry.ts",
  "src/lib/routeGuards.ts",
  "src/lib/routeNavAudit.ts",
  "src/lib/supportBundle.ts",
  "src/pages/platform/ProofGate.tsx",
  "src/pages/platform/ToolsHub.tsx",
  "src/pages/platform/RouteNavAuditor.tsx",
  "src/pages/platform/OpsCenter.tsx",
  "src/pages/platform/VibesInspector.tsx",
  "src/App.tsx",
];

// ============= Import Check Definitions =============
// Each entry attempts a dynamic import to prove the module exists

interface CriticalImport {
  id: string;
  specifier: string;
  importFn: () => Promise<unknown>;
}

const CRITICAL_IMPORTS: CriticalImport[] = [
  {
    id: "evidencePack",
    specifier: "@/lib/evidencePack",
    importFn: () => import("@/lib/evidencePack"),
  },
  {
    id: "toolRegistry",
    specifier: "@/lib/toolRegistry",
    importFn: () => import("@/lib/toolRegistry"),
  },
  {
    id: "routeGuards",
    specifier: "@/lib/routeGuards",
    importFn: () => import("@/lib/routeGuards"),
  },
  {
    id: "routeNavAudit",
    specifier: "@/lib/routeNavAudit",
    importFn: () => import("@/lib/routeNavAudit"),
  },
  {
    id: "supportBundle",
    specifier: "@/lib/supportBundle",
    importFn: () => import("@/lib/supportBundle"),
  },
  {
    id: "ProofGate",
    specifier: "@/pages/platform/ProofGate",
    importFn: () => import("@/pages/platform/ProofGate"),
  },
  {
    id: "ToolsHub",
    specifier: "@/pages/platform/ToolsHub",
    importFn: () => import("@/pages/platform/ToolsHub"),
  },
  {
    id: "RouteNavAuditor",
    specifier: "@/pages/platform/RouteNavAuditor",
    importFn: () => import("@/pages/platform/RouteNavAuditor"),
  },
];

// ============= Run FS Reality Check =============

/**
 * Run the FS Reality Check - verifies all critical modules can be imported.
 */
export async function runFSRealityCheck(): Promise<FSRealityCheckResult> {
  const importChecks: ImportCheckResult[] = [];
  
  // Run all import checks
  for (const { id, specifier, importFn } of CRITICAL_IMPORTS) {
    try {
      await importFn();
      importChecks.push({ id, specifier, ok: true });
    } catch (err) {
      importChecks.push({
        id,
        specifier,
        ok: false,
        error_message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  
  // Gather env info
  const env: FSEnvInfo = {
    app_version: "1.0.0",
    build_timestamp: (import.meta.env.VITE_BUILD_TIMESTAMP as string) ?? "(missing)",
    commit_sha: (import.meta.env.VITE_COMMIT_SHA as string) ?? "(missing)",
    supabase_url_present: !!import.meta.env.VITE_SUPABASE_URL,
    supabase_key_present: !!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
  
  // Check build output
  const buildOutput = loadBuildOutput();
  const buildOutputPresent = buildOutput.length > 0;
  const buildOutputPreview = buildOutput.substring(0, 200) + (buildOutput.length > 200 ? "..." : "");
  
  // Calculate summary
  const failedImports = importChecks.filter(c => !c.ok).map(c => c.id);
  const allImportsOk = failedImports.length === 0;
  
  const result: FSRealityCheckResult = {
    timestamp: new Date().toISOString(),
    critical_paths: CRITICAL_PATHS,
    import_checks: importChecks,
    env,
    build_output_present: buildOutputPresent,
    build_output_text_preview: buildOutputPreview,
    all_imports_ok: allImportsOk,
    failed_imports: failedImports,
  };
  
  // Store result
  storeFSRealityCheck(result);
  
  return result;
}

// ============= Build Output Helpers =============

/**
 * Save build output text to localStorage.
 */
export function saveBuildOutput(text: string): void {
  try {
    const data = {
      timestamp: new Date().toISOString(),
      text,
    };
    localStorage.setItem(BUILD_OUTPUT_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Load build output text from localStorage.
 */
export function loadBuildOutput(): string {
  try {
    const stored = localStorage.getItem(BUILD_OUTPUT_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return data.text || "";
    }
  } catch {
    // Ignore storage errors.
  }
  return "";
}

/**
 * Clear build output from localStorage.
 */
export function clearBuildOutput(): void {
  try {
    localStorage.removeItem(BUILD_OUTPUT_KEY);
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Get build output metadata.
 */
export function getBuildOutputMeta(): { timestamp: string; length: number } | null {
  try {
    const stored = localStorage.getItem(BUILD_OUTPUT_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return {
        timestamp: data.timestamp || "(unknown)",
        length: data.text?.length || 0,
      };
    }
  } catch {
    // Ignore storage errors.
  }
  return null;
}

// ============= Claim Log Helpers =============

/**
 * Save claim log text to localStorage.
 */
export function saveClaimLog(text: string): void {
  try {
    const data = {
      timestamp: new Date().toISOString(),
      text,
    };
    localStorage.setItem(CLAIM_LOG_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Load claim log text from localStorage.
 */
export function loadClaimLog(): string {
  try {
    const stored = localStorage.getItem(CLAIM_LOG_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return data.text || "";
    }
  } catch {
    // Ignore storage errors.
  }
  return "";
}

/**
 * Clear claim log from localStorage.
 */
export function clearClaimLog(): void {
  try {
    localStorage.removeItem(CLAIM_LOG_KEY);
  } catch {
    // Ignore storage errors.
  }
}

// ============= FS Reality Check Storage =============

/**
 * Store FS Reality Check result.
 */
export function storeFSRealityCheck(result: FSRealityCheckResult): void {
  try {
    localStorage.setItem(FS_REALITY_CHECK_KEY, JSON.stringify(result));
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Load stored FS Reality Check result.
 */
export function loadStoredFSRealityCheck(): FSRealityCheckResult | null {
  try {
    const stored = localStorage.getItem(FS_REALITY_CHECK_KEY);
    if (stored) return JSON.parse(stored) as FSRealityCheckResult;
  } catch {
    // Ignore storage errors.
  }
  return null;
}

// ============= Contradiction Detection =============

/**
 * Check claim log for contradiction phrases.
 * Returns phrases found that might contradict FS Reality Check.
 */
export function detectClaimContradictions(claimLog: string, fsResult: FSRealityCheckResult): {
  hasContradiction: boolean;
  contradictions: string[];
} {
  const contradictions: string[] = [];
  const claimLower = claimLog.toLowerCase();
  
  // Phrases that indicate "does not exist"
  const notExistPhrases = [
    "does not exist",
    "do not exist",
    "not found",
    "cannot be read",
    "file not found",
    "module not found",
  ];
  
  // Check if claim log has "not exist" phrases
  for (const phrase of notExistPhrases) {
    if (claimLower.includes(phrase)) {
      // If claim says something doesn't exist but all imports are OK
      if (fsResult.all_imports_ok) {
        contradictions.push(`Claim contains "${phrase}" but all critical imports succeeded`);
      }
    }
  }
  
  // Check for specific file mentions that contradict
  for (const check of fsResult.import_checks) {
    if (check.ok) {
      // File exists, but claim might say it doesn't
      const fileNameLower = check.id.toLowerCase();
      if (claimLower.includes(fileNameLower) && 
          (claimLower.includes("not exist") || claimLower.includes("not found"))) {
        contradictions.push(`Claim mentions "${check.id}" not existing, but import succeeded`);
      }
    }
  }
  
  return {
    hasContradiction: contradictions.length > 0,
    contradictions,
  };
}

/**
 * Compare two FS Reality Check results for contradictions.
 */
export function compareFSResults(
  previous: FSRealityCheckResult | null,
  current: FSRealityCheckResult
): { hasContradiction: boolean; details: string[] } {
  if (!previous) {
    return { hasContradiction: false, details: [] };
  }
  
  const details: string[] = [];
  
  // Check for flip-flop: previous had failures, current all OK (or vice versa)
  if (previous.all_imports_ok !== current.all_imports_ok) {
    if (previous.all_imports_ok && !current.all_imports_ok) {
      details.push(`Regression: Previous check had all imports OK, current has failures: ${current.failed_imports.join(", ")}`);
    } else {
      // This is actually good - things got fixed
      // But if we claimed things were broken and now they're not, that's a contradiction
    }
  }
  
  // Check for specific imports that changed state
  for (const currCheck of current.import_checks) {
    const prevCheck = previous.import_checks.find(p => p.id === currCheck.id);
    if (prevCheck && prevCheck.ok !== currCheck.ok) {
      details.push(`Import "${currCheck.id}" changed: was ${prevCheck.ok ? "OK" : "FAILED"}, now ${currCheck.ok ? "OK" : "FAILED"}`);
    }
  }
  
  return {
    hasContradiction: details.length > 0,
    details,
  };
}
