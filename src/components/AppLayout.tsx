/**
 * AppLayout - Main app shell with role-based navigation
 * 
 * Uses useRoleNavigation to show:
 * - Owner: Full CEO nav (Dashboard, Pipeline, Inbox, Analytics, etc.)
 * - Client: Portal-only nav (Portal, Messages, Deliverables, etc.)
 * 
 * Layout:
 * - Fixed top AppHeader
 * - Left sidebar nav on desktop
 * - Bottom nav on mobile (5 key items)
 * 
 * TEST CHECKLIST:
 * - Owner sees full navigation
 * - Client sees portal-only navigation
 * - Navigation items highlight correctly on active route
 * - No horizontal scroll on any screen size
 */

import { useEffect, useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AppHeader } from "@/components/AppHeader";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useRoleNavigation } from "@/hooks/useRoleNavigation";
import { loadFlightMode, type FlightMode } from "@/lib/flightMode";
import { Loader2 } from "lucide-react";

export function AppLayout() {
  const location = useLocation();
  const { userId, email } = useAuth();
  const { navItems, mobileNavItems, isLoading } = useRoleNavigation();
  const [flightMode, setFlightMode] = useState<FlightMode>(() => loadFlightMode(userId, email));

  useEffect(() => {
    setFlightMode(loadFlightMode(userId, email));
  }, [userId, email]);

  useEffect(() => {
    const update = () => setFlightMode(loadFlightMode(userId, email));
    window.addEventListener("ppp:flightmode", update);
    return () => window.removeEventListener("ppp:flightmode", update);
  }, [userId, email]);

  const bannerText =
    flightMode === "LIVE"
      ? "Live Mode - Confirmation + preflight required before real-world actions."
      : "Sim Mode - Actions are simulated, not executed.";
  const bannerTooltip =
    "Sim Mode simulates actions while Live Mode executes them only after confirmation + preflight.";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed App Header */}
      <AppHeader />

      {/* Main content area with left nav */}
      <div className="pt-14 flex min-h-screen">
        {/* Left Navigation - Hidden on mobile */}
        <nav className="hidden md:flex flex-col w-56 border-r border-border bg-muted/30 fixed top-14 bottom-0 left-0 overflow-y-auto">
          <div className="p-3 space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href || 
                (item.href !== "/app" && item.href !== "/app/portal" && location.pathname.startsWith(item.href));
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 md:ml-56 pb-20 md:pb-0">
          <div
            className={cn(
              "sticky top-14 z-40 border-b",
              flightMode === "LIVE" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
            )}
          >
            <div
              className={cn(
                "px-4 py-2 text-sm font-medium",
                flightMode === "LIVE" ? "text-emerald-900" : "text-amber-900"
              )}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help" data-testid="preflight-banner">
                    {bannerText}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {bannerTooltip}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border z-40 safe-area-inset-bottom">
        <div className="flex items-center justify-around h-16 px-1">
          {mobileNavItems.map((item) => {
            const isActive = location.pathname === item.href || 
              (item.href !== "/app" && item.href !== "/app/portal" && location.pathname.startsWith(item.href));
            const Icon = item.icon;
            
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg min-w-0 flex-1 max-w-[72px]",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium truncate w-full text-center">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default AppLayout;

