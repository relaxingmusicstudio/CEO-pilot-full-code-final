/**
 * Vibes Inspector - Detect common "vibes errors"
 * 
 * Runs multiple checks and produces a unified "Vibes Report"
 * with top 5 likely causes of issues.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { 
  AlertTriangle, Copy, Download, Play, CheckCircle2, 
  XCircle, Loader2, Eye, Map, Search
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { PlatformStatusBanner } from "@/components/platform/PlatformStatusBanner";
import { runFSRealityCheck, loadClaimLog, detectClaimContradictions, FSRealityCheckResult } from "@/lib/fsRealityCheck";
import { runRouteNavAudit, AuditContext, RouteNavAuditResult } from "@/lib/routeNavAudit";
import { getNavRoutesForRole } from "@/hooks/useRoleNavigation";

interface VibesCause {
  rank: number;
  title: string;
  severity: "critical" | "warning" | "info";
  description: string;
  action: string;
}

interface VibesReport {
  timestamp: string;
  fs_reality_check: FSRealityCheckResult | null;
  route_nav_audit: RouteNavAuditResult | null;
  claim_contradictions: { hasContradiction: boolean; contradictions: string[] };
  top_causes: VibesCause[];
  summary: {
    total_issues: number;
    critical: number;
    warning: number;
    passed_checks: number;
  };
}

export default function VibesInspector() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { role, isOwner, isAdmin, isClient, isLoading } = useUserRole();
  
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<VibesReport | null>(null);
  const [showJson, setShowJson] = useState(false);

  const roleContext: AuditContext = {
    isAdmin: isAdmin ?? false,
    isOwner: isOwner ?? false,
    isClient: isClient ?? false,
    isAuthenticated: !!user,
  };

  const runVibesInspector = async () => {
    setRunning(true);
    setProgress(0);
    
    const topCauses: VibesCause[] = [];
    let fsResult: FSRealityCheckResult | null = null;
    let auditResult: RouteNavAuditResult | null = null;
    let claimResult = { hasContradiction: false, contradictions: [] as string[] };
    
    // Step 1: FS Reality Check (33%)
    setProgress(20);
    try {
      fsResult = await runFSRealityCheck();
      
      if (!fsResult.all_imports_ok) {
        topCauses.push({
          rank: topCauses.length + 1,
          title: "Missing Critical Imports",
          severity: "critical",
          description: `${fsResult.failed_imports.length} critical module(s) failed to import: ${fsResult.failed_imports.join(", ")}`,
          action: "Check that all files exist and have no syntax errors",
        });
      }
      
      if (!fsResult.build_output_present) {
        topCauses.push({
          rank: topCauses.length + 1,
          title: "No Build Proof",
          severity: "warning",
          description: "No build output captured - cannot verify compilation success",
          action: "Go to Ops Center and paste build output",
        });
      }
    } catch (err) {
      topCauses.push({
        rank: topCauses.length + 1,
        title: "FS Reality Check Failed",
        severity: "critical",
        description: String(err),
        action: "Check console for errors",
      });
    }
    
    // Step 2: Route & Nav Audit (66%)
    setProgress(50);
    try {
      auditResult = runRouteNavAudit(roleContext);
      
      // Add findings as causes
      const criticalFindings = auditResult.findings.filter(f => f.severity === "critical");
      const warningFindings = auditResult.findings.filter(f => f.severity === "warning");
      
      if (criticalFindings.length > 0) {
        topCauses.push({
          rank: topCauses.length + 1,
          title: "Route/Nav Critical Issues",
          severity: "critical",
          description: `${criticalFindings.length} critical issue(s): ${criticalFindings.map(f => f.issue_code).join(", ")}`,
          action: "Run Route & Nav Auditor for details",
        });
      }
      
      if (warningFindings.length > 0) {
        topCauses.push({
          rank: topCauses.length + 1,
          title: "Route/Nav Warnings",
          severity: "warning",
          description: `${warningFindings.length} warning(s): ${warningFindings.map(f => f.issue_code).join(", ")}`,
          action: "Review route guards and tool registry",
        });
      }
      
      // Check for orphan routes
      const orphans = auditResult.findings.filter(f => f.issue_code === "orphan_route");
      if (orphans.length > 0) {
        topCauses.push({
          rank: topCauses.length + 1,
          title: "Orphan Routes",
          severity: "warning",
          description: `${orphans.length} route guard(s) without matching tools`,
          action: "Add tools or remove orphan guards",
        });
      }
    } catch (err) {
      topCauses.push({
        rank: topCauses.length + 1,
        title: "Route Audit Failed",
        severity: "critical",
        description: String(err),
        action: "Check routeNavAudit.ts for errors",
      });
    }
    
    // Step 3: Claim Contradiction Check (100%)
    setProgress(80);
    try {
      const claimLog = loadClaimLog();
      if (claimLog && fsResult) {
        claimResult = detectClaimContradictions(claimLog, fsResult);
        
        if (claimResult.hasContradiction) {
          topCauses.push({
            rank: topCauses.length + 1,
            title: "Claim Contradictions Detected",
            severity: "critical",
            description: claimResult.contradictions.join("; "),
            action: "Clear claim log or re-verify with fresh FS check",
          });
        }
      }
    } catch {
      // ignore claim log read errors
    }
    
    // Add common vibes causes if not already detected
    if (!user) {
      topCauses.push({
        rank: topCauses.length + 1,
        title: "Auth-Blocked QA Tests",
        severity: "warning",
        description: "Not authenticated - QA tests and protected routes are inaccessible",
        action: "Log in to access all diagnostics",
      });
    }
    
    // Sort by severity and limit to top 5
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    topCauses.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    const top5 = topCauses.slice(0, 5).map((c, i) => ({ ...c, rank: i + 1 }));
    
    // Calculate summary
    const totalIssues = top5.length;
    const critical = top5.filter(c => c.severity === "critical").length;
    const warning = top5.filter(c => c.severity === "warning").length;
    const passedChecks = (fsResult?.all_imports_ok ? 1 : 0) + 
                         (auditResult?.summary.critical === 0 ? 1 : 0) +
                         (!claimResult.hasContradiction ? 1 : 0);
    
    const vibesReport: VibesReport = {
      timestamp: new Date().toISOString(),
      fs_reality_check: fsResult,
      route_nav_audit: auditResult,
      claim_contradictions: claimResult,
      top_causes: top5,
      summary: {
        total_issues: totalIssues,
        critical,
        warning,
        passed_checks: passedChecks,
      },
    };
    
    setReport(vibesReport);
    setProgress(100);
    setRunning(false);
    
    if (critical > 0) {
      toast.error(`Vibes Inspector: ${critical} critical issue(s) found`);
    } else if (warning > 0) {
      toast.warning(`Vibes Inspector: ${warning} warning(s) found`);
    } else {
      toast.success("Vibes Inspector: All clear!");
    }
  };

  const handleCopyJson = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      toast.success("Vibes Report copied");
    } catch {
      setShowJson(true);
    }
  };

  const handleDownloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vibes-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <Card>
          <CardContent className="py-8 text-center">
            <div className="animate-pulse">Loading...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
      <PlatformStatusBanner />
      
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <AlertTriangle className="h-6 w-6" />
            Vibes Inspector
          </CardTitle>
          <CardDescription>
            Detect common "vibes errors" - contradictions, missing proof, broken assumptions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <Button 
              onClick={runVibesInspector} 
              disabled={running}
              size="lg"
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run Vibes Inspector
            </Button>
            
            {report && (
              <>
                <Button variant="outline" onClick={handleCopyJson}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Report
                </Button>
                <Button variant="outline" onClick={handleDownloadJson}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </>
            )}
          </div>
          
          {running && <Progress value={progress} className="h-2" />}
        </CardContent>
      </Card>

      {/* Results */}
      {report && (
        <>
          {/* Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className={`text-lg font-bold ${report.summary.critical > 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {report.summary.critical}
                  </div>
                  <div className="text-xs text-muted-foreground">Critical</div>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className={`text-lg font-bold ${report.summary.warning > 0 ? 'text-yellow-500' : 'text-green-500'}`}>
                    {report.summary.warning}
                  </div>
                  <div className="text-xs text-muted-foreground">Warnings</div>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-lg font-bold text-green-500">{report.summary.passed_checks}</div>
                  <div className="text-xs text-muted-foreground">Passed</div>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-lg font-bold">{report.top_causes.length}</div>
                  <div className="text-xs text-muted-foreground">Issues Found</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top 5 Causes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Top 5 Likely Causes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.top_causes.length === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>All Clear</AlertTitle>
                  <AlertDescription>No vibes errors detected!</AlertDescription>
                </Alert>
              ) : (
                report.top_causes.map((cause) => (
                  <div 
                    key={cause.rank}
                    className={`p-4 rounded-lg border ${
                      cause.severity === "critical" ? "border-red-500 bg-red-500/5" :
                      cause.severity === "warning" ? "border-yellow-500 bg-yellow-500/5" :
                      "border-muted bg-muted/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
                        cause.severity === "critical" ? "bg-red-500 text-white" :
                        cause.severity === "warning" ? "bg-yellow-500 text-black" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {cause.rank}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{cause.title}</h4>
                          <Badge variant={cause.severity === "critical" ? "destructive" : "secondary"}>
                            {cause.severity}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{cause.description}</p>
                        <p className="text-sm mt-2">
                          <strong>Action:</strong> {cause.action}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Fix These Issues</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-3 flex-wrap">
              <Button variant="outline" onClick={() => navigate("/platform/ops")} className="gap-2">
                <Eye className="h-4 w-4" />
                Ops Center
              </Button>
              <Button variant="outline" onClick={() => navigate("/platform/route-nav-auditor")} className="gap-2">
                <Map className="h-4 w-4" />
                Route Auditor
              </Button>
              <Button variant="outline" onClick={() => navigate("/platform/placeholder-scan")} className="gap-2">
                <Search className="h-4 w-4" />
                Placeholder Scan
              </Button>
              <Button variant="outline" onClick={() => navigate("/platform/proof-gate")} className="gap-2">
                Proof Gate
              </Button>
            </CardContent>
          </Card>

          {/* Raw JSON */}
          {showJson && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Raw Report JSON</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea 
                  value={JSON.stringify(report, null, 2)} 
                  readOnly 
                  className="font-mono text-xs h-64"
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
