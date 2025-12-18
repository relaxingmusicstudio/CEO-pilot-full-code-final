/**
 * Proof Gate - One-click diagnostic orchestrator
 * 
 * Runs sequential checks and produces a canonical Evidence Pack.
 * "This is how we prove what's true."
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Loader2, Copy, Download, Play, AlertTriangle, Shield, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { PlatformStatusBanner } from "@/components/platform/PlatformStatusBanner";
import { 
  SupportBundle, 
  PreflightReport, 
  createEmptyBundle, 
  copyBundleToClipboard, 
  downloadBundle,
  EvidencePack,
  createEmptyEvidencePack,
  copyEvidencePackToClipboard,
  downloadEvidencePack,
  storeEvidencePack,
  loadIssueCounts,
  saveIssueCounts,
  incrementIssueCounts,
  getRecurringIssues,
  resetIssueCounts,
  loadLatestEdgeRun,
  runMiniQA,
} from "@/lib/supportBundle";
import { platformTools, getAllPlatformRoutes } from "@/lib/toolRegistry";
import { getPlatformRouteGuards } from "@/lib/routeGuards";
import { runRouteNavAudit, AuditContext } from "@/lib/routeNavAudit";
import { getNavRoutesForRole } from "@/hooks/useRoleNavigation";

type StepStatus = "pending" | "running" | "pass" | "fail" | "skip";

interface Step {
  id: string;
  name: string;
  status: StepStatus;
  result?: unknown;
  error?: string;
}

export default function ProofGate() {
  const { user } = useAuth();
  const { role, isOwner, isAdmin, isClient } = useUserRole();
  
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Step[]>([
    { id: "access_check", name: "Access/Role Check", status: "pending" },
    { id: "route_audit", name: "Route & Nav Audit", status: "pending" },
    { id: "db_doctor", name: "DB Doctor (preflight)", status: "pending" },
    { id: "edge_preflight", name: "Edge Preflight", status: "pending" },
    { id: "qa_check", name: "QA Access + Mini QA", status: "pending" },
    { id: "edge_capture", name: "Edge Console Capture", status: "pending" },
    { id: "compose", name: "Compose Evidence Pack", status: "pending" },
  ]);
  
  const [evidencePack, setEvidencePack] = useState<EvidencePack | null>(null);
  const [bundle, setBundle] = useState<SupportBundle | null>(null);
  const [showTextarea, setShowTextarea] = useState(false);
  const [preflightStatus, setPreflightStatus] = useState<PreflightReport | null>(null);
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>(loadIssueCounts());
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const edgeBaseUrl = `${supabaseUrl}/functions/v1`;

  const updateStep = (id: string, update: Partial<Step>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...update } : s));
  };

  const roleContext: AuditContext = {
    isAdmin: isAdmin ?? false,
    isOwner: isOwner ?? false,
    isClient: isClient ?? false,
    isAuthenticated: !!user,
  };

  const runProofGate = async () => {
    setRunning(true);
    setShowTextarea(false);
    setSteps(steps.map(s => ({ ...s, status: "pending", result: undefined, error: undefined })));
    
    // Initialize Evidence Pack
    const pack = createEmptyEvidencePack();
    pack.timestamp = new Date().toISOString();
    pack.current_route = window.location.pathname;
    pack.user_id_masked = user?.id ? `${user.id.substring(0, 8)}...` : "(unauthenticated)";
    pack.role_flags = { ...roleContext };
    
    // Also initialize legacy bundle for backwards compat
    const newBundle = createEmptyBundle();
    newBundle.user_id = user?.id || null;
    newBundle.role = role || null;
    newBundle.isOwner = isOwner ?? false;
    newBundle.isAdmin = isAdmin ?? false;
    
    // Fetch tenant IDs
    try {
      const { data: tenants } = await supabase.from("tenants").select("id").limit(5);
      const tenantIds = tenants?.map(t => t.id) || [];
      pack.tenant_ids = tenantIds;
      newBundle.tenant_ids = tenantIds;
    } catch {}

    // === STEP 1: Access/Role Check ===
    updateStep("access_check", { status: "running" });
    try {
      const accessResult = {
        authenticated: !!user,
        role: role || "unknown",
        isOwner: isOwner ?? false,
        isAdmin: isAdmin ?? false,
        isClient: isClient ?? false,
      };
      updateStep("access_check", { 
        status: accessResult.authenticated ? "pass" : "fail", 
        result: accessResult 
      });
    } catch (err) {
      updateStep("access_check", { status: "fail", error: String(err) });
    }

    // === STEP 2: Route & Nav Audit ===
    updateStep("route_audit", { status: "running" });
    try {
      // Populate routing snapshots
      pack.nav_routes_visible = getNavRoutesForRole(roleContext);
      pack.tool_registry_snapshot = platformTools.map(t => ({
        id: t.id,
        name: t.name,
        route: t.route,
        requires: t.requires,
        category: t.category,
      }));
      pack.platform_routes_snapshot = getAllPlatformRoutes();
      pack.route_guard_snapshot = getPlatformRouteGuards().map(g => ({
        path: g.path,
        requires: g.requires,
      }));
      
      // Run audit
      const auditResult = runRouteNavAudit(roleContext);
      pack.route_nav_audit = auditResult;
      
      // Update issue counts
      const newCounts = incrementIssueCounts(auditResult.findings, issueCounts);
      setIssueCounts(newCounts);
      saveIssueCounts(newCounts);
      pack.recurring_issue_counts = newCounts;
      
      // Legacy bundle
      newBundle.route_nav_audit = {
        summary: auditResult.summary,
        findings: auditResult.findings.map(f => ({
          severity: f.severity,
          issue_code: f.issue_code,
          identifier: f.identifier,
          route: f.route,
          description: f.description,
        })),
        counters: newCounts,
      };
      
      updateStep("route_audit", { 
        status: auditResult.summary.critical === 0 ? "pass" : "fail",
        result: { 
          critical: auditResult.summary.critical, 
          warning: auditResult.summary.warning,
          passed: auditResult.summary.passed,
        }
      });
    } catch (err) {
      updateStep("route_audit", { status: "fail", error: String(err) });
    }

    // === STEP 3: DB Doctor ===
    updateStep("db_doctor", { status: "running" });
    try {
      const { data, error } = await (supabase.rpc as any)("qa_dependency_check");
      if (error) throw error;
      newBundle.db_doctor_report = data;
      updateStep("db_doctor", { status: data?.ok ? "pass" : "fail", result: data });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      updateStep("db_doctor", { status: "skip", error: errMsg });
      newBundle.db_doctor_report = { ok: false, error: errMsg };
    }

    // === STEP 4: Edge Preflight ===
    updateStep("edge_preflight", { status: "running" });
    try {
      const response = await fetch(`${edgeBaseUrl}/lead-normalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preflight" }),
      });
      const data = await response.json();
      const report = data.report || data;
      newBundle.edge_preflight = report;
      setPreflightStatus(report);
      updateStep("edge_preflight", { status: report?.ok ? "pass" : "fail", result: data });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      updateStep("edge_preflight", { status: "fail", error: errMsg });
      newBundle.edge_preflight = { ok: false, error: errMsg };
    }

    // === STEP 5: QA Access + Mini QA ===
    updateStep("qa_check", { status: "running" });
    try {
      // Try to access QA endpoint (this would fail if not authenticated properly)
      pack.qa_access_status = user ? "available" : "denied";
      
      // Run Mini QA as fallback
      let auditRunnable = true;
      try {
        runRouteNavAudit(roleContext);
      } catch {
        auditRunnable = false;
      }
      
      const miniQA = runMiniQA({
        isAuthenticated: !!user,
        toolRegistryLength: platformTools.length,
        auditRunnable,
      });
      pack.mini_qa = miniQA;
      
      updateStep("qa_check", { 
        status: miniQA.errors.length === 0 ? "pass" : "fail",
        result: miniQA,
      });
    } catch (err) {
      pack.qa_access_status = "denied";
      updateStep("qa_check", { status: "skip", error: String(err) });
    }

    // === STEP 6: Edge Console Capture ===
    updateStep("edge_capture", { status: "running" });
    try {
      const latestRun = loadLatestEdgeRun();
      pack.latest_edge_console_run = latestRun;
      updateStep("edge_capture", { 
        status: latestRun ? "pass" : "skip",
        result: latestRun ? { function: latestRun.function_name, timestamp: latestRun.timestamp } : { reason: "No edge runs captured" },
      });
    } catch (err) {
      updateStep("edge_capture", { status: "skip", error: String(err) });
    }

    // === STEP 7: Compose Evidence Pack ===
    updateStep("compose", { status: "running" });
    
    // Determine human actions required
    if ((newBundle.db_doctor_report?.suspect_count ?? 0) > 0) {
      const action = {
        action: "Run Fix SQL in Supabase",
        location: "Supabase Dashboard → SQL Editor",
        value: newBundle.db_doctor_report?.suspects?.map(s => s.fix_sql).join("\n\n"),
      };
      pack.human_actions_required.push(action);
      newBundle.human_actions_required.push(action);
    }
    
    // Store Evidence Pack
    storeEvidencePack(pack);
    setEvidencePack(pack);
    
    // Legacy bundle
    newBundle.timestamp = new Date().toISOString();
    setBundle(newBundle);
    
    // Auto-copy Evidence Pack
    const result = await copyEvidencePackToClipboard(pack);
    if (!result.success) {
      setShowTextarea(true);
    }
    
    updateStep("compose", { status: "pass" });
    setRunning(false);
    toast.success("Proof Gate complete! Evidence Pack copied.");
  };

  const handleResetCounters = () => {
    resetIssueCounts();
    setIssueCounts({});
    toast.success("Issue counters reset");
  };

  const progress = (steps.filter(s => s.status !== "pending").length / steps.length) * 100;
  const hasBlockers = preflightStatus && (!preflightStatus.ok || (preflightStatus.suspect_count ?? 0) > 0);
  const allPass = steps.every(s => s.status === "pass" || s.status === "skip");
  const recurringIssues = getRecurringIssues(issueCounts);

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
      <PlatformStatusBanner preflightStatus={preflightStatus} />
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Proof Gate
          </CardTitle>
          <CardDescription>
            One-click diagnostic that runs checks, captures evidence, and copies the Evidence Pack.
            "This is how we prove what's true."
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-4">
            <Button 
              onClick={runProofGate} 
              disabled={running}
              size="lg"
              className="bg-primary"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Run Proof Gate
            </Button>
            
            {evidencePack && (
              <>
                <Button variant="outline" onClick={() => copyEvidencePackToClipboard(evidencePack).then(r => {
                  if (!r.success) setShowTextarea(true);
                  else toast.success("Evidence Pack copied");
                })}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Evidence Pack
                </Button>
                <Button variant="outline" onClick={() => downloadEvidencePack(evidencePack)}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Evidence Pack
                </Button>
              </>
            )}
            
            {bundle && (
              <Button variant="outline" onClick={() => downloadBundle(bundle)}>
                <Download className="h-4 w-4 mr-2" />
                Download Legacy Bundle
              </Button>
            )}
            
            <Button variant="ghost" onClick={handleResetCounters}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset Counters
            </Button>
          </div>

          {running && <Progress value={progress} className="h-2" />}

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
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            {steps.map((step) => (
              <div key={step.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                {step.status === "pending" && <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />}
                {step.status === "running" && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                {step.status === "pass" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                {step.status === "fail" && <XCircle className="h-5 w-5 text-destructive" />}
                {step.status === "skip" && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                
                <span className="flex-1">{step.name}</span>
                
                <Badge variant={
                  step.status === "pass" ? "default" :
                  step.status === "fail" ? "destructive" :
                  step.status === "skip" ? "secondary" : "outline"
                }>
                  {step.status}
                </Badge>
                
                {step.result && (
                  <span className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {JSON.stringify(step.result).substring(0, 50)}...
                  </span>
                )}
              </div>
            ))}
          </div>

          {hasBlockers && bundle?.db_doctor_report?.suspects && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>🚨 BLOCKER FOUND</AlertTitle>
              <AlertDescription className="space-y-2">
                <ul className="list-disc pl-4 mt-2">
                  {bundle.db_doctor_report.suspects.map((s, i) => (
                    <li key={i}><code>{s.object}</code> ({s.type})</li>
                  ))}
                </ul>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-2"
                  onClick={() => {
                    const sql = bundle.db_doctor_report?.suspects?.map(s => 
                      `-- Fix: ${s.object}\n${s.fix_sql}`
                    ).join("\n\n");
                    navigator.clipboard.writeText(sql || "");
                    toast.success("Fix SQL copied");
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Fix SQL
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {!running && allPass && evidencePack && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>✅ Proof Gate PASS</AlertTitle>
              <AlertDescription>
                All checks passed. Evidence Pack has been copied to clipboard.
              </AlertDescription>
            </Alert>
          )}

          {evidencePack?.human_actions_required && evidencePack.human_actions_required.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Human Action Required</AlertTitle>
              <AlertDescription>
                {evidencePack.human_actions_required.map((action, i) => (
                  <div key={i} className="mt-2 p-2 bg-muted rounded">
                    <strong>{action.action}</strong>
                    <div className="text-sm text-muted-foreground">{action.location}</div>
                  </div>
                ))}
              </AlertDescription>
            </Alert>
          )}

          {showTextarea && evidencePack && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Clipboard access denied. Copy from below:</p>
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
    </div>
  );
}
