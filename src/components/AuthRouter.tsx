/**
 * AuthRouter - SINGLE routing brain for authenticated users
 * 
 * This component handles ALL routing decisions based on:
 * 1. Authentication status
 * 2. Onboarding completion
 * 3. User role (owner/client)
 * 
 * ROUTING RULES:
 * - !isAuthenticated -> /login
 * - authenticated + onboarding_complete=false -> /app (onboarding happens inside dashboard)
 * - authenticated + onboarding_complete=true + role=client -> /app/portal
 * - authenticated + onboarding_complete=true + role=owner/admin -> /app
 * 
 * LEGACY REDIRECTS:
 * - /app/onboarding -> /app (onboarding is now in-dashboard)
 * 
 * TEST CHECKLIST:
 * - New user -> auth -> /app (shows onboarding card) -> completes -> dashboard appears
 * - Client visiting /app/* -> redirected to /app/portal with no flash
 * - Owner visiting /app/portal -> redirected to /app
 * - Unauthenticated user visiting /app/* -> redirected to /login
 */

import { useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { useUserRole } from "@/hooks/useUserRole";

interface AuthRouterProps {
  children: React.ReactNode;
}

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/", "/login", "/auth", "/blog", "/privacy", "/terms", "/cookies"];

// Routes for clients only
const CLIENT_ROUTES = ["/app/portal"];

// Legacy routes that redirect
const LEGACY_REDIRECTS: Record<string, string> = {
  "/app/onboarding": "/app",
};

// Check if path starts with any of the given prefixes
function matchesAnyRoute(path: string, routes: string[]): boolean {
  return routes.some(route => path === route || path.startsWith(route + "/"));
}

export function AuthRouter({ children }: AuthRouterProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isOnboardingComplete, isLoading: onboardingLoading } = useOnboardingStatus();
  const { role, isClient, isOwner, isLoading: roleLoading } = useUserRole();

  const isLoading = authLoading || onboardingLoading || roleLoading;
  const currentPath = location.pathname;

  // Compute target path based on current state - IDEMPOTENT
  const targetPath = useMemo(() => {
    // Still loading - no redirect
    if (isLoading) return null;

    // Handle legacy redirects first
    if (LEGACY_REDIRECTS[currentPath]) {
      return LEGACY_REDIRECTS[currentPath];
    }

    // Public routes - no redirect needed
    if (matchesAnyRoute(currentPath, PUBLIC_ROUTES)) return null;

    // Rule 1: Not authenticated -> /login
    if (!isAuthenticated) return "/login";

    // Rule 2: Authenticated - determine proper destination based on role
    // Note: Onboarding now happens inside /app, so no separate route needed
    
    if (isOnboardingComplete === true) {
      // Client role
      if (isClient) {
        // Client on non-client routes -> redirect to portal
        if (!matchesAnyRoute(currentPath, CLIENT_ROUTES)) {
          return "/app/portal";
        }
        return null;
      }

      // Owner/Admin role
      if (isOwner) {
        // Owner on client portal -> redirect to home
        if (matchesAnyRoute(currentPath, CLIENT_ROUTES)) {
          return "/app";
        }
        return null;
      }

      // Role not determined yet (null) - wait for role to load
      if (role === null) {
        return null;
      }
    }

    // Authenticated but onboarding not complete - allow access to /app
    // (onboarding happens inside the dashboard now)
    if (isOnboardingComplete === false) {
      // If trying to access any /app route, allow it (onboarding is in-dashboard)
      if (currentPath.startsWith("/app")) {
        // But clients should still go to portal
        if (isClient) {
          return "/app/portal";
        }
        return null;
      }
    }

    return null;
  }, [isLoading, isAuthenticated, isOnboardingComplete, isClient, isOwner, role, currentPath]);

  // Execute navigation if target differs from current
  useEffect(() => {
    if (targetPath && targetPath !== currentPath) {
      navigate(targetPath, { replace: true });
    }
  }, [targetPath, currentPath, navigate]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated on protected route - show nothing while redirecting
  if (!isAuthenticated && !matchesAnyRoute(currentPath, PUBLIC_ROUTES)) {
    return null;
  }

  return <>{children}</>;
}

export default AuthRouter;
