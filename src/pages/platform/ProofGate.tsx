/**
 * Proof Gate - One-click diagnostic orchestrator with HARD ENFORCEMENT
 * 
 * Runs sequential checks and produces a canonical Evidence Pack.
 * PASS requires validateEvidencePack().ok = true
 * "This is how we prove what's true."
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Loader2, Copy, Download, Play, AlertTriangle, Shield, RotateCcw, Key, Clock, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { PlatformStatusBanner } from "@/components/platform/PlatformStatusBanner";
import { 
  SupportBundle, 
  PreflightReport, 
  createEmptyBundle, 
  downloadBundle,
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
  validateEvidencePack,
  createProofRun,
  completeProofRun,
  captureConsole,
  ValidationResult,
  ProofRun,
} from "@/lib/supportBundle";
import { platformTools, getAllPlatformRoutes } from "@/lib/toolRegistry";
import { getPlatformRouteGuards } from "@/lib/routeGuards";
import { runRouteNavAudit, AuditContext } from "@/lib/routeNavAudit";
import { getNavRoutesForRole } from "@/hooks/useRoleNavigation";
import { 
  runFSRealityCheck, 
  loadBuildOutput, 
  loadClaimLog, 
  detectClaimContradictions,
  compareFSResults,
  loadStoredFSRealityCheck,
  FSRealityCheckResult,
} from "@/lib/fsRealityCheck";

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
    { id: "fs_reality_check", name: "FS Reality Check (Existence + Env)", status: "pending" },
    { id: "build_check", name: "Build Output Verification", status: "pending" },
    { id: "contradiction_check", name: "Contradiction Detector", status: "pending" },
    { id: "route_audit", name: "Route & Nav Audit", status: "pending" },
    { id: "db_doctor", name: "DB Doctor (preflight)", status: "pending" },
    { id: "edge_preflight", name: "Edge Preflight", status: "pending" },
    { id: "qa_check", name: "QA Access + Mini QA", status: "pending" },
    { id: "edge_capture", name: "Edge Console Capture", status: "pending" },
    { id: "validation", name: "HARD VALIDATION GATE", status: "pending" },
    { id: "compose", name: "Compose Evidence Pack", status: "pending" },
  ]);
  
  const [evidencePack, setEvidencePack] = useState<EvidencePack | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
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
    setValidationResult(null);
    setSteps(steps.map(s => ({ ...s, status: "pending", result: undefined, error: undefined })));
    
    // Start proof run tracking
    const proofRun = createProofRun("proof-gate");
    const runs: ProofRun[] = [];
    
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
    const accessRun = createProofRun("access_check");
    try {
      const accessResult = {
        authenticated: !!user,
        role: role || "unknown",
        isOwner: isOwner ?? false,
        isAdmin: isAdmin ?? false,
        isClient: isClient ?? false,
      };
      runs.push(completeProofRun(accessRun, accessResult.authenticated));
      updateStep("access_check", { 
        status: accessResult.authenticated ? "pass" : "fail", 
        result: accessResult 
      });
    } catch (err) {
      runs.push(completeProofRun(accessRun, false, String(err)));
      updateStep("access_check", { status: "fail", error: String(err) });
    }

    // === STEP 2: FS Reality Check ===
    updateStep("fs_reality_check", { status: "running" });
    const fsRun = createProofRun("fs_reality_check");
    let fsResult: FSRealityCheckResult | null = null;
    try {
      const { result, warnings, errors } = await captureConsole(async () => runFSRealityCheck());
      fsResult = result;
      pack.fs_reality_check = fsResult;
      runs.push(completeProofRun(fsRun, fsResult.all_imports_ok, undefined, { warnings, errors }));
      updateStep("fs_reality_check", { 
        status: fsResult.all_imports_ok ? "pass" : "fail",
        result: { 
          imports_ok: fsResult.all_imports_ok, 
          failed: fsResult.failed_imports 
        }
      });
    } catch (err) {
      runs.push(completeProofRun(fsRun, false, String(err)));
      updateStep("fs_reality_check", { status: "fail", error: String(err) });
    }

    // === STEP 3: Build Output Verification ===
    updateStep("build_check", { status: "running" });
    const buildRun = createProofRun("build_check");
    try {
      const buildOutput = loadBuildOutput();
      const buildPresent = buildOutput.length > 0;
      pack.build_output = { present: buildPresent, text: buildOutput || null };
      
      if (!buildPresent) {
        // Add human action required for missing build output
        pack.human_actions_required.push({
          action: "Paste raw build output in Ops Center → Build Proof section",
          location: "/platform/ops",
          value: "Required for PASS validation",
        });
      }
      
      runs.push(completeProofRun(buildRun, buildPresent));
      updateStep("build_check", { 
        status: buildPresent ? "pass" : "fail",
        result: { present: buildPresent, length: buildOutput.length }
      });
    } catch (err) {
      runs.push(completeProofRun(buildRun, false, String(err)));
      updateStep("build_check", { status: "fail", error: String(err) });
    }

    // === STEP 4: Contradiction Detector ===
    updateStep("contradiction_check", { status: "running" });
    const contradictionRun = createProofRun("contradiction_check");
    try {
      let hasContradiction = false;
      const contradictionDetails: string[] = [];
      
      // Check claim log for contradictions
      const claimLog = loadClaimLog();
      if (claimLog && fsResult) {
        const claimResult = detectClaimContradictions(claimLog, fsResult);
        if (claimResult.hasContradiction) {
          hasContradiction = true;
          contradictionDetails.push(...claimResult.contradictions);
        }
      }
      
      // Compare with previous FS result
      const previousFS = loadStoredFSRealityCheck();
      if (previousFS && fsResult) {
        const comparison = compareFSResults(previousFS, fsResult);
        if (comparison.hasContradiction) {
          hasContradiction = true;
          contradictionDetails.push(...comparison.details);
        }
      }
      
      if (hasContradiction) {
        // Increment contradiction counter
        const newCounts = { ...issueCounts, proof_contradiction: (issueCounts.proof_contradiction || 0) + 1 };
        setIssueCounts(newCounts);
        saveIssueCounts(newCounts);
        pack.recurring_issue_counts = newCounts;
        
        pack.human_actions_required.push({
          action: "Resolve contradiction - update claim log or re-verify",
          location: "/platform/ops",
          value: contradictionDetails.join("; "),
        });
        
        runs.push(completeProofRun(contradictionRun, false, "proof_contradiction"));
        updateStep("contradiction_check", { 
          status: "fail", 
          result: { contradictions: contradictionDetails },
          error: "proof_contradiction"
        });
      } else {
        runs.push(completeProofRun(contradictionRun, true));
        updateStep("contradiction_check", { status: "pass", result: { clean: true } });
      }
    } catch (err) {
      runs.push(completeProofRun(contradictionRun, false, String(err)));
      updateStep("contradiction_check", { status: "skip", error: String(err) });
    }

    // === STEP 5: Route & Nav Audit ===
    updateStep("route_audit", { status: "running" });
    const routeRun = createProofRun("route_audit");
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
      
      const routeOk = auditResult.summary.critical === 0;
      runs.push(completeProofRun(routeRun, routeOk));
      updateStep("route_audit", { 
        status: routeOk ? "pass" : "fail",
        result: { 
          critical: auditResult.summary.critical, 
          warning: auditResult.summary.warning,
          passed: auditResult.summary.passed,
        }
      });
    } catch (err) {
      runs.push(completeProofRun(routeRun, false, String(err)));
      updateStep("route_audit", { status: "fail", error: String(err) });
    }

    // === STEP 6: DB Doctor ===
    updateStep("db_doctor", { status: "running" });
    const dbRun = createProofRun("db_doctor");
    try {
      const { data, error } = await (supabase.rpc as any)("qa_dependency_check");
      if (error) throw error;
      newBundle.db_doctor_report = data;
      runs.push(completeProofRun(dbRun, data?.ok ?? false));
      updateStep("db_doctor", { status: data?.ok ? "pass" : "fail", result: data });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      runs.push(completeProofRun(dbRun, false, errMsg));
      updateStep("db_doctor", { status: "skip", error: errMsg });
      newBundle.db_doctor_report = { ok: false, error: errMsg };
    }

    // === STEP 7: Edge Preflight ===
    updateStep("edge_preflight", { status: "running" });
    const edgeRun = createProofRun("edge_preflight");
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
      runs.push(completeProofRun(edgeRun, report?.ok ?? false));
      updateStep("edge_preflight", { status: report?.ok ? "pass" : "fail", result: data });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      runs.push(completeProofRun(edgeRun, false, errMsg));
      updateStep("edge_preflight", { status: "fail", error: errMsg });
      newBundle.edge_preflight = { ok: false, error: errMsg };
    }

    // === STEP 8: QA Access + Mini QA ===
    updateStep("qa_check", { status: "running" });
    const qaRun = createProofRun("qa_check");
    try {
      pack.qa_access_status = user ? "available" : "denied";
      
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
      
      const qaOk = miniQA.errors.length === 0;
      runs.push(completeProofRun(qaRun, qaOk));
      updateStep("qa_check", { 
        status: qaOk ? "pass" : "fail",
        result: miniQA,
      });
    } catch (err) {
      pack.qa_access_status = "denied";
      runs.push(completeProofRun(qaRun, false, String(err)));
      updateStep("qa_check", { status: "skip", error: String(err) });
    }

    // === STEP 9: Edge Console Capture ===
    updateStep("edge_capture", { status: "running" });
    const captureRun = createProofRun("edge_capture");
    try {
      const latestRun = loadLatestEdgeRun();
      pack.latest_edge_console_run = latestRun;
      runs.push(completeProofRun(captureRun, !!latestRun));
      updateStep("edge_capture", { 
        status: latestRun ? "pass" : "skip",
        result: latestRun ? { function: latestRun.function_name, timestamp: latestRun.timestamp } : { reason: "No edge runs captured" },
      });
    } catch (err) {
      runs.push(completeProofRun(captureRun, false, String(err)));
      updateStep("edge_capture", { status: "skip", error: String(err) });
    }

    // === Add all runs to pack ===
    pack.runs = runs;
    
    // === STEP 10: HARD VALIDATION GATE ===
    updateStep("validation", { status: "running" });
    const validationRunEntry = createProofRun("validation");
    
    // Run validation
    const validation = validateEvidencePack(pack);
    pack.validation_result = validation;
    pack.proof_token = validation.proof_token;
    
    setValidationResult(validation);
    runs.push(completeProofRun(validationRunEntry, validation.ok, validation.errors.join("; ")));
    
    updateStep("validation", {
      status: validation.ok ? "pass" : "fail",
      result: { 
        ok: validation.ok, 
        errors: validation.errors.length,
        warnings: validation.warnings.length,
        proof_token: validation.proof_token,
      },
      error: validation.ok ? undefined : validation.errors[0],
    });

    // === STEP 11: Compose Evidence Pack ===
    updateStep("compose", { status: "running" });
    
    // Determine human actions required
    if ((newBundle.db_doctor_report?.suspect_count ?? 0) > 0) {
      const action = {
        action: "Run Fix SQL in Supabase",
        location: "Supabase Dashboard → SQL Editor",
        value: newBundle.db_doctor_report?.suspects?.map((s: any) => s.fix_sql).join("\n\n"),
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
    
    if (validation.ok) {
      toast.success(`✅ PROOF GATE PASS - Token: ${validation.proof_token}`);
    } else {
      toast.error(`❌ PROOF GATE FAIL - ${validation.errors.length} error(s)`);
    }
  };

  const handleResetCounters = () => {
    resetIssueCounts();
    setIssueCounts({});
    toast.success("Issue counters reset");
  };

  const progress = (steps.filter(s => s.status !== "pending").length / steps.length) * 100;
  const hasBlockers = preflightStatus && (!preflightStatus.ok || (preflightStatus.suspect_count ?? 0) > 0);
  const recurringIssues = getRecurringIssues(issueCounts);

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
      <PlatformStatusBanner preflightStatus={preflightStatus} />
      
      {/* PROOF TOKEN BANNER - Most prominent element */}
      {validationResult && (
        <Card className={validationResult.ok ? "border-green-500 border-2" : "border-destructive border-2"}>
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {validationResult.ok ? (
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                ) : (
                  <XCircle className="h-12 w-12 text-destructive" />
                )}
                <div>
                  <div className="text-2xl font-bold">
                    {validationResult.ok ? "✅ PASS" : "❌ FAIL"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {validationResult.errors.length} error(s), {validationResult.warnings.length} warning(s)
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Key className="h-4 w-4" />
                  Proof Token
                </div>
                <div className="font-mono text-lg bg-muted px-3 py-1 rounded flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  {validationResult.proof_token}
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(validationResult.proof_token);
                      toast.success("Token copied");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Validation Errors */}
            {validationResult.errors.length > 0 && (
              <div className="mt-4 p-3 bg-destructive/10 rounded-lg">
                <div className="text-sm font-medium text-destructive mb-2">Validation Errors (must fix for PASS):</div>
                <ul className="text-sm space-y-1">
                  {validationResult.errors.map((err, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Validation Warnings */}
            {validationResult.warnings.length > 0 && (
              <div className="mt-4 p-3 bg-yellow-500/10 rounded-lg">
                <div className="text-sm font-medium text-yellow-600 mb-2">Warnings:</div>
                <ul className="text-sm space-y-1">
                  {validationResult.warnings.map((warn, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                      {warn}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Proof Gate
            {validationResult && (
              <Badge variant={validationResult.ok ? "default" : "destructive"} className="ml-2">
                {validationResult.ok ? "VALIDATED" : "INVALID"}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            One-click diagnostic with HARD enforcement. PASS requires validateEvidencePack().ok = true.
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

          {/* Run History Summary */}
          {evidencePack && evidencePack.runs.length > 0 && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium mb-2">
                <Clock className="h-4 w-4" />
                Run History ({evidencePack.runs.length} steps)
              </div>
              <div className="flex gap-2 flex-wrap">
                {evidencePack.runs.map((run, i) => (
                  <Badge 
                    key={i} 
                    variant={run.ok ? "default" : "destructive"}
                    className="text-xs"
                  >
                    {run.tool_id}: {run.duration_ms}ms
                  </Badge>
                ))}
              </div>
            </div>
          )}

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
                
                <span className={`flex-1 ${step.id === "validation" ? "font-bold" : ""}`}>
                  {step.name}
                </span>
                
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
                <p>Found {bundle.db_doctor_report.suspect_count} suspect(s)</p>
                <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                  {bundle.db_doctor_report.suspects.map((s: any) => s.fix_sql).join("\n\n")}
                </pre>
              </AlertDescription>
            </Alert>
          )}

          {/* Human Actions Required */}
          {evidencePack && evidencePack.human_actions_required.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Human Actions Required</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 space-y-2">
                  {evidencePack.human_actions_required.map((action, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5">{i + 1}</Badge>
                      <div>
                        <div className="font-medium">{action.action}</div>
                        <div className="text-xs text-muted-foreground">Location: {action.location}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {showTextarea && evidencePack && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Auto-copy failed. Select all and copy manually:
              </p>
              <Textarea
                value={JSON.stringify(evidencePack, null, 2)}
                readOnly
                className="font-mono text-xs h-96"
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
