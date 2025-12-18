/**
 * ToolsHub - Central Platform Tools Dashboard
 * Always reachable at /platform/tools
 * 
 * Features:
 * - Evidence Pack runner with localStorage storage
 * - Find My Page search
 * - Quick links to key tools
 */

import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Copy, Download, Wrench, Shield, CheckCircle2, XCircle, 
  AlertTriangle, ExternalLink, Play, Info, Search, FileJson, Map, Code
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { PlatformStatusBanner } from "@/components/platform/PlatformStatusBanner";
import { IssuePanel, BlockerItem } from "@/components/platform/IssuePanel";
import { platformTools, getToolsForAccessLevel, PlatformTool } from "@/lib/toolRegistry";
import { ROUTE_GUARDS, getPlatformRouteGuards } from "@/lib/routeGuards";
import { runRouteNavAudit, AuditContext } from "@/lib/routeNavAudit";
import { getNavRoutesForRole } from "@/hooks/useRoleNavigation";
import { 
  EvidencePack,
  createEmptyEvidencePack, 
  copyEvidencePackToClipboard, 
  downloadEvidencePack,
  storeEvidencePack,
  loadStoredEvidencePack,
  loadIssueCounts,
  saveIssueCounts,
  incrementIssueCounts,
  getRecurringIssues,
  resetIssueCounts,
  loadLatestEdgeRun,
  runMiniQA,
  EVIDENCE_PACK_KEY,
  ISSUE_COUNTS_KEY,
} from "@/lib/supportBundle";

interface ToolRunResult {
  toolId: string;
  timestamp: string;
  status: "pass" | "fail" | "skip";
  message?: string;
}

export default function ToolsHub() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { role, isOwner, isAdmin, isClient, isLoading } = useUserRole();
  
  const [toolRuns, setToolRuns] = useState<ToolRunResult[]>([]);
  const [blockers, setBlockers] = useState<BlockerItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [evidencePack, setEvidencePack] = useState<EvidencePack | null>(null);
  const [showEvidenceJson, setShowEvidenceJson] = useState(false);
  const [isRunningEvidence, setIsRunningEvidence] = useState(false);
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>(loadIssueCounts());
  
  // Load stored evidence pack on mount
  useEffect(() => {
    const storedPack = loadStoredEvidencePack();
    if (storedPack) setEvidencePack(storedPack);
  }, []);

  const availableTools = getToolsForAccessLevel(isAdmin ?? false, isOwner ?? false);
  
  // Filter tools based on search query - "Find My Page"
  const filteredTools = searchQuery.trim()
    ? availableTools.filter(t => 
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.route.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : availableTools;

  const roleContext: AuditContext = {
    isAdmin: isAdmin ?? false,
    isOwner: isOwner ?? false,
    isClient: isClient ?? false,
    isAuthenticated: !!user,
  };

  /**
   * Run Evidence Pack - captures ALL diagnostic evidence
   */
  const runEvidencePack = async () => {
    setIsRunningEvidence(true);
    
    const pack = createEmptyEvidencePack();
    
    // Meta
    pack.timestamp = new Date().toISOString();
    pack.current_route = location.pathname;
    
    // User context
    pack.user_id_masked = user?.id ? `${user.id.substring(0, 8)}...` : "(unauthenticated)";
    pack.role_flags = { ...roleContext };
    
    // Navigation & Routes
    pack.nav_routes_visible = getNavRoutesForRole(roleContext);
    pack.tool_registry_snapshot = platformTools.map(t => ({ 
      id: t.id,
      name: t.name,
      route: t.route, 
      requires: t.requires,
      category: t.category,
    }));
    pack.platform_routes_snapshot = platformTools.map(t => t.route);
    pack.route_guard_snapshot = getPlatformRouteGuards().map(g => ({ 
      path: g.path, 
      requires: g.requires 
    }));
    
    // Run Route & Nav Audit
    try {
      const auditResult = runRouteNavAudit(roleContext);
      pack.route_nav_audit = auditResult;
      
      // Update issue counts using utility
      const newCounts = incrementIssueCounts(auditResult.findings, issueCounts);
      setIssueCounts(newCounts);
      saveIssueCounts(newCounts);
      pack.recurring_issue_counts = newCounts;
    } catch (err) {
      console.error("Audit failed:", err);
    }
    
    // Load latest edge console run
    pack.latest_edge_console_run = loadLatestEdgeRun();
    
    // Run Mini QA
    let auditRunnable = true;
    try {
      runRouteNavAudit(roleContext);
    } catch {
      auditRunnable = false;
    }
    pack.mini_qa = runMiniQA({
      isAuthenticated: !!user,
      toolRegistryLength: platformTools.length,
      auditRunnable,
    });
    pack.qa_access_status = user ? "available" : "denied";
    
    // Store and display
    setEvidencePack(pack);
    storeEvidencePack(pack);
    
    // Auto-copy
    const result = await copyEvidencePackToClipboard(pack);
    if (result.success) {
      toast.success("Evidence Pack captured and copied!");
    } else {
      setShowEvidenceJson(true);
      toast.info("Evidence Pack captured. Copy from textarea below.");
    }
    
    setIsRunningEvidence(false);
  };

  const getCategoryTools = (category: PlatformTool["category"]) => {
    return filteredTools.filter(t => t.category === category && t.id !== "tools-hub");
  };

  const handleToolClick = (toolId: string) => {
    const tool = platformTools.find(t => t.id === toolId);
    if (tool) navigate(tool.route);
  };

  // Check for recurring issues using utility
  const recurringIssues = getRecurringIssues(issueCounts);
  
  const handleResetCounters = () => {
    resetIssueCounts();
    setIssueCounts({});
    toast.success("Issue counters reset");
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <Card>
          <CardContent className="py-8 text-center">
            <div className="animate-pulse">Loading tools...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
      <PlatformStatusBanner />
      
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Wrench className="h-6 w-6" />
                Platform Tools
              </CardTitle>
              <CardDescription className="mt-1">
                Developer-grade diagnostic and configuration tools
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={runEvidencePack} 
                disabled={isRunningEvidence}
                className="bg-primary"
              >
                {isRunningEvidence ? (
                  <span className="animate-pulse">Running...</span>
                ) : (
                  <>
                    <FileJson className="h-4 w-4 mr-2" />
                    Run Evidence Pack
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Input - "Find My Page" */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Find a tool... (e.g., 'proof', 'route', 'schema', 'scan')"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Capabilities Panel */}
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Access Level:</span>
              {isAdmin && <Badge className="bg-red-500">Admin</Badge>}
              {isOwner && !isAdmin && <Badge className="bg-blue-500">Owner</Badge>}
              {!isAdmin && !isOwner && <Badge variant="secondary">Authenticated</Badge>}
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="text-sm text-muted-foreground">
              {availableTools.length} tools available
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="text-xs text-muted-foreground font-mono">
              user: {user?.id?.substring(0, 8) || "(none)"}...
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
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2"
              onClick={handleResetCounters}
            >
              Reset Counters
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Evidence Pack Results */}
      {evidencePack && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileJson className="h-5 w-5" />
                Evidence Pack
              </CardTitle>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => copyEvidencePackToClipboard(evidencePack).then(r => {
                    if (r.success) toast.success("Copied!");
                    else setShowEvidenceJson(true);
                  })}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Evidence JSON
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => downloadEvidencePack(evidencePack)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
            <CardDescription>
              "This is how we prove what's true." Last run: {new Date(evidencePack.timestamp).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Summary Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-lg font-bold">{evidencePack.nav_routes_visible.length}</div>
                <div className="text-xs text-muted-foreground">Nav Routes</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-lg font-bold">{evidencePack.tool_registry_snapshot.length}</div>
                <div className="text-xs text-muted-foreground">Tools</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-lg font-bold">{evidencePack.route_guard_snapshot.length}</div>
                <div className="text-xs text-muted-foreground">Route Guards</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className={`text-lg font-bold ${(evidencePack.route_nav_audit?.summary.critical ?? 0) > 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {evidencePack.route_nav_audit?.summary.critical ?? 0}
                </div>
                <div className="text-xs text-muted-foreground">Critical Issues</div>
              </div>
            </div>
            
            {/* Role Flags */}
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant={evidencePack.role_flags.isAuthenticated ? "default" : "secondary"}>
                {evidencePack.role_flags.isAuthenticated ? "✓" : "✗"} Authenticated
              </Badge>
              <Badge variant={evidencePack.role_flags.isOwner ? "default" : "secondary"}>
                {evidencePack.role_flags.isOwner ? "✓" : "✗"} Owner
              </Badge>
              <Badge variant={evidencePack.role_flags.isAdmin ? "default" : "secondary"}>
                {evidencePack.role_flags.isAdmin ? "✓" : "✗"} Admin
              </Badge>
            </div>
            
            {/* Audit Findings Summary */}
            {evidencePack.route_nav_audit && evidencePack.route_nav_audit.findings.length > 0 && (
              <Alert variant="destructive" className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Audit Found {evidencePack.route_nav_audit.findings.length} Issues</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4 mt-2 text-sm">
                    {evidencePack.route_nav_audit.findings.slice(0, 3).map((f, i) => (
                      <li key={i}>{f.issue_code}: {f.description}</li>
                    ))}
                    {evidencePack.route_nav_audit.findings.length > 3 && (
                      <li>...and {evidencePack.route_nav_audit.findings.length - 3} more</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            
            {evidencePack.route_nav_audit && evidencePack.route_nav_audit.findings.length === 0 && (
              <Alert className="mb-4">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>All Clear</AlertTitle>
                <AlertDescription>No routing or navigation issues detected.</AlertDescription>
              </Alert>
            )}
            
            {/* JSON Textarea (fallback) */}
            {showEvidenceJson && (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground mb-2">Clipboard access denied. Copy from below:</p>
                <Textarea 
                  value={JSON.stringify(evidencePack, null, 2)} 
                  readOnly 
                  className="font-mono text-xs h-64"
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          <Button onClick={() => navigate("/platform/proof-gate")} className="gap-2">
            <Shield className="h-4 w-4" />
            Run Proof Gate
          </Button>
          <Button variant="outline" onClick={() => navigate("/platform/route-nav-auditor")} className="gap-2">
            <Map className="h-4 w-4" />
            Route & Nav Auditor
          </Button>
          <Button variant="outline" onClick={() => navigate("/platform/placeholder-scan")} className="gap-2">
            <Code className="h-4 w-4" />
            Placeholder Scanner
          </Button>
          <Button variant="outline" onClick={() => navigate("/platform/qa-tests")} className="gap-2">
            Run QA Tests
          </Button>
        </CardContent>
      </Card>

      {/* Tool Categories */}
      {(["diagnostics", "configuration", "debug", "admin"] as const).map(category => {
        const categoryTools = getCategoryTools(category);
        if (categoryTools.length === 0) return null;
        
        return (
          <Card key={category}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg capitalize">{category} Tools</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {categoryTools.map((tool) => {
                  const Icon = tool.icon;
                  const runResult = toolRuns.find(r => r.toolId === tool.id);
                  
                  return (
                    <div 
                      key={tool.id}
                      className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="p-2 rounded-md bg-primary/10">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{tool.name}</h3>
                          {tool.requires !== "authenticated" && (
                            <Badge variant="outline" className="text-xs">
                              {tool.requires}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {tool.description}
                        </p>
                        {runResult && (
                          <div className="flex items-center gap-2 mt-2 text-xs">
                            {runResult.status === "pass" && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                            {runResult.status === "fail" && <XCircle className="h-3 w-3 text-red-500" />}
                            {runResult.status === "skip" && <AlertTriangle className="h-3 w-3 text-yellow-500" />}
                            <span className="text-muted-foreground">
                              Last run: {new Date(runResult.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => navigate(tool.route)}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Open
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Info Panel */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>About Evidence Pack</AlertTitle>
        <AlertDescription className="text-sm">
          The Evidence Pack captures ALL diagnostic evidence at runtime: user context, role flags, 
          visible navigation routes, tool registry snapshot, route guards, and audit findings.
          Use "Run Evidence Pack" to prove what's true—no guessing.
        </AlertDescription>
      </Alert>
    </div>
  );
}
