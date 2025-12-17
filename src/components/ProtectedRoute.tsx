import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  skipOnboardingCheck?: boolean;
}

const ProtectedRoute = ({ children, requireAdmin = false, skipOnboardingCheck = false }: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isAdmin, isLoading: authLoading, signOut } = useAuth();
  const { isNewUser, isLoading: onboardingLoading } = useOnboardingStatus();

  const isLoading = authLoading || onboardingLoading;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/auth");
    }
  }, [isAuthenticated, isLoading, navigate]);

  // GOVERNANCE #5: Redirect NEW users to onboarding conversation
  // Only for /app route, not for the onboarding page itself
  useEffect(() => {
    if (!isLoading && isAuthenticated && !skipOnboardingCheck) {
      if (isNewUser && location.pathname === "/app") {
        navigate("/app/onboarding");
      }
    }
  }, [isNewUser, isLoading, isAuthenticated, skipOnboardingCheck, location.pathname, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect via useEffect
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <ShieldAlert className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
          <p className="text-muted-foreground mb-6">
            You don't have permission to access this page. Only administrators can view the CEO Agent dashboard.
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

  return <>{children}</>;
};

export default ProtectedRoute;
