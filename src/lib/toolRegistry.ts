/**
 * Tool Registry - Extensibility spine for Platform Tools
 * Adding new tools is as simple as adding to this registry
 */

import { Shield, Database, Terminal, Cloud, UserCheck, TestTube, Building2, Clock, Flag, Table } from "lucide-react";

export type AccessLevel = "authenticated" | "owner" | "admin";

export interface PlatformTool {
  id: string;
  name: string;
  description: string;
  route: string;
  icon: React.ComponentType<{ className?: string }>;
  requires: AccessLevel;
  category: "diagnostics" | "configuration" | "admin" | "debug";
  canRunInline: boolean;
  runAction?: () => Promise<{ ok: boolean; message: string }>;
}

export const platformTools: PlatformTool[] = [
  {
    id: "tools-hub",
    name: "Platform Tools",
    description: "Central hub for all diagnostic and configuration tools",
    route: "/platform/tools",
    icon: Terminal,
    requires: "authenticated",
    category: "diagnostics",
    canRunInline: false,
  },
  {
    id: "proof-gate",
    name: "Proof Gate",
    description: "One-click diagnostic that runs all checks and generates a Support Bundle",
    route: "/platform/proof-gate",
    icon: Shield,
    requires: "authenticated",
    category: "diagnostics",
    canRunInline: true,
  },
  {
    id: "db-doctor",
    name: "DB Doctor",
    description: "Check database dependencies, grants, and generate fix SQL",
    route: "/platform/db-doctor",
    icon: Database,
    requires: "owner",
    category: "diagnostics",
    canRunInline: true,
  },
  {
    id: "edge-console",
    name: "Edge Console",
    description: "Invoke edge functions with templates and capture evidence",
    route: "/platform/edge-console",
    icon: Terminal,
    requires: "owner",
    category: "debug",
    canRunInline: false,
  },
  {
    id: "cloud-wizard",
    name: "Cloud Wizard",
    description: "Step-by-step guide for Supabase configuration tasks",
    route: "/platform/cloud-wizard",
    icon: Cloud,
    requires: "owner",
    category: "configuration",
    canRunInline: false,
  },
  {
    id: "access",
    name: "Access & Identity",
    description: "View your role, tenant access, and request elevated permissions",
    route: "/platform/access",
    icon: UserCheck,
    requires: "authenticated",
    category: "diagnostics",
    canRunInline: false,
  },
  {
    id: "qa-tests",
    name: "QA Tests",
    description: "Run tenant isolation and data integrity tests",
    route: "/platform/qa-tests",
    icon: TestTube,
    requires: "authenticated",
    category: "diagnostics",
    canRunInline: true,
  },
  {
    id: "tenants",
    name: "Admin Tenants",
    description: "Manage tenant configuration and provisioning",
    route: "/platform/tenants",
    icon: Building2,
    requires: "admin",
    category: "admin",
    canRunInline: false,
  },
  {
    id: "scheduler",
    name: "Scheduler Control",
    description: "View and manage automated scheduler tasks",
    route: "/platform/scheduler",
    icon: Clock,
    requires: "admin",
    category: "admin",
    canRunInline: false,
  },
  {
    id: "feature-flags",
    name: "Feature Flags",
    description: "Toggle experimental features and debug modes",
    route: "/platform/feature-flags",
    icon: Flag,
    requires: "authenticated",
    category: "configuration",
    canRunInline: false,
  },
  {
    id: "schema-snapshot",
    name: "Schema Snapshot",
    description: "Read-only view of table access and RPC availability",
    route: "/platform/schema-snapshot",
    icon: Table,
    requires: "authenticated",
    category: "diagnostics",
    canRunInline: true,
  },
];

export function getToolsForAccessLevel(isAdmin: boolean, isOwner: boolean): PlatformTool[] {
  return platformTools.filter(tool => {
    if (tool.requires === "admin") return isAdmin;
    if (tool.requires === "owner") return isOwner || isAdmin;
    return true; // authenticated
  });
}

export function getToolById(id: string): PlatformTool | undefined {
  return platformTools.find(t => t.id === id);
}

export function getToolsByCategory(category: PlatformTool["category"]): PlatformTool[] {
  return platformTools.filter(t => t.category === category);
}
