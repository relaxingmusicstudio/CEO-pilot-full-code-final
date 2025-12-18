/**
 * Route & Nav Auditor - Detects routing and navigation mismatches
 * Helps prevent "I can't find that page" issues
 */

import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Copy, Download, AlertTriangle, CheckCircle2, XCircle, 
  RefreshCw, Map, Navigation, Route as RouteIcon, Info
} from "lucide-react";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { platformTools } from "@/lib/toolRegistry";

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
  findings: AuditFinding[];
  summary: {
    critical: number;
    warning: number;
    passed: number;
    total_tools: number;
  };
  registered_routes: string[];
  nav_routes: string[];
  tools_hub_routes: string[];
}

// Local storage key for recurring issue counter
const ISSUE_COUNTS_KEY = "platform_issue_counts_v1";

// Known registered routes from App.tsx (this is the source of truth we compare against)
const REGISTERED_PLATFORM_ROUTES = [
  "/platform/tools",
  "/platform/proof-gate",
  "/platform/access",
  "/platform/qa-tests",
  "/platform/feature-flags",
  "/platform/schema-snapshot",
  "/platform/placeholder-scan",
  "/platform/route-nav-auditor",
  "/platform/cloud-wizard",
  "/platform/edge-console",
  "/platform/db-doctor",
  "/platform/tenants",
  "/platform/scheduler",
  "/platform/docs/scheduler",
];

// Routes that require specific roles (from App.tsx)
const ROUTE_ROLE_REQUIREMENTS: Record<string, "authenticated" | "owner" | "admin"> = {
  "/platform/tools": "authenticated",
  "/platform/proof-gate": "authenticated",
  "/platform/access": "authenticated",
  "/platform/qa-tests": "authenticated",
  "/platform/feature-flags": "authenticated",
  "/platform/schema-snapshot": "authenticated",
  "/platform/placeholder-scan": "authenticated",
  "/platform/route-nav-auditor": "authenticated",
  "/platform/cloud-wizard": "owner",
  "/platform/edge-console": "owner",
  "/platform/db-doctor": "owner",
  "/platform/tenants": "admin",
  "/platform/scheduler": "admin",
  "/platform/docs/scheduler": "admin",
};

export default function RouteNavAuditor() {
  const location = useLocation();
  const { isOwner, isAdmin, isLoading } = useUserRole();
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>({});
  const [recurringIssues, setRecurringIssues] = useState<string[]>([]);

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

  const runAudit = () => {
    setIsRunning(true);
    
    const findings: AuditFinding[] = [];
    const toolsHubRoutes = platformTools.map(t => t.route);
    
    // Check each tool in the registry
    for (const tool of platformTools) {
      // Skip the tools hub itself
      if (tool.id === "tools-hub") continue;
      
      // Check 1: Is the route registered in App.tsx?
      const isRegistered = REGISTERED_PLATFORM_ROUTES.includes(tool.route);
      if (!isRegistered) {
        findings.push({
          severity: "critical",
          issue_code: "missing_route",
          tool_id: tool.id,
          tool_name: tool.name,
          route: tool.route,
          description: `Route "${tool.route}" is in toolRegistry but not in App.tsx routes`,
          file_hint: "src/App.tsx",
          suggested_fix: `Add route: <Route path="${tool.route}" element={<ProtectedRoute><${tool.name.replace(/\s/g, "")} /></ProtectedRoute>} />`,
        });
      }
      
      // Check 2: Role mismatch between toolRegistry and actual route
      const registryRole = tool.requires;
      const routeRole = ROUTE_ROLE_REQUIREMENTS[tool.route];
      
      if (routeRole && registryRole !== routeRole) {
        findings.push({
          severity: "warning",
          issue_code: "role_mismatch",
          tool_id: tool.id,
          tool_name: tool.name,
          route: tool.route,
          description: `Role mismatch: toolRegistry says "${registryRole}" but route requires "${routeRole}"`,
          file_hint: "src/lib/toolRegistry.ts or src/App.tsx",
          suggested_fix: `Update toolRegistry to set requires: "${routeRole}" OR update App.tsx route protection`,
        });
      }
      
      // Check 3: Is tool in ToolsHub list?
      const inToolsHub = toolsHubRoutes.includes(tool.route);
      if (!inToolsHub) {
        findings.push({
          severity: "warning",
          issue_code: "tools_hub_missing",
          tool_id: tool.id,
          tool_name: tool.name,
          route: tool.route,
          description: `Tool "${tool.name}" route not in ToolsHub card list`,
          file_hint: "src/lib/toolRegistry.ts",
          suggested_fix: `Add tool to platformTools array in toolRegistry.ts`,
        });
      }
    }
    
    // Check for routes in App.tsx that aren't in toolRegistry
    for (const route of REGISTERED_PLATFORM_ROUTES) {
      const inRegistry = platformTools.some(t => t.route === route);
      if (!inRegistry && !route.includes("/docs/")) {
        findings.push({
          severity: "warning",
          issue_code: "nav_missing",
          tool_id: "unknown",
          tool_name: "Unknown",
          route: route,
          description: `Route "${route}" exists in App.tsx but not in toolRegistry`,
          file_hint: "src/lib/toolRegistry.ts",
          suggested_fix: `Add tool entry to platformTools array for route "${route}"`,
        });
      }
    }
    
    // Count findings by severity
    const critical = findings.filter(f => f.severity === "critical").length;
    const warning = findings.filter(f => f.severity === "warning").length;
    
    const result: AuditResult = {
      timestamp: new Date().toISOString(),
      current_path: location.pathname,
      findings,
      summary: {
        critical,
        warning,
        passed: platformTools.length - findings.length,
        total_tools: platformTools.length,
      },
      registered_routes: REGISTERED_PLATFORM_ROUTES,
      nav_routes: [], // Would need to introspect useRoleNavigation
      tools_hub_routes: toolsHubRoutes,
    };
    
    setAuditResult(result);
    
    // Update issue counts in localStorage
    const newCounts = { ...issueCounts };
    for (const finding of findings) {
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
    navigator.clipboard.writeText(JSON.stringify({
      ...auditResult,
      counters: issueCounts,
    }, null, 2));
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
                Detect routing mismatches, missing nav entries, and role gating issues
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
          {/* Current Path Info */}
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Navigation className="h-4 w-4" />
              <span className="text-sm font-medium">Current Path:</span>
              <code className="text-sm bg-background px-2 py-1 rounded">{location.pathname}</code>
            </div>
            <div className="flex items-center gap-2">
              <RouteIcon className="h-4 w-4" />
              <span className="text-sm">
                {isAdmin ? "Admin" : isOwner ? "Owner" : "Authenticated"} access
              </span>
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

      {/* Audit Results */}
      {auditResult && (
        <>
          {/* Summary */}
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
            </CardContent>
          </Card>

          {/* Findings Table */}
          {auditResult.findings.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Findings</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Severity</TableHead>
                      <TableHead className="w-32">Issue Code</TableHead>
                      <TableHead>Tool / Route</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-32">File Hint</TableHead>
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
                        </TableCell>
                        <TableCell>
                          <code className="text-xs">{finding.file_hint}</code>
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
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <p className="text-lg font-medium">All Clear!</p>
                <p className="text-muted-foreground">No routing or navigation issues detected.</p>
              </CardContent>
            </Card>
          )}

          {/* Route Lists */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Registered Routes ({REGISTERED_PLATFORM_ROUTES.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {REGISTERED_PLATFORM_ROUTES.map(route => (
                    <div key={route} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-xs">
                        {ROUTE_ROLE_REQUIREMENTS[route] || "?"}
                      </Badge>
                      <code className="text-xs">{route}</code>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">ToolsHub Routes ({auditResult.tools_hub_routes.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {auditResult.tools_hub_routes.map(route => (
                    <code key={route} className="block text-xs">{route}</code>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Info */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>How This Tool Works</AlertTitle>
        <AlertDescription className="text-sm">
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Compares toolRegistry entries against App.tsx route definitions</li>
            <li>Detects role mismatches between registry and actual route protection</li>
            <li>Tracks recurring issues to help identify systemic problems</li>
            <li>Use "Copy Audit JSON" for evidence in support bundles</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}
