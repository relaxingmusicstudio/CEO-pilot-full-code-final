/**
 * Route & Nav Audit - Pure function module
 * 
 * Compares:
 * - toolRegistry routes vs routeGuards → missing_route
 * - toolRegistry.requires vs routeGuards.requires → role_mismatch
 * - navRoutesForRole vs expectations → nav_missing / nav_exposes_restricted
 * 
 * Returns findings that can be used by Evidence Pack.
 */

import { platformToolsCore } from "./toolRegistryCore";
import { ROUTE_GUARDS, RouteGuard, getRouteGuard, getPlatformRouteGuards } from "./routeGuards";
import { getNavRoutesForRole } from "@/lib/navigationData";

export type AuditIssueCode = 
  | "missing_route"
  | "nav_missing_required"
  | "nav_exposes_restricted"
  | "tools_hub_missing"
  | "role_mismatch"
  | "malformed_route"
  | "orphan_route";

export interface AuditFinding {
  severity: "critical" | "warning";
  issue_code: AuditIssueCode;
  source: "tool" | "route" | "nav" | "scan";
  identifier: string;
  route: string;
  description: string;
  file_hint: string;
  suggested_fix: string;
}

export interface AuditContext {
  isAdmin: boolean;
  isOwner: boolean;
  isClient: boolean;
  isAuthenticated: boolean;
}

export interface AuditSummary {
  critical: number;
  warning: number;
  passed: number;
  total_checks: number;
}

export interface RouteNavAuditResult {
  timestamp: string;
  context: AuditContext;
  summary: AuditSummary;
  findings: AuditFinding[];
  snapshots: {
    tool_registry: Array<{ id: string; route: string; requires: string }>;
    route_guards: Array<{ path: string; requires: string }>;
    nav_routes: string[];
  };
}

/**
 * Run a complete route and navigation audit.
 * This is a PURE function - no side effects, just analysis.
 */
export function runRouteNavAudit(context: AuditContext): RouteNavAuditResult {
  const findings: AuditFinding[] = [];
  let checksPerformed = 0;
  
  const navRoutes = getNavRoutesForRole(context);
  const platformGuards = getPlatformRouteGuards();
  
  // === CHECK 1: Tool Registry vs Route Guards ===
  // Every tool in toolRegistry should have a corresponding route guard
  for (const tool of platformToolsCore) {
    checksPerformed++;
    
    const guard = getRouteGuard(tool.route);
    if (!guard) {
      findings.push({
        severity: "critical",
        issue_code: "missing_route",
        source: "tool",
        identifier: tool.id,
        route: tool.route,
        description: `Tool "${tool.name}" has route ${tool.route} but no matching entry in ROUTE_GUARDS`,
        file_hint: "src/lib/routeGuards.ts",
        suggested_fix: `Add { path: "${tool.route}", requires: "${tool.requires}" } to ROUTE_GUARDS`,
      });
      continue;
    }
    
    // Check role requirement consistency
    if (guard.requires !== tool.requires && guard.requires !== "public") {
      const mappedGuardReq = guard.requires === "authenticated" ? "authenticated" : guard.requires;
      if (mappedGuardReq !== tool.requires) {
        findings.push({
          severity: "warning",
          issue_code: "role_mismatch",
          source: "tool",
          identifier: tool.id,
          route: tool.route,
          description: `Tool "${tool.name}" requires "${tool.requires}" but route guard requires "${guard.requires}"`,
          file_hint: "src/lib/routeGuards.ts or src/lib/toolRegistry.ts",
          suggested_fix: `Align tool.requires and route guard.requires for ${tool.route}`,
        });
      }
    }
  }
  
  // === CHECK 2: Route Guards vs Tool Registry ===
  // Platform route guards should have a corresponding tool
  for (const guard of platformGuards) {
    checksPerformed++;
    
    const tool = platformToolsCore.find(t => t.route === guard.path);
    if (!tool) {
      findings.push({
        severity: "warning",
        issue_code: "orphan_route",
        source: "route",
        identifier: guard.path,
        route: guard.path,
        description: `Route guard exists for ${guard.path} but no tool in toolRegistry`,
        file_hint: "src/lib/toolRegistry.ts",
        suggested_fix: `Add tool entry for ${guard.path} or remove orphan guard`,
      });
    }
  }
  
  // === CHECK 3: ToolsHub Visibility ===
  // Tools that should be visible for the current role
  for (const tool of platformToolsCore) {
    if (tool.id === "tools-hub") continue;
    checksPerformed++;
    
    const shouldBeVisible = (
      (tool.requires === "authenticated" && context.isAuthenticated) ||
      (tool.requires === "owner" && (context.isOwner || context.isAdmin)) ||
      (tool.requires === "admin" && context.isAdmin)
    );
    
    // This is informational - can't detect actual ToolsHub rendering issues without runtime
  }
  
  // === CHECK 4: Navigation Exposure ===
  // Check if platform tools hub is in nav for owners
  checksPerformed++;
  const platformToolsInNav = navRoutes.includes("/platform/tools");
  if (context.isOwner && !platformToolsInNav) {
    findings.push({
      severity: "warning",
      issue_code: "nav_missing_required",
      source: "nav",
      identifier: "platform-tools-hub",
      route: "/platform/tools",
      description: "Platform Tools hub should be in sidebar nav for owners but is missing",
      file_hint: "src/hooks/useRoleNavigation.ts",
      suggested_fix: "Ensure PLATFORM_NAV_ITEM is included in owner nav items",
    });
  }
  
  // Check for restricted routes exposed in nav
  for (const navRoute of navRoutes) {
    const guard = getRouteGuard(navRoute);
    if (!guard) continue;
    checksPerformed++;
    
    // If guard requires admin but user is not admin, that's a problem
    if (guard.requires === "admin" && !context.isAdmin) {
      findings.push({
        severity: "critical",
        issue_code: "nav_exposes_restricted",
        source: "nav",
        identifier: navRoute,
        route: navRoute,
        description: `Nav exposes admin-only route ${navRoute} to non-admin user`,
        file_hint: "src/hooks/useRoleNavigation.ts",
        suggested_fix: `Remove ${navRoute} from non-admin nav items or wrap with admin check`,
      });
    }
    
    // If guard requires owner but user is client, that's a problem
    if (guard.requires === "owner" && context.isClient && !context.isOwner) {
      findings.push({
        severity: "critical",
        issue_code: "nav_exposes_restricted",
        source: "nav",
        identifier: navRoute,
        route: navRoute,
        description: `Nav exposes owner-only route ${navRoute} to client user`,
        file_hint: "src/hooks/useRoleNavigation.ts",
        suggested_fix: `Remove ${navRoute} from client nav items`,
      });
    }
  }
  
  // Calculate summary
  const critical = findings.filter(f => f.severity === "critical").length;
  const warning = findings.filter(f => f.severity === "warning").length;
  
  return {
    timestamp: new Date().toISOString(),
    context,
    summary: {
      critical,
      warning,
      passed: checksPerformed - findings.length,
      total_checks: checksPerformed,
    },
    findings,
    snapshots: {
      tool_registry: platformToolsCore.map(t => ({ id: t.id, route: t.route, requires: t.requires })),
      route_guards: ROUTE_GUARDS.filter(g => g.path.startsWith("/platform/")).map(g => ({ path: g.path, requires: g.requires })),
      nav_routes: navRoutes,
    },
  };
}

/**
 * Scan source code for malformed patterns.
 * Can be used with App.tsx source to detect issues.
 */
export interface MalformedPattern {
  pattern: RegExp;
  name: string;
  severity: "critical" | "warning";
}

export const MALFORMED_PATTERNS: MalformedPattern[] = [
  { pattern: /element=\{null\}/, name: "null_element", severity: "critical" },
  { pattern: /}\s*\/>/, name: "stray_close", severity: "critical" },
  { pattern: /\/>\s*}/, name: "stray_close_reverse", severity: "critical" },
  { pattern: /TODO:\s*REMOVE|TEMP|stub|mock/i, name: "temp_marker", severity: "warning" },
  { pattern: /REPLACE_ME|CHANGE_ME|PLACEHOLDER/i, name: "placeholder", severity: "critical" },
  { pattern: /element=\{\s*<\s*\/>/, name: "empty_element", severity: "critical" },
  { pattern: /TODO|FIXME|HACK/i, name: "todo_marker", severity: "warning" },
];

export interface SourceScanFinding {
  severity: "critical" | "warning";
  pattern: string;
  line: number;
  snippet: string;
}

export function scanSourceForMalformed(source: string): SourceScanFinding[] {
  const findings: SourceScanFinding[] = [];
  const lines = source.split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, name, severity } of MALFORMED_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({
          severity,
          pattern: name,
          line: i + 1,
          snippet: line.trim().substring(0, 100),
        });
      }
    }
  }
  
  return findings;
}
