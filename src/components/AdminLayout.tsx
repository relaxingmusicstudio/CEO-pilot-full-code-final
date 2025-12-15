import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Home,
  LogOut,
  ChevronLeft,
  Bot,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePWA } from "@/hooks/usePWA";
import { GroupedNavigation } from "@/components/GroupedNavigation";

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

const AdminLayout = ({ children, title, subtitle }: AdminLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const { isOnline } = usePWA();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Offline Indicator */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-destructive text-destructive-foreground text-center py-2 text-sm font-medium">
          You're offline. Some features may be unavailable.
        </div>
      )}
      
      {/* Hero Header */}
      <header className={`hero-gradient text-primary-foreground ${!isOnline ? 'mt-10' : ''}`}>
        <div className="container py-8">
          <div className="flex items-center justify-between mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
            >
              <Home className="h-4 w-4 mr-2" />
              Back to Site
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
          
          <div className="flex items-center gap-4 mb-2">
            {location.pathname !== "/admin/ceo" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/admin/ceo")}
                className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">{title}</h1>
              {subtitle && (
                <p className="text-primary-foreground/70 mt-1">{subtitle}</p>
              )}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="border-t border-primary-foreground/10 relative z-50">
          <div className="container py-2 overflow-visible">
            <GroupedNavigation variant="horizontal" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8">
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;
