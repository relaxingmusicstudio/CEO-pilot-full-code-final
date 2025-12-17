import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Settings, Bell, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

type SystemStatus = "healthy" | "warning" | "critical";

interface StatusBarProps {
  pendingDecisions: number;
}

export function CEOStatusBar({ pendingDecisions }: StatusBarProps) {
  const navigate = useNavigate();
  const [systemStatus, setSystemStatus] = useState<SystemStatus>("healthy");
  const [statusMessage, setStatusMessage] = useState("All systems operational");

  useEffect(() => {
    checkSystemStatus();
  }, []);

  const checkSystemStatus = async () => {
    try {
      // Check for recent errors in automation logs
      const { data: logs } = await supabase
        .from("automation_logs")
        .select("status")
        .gte("started_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .eq("status", "failed")
        .limit(5);

      if (logs && logs.length >= 3) {
        setSystemStatus("warning");
        setStatusMessage(`${logs.length} failed tasks in 24h`);
      } else if (logs && logs.length >= 5) {
        setSystemStatus("critical");
        setStatusMessage("Multiple system failures");
      } else {
        setSystemStatus("healthy");
        setStatusMessage("All systems operational");
      }
    } catch (error) {
      console.error("Error checking system status:", error);
    }
  };

  const StatusIcon = systemStatus === "healthy" ? CheckCircle2 
    : systemStatus === "warning" ? AlertTriangle 
    : XCircle;

  const statusColor = systemStatus === "healthy" ? "text-green-600" 
    : systemStatus === "warning" ? "text-amber-600" 
    : "text-red-600";

  return (
    <div className="h-12 border-b bg-card flex items-center justify-between px-4 shrink-0">
      {/* Left: System Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <StatusIcon className={`h-4 w-4 ${statusColor}`} />
          <span className="text-sm text-muted-foreground hidden sm:inline">{statusMessage}</span>
        </div>
      </div>

      {/* Center: Pending Decisions */}
      <div className="flex items-center gap-2">
        {pendingDecisions > 0 ? (
          <Badge 
            variant="secondary" 
            className="bg-amber-500/10 text-amber-700 dark:text-amber-400 cursor-pointer hover:bg-amber-500/20"
            onClick={() => navigate("/app/decisions")}
          >
            {pendingDecisions} decision{pendingDecisions !== 1 ? "s" : ""} pending
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">No pending decisions</span>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          onClick={() => navigate("/app/notifications")}
        >
          <Bell className="h-4 w-4" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          onClick={() => navigate("/app/settings")}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
