/**
 * Tool Registry - Extensibility spine for Platform Tools
 * Adding new tools is as simple as adding to this registry
 */
import { Shield, Database, Terminal, Cloud, UserCheck, TestTube, Building2, Clock, Flag, Table, Search, Map } from "lucide-react";
import { platformToolsCore } from "./toolRegistryCore";
import type { PlatformToolCore } from "./toolRegistryCore";

export type { AccessLevel } from "./toolRegistryCore";

export interface PlatformTool extends PlatformToolCore {
  icon: React.ComponentType<{ className?: string }>;
}

const TOOL_ICON_MAP: Record<string, PlatformTool["icon"]> = {
  "tools-hub": Terminal,
  "proof-gate": Shield,
  "db-doctor": Database,
  "edge-console": Terminal,
  "cloud-wizard": Cloud,
  "access": UserCheck,
  "qa-tests": TestTube,
  "tenants": Building2,
  "scheduler": Clock,
  "feature-flags": Flag,
  "schema-snapshot": Table,
  "placeholder-scan": Search,
  "route-nav-auditor": Map,
  "ops-center": Terminal,
  "vibes-inspector": Shield,
};

export const platformTools: PlatformTool[] = platformToolsCore.map((tool) => ({
  ...tool,
  icon: TOOL_ICON_MAP[tool.id],
}));

/**
 * Get tools visible for a specific access level.
 * This is the canonical function used by ToolsHub and RouteNavAuditor.
 */
export function getToolsForAccessLevel(isAdmin: boolean, isOwner: boolean): PlatformTool[] {
  return platformTools.filter(tool => {
    if (tool.requires === "admin") return isAdmin;
    if (tool.requires === "owner") return isOwner || isAdmin;
    return true; // authenticated
  });
}

/**
 * Get visible tools for a role context (pure function for auditing).
 */
export function getVisibleTools(context: {
  isAdmin: boolean;
  isOwner: boolean;
  isAuthenticated: boolean;
}): PlatformTool[] {
  if (!context.isAuthenticated) return [];
  return platformTools.filter(tool => {
    if (tool.requires === "admin") return context.isAdmin;
    if (tool.requires === "owner") return context.isOwner || context.isAdmin;
    return true;
  });
}

/**
 * Get all platform tool routes.
 */
export function getAllPlatformRoutes(): string[] {
  return platformTools.map(t => t.route);
}

export function getToolById(id: string): PlatformTool | undefined {
  return platformTools.find(t => t.id === id);
}

export function getToolsByCategory(category: PlatformTool["category"]): PlatformTool[] {
  return platformTools.filter(t => t.category === category);
}
