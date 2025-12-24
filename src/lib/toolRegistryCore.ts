/**
 * Core tool registry data only.
 * UI modules attach icons to keep logic React-free.
 */
export type AccessLevel = "authenticated" | "owner" | "admin";

export interface PlatformToolCore {
  id: string;
  name: string;
  description: string;
  route: string;
  requires: AccessLevel;
  category: "diagnostics" | "configuration" | "admin" | "debug";
  canRunInline: boolean;
  runAction?: () => Promise<{ ok: boolean; message: string }>;
}

export const platformToolsCore: PlatformToolCore[] = [
  {
    id: "tools-hub",
    name: "Platform Tools",
    description: "Central hub for all diagnostic and configuration tools",
    route: "/platform/tools",
    requires: "authenticated",
    category: "diagnostics",
    canRunInline: false,
  },
  {
    id: "proof-gate",
    name: "Proof Gate",
    description: "One-click diagnostic that runs all checks and generates a Support Bundle",
    route: "/platform/proof-gate",
    requires: "authenticated",
    category: "diagnostics",
    canRunInline: true,
  },
  {
    id: "db-doctor",
    name: "DB Doctor",
    description: "Check database dependencies, grants, and generate fix SQL",
    route: "/platform/db-doctor",
    requires: "owner",
    category: "diagnostics",
    canRunInline: true,
  },
  {
    id: "edge-console",
    name: "Edge Console",
    description: "Invoke edge functions with templates and capture evidence",
    route: "/platform/edge-console",
    requires: "owner",
    category: "debug",
    canRunInline: false,
  },
  {
    id: "cloud-wizard",
    name: "Cloud Wizard",
    description: "Step-by-step guide for Supabase configuration tasks",
    route: "/platform/cloud-wizard",
    requires: "owner",
    category: "configuration",
    canRunInline: false,
  },
  {
    id: "access",
    name: "Access & Identity",
    description: "View your role, tenant access, and request elevated permissions",
    route: "/platform/access",
    requires: "authenticated",
    category: "diagnostics",
    canRunInline: false,
  },
  {
    id: "qa-tests",
    name: "QA Tests",
    description: "Run tenant isolation and data integrity tests",
    route: "/platform/qa-tests",
    requires: "authenticated",
    category: "diagnostics",
    canRunInline: true,
  },
  {
    id: "tenants",
    name: "Admin Tenants",
    description: "Manage tenant configuration and provisioning",
    route: "/platform/tenants",
    requires: "admin",
    category: "admin",
    canRunInline: false,
  },
  {
    id: "scheduler",
    name: "Scheduler Control",
    description: "View and manage automated scheduler tasks",
    route: "/platform/scheduler",
    requires: "admin",
    category: "admin",
    canRunInline: false,
  },
  {
    id: "feature-flags",
    name: "Feature Flags",
    description: "Toggle experimental features and debug modes",
    route: "/platform/feature-flags",
    requires: "authenticated",
    category: "configuration",
    canRunInline: false,
  },
  {
    id: "schema-snapshot",
    name: "Schema Snapshot",
    description: "Read-only view of table access and RPC availability",
    route: "/platform/schema-snapshot",
    requires: "authenticated",
    category: "diagnostics",
    canRunInline: true,
  },
  {
    id: "placeholder-scan",
    name: "Placeholder Scanner",
    description: "Detect placeholders, stubs, and false-done patterns in source files",
    route: "/platform/placeholder-scan",
    requires: "authenticated",
    category: "diagnostics",
    canRunInline: true,
  },
  {
    id: "route-nav-auditor",
    name: "Route & Nav Auditor",
    description: "Detect routing mismatches, missing nav entries, and role gating issues",
    route: "/platform/route-nav-auditor",
    requires: "authenticated",
    category: "diagnostics",
    canRunInline: true,
  },
  {
    id: "ops-center",
    name: "Ops Center",
    description: "Central cockpit for all diagnostics, build proof, and contradiction detection",
    route: "/platform/ops",
    requires: "authenticated",
    category: "diagnostics",
    canRunInline: false,
  },
  {
    id: "vibes-inspector",
    name: "Vibes Inspector",
    description: "Detect common vibes errors - contradictions, missing proof, broken assumptions",
    route: "/platform/vibes",
    requires: "authenticated",
    category: "diagnostics",
    canRunInline: true,
  },
];
