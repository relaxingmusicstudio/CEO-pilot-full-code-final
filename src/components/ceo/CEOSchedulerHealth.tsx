import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, XCircle, Clock, SkipForward, Loader2 } from "lucide-react";

interface JobRun {
  id: string;
  tenant_id: string | null;
  job_type: string;
  status: string;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface CEOSchedulerHealthProps {
  tenantId: string | null;
}

export function CEOSchedulerHealth({ tenantId }: CEOSchedulerHealthProps) {
  const [loading, setLoading] = useState(true);
  const [tenantJobs, setTenantJobs] = useState<JobRun[]>([]);
  const [globalJobs, setGlobalJobs] = useState<JobRun[]>([]);

  useEffect(() => {
    if (tenantId) {
      loadJobRuns();
    }
  }, [tenantId]);

  const loadJobRuns = async () => {
    if (!tenantId) return;

    setLoading(true);
    try {
      // Fetch tenant-specific daily_brief jobs
      const { data: tenantData, error: tenantError } = await supabase
        .from("ceo_job_runs")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("job_type", ["daily_brief", "daily_brief_actionize"])
        .order("created_at", { ascending: false })
        .limit(10);

      if (tenantError) {
        console.error("Failed to fetch tenant job runs:", tenantError);
      } else {
        setTenantJobs((tenantData || []) as JobRun[]);
      }

      // Fetch global cost_rollup jobs (tenant_id is null)
      const { data: globalData, error: globalError } = await supabase
        .from("ceo_job_runs")
        .select("*")
        .is("tenant_id", null)
        .eq("job_type", "cost_rollup")
        .order("created_at", { ascending: false })
        .limit(10);

      if (globalError) {
        console.error("Failed to fetch global job runs:", globalError);
      } else {
        setGlobalJobs((globalData || []) as JobRun[]);
      }
    } catch (error) {
      console.error("Failed to load job runs:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "skipped":
        return <SkipForward className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      success: "default",
      failed: "destructive",
      skipped: "secondary",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const renderJobsTable = (jobs: JobRun[]) => {
    if (jobs.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          No job runs found
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Job Type</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {getStatusIcon(job.status)}
                  {getStatusBadge(job.status)}
                </div>
              </TableCell>
              <TableCell className="font-medium">{job.job_type}</TableCell>
              <TableCell>{formatDuration(job.duration_ms)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatTime(job.created_at)}
              </TableCell>
              <TableCell className="max-w-[200px]">
                {job.error ? (
                  <span className="text-xs text-destructive truncate block" title={job.error}>
                    {job.error.substring(0, 50)}...
                  </span>
                ) : job.metadata ? (
                  <span className="text-xs text-muted-foreground">
                    {JSON.stringify(job.metadata).substring(0, 50)}...
                  </span>
                ) : (
                  "-"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Scheduler Health</CardTitle>
        <CardDescription>Recent job runs and their status</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="tenant" className="space-y-4">
          <TabsList>
            <TabsTrigger value="tenant">Your Brief Jobs ({tenantJobs.length})</TabsTrigger>
            <TabsTrigger value="global">Cost Rollups ({globalJobs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="tenant">
            {renderJobsTable(tenantJobs)}
          </TabsContent>

          <TabsContent value="global">
            {renderJobsTable(globalJobs)}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
