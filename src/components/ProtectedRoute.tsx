/**
 * ProtectedRoute - Access guard ONLY (no routing logic)
 * 
 * This component ONLY handles:
 * 1. Authentication check -> redirect to /auth
 * 2. Role-based access control -> redirect to appropriate home
 * 3. Suspended tenant display
 * 4. Admin-only access denied screen
 * 
 * NOTE: Onboarding routing is handled by AuthRouter, NOT here.
 * 
 * Props:
 * - requireOwner: Redirect clients to /app/portal
 * - requireClient: Redirect owners to /app
 * - requireAdmin: Show Access Denied (only case that shows error screen)
 * 
 * TEST CHECKLIST:
 * - Client visiting requireOwner page -> redirected to /app/portal (no flash, no error)
 * - Owner visiting requireClient page -> redirected to /app (no flash, no error)
 * - Non-admin visiting requireAdmin page -> Access Denied screen
 * - Suspended tenant -> Suspended screen
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ShieldAlert, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { useUserRole } from "@/hooks/useUserRole";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireOwner?: boolean;
  requireClient?: boolean;
}

const ProtectedRoute = ({ 
  children, 
  requireAdmin = false,
  requireOwner = false,
  requireClient = false,
}: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin, isLoading: authLoading, signOut } = useAuth();
  const { isOwner, isClient, isLoading: roleLoading } = useUserRole();
  const { 
    isSuspendedTenant,
    isPlatformAdmin,
    isLoading: tenantLoading 
  } = useTenant();

  const isMockAuth =
    import.meta.env.VITE_MOCK_AUTH === "true" ||
    (typeof window !== "undefined" && window.localStorage.getItem("VITE_MOCK_AUTH") === "true");
  const isEffectivelyAuthed = isAuthenticated || isMockAuth;

  const isLoading = authLoading || tenantLoading || roleLoading;

  // Redirect to auth if not authenticated
  useEffect(() => {
    if (!isLoading && !isEffectivelyAuthed) {
      navigate("/login", { replace: true });
    }
  }, [isEffectivelyAuthed, isLoading, navigate]);

  // Role-based redirects (NOT access denied - just redirect to correct home)
  useEffect(() => {
    if (!isLoading && isEffectivelyAuthed) {
      // Client trying to access owner pages -> redirect to portal
      if (requireOwner && isClient) {
        navigate("/app/portal", { replace: true });
        return;
      }
      
      // Owner trying to access client pages -> redirect to CEO home
      if (requireClient && isOwner) {
        navigate("/app", { replace: true });
        return;
      }
    }
  }, [isClient, isOwner, isLoading, isAuthenticated, requireOwner, requireClient, navigate]);

  // Loading state
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

  // Not authenticated - show nothing while redirecting
  if (!isEffectivelyAuthed) {
    return null;
  }

  // Role mismatch - show nothing while redirecting (no access denied screen)
  if (requireOwner && isClient) {
    return null;
  }
  if (requireClient && isOwner) {
    return null;
  }

  // Show suspended tenant message
  if (isSuspendedTenant && !isPlatformAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <Building2 className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Account Suspended</h1>
          <p className="text-muted-foreground mb-6">
            Your account has been suspended. Please contact support for assistance.
          </p>
          <div className="flex gap-4 justify-center">
            <Button variant="outline" onClick={() => navigate("/")}>
              Go Home
            </Button>
            <Button variant="destructive" onClick={() => signOut()}>
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ONLY show Access Denied for admin requirement (security critical)
  if (requireAdmin && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <ShieldAlert className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
          <p className="text-muted-foreground mb-6">
            You don't have permission to access this page. Administrator access required.
          </p>
          <div className="flex gap-4 justify-center">
            <Button variant="outline" onClick={() => navigate(isClient ? "/app/portal" : "/app")}>
              Go to Dashboard
            </Button>
            <Button variant="destructive" onClick={() => signOut()}>
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
