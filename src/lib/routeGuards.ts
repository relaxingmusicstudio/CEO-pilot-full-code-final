/**
 * Route Guards - Single Source of Truth for Route Access Control
 * 
 * This is the AUTHORITY for what routes exist and what role they require.
 * App.tsx guards use this, and the auditor compares against it.
 * 
 * DO NOT derive from toolRegistry - this is independent.
 */

export type RouteRequirement = "public" | "authenticated" | "owner" | "admin";

export interface RouteGuard {
  path: string;
  requires: RouteRequirement;
  description?: string;
}

/**
 * Canonical route guards used by App.tsx
 * This is the SINGLE source of truth for route access requirements.
 */
export const ROUTE_GUARDS: RouteGuard[] = [
  // Public routes
  { path: "/", requires: "public", description: "Landing page" },
  { path: "/blog", requires: "public", description: "Blog listing" },
  { path: "/blog/:slug", requires: "public", description: "Blog post" },
  { path: "/privacy", requires: "public", description: "Privacy policy" },
  { path: "/terms", requires: "public", description: "Terms of service" },
  { path: "/cookies", requires: "public", description: "Cookie policy" },
  { path: "/auth", requires: "public", description: "Authentication" },
  { path: "/login", requires: "public", description: "Login" },
  
  // App routes - Owner required
  { path: "/app", requires: "owner", description: "CEO Dashboard" },
  { path: "/app/onboarding", requires: "authenticated", description: "Onboarding" },
  { path: "/app/portal", requires: "authenticated", description: "Client portal" },
  { path: "/app/decisions", requires: "owner", description: "Decisions" },
  { path: "/app/control-room", requires: "owner", description: "Control Room" },
  { path: "/app/pipeline", requires: "owner", description: "Pipeline" },
  { path: "/app/inbox", requires: "owner", description: "Inbox" },
  { path: "/app/analytics", requires: "owner", description: "Analytics" },
  { path: "/app/billing", requires: "owner", description: "Billing" },
  { path: "/app/content", requires: "owner", description: "Content" },
  { path: "/app/clients", requires: "owner", description: "Clients" },
  { path: "/app/leads", requires: "owner", description: "Leads" },
  { path: "/app/sequences", requires: "owner", description: "Sequences" },
  { path: "/app/crm", requires: "owner", description: "CRM" },
  { path: "/app/contacts", requires: "owner", description: "Contacts" },
  { path: "/app/vault", requires: "owner", description: "Knowledge Vault" },
  { path: "/app/automation", requires: "owner", description: "Automation" },
  { path: "/app/settings", requires: "owner", description: "Settings" },
  { path: "/app/health", requires: "owner", description: "System Health" },
  { path: "/app/audit", requires: "owner", description: "Audit" },
  { path: "/app/help", requires: "owner", description: "Help" },
  { path: "/app/business-setup", requires: "owner", description: "Business Setup" },
  { path: "/app/ceo-dashboard", requires: "owner", description: "CEO Dashboard" },
  
  // Platform Tools - Authenticated
  { path: "/platform/tools", requires: "authenticated", description: "Platform Tools Hub" },
  { path: "/platform/proof-gate", requires: "authenticated", description: "Proof Gate" },
  { path: "/platform/access", requires: "authenticated", description: "Access & Identity" },
  { path: "/platform/qa-tests", requires: "authenticated", description: "QA Tests" },
  { path: "/platform/feature-flags", requires: "authenticated", description: "Feature Flags" },
  { path: "/platform/schema-snapshot", requires: "authenticated", description: "Schema Snapshot" },
  { path: "/platform/placeholder-scan", requires: "authenticated", description: "Placeholder Scanner" },
  { path: "/platform/route-nav-auditor", requires: "authenticated", description: "Route & Nav Auditor" },
  { path: "/platform/ops", requires: "authenticated", description: "Ops Center" },
  { path: "/platform/vibes", requires: "authenticated", description: "Vibes Inspector" },
  
  // Platform Tools - Owner required
  { path: "/platform/cloud-wizard", requires: "owner", description: "Cloud Wizard" },
  { path: "/platform/edge-console", requires: "owner", description: "Edge Console" },
  { path: "/platform/db-doctor", requires: "owner", description: "DB Doctor" },
  
  // Platform Admin - Admin only
  { path: "/platform/tenants", requires: "admin", description: "Admin Tenants" },
  { path: "/platform/scheduler", requires: "admin", description: "Scheduler Control" },
  { path: "/platform/docs/scheduler", requires: "admin", description: "Scheduler Docs" },
];

/**
 * Get the guard for a specific route path.
 */
export function getRouteGuard(path: string): RouteGuard | undefined {
  // Exact match first
  const exact = ROUTE_GUARDS.find(g => g.path === path);
  if (exact) return exact;
  
  // Check for pattern matches (e.g., /blog/:slug)
  for (const guard of ROUTE_GUARDS) {
    if (guard.path.includes(":")) {
      const pattern = guard.path.replace(/:[^/]+/g, "[^/]+");
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(path)) return guard;
    }
  }
  
  return undefined;
}

/**
 * Get all platform tool routes from guards.
 */
export function getPlatformRouteGuards(): RouteGuard[] {
  return ROUTE_GUARDS.filter(g => g.path.startsWith("/platform/"));
}

/**
 * Check if a user can access a route based on their role context.
 */
export function canAccessRoute(
  path: string,
  context: { isAdmin: boolean; isOwner: boolean; isAuthenticated: boolean }
): boolean {
  const guard = getRouteGuard(path);
  if (!guard) return false;
  
  switch (guard.requires) {
    case "public": return true;
    case "authenticated": return context.isAuthenticated;
    case "owner": return context.isOwner || context.isAdmin;
    case "admin": return context.isAdmin;
    default: return false;
  }
}

/**
 * Get all routes accessible for a role context.
 */
export function getAccessibleRoutes(
  context: { isAdmin: boolean; isOwner: boolean; isAuthenticated: boolean }
): RouteGuard[] {
  return ROUTE_GUARDS.filter(guard => canAccessRoute(guard.path, context));
}
