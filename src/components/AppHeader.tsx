/**
 * AppHeader - Application header with notifications and user menu
 * 
 * Features:
 * - App logo/name
 * - Back to Site link (optional)
 * - Notifications icon
 * - User menu (Account, Sign out)
 */

import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Bell, User, LogOut, Settings, Phone, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useRoleNavigation } from "@/hooks/useRoleNavigation";
import { describeFlightMode, loadFlightMode, saveFlightMode, type FlightMode } from "@/lib/flightMode";

export function AppHeader() {
  const { signOut, userId, email } = useAuth();
  const { homeRoute, isClient } = useRoleNavigation();
  const [flightMode, setFlightMode] = useState<FlightMode>(() => loadFlightMode(userId, email));
  const [pendingMode, setPendingMode] = useState<FlightMode | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [modeNotice, setModeNotice] = useState<string | null>(null);
  const [liveReady, setLiveReady] = useState(false);

  const handleSignOut = async () => {
    await signOut();
  };

  useEffect(() => {
    setFlightMode(loadFlightMode(userId, email));
  }, [userId, email]);

  useEffect(() => {
    const update = () => setFlightMode(loadFlightMode(userId, email));
    window.addEventListener("ppp:flightmode", update);
    return () => window.removeEventListener("ppp:flightmode", update);
  }, [userId, email]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setLiveReady(window.localStorage.getItem("ppp:preflightReady") === "true");
  }, []);

  const requestMode = (mode: FlightMode) => {
    setPendingMode(mode);
    setConfirmText("");
    setModeNotice(null);
  };

  const cancelModeChange = () => {
    setPendingMode(null);
    setConfirmText("");
    setModeNotice(null);
  };

  const confirmModeChange = () => {
    if (!pendingMode) return;
    if (pendingMode === "LIVE" && !liveReady) {
      setModeNotice("Live Mode requires preflight readiness.");
      return;
    }
    if (confirmText.trim().toUpperCase() !== pendingMode) {
      setModeNotice(`Type ${pendingMode} to confirm.`);
      return;
    }
    saveFlightMode(pendingMode, userId, email);
    setFlightMode(pendingMode);
    cancelModeChange();
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-background border-b border-border">
      <div className="h-full px-4 flex items-center justify-between">
        {/* Logo / Home */}
        <Link to={homeRoute} className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Phone className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold text-foreground">
            {isClient ? "Client Portal" : "Command Center"}
          </span>
        </Link>

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    className="hidden md:flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground"
                    data-testid="flight-mode-indicator"
                  >
                    {flightMode === "LIVE" ? "Live Flight" : "Sim Mode"}
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                Sim Mode has no real-world effects; Live Mode requires confirmation + preflight.
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-72">
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {describeFlightMode(flightMode)}
              </div>
              <DropdownMenuSeparator />
              <div className="px-2 py-2 text-xs text-muted-foreground">
                Live Mode is locked until preflight requirements are met.
              </div>
              <div className="flex flex-col gap-2 px-2 pb-2">
                <Button
                  variant={flightMode === "SIM" ? "default" : "outline"}
                  size="sm"
                  onClick={() => requestMode("SIM")}
                >
                  Sim Mode
                </Button>
                <Button
                  variant={flightMode === "LIVE" ? "default" : "outline"}
                  size="sm"
                  onClick={() => requestMode("LIVE")}
                  disabled={!liveReady}
                >
                  Live Flight
                </Button>
              </div>
              {pendingMode && (
                <div className="px-2 pb-2 text-xs text-foreground">
                  <div className="mb-1 font-semibold">Confirm {pendingMode} Mode</div>
                  <div className="mb-2 text-muted-foreground">Type {pendingMode} to acknowledge.</div>
                  <input
                    className="mb-2 w-full rounded-md border border-border px-2 py-1 text-xs"
                    value={confirmText}
                    onChange={(event) => setConfirmText(event.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={confirmModeChange}>
                      Confirm
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancelModeChange}>
                      Cancel
                    </Button>
                  </div>
                  {modeNotice && <div className="mt-2 text-amber-700">{modeNotice}</div>}
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="md:hidden rounded-full border border-border px-2 py-1 text-[10px] font-semibold text-foreground">
                {flightMode === "LIVE" ? "LIVE" : "SIM"}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Sim Mode has no real-world effects; Live Mode requires confirmation + preflight.
            </TooltipContent>
          </Tooltip>

          {/* Back to Site */}
          <Button variant="ghost" size="sm" asChild className="hidden md:flex">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              <Home className="w-4 h-4 mr-1" />
              Back to Site
            </Link>
          </Button>

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5 text-muted-foreground" />
            {/* Notification badge - show when there are unread notifications */}
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <User className="w-5 h-5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                {email ?? "unknown"}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/app/settings" className="flex items-center cursor-pointer">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

export default AppHeader;
