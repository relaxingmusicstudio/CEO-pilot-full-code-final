export const API_PREFIX = "/api";

export const PUBLIC_ROUTES = ["/", "/login", "/auth", "/blog", "/privacy", "/terms", "/cookies"];

export const PROTECTED_PREFIXES = ["/app", "/platform", "/admin", "/ceo"];

export const CLIENT_ROUTES = ["/app/portal"];

export const LEGACY_REDIRECTS: Record<string, string> = {};

export const API_ROUTES = [
  "/api/health",
  "/api/build",
  "/api/_routes",
  "/api/alex-chat",
  "/api/save-analytics",
  "/api/event",
  "/api/events",
  "/api/diag",
  "/api/kernel/status",
  "/api/audit/run",
  "/api/mandate/verify",
  "/api/decision/[id]",
  "/api/decision-feedback",
  "/api/search-decision",
  "/api/resolve-decision",
  "/api/diag-decision-write",
  "/api/diag-save-analytics",
  "/api/diag-supabase",
];

export const AUTH_REDIRECT_RULES = [
  {
    when: "unauthenticated && protected",
    redirectTo: "/login",
  },
  {
    when: "authenticated && onboarding_incomplete",
    redirectTo: "/app/onboarding",
  },
  {
    when: "client && not_on_client_route",
    redirectTo: "/app/portal",
  },
  {
    when: "owner && on_client_route",
    redirectTo: "/app",
  },
];

export const matchesAnyRoute = (path: string, routes: string[]): boolean =>
  routes.some((route) => path === route || path.startsWith(`${route}/`));

export const isApiRoute = (path: string): boolean =>
  path === API_PREFIX || path.startsWith(`${API_PREFIX}/`);

export const isPublicRoute = (path: string): boolean => matchesAnyRoute(path, PUBLIC_ROUTES);

export const isProtectedRoute = (path: string): boolean => matchesAnyRoute(path, PROTECTED_PREFIXES);
