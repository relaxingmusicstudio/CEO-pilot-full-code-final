/**
 * Route & Nav Auditor - UI for route and navigation auditing
 * 
 * Uses the pure function module routeNavAudit.ts for all checks.
 * Shows results, recurring issue tracking, and malformed pattern scanning.
 */

import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Copy, AlertTriangle, CheckCircle2, XCircle, 
  RefreshCw, Map, Navigation, Route as RouteIcon, Code, FileJson
} from "lucide-react";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { platformTools, getVisibleTools } from "@/lib/toolRegistry";
import { 
  runRouteNavAudit, 
  scanSourceForMalformed, 
  AuditContext, 
  RouteNavAuditResult,
  AuditFinding 
} from "@/lib/routeNavAudit";

const ISSUE_COUNTS_KEY = "platform_issue_counts_v1";

export default function RouteNavAuditor() {
  const location = useLocation();
  const { isOwner, isAdmin, isClient, isLoading } = useUserRole();
  
  const [auditResult, setAuditResult] = useState<RouteNavAuditResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>({});
  const [recurringIssues, setRecurringIssues] = useState<string[]>([]);
  const [routeSource, setRouteSource] = useState("");
  const [sourceScanFindings, setSourceScanFindings] = useState<Array<{
    severity: string;
    pattern: string;
    line: number;
    snippet: string;
  }>>([]);

  // Load issue counts from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ISSUE_COUNTS_KEY);
      if (stored) setIssueCounts(JSON.parse(stored));
    } catch {
      // ignore localStorage parse errors
    }
  }, []);

  // Check for recurring issues
  useEffect(() => {
    const recurring = Object.entries(issueCounts)
      .filter(([_, count]) => count >= 2)
      .map(([code]) => code);
    setRecurringIssues(recurring);
  }, [issueCounts]);

  const roleContext: AuditContext = {
    isAdmin: isAdmin ?? false,
    isOwner: isOwner ?? false,
    isClient: isClient ?? false,
    isAuthenticated: true,
  };

  const runAudit = () => {
    setIsRunning(true);
    
    // Run the pure function audit
    const result = runRouteNavAudit(roleContext);
    
    // Scan source if provided
    let sourceFindings: typeof sourceScanFindings = [];
    if (routeSource.trim()) {
      sourceFindings = scanSourceForMalformed(routeSource);
      setSourceScanFindings(sourceFindings);
      
      // Add source scan findings to audit result
      for (const sf of sourceFindings) {
        result.findings.push({
          severity: sf.severity as "critical" | "warning",
          issue_code: "malformed_route",
          source: "scan",
          identifier: `line-${sf.line}`,
          route: `line ${sf.line}`,
          description: `Pattern "${sf.pattern}": ${sf.snippet}`,
          file_hint: "src/App.tsx",
          suggested_fix: `Fix the malformed code at line ${sf.line}`,
        });
      }
      
      // Recalculate summary
      result.summary.critical = result.findings.filter(f => f.severity === "critical").length;
      result.summary.warning = result.findings.filter(f => f.severity === "warning").length;
    }
    
    setAuditResult(result);
    
    // Update issue counts in localStorage
    const newCounts = { ...issueCounts };
    for (const finding of result.findings) {
      newCounts[finding.issue_code] = (newCounts[finding.issue_code] || 0) + 1;
    }
    setIssueCounts(newCounts);
    localStorage.setItem(ISSUE_COUNTS_KEY, JSON.stringify(newCounts));
    
    setIsRunning(false);
    toast.success(`Audit complete: ${result.summary.critical} critical, ${result.summary.warning} warnings`);
  };

  const resetCounters = () => {
    setIssueCounts({});
    setRecurringIssues([]);
    localStorage.removeItem(ISSUE_COUNTS_KEY);
    toast.success("Issue counters reset");
  };

  const copyAuditJSON = () => {
    if (!auditResult) return;
    const output = {
      ...auditResult,
      counters: issueCounts,
      source_scan: sourceScanFindings.length > 0 ? sourceScanFindings : undefined,
    };
    navigator.clipboard.writeText(JSON.stringify(output, null, 2));
    toast.success("Audit JSON copied to clipboard");
  };

  const copySuggestedFix = (fix: string) => {
    navigator.clipboard.writeText(fix);
    toast.success("Fix copied to clipboard");
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <Card>
          <CardContent className="py-8 text-center">
            <div className="animate-pulse">Loading...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Map className="h-6 w-6" />
                Route & Nav Auditor
              </CardTitle>
              <CardDescription className="mt-1">
                Compares toolRegistry, routeGuards, and nav visibility
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={runAudit} disabled={isRunning}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRunning ? "animate-spin" : ""}`} />
                {isRunning ? "Running..." : "Run Audit"}
              </Button>
              {auditResult && (
                <Button variant="outline" onClick={copyAuditJSON}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Audit JSON
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Current Context Info */}
          <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Navigation className="h-4 w-4" />
              <span className="text-sm font-medium">Path:</span>
              <code className="text-sm bg-background px-2 py-1 rounded">{location.pathname}</code>
            </div>
            <div className="flex items-center gap-2">
              <RouteIcon className="h-4 w-4" />
              <span className="text-sm">Role:</span>
              {isAdmin && <Badge className="bg-red-500">Admin</Badge>}
              {isOwner && !isAdmin && <Badge className="bg-blue-500">Owner</Badge>}
              {isClient && <Badge className="bg-green-500">Client</Badge>}
              {!isAdmin && !isOwner && !isClient && <Badge variant="secondary">Authenticated</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">
              Tools: {platformTools.length} | Visible: {getVisibleTools(roleContext).length}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recurring Issues Banner */}
      {recurringIssues.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Recurring Issues Detected (2+)</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap gap-2 mt-2">
              {recurringIssues.map(code => (
                <Badge key={code} variant="destructive">
                  {code} ({issueCounts[code]}x)
                </Badge>
              ))}
            </div>
            <p className="mt-2 text-sm">
              Recommended: Create or expand a tool rule to prevent these issues.
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={resetCounters}>
              Reset Counters
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Route Source Scanner */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Code className="h-5 w-5" />
            Malformed Route Detection
          </CardTitle>
          <CardDescription>
            Paste App.tsx route source to detect element=null, stray {`} />`}, TODO markers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Paste your App.tsx route definitions here to scan for malformed patterns..."
            value={routeSource}
            onChange={(e) => setRouteSource(e.target.value)}
            className="min-h-[100px] font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground mt-2">
            After pasting, click "Run Audit" to include malformed pattern detection.
          </p>
        </CardContent>
      </Card>

      {/* Audit Results */}
      {auditResult && (
        <Tabs defaultValue="summary" className="w-full">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="findings">Findings ({auditResult.findings.length})</TabsTrigger>
            <TabsTrigger value="snapshots">Snapshots</TabsTrigger>
            <TabsTrigger value="json">Raw JSON</TabsTrigger>
          </TabsList>
          
          <TabsContent value="summary">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Audit Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-red-500/10 rounded-lg">
                    <div className="text-2xl font-bold text-red-500">{auditResult.summary.critical}</div>
                    <div className="text-sm text-muted-foreground">Critical</div>
                  </div>
                  <div className="text-center p-4 bg-yellow-500/10 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-500">{auditResult.summary.warning}</div>
                    <div className="text-sm text-muted-foreground">Warnings</div>
                  </div>
                  <div className="text-center p-4 bg-green-500/10 rounded-lg">
                    <div className="text-2xl font-bold text-green-500">{auditResult.summary.passed}</div>
                    <div className="text-sm text-muted-foreground">Passed</div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{auditResult.summary.total_checks}</div>
                    <div className="text-sm text-muted-foreground">Total Checks</div>
                  </div>
                </div>
                
                {auditResult.findings.length === 0 && (
                  <div className="mt-6 text-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <p className="text-lg font-medium">All Clear!</p>
                    <p className="text-muted-foreground">No routing or navigation issues detected.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="findings">
            <Card>
              <CardContent className="pt-6">
                {auditResult.findings.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Severity</TableHead>
                        <TableHead className="w-36">Issue Code</TableHead>
                        <TableHead>Route / Location</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-24">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditResult.findings.map((finding, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            {finding.severity === "critical" ? (
                              <Badge variant="destructive">Critical</Badge>
                            ) : (
                              <Badge variant="secondary">Warning</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <code className="text-xs">{finding.issue_code}</code>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{finding.identifier}</div>
                            <div className="text-xs text-muted-foreground">{finding.route}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{finding.description}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              File: {finding.file_hint}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => copySuggestedFix(finding.suggested_fix)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No findings to display.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="snapshots">
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div>
                  <h3 className="font-medium mb-2">Tool Registry ({auditResult.snapshots.tool_registry.length} tools)</h3>
                  <div className="flex flex-wrap gap-2">
                    {auditResult.snapshots.tool_registry.map(t => (
                      <Badge key={t.id} variant="outline" className="text-xs">
                        {t.id} ({t.requires})
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium mb-2">Route Guards ({auditResult.snapshots.route_guards.length} guards)</h3>
                  <div className="flex flex-wrap gap-2">
                    {auditResult.snapshots.route_guards.map(g => (
                      <Badge key={g.path} variant="outline" className="text-xs">
                        {g.path} ({g.requires})
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium mb-2">Visible Nav Routes ({auditResult.snapshots.nav_routes.length})</h3>
                  <div className="flex flex-wrap gap-2">
                    {auditResult.snapshots.nav_routes.map(r => (
                      <Badge key={r} variant="outline" className="text-xs">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="json">
            <Card>
              <CardContent className="pt-6">
                <Textarea 
                  value={JSON.stringify({ ...auditResult, counters: issueCounts }, null, 2)} 
                  readOnly 
                  className="font-mono text-xs h-96"
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
