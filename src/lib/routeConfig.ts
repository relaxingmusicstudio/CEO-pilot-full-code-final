/**
 * Route Configuration - Single Source of Truth
 * 
 * This module defines all platform routes and their access policies.
 * Both App.tsx routing and the RouteNavAuditor import from here.
 * 
 * TO ADD A NEW ROUTE:
 * 1. Add to platformTools in toolRegistry.ts
 * 2. The route is automatically registered here
 * 3. Add the actual <Route> in App.tsx
 */

import { platformToolsCore, AccessLevel } from "./toolRegistryCore";

export interface RouteAccessPolicy {
  route: string;
  requires: AccessLevel;
  toolId: string;
  toolName: string;
}

/**
 * Generate route access policies from the tool registry.
 * This is the SINGLE source of truth - no hardcoded lists.
 */
export function getRouteAccessPolicies(): RouteAccessPolicy[] {
  return platformToolsCore.map(tool => ({
    route: tool.route,
    requires: tool.requires,
    toolId: tool.id,
    toolName: tool.name,
  }));
}

/**
 * Get all platform routes from the tool registry.
 */
export function getPlatformRoutes(): string[] {
  return platformToolsCore.map(tool => tool.route);
}

/**
 * Get the access requirement for a specific route.
 */
export function getRouteRequirement(route: string): AccessLevel | null {
  const tool = platformToolsCore.find(t => t.route === route);
  return tool?.requires ?? null;
}

/**
 * Check if a route is accessible for a given role.
 */
export function canAccessRoute(
  route: string,
  context: { isAdmin: boolean; isOwner: boolean; isAuthenticated: boolean }
): boolean {
  const requirement = getRouteRequirement(route);
  if (!requirement) return false;
  
  if (requirement === "admin") return context.isAdmin;
  if (requirement === "owner") return context.isOwner || context.isAdmin;
  return context.isAuthenticated;
}

/**
 * Malformed route patterns to detect
 */
export const MALFORMED_PATTERNS = [
  { pattern: /element=\{null\}/, name: "null_element", severity: "critical" as const },
  { pattern: /}\s*\/>/, name: "stray_close", severity: "critical" as const },
  { pattern: /\/>\s*}/, name: "stray_close_reverse", severity: "critical" as const },
  { pattern: /TODO|FIXME|PLACEHOLDER|REPLACE_ME/i, name: "placeholder_marker", severity: "warning" as const },
  { pattern: /element=\{\s*<\s*\/>/, name: "empty_element", severity: "critical" as const },
];

/**
 * Scan route source code for malformed patterns.
 */
export function scanRouteSource(source: string): Array<{
  severity: "critical" | "warning";
  pattern: string;
  line: number;
  snippet: string;
}> {
  const findings: Array<{
    severity: "critical" | "warning";
    pattern: string;
    line: number;
    snippet: string;
  }> = [];

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
