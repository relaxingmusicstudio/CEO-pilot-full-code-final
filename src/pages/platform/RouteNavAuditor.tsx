/**
 * Route & Nav Auditor - Detects routing and navigation mismatches
 * 
 * Uses SHARED sources of truth:
 * - toolRegistry.ts for platform tools and their access requirements
 * - routeConfig.ts for route access policies
 * - useRoleNavigation.ts for nav item visibility
 * 
 * NO HARDCODED LISTS - everything is derived from the registry.
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
  RefreshCw, Map, Navigation, Route as RouteIcon, Info, Code
} from "lucide-react";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { 
  platformTools, 
  getVisibleTools, 
  getAllPlatformRoutes 
} from "@/lib/toolRegistry";
import { 
  getRouteAccessPolicies, 
  scanRouteSource,
  RouteAccessPolicy 
} from "@/lib/routeConfig";
import { getNavRoutesForRole } from "@/hooks/useRoleNavigation";

// Issue codes for categorization
type IssueCode = 
  | "missing_route" 
  | "nav_missing" 
  | "tools_hub_missing" 
  | "role_mismatch" 
  | "malformed_route";

interface AuditFinding {
  severity: "critical" | "warning";
  issue_code: IssueCode;
  tool_id: string;
  tool_name: string;
  route: string;
  description: string;
  file_hint: string;
  suggested_fix: string;
}

interface AuditResult {
  timestamp: string;
  current_path: string;
  role_context: {
    isAdmin: boolean;
    isOwner: boolean;
    isClient: boolean;
    isAuthenticated: boolean;
  };
  findings: AuditFinding[];
  summary: {
    critical: number;
    warning: number;
    passed: number;
    total_tools: number;
  };
  checks: {
    registry_routes: string[];
    visible_tools: string[];
    nav_routes: string[];
    route_policies: RouteAccessPolicy[];
  };
  malformed_scan?: {
    source_provided: boolean;
    findings: Array<{
      severity: string;
      pattern: string;
      line: number;
      snippet: string;
    }>;
  };
}

// Local storage key for recurring issue counter
const ISSUE_COUNTS_KEY = "platform_issue_counts_v1";

export default function RouteNavAuditor() {
  const location = useLocation();
  const { isOwner, isAdmin, isClient, isLoading } = useUserRole();
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>({});
  const [recurringIssues, setRecurringIssues] = useState<string[]>([]);
  const [routeSource, setRouteSource] = useState("");

  // Load issue counts from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ISSUE_COUNTS_KEY);
      if (stored) {
        setIssueCounts(JSON.parse(stored));
      }
    } catch {}
  }, []);

  // Check for recurring issues
  useEffect(() => {
    const recurring = Object.entries(issueCounts)
      .filter(([_, count]) => count >= 2)
      .map(([code]) => code);
    setRecurringIssues(recurring);
  }, [issueCounts]);

  const roleContext = {
    isAdmin: isAdmin ?? false,
    isOwner: isOwner ?? false,
    isClient: isClient ?? false,
    isAuthenticated: true,
  };

  const runAudit = () => {
    setIsRunning(true);
    
    const findings: AuditFinding[] = [];
    
    // Get data from SHARED sources - no hardcoded lists
    const registryRoutes = getAllPlatformRoutes();
    const routePolicies = getRouteAccessPolicies();
    const visibleTools = getVisibleTools(roleContext);
    const navRoutes = getNavRoutesForRole(roleContext);
    
    // Check each tool in the registry
    for (const tool of platformTools) {
      // Skip the tools hub itself for some checks
      if (tool.id === "tools-hub") continue;
      
      // Check 1: Would this tool be visible in ToolsHub for current role?
      const isVisibleInToolsHub = visibleTools.some(t => t.id === tool.id);
      const shouldBeVisible = (
        (tool.requires === "authenticated") ||
        (tool.requires === "owner" && (roleContext.isOwner || roleContext.isAdmin)) ||
        (tool.requires === "admin" && roleContext.isAdmin)
      );
      
      if (shouldBeVisible && !isVisibleInToolsHub) {
        findings.push({
          severity: "warning",
          issue_code: "tools_hub_missing",
          tool_id: tool.id,
          tool_name: tool.name,
          route: tool.route,
          description: `Tool "${tool.name}" should be visible but is not in ToolsHub for current role`,
          file_hint: "src/lib/toolRegistry.ts",
          suggested_fix: `Check getVisibleTools() logic or tool.requires value`,
        });
      }
      
      // Check 2: Is the tool's route in nav for current role? (Platform tools should be under /platform/tools)
      // Only check if it's a platform route that should be navigable
      if (tool.route.startsWith("/platform/") && tool.id !== "tools-hub") {
        // Platform tools are accessed via /platform/tools hub, not directly in nav
        // But /platform/tools should be in nav for owners
        const platformToolsInNav = navRoutes.includes("/platform/tools");
        if (roleContext.isOwner && !platformToolsInNav) {
          findings.push({
            severity: "warning",
            issue_code: "nav_missing",
            tool_id: "platform-tools-hub",
            tool_name: "Platform Tools Hub",
            route: "/platform/tools",
            description: "Platform Tools hub is not in sidebar nav for owner role",
            file_hint: "src/hooks/useRoleNavigation.ts",
            suggested_fix: `Ensure PLATFORM_NAV_ITEM is included in owner nav items`,
          });
        }
      }
      
      // Check 3: Role consistency - does tool.requires match what it should be?
      const policy = routePolicies.find(p => p.route === tool.route);
      if (policy && policy.requires !== tool.requires) {
        findings.push({
          severity: "warning",
          issue_code: "role_mismatch",
          tool_id: tool.id,
          tool_name: tool.name,
          route: tool.route,
          description: `Role mismatch: policy says "${policy.requires}" but tool.requires is "${tool.requires}"`,
          file_hint: "src/lib/toolRegistry.ts",
          suggested_fix: `Update tool.requires to match the route access policy`,
        });
      }
    }
    
    // Check for malformed patterns in provided route source
    let malformedScan = undefined;
    if (routeSource.trim()) {
      const malformedFindings = scanRouteSource(routeSource);
      malformedScan = {
        source_provided: true,
        findings: malformedFindings,
      };
      
      for (const mf of malformedFindings) {
        findings.push({
          severity: mf.severity,
          issue_code: "malformed_route",
          tool_id: "source-scan",
          tool_name: "Route Source",
          route: `line ${mf.line}`,
          description: `Malformed pattern "${mf.pattern}" detected: ${mf.snippet}`,
          file_hint: "src/App.tsx",
          suggested_fix: `Fix the malformed JSX at line ${mf.line}`,
        });
      }
    } else {
      malformedScan = {
        source_provided: false,
        findings: [],
      };
    }
    
    // Deduplicate findings by issue_code + route
    const seenKeys = new Set<string>();
    const uniqueFindings = findings.filter(f => {
      const key = `${f.issue_code}:${f.route}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
    
    // Count findings by severity
    const critical = uniqueFindings.filter(f => f.severity === "critical").length;
    const warning = uniqueFindings.filter(f => f.severity === "warning").length;
    
    const result: AuditResult = {
      timestamp: new Date().toISOString(),
      current_path: location.pathname,
      role_context: roleContext,
      findings: uniqueFindings,
      summary: {
        critical,
        warning,
        passed: platformTools.length - uniqueFindings.length,
        total_tools: platformTools.length,
      },
      checks: {
        registry_routes: registryRoutes,
        visible_tools: visibleTools.map(t => t.id),
        nav_routes: navRoutes,
        route_policies: routePolicies,
      },
      malformed_scan: malformedScan,
    };
    
    setAuditResult(result);
    
    // Update issue counts in localStorage
    const newCounts = { ...issueCounts };
    for (const finding of uniqueFindings) {
      newCounts[finding.issue_code] = (newCounts[finding.issue_code] || 0) + 1;
    }
    setIssueCounts(newCounts);
    localStorage.setItem(ISSUE_COUNTS_KEY, JSON.stringify(newCounts));
    
    setIsRunning(false);
    toast.success(`Audit complete: ${critical} critical, ${warning} warnings`);
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
                Real-time audit using shared toolRegistry + routeConfig sources
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={runAudit} disabled={isRunning}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRunning ? "animate-spin" : ""}`} />
                {isRunning ? "Running..." : "Run Audit"}
              </Button>
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
            Paste App.tsx route source to detect element=null, stray {`} />`}, or TODO markers
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
            <TabsTrigger value="checks">Checks</TabsTrigger>
            <TabsTrigger value="json">Raw JSON</TabsTrigger>
          </TabsList>
          
          <TabsContent value="summary">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Audit Summary</CardTitle>
                  <Button variant="outline" size="sm" onClick={copyAuditJSON}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Audit JSON
                  </Button>
                </div>
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
                    <div className="text-2xl font-bold">{auditResult.summary.total_tools}</div>
                    <div className="text-sm text-muted-foreground">Total Tools</div>
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
                        <TableHead>Tool / Route</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-24">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditResult.findings.map((finding, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            {finding.severity === "critical" ? (
                              <Badge variant="destructive" className="gap-1">
                                <XCircle className="h-3 w-3" />
                                Critical
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1 bg-yellow-500/20 text-yellow-700">
                                <AlertTriangle className="h-3 w-3" />
                                Warning
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {finding.issue_code}
                            </code>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{finding.tool_name}</div>
                            <code className="text-xs text-muted-foreground">{finding.route}</code>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <p className="text-sm">{finding.description}</p>
                            <p className="text-xs text-muted-foreground mt-1">{finding.file_hint}</p>
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => copySuggestedFix(finding.suggested_fix)}
                              title={finding.suggested_fix}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No findings</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="checks">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Registry Routes ({auditResult.checks.registry_routes.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {auditResult.checks.registry_routes.map(route => (
                      <code key={route} className="block text-xs">{route}</code>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Visible Tools ({auditResult.checks.visible_tools.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {auditResult.checks.visible_tools.map(id => (
                      <code key={id} className="block text-xs">{id}</code>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Nav Routes ({auditResult.checks.nav_routes.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {auditResult.checks.nav_routes.map(route => (
                      <code key={route} className="block text-xs">{route}</code>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Route Policies</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {auditResult.checks.route_policies.map(policy => (
                      <div key={policy.route} className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className="text-xs">
                          {policy.requires}
                        </Badge>
                        <code>{policy.route}</code>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="json">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Raw Audit JSON</CardTitle>
                  <Button variant="outline" size="sm" onClick={copyAuditJSON}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">
                  {JSON.stringify({ ...auditResult, counters: issueCounts }, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Info */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>How This Tool Works</AlertTitle>
        <AlertDescription className="text-sm">
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li><strong>No hardcoded lists</strong> - derives everything from toolRegistry.ts</li>
            <li><strong>Real visibility check</strong> - uses getVisibleTools() for current role</li>
            <li><strong>Nav route check</strong> - uses getNavRoutesForRole() from useRoleNavigation</li>
            <li><strong>Malformed detection</strong> - paste route source to scan for issues</li>
            <li><strong>Recurring counter</strong> - tracks issues across runs in localStorage</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}
