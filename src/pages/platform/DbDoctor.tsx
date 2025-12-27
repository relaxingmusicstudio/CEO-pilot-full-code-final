import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, Loader2, Copy, Database, AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PlatformStatusBanner } from "@/components/platform/PlatformStatusBanner";
import { PreflightReport } from "@/lib/supportBundle";

export default function DbDoctor() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<PreflightReport | null>(null);
  const [showTextarea, setShowTextarea] = useState(false);

  const runDbDoctor = async () => {
    setRunning(true);
    setReport(null);
    
    try {
      const runRpc = (fn: string) =>
        supabase.rpc(fn) as unknown as Promise<{ data: PreflightReport | null; error: { message?: string; code?: string } | null }>;
      const { data, error } = await runRpc("qa_dependency_check");
      
      if (error) {
        setReport({ ok: false, error: error.message, error_code: error.code });
        toast.error(`DB Doctor failed: ${error.message}`);
      } else {
        setReport(data);
        toast.success(data.ok ? "All dependencies OK" : `Found ${data.suspect_count} issues`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setReport({ ok: false, error: errMsg });
      toast.error(`Error: ${errMsg}`);
    } finally {
      setRunning(false);
    }
  };

  const copyReport = () => {
    if (report) {
      navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      toast.success("Report copied to clipboard");
    }
  };

  const copyFixSql = () => {
    if (report?.suspects?.length) {
      const sql = report.suspects.map(s => 
        `-- Fix: ${s.object} (${s.type})\n${s.fix_sql}`
      ).join("\n\n");
      navigator.clipboard.writeText(sql);
      toast.success("Fix SQL copied to clipboard");
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
      <PlatformStatusBanner preflightStatus={report} />
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-6 w-6" />
            DB Doctor
          </CardTitle>
          <CardDescription>
            Check database dependencies, types, functions, and permissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex gap-2">
            <Button onClick={runDbDoctor} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Run DB Doctor
            </Button>
            
            {report && (
              <>
                <Button variant="outline" onClick={copyReport}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Evidence
                </Button>
                <Button variant="outline" onClick={() => setShowTextarea(!showTextarea)}>
                  {showTextarea ? "Hide JSON" : "Show JSON"}
                </Button>
              </>
            )}
          </div>

          {report && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center gap-4">
                <Badge variant={report.ok ? "default" : "destructive"} className="text-lg px-4 py-2">
                  {report.ok ? <CheckCircle2 className="h-5 w-5 mr-2" /> : <XCircle className="h-5 w-5 mr-2" />}
                  {report.ok ? "ALL PASS" : `${report.suspect_count} ISSUES`}
                </Badge>
                {report.checked_at && (
                  <span className="text-sm text-muted-foreground">
                    Checked: {new Date(report.checked_at).toLocaleString()}
                  </span>
                )}
              </div>

              {/* Types */}
              {report.types && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Types/Enums</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(report.types).map(([key, exists]) => (
                      <Badge key={key} variant={exists ? "default" : "destructive"}>
                        {exists ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                        {key}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Tables */}
              {report.tables && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Tables</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(report.tables).map(([key, exists]) => (
                      <Badge key={key} variant={exists ? "default" : "destructive"}>
                        {exists ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                        {key}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Functions */}
              {report.functions && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Functions</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(report.functions).map(([key, exists]) => (
                      <Badge key={key} variant={exists ? "default" : "destructive"}>
                        {exists ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                        {key}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Permissions */}
              {report.permissions && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Permissions (EXECUTE)</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(report.permissions).map(([key, granted]) => (
                      <Badge key={key} variant={granted ? "default" : "destructive"}>
                        {granted ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                        {key}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Suspects */}
              {report.suspects && report.suspects.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Issues Found ({report.suspects.length})</AlertTitle>
                  <AlertDescription className="space-y-4">
                    <ul className="list-disc pl-4 mt-2">
                      {report.suspects.map((s, i) => (
                        <li key={i} className="mt-1">
                          <code className="text-sm">{s.object}</code> ({s.type})
                        </li>
                      ))}
                    </ul>
                    <Button variant="outline" size="sm" onClick={copyFixSql}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Fix SQL
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {/* Raw JSON */}
              {showTextarea && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Raw Report JSON</h3>
                  <Textarea 
                    value={JSON.stringify(report, null, 2)}
                    readOnly
                    className="font-mono text-xs h-64"
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
