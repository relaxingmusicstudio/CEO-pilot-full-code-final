import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Play, RefreshCw, Clock, CheckCircle2, XCircle, AlertTriangle, 
  Loader2, ShieldX, CalendarClock, Coins, Send, Timer, Activity
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";

interface SchedulerJob {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  last_run: string | null;
  last_status: string | null;
}

interface AuditLog {
  id: string;
  action_type: string;
  entity_id: string;
  description: string;
  success: boolean;
  created_at: string;
  duration_ms: number | null;
}

interface SchedulerStatusResponse {
  secret_configured: boolean;
  jobs: SchedulerJob[];
  audit_logs: AuditLog[];
}

export default function SchedulerControl() {
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const [jobs, setJobs] = useState<SchedulerJob[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [secretConfigured, setSecretConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<"unknown" | "healthy" | "error">("unknown");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        setError("Supabase URL not configured");
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/admin-scheduler-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: SchedulerStatusResponse = await response.json();
      
      setSecretConfigured(data.secret_configured);
      setJobs(data.jobs || []);
      setAuditLogs(data.audit_logs || []);
    } catch (err) {
      console.error("Failed to load scheduler data", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const runHealthCheck = async () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      toast.error("Supabase URL not configured");
      return;
    }

    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/ceo-scheduler`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "health" }),
        }
      );
      
      if (response.ok) {
        setHealthStatus("healthy");
        toast.success("Scheduler is healthy");
      } else {
        setHealthStatus("error");
        toast.error("Health check failed");
      }
    } catch {
      setHealthStatus("error");
      toast.error("Health check failed - connection error");
    }
  };

  const runSchedulerAction = async (action: string) => {
    setRunningAction(action);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        toast.error("Not authenticated");
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        toast.error("Supabase URL not configured");
        return;
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/admin-run-scheduler`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ action }),
        }
      );

      const result = await response.json();

      if (response.ok) {
        toast.success(`${action} triggered successfully`);
        setTimeout(loadData, 1000);
      } else {
        toast.error(result.error || "Action failed");
      }
    } catch {
      toast.error("Failed to trigger action");
    } finally {
      setRunningAction(null);
    }
  };

  const getJobIcon = (jobname: string) => {
    if (jobname.includes("daily") || jobname.includes("brief")) {
      return <CalendarClock className="h-4 w-4" />;
    }
    if (jobname.includes("cost") || jobname.includes("rollup")) {
      return <Coins className="h-4 w-4" />;
    }
    if (jobname.includes("outreach")) {
      return <Send className="h-4 w-4" />;
    }
    return <Timer className="h-4 w-4" />;
  };

  const getActionFromJobname = (jobname: string): string => {
    if (jobname.includes("daily") || jobname.includes("brief")) return "run_daily_briefs";
    if (jobname.includes("cost") || jobname.includes("rollup")) return "run_cost_rollup";
    if (jobname.includes("outreach")) return "run_outreach_queue";
    return "";
  };

  const formatSchedule = (schedule: string): string => {
    if (schedule === "0 6 * * *") return "Daily at 6:00 AM UTC";
    if (schedule === "0 */6 * * *") return "Every 6 hours";
    if (schedule === "*/15 * * * *") return "Every 15 minutes";
    return schedule;
  };

  const formatJobName = (jobname: string): string => {
    return jobname
      .replace("ceo-scheduler-", "")
      .replace("ceo-", "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  if (roleLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <Alert variant="destructive">
          <ShieldX className="h-5 w-5" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            This page is restricted to platform administrators only.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Scheduler Control Panel</h1>
          <p className="text-muted-foreground mt-1">
            Monitor and control automated scheduler jobs
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {secretConfigured === false && (
        <Alert variant="destructive">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Scheduler Secret Not Configured</AlertTitle>
          <AlertDescription>
            The internal scheduler secret is not set. Cron jobs will not execute.
            Run: <code className="bg-muted px-1 rounded">SELECT public.set_internal_scheduler_secret('your-secret');</code>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">System Health</CardTitle>
            <Button variant="outline" size="sm" onClick={runHealthCheck}>
              <Activity className="mr-2 h-4 w-4" />
              Health Check
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Secret:</span>
              {loading ? (
                <Skeleton className="h-5 w-20" />
              ) : secretConfigured ? (
                <Badge className="bg-green-500/20 text-green-600 border-green-500/30">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Configured
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="mr-1 h-3 w-3" /> Not Set
                </Badge>
              )}
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Edge Function:</span>
              {healthStatus === "healthy" && (
                <Badge className="bg-green-500/20 text-green-600 border-green-500/30">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Healthy
                </Badge>
              )}
              {healthStatus === "error" && (
                <Badge variant="destructive">
                  <XCircle className="mr-1 h-3 w-3" /> Error
                </Badge>
              )}
              {healthStatus === "unknown" && (
                <Badge variant="outline">Unknown</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {loading ? (
          <>
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </>
        ) : jobs.length > 0 ? (
          jobs.map((job) => (
            <Card key={job.jobid}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getJobIcon(job.jobname)}
                    <CardTitle className="text-base">
                      {formatJobName(job.jobname)}
                    </CardTitle>
                  </div>
                  {job.active ? (
                    <Badge className="bg-green-500/20 text-green-600 border-green-500/30">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </div>
                <CardDescription>{formatSchedule(job.schedule)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm space-y-1">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Last Run:</span>
                    <span>{job.last_run ? new Date(job.last_run).toLocaleString() : "Never"}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Status:</span>
                    <span className={job.last_status === "succeeded" ? "text-green-600" : job.last_status === "failed" ? "text-red-600" : ""}>
                      {job.last_status || "N/A"}
                    </span>
                  </div>
                </div>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => runSchedulerAction(getActionFromJobname(job.jobname))}
                  disabled={runningAction !== null || !secretConfigured}
                >
                  {runningAction === getActionFromJobname(job.jobname) ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Run Now
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="md:col-span-3">
            <CardContent className="py-8 text-center text-muted-foreground">
              No scheduler jobs found. Ensure pg_cron is enabled and jobs are configured.
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Scheduler Activity
          </CardTitle>
          <CardDescription>Last 20 scheduler triggers from audit log</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : auditLogs.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No recent activity</p>
          ) : (
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    {log.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{log.entity_id}</p>
                      <p className="text-xs text-muted-foreground">{log.action_type}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                    {log.duration_ms && (
                      <p className="text-xs text-muted-foreground">{log.duration_ms}ms</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
