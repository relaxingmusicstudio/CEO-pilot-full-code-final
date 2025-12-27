/**
 * Proof Gate - One-click diagnostic orchestrator with HARD ENFORCEMENT
 * Uses Proof Kernel for cryptographic verification
 * PASS requires validateEvidencePackStrict().ok = true
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Loader2, Copy, Download, Play, AlertTriangle, Shield, RotateCcw, Key, Clock, Hash, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { PlatformStatusBanner } from "@/components/platform/PlatformStatusBanner";
import { 
  PreflightReport, 
  createEmptyBundle, 
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
import { 
  runFSRealityCheck, 
  loadBuildOutput, 
  loadClaimLog, 
  detectClaimContradictions,
  compareFSResults,
  loadStoredFSRealityCheck,
  getBuildOutputMeta,
} from "@/lib/fsRealityCheck";
import {
  runWithProof,
  createRecorderContext,
  getRecords,
  validateEvidencePackStrict,
  generateProofTokenFromObject,
  hashObject,
  signEvidencePack,
  type ProofValidationResult,
  type StepRecord,
} from "@/lib/proofKernel";

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
    { id: "access_check", name: "Access/Role Snapshot", status: "pending" },
    { id: "fs_reality_check", name: "FS Reality Check", status: "pending" },
    { id: "build_check", name: "Build Output Verification", status: "pending" },
    { id: "contradiction_check", name: "Contradiction Detector", status: "pending" },
    { id: "route_audit", name: "Route & Nav Audit", status: "pending" },
    { id: "db_doctor", name: "DB Doctor (preflight)", status: "pending" },
    { id: "edge_preflight", name: "Edge Preflight", status: "pending" },
    { id: "qa_check", name: "QA Access + Mini QA", status: "pending" },
    { id: "edge_capture", name: "Edge Console Capture", status: "pending" },
    { id: "compose", name: "Compose + Hash + Sign", status: "pending" },
    { id: "validation", name: "HARD VALIDATION GATE", status: "pending" },
  ]);
  
  const [evidencePack, setEvidencePack] = useState<EvidencePack | null>(null);
  const [validationResult, setValidationResult] = useState<ProofValidationResult | null>(null);
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
    const runRpc = (fn: string) =>
      supabase.rpc(fn) as unknown as Promise<{ data: PreflightReport | null; error: { message?: string } | null }>;
    
    // Create recorder context for proof capture
    const recorderCtx = createRecorderContext();
    
    // Initialize Evidence Pack
    const pack = createEmptyEvidencePack();
    pack.timestamp = new Date().toISOString();
    pack.current_route = window.location.pathname;
    pack.user_id_masked = user?.id ? `${user.id.substring(0, 8)}...` : "(unauthenticated)";
    pack.role_flags = { ...roleContext };
    
    // Legacy bundle for backwards compat
    const newBundle = createEmptyBundle();
    newBundle.user_id = user?.id || null;
    newBundle.role = role || null;
    newBundle.isOwner = isOwner ?? false;
    newBundle.isAdmin = isAdmin ?? false;
    
    // Fetch tenant IDs
    try {
      const { data: tenants } = await supabase.from("tenants").select("id").limit(5);
      pack.tenant_ids = tenants?.map(t => t.id) || [];
      newBundle.tenant_ids = pack.tenant_ids;
    } catch {
      // ignore tenant lookup errors
    }

    // === STEP 1: Access/Role Snapshot ===
    updateStep("access_check", { status: "running" });
    await runWithProof(recorderCtx, "access_check", async () => {
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
      return accessResult;
    });

    // === STEP 2: FS Reality Check ===
    updateStep("fs_reality_check", { status: "running" });
    const fsRunResult = await runWithProof(recorderCtx, "fs_reality_check", async () => {
      const fsResult = await runFSRealityCheck();
      pack.fs_reality_check = fsResult;
      updateStep("fs_reality_check", { 
        status: fsResult.all_imports_ok ? "pass" : "fail",
        result: { imports_ok: fsResult.all_imports_ok, failed: fsResult.failed_imports }
      });
      return fsResult;
    });

    // === STEP 3: Build Output Verification ===
    updateStep("build_check", { status: "running" });
    await runWithProof(recorderCtx, "build_check", async () => {
      const buildOutput = loadBuildOutput();
      const buildMeta = getBuildOutputMeta();
      const buildPresent = buildOutput.length > 0;
      pack.build_output = { 
        present: buildPresent, 
        text: buildOutput || null,
        meta: buildMeta || undefined,
      };
      
      if (!buildPresent) {
        pack.human_actions_required.push({
          action: "Paste raw build output in Ops Center → Build Proof section",
          location: "/platform/ops",
          value: "Required for PASS validation",
        });
      }
      
      updateStep("build_check", { 
        status: buildPresent ? "pass" : "fail",
        result: { present: buildPresent, length: buildOutput.length }
      });
      return { present: buildPresent };
    });

    // === STEP 4: Contradiction Detector ===
    updateStep("contradiction_check", { status: "running" });
    await runWithProof(recorderCtx, "contradiction_check", async () => {
      let hasContradiction = false;
      const contradictionDetails: string[] = [];
      
      const claimLog = loadClaimLog();
      const fsResult = fsRunResult.result;
      if (claimLog && fsResult) {
        const claimResult = detectClaimContradictions(claimLog, fsResult);
        if (claimResult.hasContradiction) {
          hasContradiction = true;
          contradictionDetails.push(...claimResult.contradictions);
        }
      }
      
      const previousFS = loadStoredFSRealityCheck();
      if (previousFS && fsResult) {
        const comparison = compareFSResults(previousFS, fsResult);
        if (comparison.hasContradiction) {
          hasContradiction = true;
          contradictionDetails.push(...comparison.details);
        }
      }
      
      if (hasContradiction) {
        const newCounts = { ...issueCounts, proof_contradiction: (issueCounts.proof_contradiction || 0) + 1 };
        setIssueCounts(newCounts);
        saveIssueCounts(newCounts);
        pack.recurring_issue_counts = newCounts;
        
        pack.human_actions_required.push({
          action: "Resolve contradiction - update claim log or re-verify",
          location: "/platform/ops",
          value: contradictionDetails.join("; "),
        });
        
        updateStep("contradiction_check", { status: "fail", result: { contradictions: contradictionDetails }, error: "proof_contradiction" });
        throw new Error("Contradiction detected");
      }
      
      updateStep("contradiction_check", { status: "pass", result: { clean: true } });
      return { clean: true };
    });

    // === STEP 5: Route & Nav Audit ===
    updateStep("route_audit", { status: "running" });
    await runWithProof(recorderCtx, "route_audit", async () => {
      pack.nav_routes_visible = getNavRoutesForRole(roleContext);
      pack.tool_registry_snapshot = platformTools.map(t => ({
        id: t.id, name: t.name, route: t.route, requires: t.requires, category: t.category,
      }));
      pack.platform_routes_snapshot = getAllPlatformRoutes();
      pack.route_guard_snapshot = getPlatformRouteGuards().map(g => ({ path: g.path, requires: g.requires }));
      
      const auditResult = runRouteNavAudit(roleContext);
      pack.route_nav_audit = auditResult;
      
      const newCounts = incrementIssueCounts(auditResult.findings, issueCounts);
      setIssueCounts(newCounts);
      saveIssueCounts(newCounts);
      pack.recurring_issue_counts = newCounts;
      
      newBundle.route_nav_audit = {
        summary: auditResult.summary,
        findings: auditResult.findings.map(f => ({
          severity: f.severity, issue_code: f.issue_code, identifier: f.identifier, route: f.route, description: f.description,
        })),
        counters: newCounts,
      };
      
      const routeOk = auditResult.summary.critical === 0;
      updateStep("route_audit", { 
        status: routeOk ? "pass" : "fail",
        result: { critical: auditResult.summary.critical, warning: auditResult.summary.warning, passed: auditResult.summary.passed }
      });
      return auditResult;
    });

    // === STEP 6: DB Doctor ===
    updateStep("db_doctor", { status: "running" });
    await runWithProof(recorderCtx, "db_doctor", async () => {
      try {
        const { data, error } = await runRpc("qa_dependency_check");
        if (error) throw error;
        newBundle.db_doctor_report = data;
        updateStep("db_doctor", { status: data?.ok ? "pass" : "fail", result: data });
        return data;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        updateStep("db_doctor", { status: "skip", error: errMsg });
        newBundle.db_doctor_report = { ok: false, error: errMsg };
        return { ok: false, error: errMsg };
      }
    });

    // === STEP 7: Edge Preflight ===
    updateStep("edge_preflight", { status: "running" });
    await runWithProof(recorderCtx, "edge_preflight", async () => {
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
        return report;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        updateStep("edge_preflight", { status: "fail", error: errMsg });
        newBundle.edge_preflight = { ok: false, error: errMsg };
        return { ok: false, error: errMsg };
      }
    });

    // === STEP 8: QA Access + Mini QA ===
    updateStep("qa_check", { status: "running" });
    await runWithProof(recorderCtx, "qa_check", async () => {
      pack.qa_access_status = user ? "available" : "denied";
      
      let auditRunnable = true;
      try { runRouteNavAudit(roleContext); } catch { auditRunnable = false; }
      
      const miniQA = runMiniQA({
        isAuthenticated: !!user,
        toolRegistryLength: platformTools.length,
        auditRunnable,
      });
      pack.mini_qa = miniQA;
      
      const qaOk = miniQA.errors.length === 0;
      updateStep("qa_check", { status: qaOk ? "pass" : "fail", result: miniQA });
      return miniQA;
    });

    // === STEP 9: Edge Console Capture ===
    updateStep("edge_capture", { status: "running" });
    await runWithProof(recorderCtx, "edge_capture", async () => {
      const latestRun = loadLatestEdgeRun();
      pack.latest_edge_console_run = latestRun;
      updateStep("edge_capture", { 
        status: latestRun ? "pass" : "skip",
        result: latestRun ? { function: latestRun.function_name, timestamp: latestRun.timestamp } : { reason: "No edge runs captured" },
      });
      return latestRun;
    });

    // === STEP 10: Compose + Hash + Sign ===
    updateStep("compose", { status: "running" });
    await runWithProof(recorderCtx, "compose", async () => {
      // Convert recorder records to run log format
      const records = getRecords(recorderCtx);
      pack.runs = records.map(r => ({
        id: `${r.step_id}-${Date.now()}`,
        tool_id: r.step_id,
        started_at: r.started_at,
        ended_at: r.ended_at,
        duration_ms: r.duration_ms,
        ok: r.ok,
        error: r.error,
        console_warnings: r.console_warnings,
        console_errors: r.console_errors,
      }));
      
      // Add DB doctor actions
      if ((newBundle.db_doctor_report?.suspect_count ?? 0) > 0) {
        pack.human_actions_required.push({
          action: "Run Fix SQL in Supabase",
          location: "Supabase Dashboard → SQL Editor",
          value: newBundle.db_doctor_report?.suspects
            ?.map((s) => (s as { fix_sql?: string }).fix_sql || "")
            .filter((fixSql) => fixSql.length > 0)
            .join("\n\n"),
        });
      }
      
      // Generate proof token using crypto hash
      const proofToken = await generateProofTokenFromObject(pack, pack.timestamp);
      const packHash = await hashObject(pack);
      pack.proof_token = proofToken;
      
      // Initialize proof kernel
      pack.proof_kernel = {
        proof_token: proofToken,
        signature: null,
        validator: { ok: false, errors: [], warnings: [] },
        run_log: records.map(r => ({
          step_id: r.step_id,
          ok: r.ok,
          duration_ms: r.duration_ms,
          error: r.error,
        })),
      };
      
      // Attempt to sign (optional, may fail if edge function not deployed)
      try {
        const signResult = await signEvidencePack(pack);
        if (signResult.success && signResult.signature) {
          pack.proof_kernel.signature = signResult.signature;
        }
      } catch {
        // Signing is optional
      }
      
      updateStep("compose", { status: "pass", result: { proof_token: proofToken } });
      return { proof_token: proofToken, pack_hash: packHash };
    });

    // === STEP 11: HARD VALIDATION GATE ===
    updateStep("validation", { status: "running" });
    const validation = validateEvidencePackStrict(pack);
    
    // Update proof kernel with validation result
    if (pack.proof_kernel) {
      pack.proof_kernel.validator = {
        ok: validation.ok,
        errors: validation.errors,
        warnings: validation.warnings,
      };
    }
    
    pack.validation_result = {
      ok: validation.ok,
      errors: validation.errors,
      warnings: validation.warnings,
      proof_token: pack.proof_token,
    };
    
    setValidationResult(validation);
    
    updateStep("validation", {
      status: validation.ok ? "pass" : "fail",
      result: { ok: validation.ok, errors: validation.errors.length, warnings: validation.warnings.length },
      error: validation.ok ? undefined : validation.errors[0],
    });
    
    // Store Evidence Pack
    storeEvidencePack(pack);
    setEvidencePack(pack);
    
    // Legacy bundle
    newBundle.timestamp = new Date().toISOString();
    
    // Auto-copy
    const copyResult = await copyEvidencePackToClipboard(pack);
    if (!copyResult.success) {
      setShowTextarea(true);
    }
    
    setRunning(false);
    
    if (validation.ok) {
      toast.success(`✅ PROOF GATE PASS - Token: ${pack.proof_token}`);
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
  const recurringIssues = getRecurringIssues(issueCounts);

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
      <PlatformStatusBanner preflightStatus={preflightStatus} />
      
      {/* PROOF TOKEN BANNER */}
      {validationResult && (
        <Card className={validationResult.ok ? "border-green-500 border-2" : "border-destructive border-2"}>
          <CardContent className="py-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                {validationResult.ok ? (
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                ) : (
                  <XCircle className="h-12 w-12 text-destructive" />
                )}
                <div>
                  <div className="text-2xl font-bold">{validationResult.ok ? "✅ PASS" : "❌ FAIL"}</div>
                  <div className="text-sm text-muted-foreground">
                    {validationResult.errors.length} error(s), {validationResult.warnings.length} warning(s)
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Key className="h-4 w-4" />Proof Token
                </div>
                {evidencePack?.proof_token && (
                  <div className="font-mono text-sm bg-muted px-3 py-1 rounded flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    {evidencePack.proof_token}
                    <Button variant="ghost" size="sm" onClick={() => {
                      navigator.clipboard.writeText(evidencePack.proof_token);
                      toast.success("Token copied");
                    }}><Copy className="h-4 w-4" /></Button>
                  </div>
                )}
                {evidencePack?.proof_kernel?.signature && (
                  <div className="flex items-center gap-1 text-xs text-green-600 mt-1">
                    <Lock className="h-3 w-3" />Signed
                  </div>
                )}
              </div>
            </div>
            
            {validationResult.errors.length > 0 && (
              <div className="mt-4 p-3 bg-destructive/10 rounded-lg">
                <div className="text-sm font-medium text-destructive mb-2">Validation Errors (must fix for PASS):</div>
                <ul className="text-sm space-y-1">
                  {validationResult.errors.map((err, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />{err}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {validationResult.warnings.length > 0 && (
              <div className="mt-4 p-3 bg-yellow-500/10 rounded-lg">
                <div className="text-sm font-medium text-yellow-600 mb-2">Warnings:</div>
                <ul className="text-sm space-y-1">
                  {validationResult.warnings.map((warn, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />{warn}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {validationResult.required_actions.length > 0 && (
              <div className="mt-4 p-3 bg-blue-500/10 rounded-lg">
                <div className="text-sm font-medium text-blue-600 mb-2">Required Actions:</div>
                <ul className="text-sm space-y-2">
                  {validationResult.required_actions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5">{i + 1}</Badge>
                      <div>
                        <div className="font-medium">{action.action}</div>
                        <div className="text-xs text-muted-foreground">Location: {action.location}</div>
                      </div>
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
            <Shield className="h-6 w-6" />Proof Gate
            {validationResult && (
              <Badge variant={validationResult.ok ? "default" : "destructive"} className="ml-2">
                {validationResult.ok ? "VALIDATED" : "INVALID"}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            HARD enforcement gate. Uses cryptographic hashing + optional server signing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-4">
            <Button onClick={runProofGate} disabled={running} size="lg" className="bg-primary">
              {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Run Proof Gate
            </Button>
            
            {evidencePack && (
              <>
                <Button variant="outline" onClick={() => copyEvidencePackToClipboard(evidencePack).then(r => {
                  if (!r.success) setShowTextarea(true);
                  else toast.success("Evidence Pack copied");
                })}><Copy className="h-4 w-4 mr-2" />Copy Evidence Pack</Button>
                <Button variant="outline" onClick={() => downloadEvidencePack(evidencePack)}>
                  <Download className="h-4 w-4 mr-2" />Download</Button>
              </>
            )}
            
            <Button variant="ghost" onClick={handleResetCounters}>
              <RotateCcw className="h-4 w-4 mr-2" />Reset Counters
            </Button>
          </div>

          {running && <Progress value={progress} className="h-2" />}

          {evidencePack && evidencePack.runs.length > 0 && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium mb-2">
                <Clock className="h-4 w-4" />Run Log ({evidencePack.runs.length} steps)
              </div>
              <div className="flex gap-1 flex-wrap">
                {evidencePack.runs.map((run, i) => (
                  <Badge key={i} variant={run.ok ? "default" : "destructive"} className="text-xs">
                    {run.tool_id}: {run.duration_ms}ms
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {recurringIssues.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Recurring Issues (2+)</AlertTitle>
              <AlertDescription>
                <div className="flex flex-wrap gap-2 mt-2">
                  {recurringIssues.map(code => (
                    <Badge key={code} variant="destructive">{code} ({issueCounts[code]}x)</Badge>
                  ))}
                </div>
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
                
                <span className={`flex-1 ${step.id === "validation" ? "font-bold" : ""}`}>{step.name}</span>
                
                <Badge variant={
                  step.status === "pass" ? "default" :
                  step.status === "fail" ? "destructive" :
                  step.status === "skip" ? "secondary" : "outline"
                }>{step.status}</Badge>
                
                {step.result && (
                  <span className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {JSON.stringify(step.result).substring(0, 50)}...
                  </span>
                )}
              </div>
            ))}
          </div>

          {showTextarea && evidencePack && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Auto-copy failed. Select and copy manually:</p>
              <Textarea value={JSON.stringify(evidencePack, null, 2)} readOnly className="font-mono text-xs h-96"
                onClick={(e) => (e.target as HTMLTextAreaElement).select()} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
