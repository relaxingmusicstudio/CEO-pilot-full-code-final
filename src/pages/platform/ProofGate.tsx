import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Loader2, Copy, Download, Play, AlertTriangle, Shield, Zap } from "lucide-react";
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
  downloadBundle 
} from "@/lib/supportBundle";
import { platformTools, getVisibleTools, getAllPlatformRoutes } from "@/lib/toolRegistry";
import { getRouteAccessPolicies } from "@/lib/routeConfig";
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
  const { role, isOwner, isAdmin } = useUserRole();
  
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Step[]>([
    { id: "db_doctor", name: "DB Doctor (qa_dependency_check)", status: "pending" },
    { id: "edge_preflight", name: "Edge Preflight (lead-normalize)", status: "pending" },
    { id: "normalize_test", name: "Normalize Sample Test", status: "pending" },
    { id: "route_audit", name: "Route & Nav Audit", status: "pending" },
    { id: "audit_logs", name: "Fetch Recent Audit Logs", status: "pending" },
    { id: "bundle", name: "Compose Support Bundle", status: "pending" },
  ]);
  const [bundle, setBundle] = useState<SupportBundle | null>(null);
  const [showTextarea, setShowTextarea] = useState(false);
  const [preflightStatus, setPreflightStatus] = useState<PreflightReport | null>(null);
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const edgeBaseUrl = `${supabaseUrl}/functions/v1`;

  const updateStep = (id: string, update: Partial<Step>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...update } : s));
  };

  const runProofGate = async () => {
    setRunning(true);
    setShowTextarea(false);
    setSteps(steps.map(s => ({ ...s, status: "pending", result: undefined, error: undefined })));
    
    const newBundle = createEmptyBundle();
    newBundle.user_id = user?.id || null;
    newBundle.role = role || null;
    newBundle.isOwner = isOwner ?? false;
    newBundle.isAdmin = isAdmin ?? false;
    
    // Fetch tenant IDs
    try {
      const { data: tenants } = await supabase.from("tenants").select("id").limit(5);
      newBundle.tenant_ids = tenants?.map(t => t.id) || [];
    } catch {}
    
    // Fetch counts
    try {
      const [alertsRes, profilesRes] = await Promise.all([
        supabase.from("ceo_alerts").select("*", { count: "exact", head: true }),
        supabase.from("lead_profiles").select("*", { count: "exact", head: true }),
      ]);
      newBundle.ceo_alerts_count = alertsRes.count ?? 0;
      newBundle.lead_profiles_count = profilesRes.count ?? 0;
    } catch {}

    // Step 1: DB Doctor
    updateStep("db_doctor", { status: "running" });
    try {
      const { data, error } = await (supabase.rpc as any)("qa_dependency_check");
      if (error) throw error;
      newBundle.db_doctor_report = data;
      updateStep("db_doctor", { status: data?.ok ? "pass" : "fail", result: data });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      updateStep("db_doctor", { status: "fail", error: errMsg });
      newBundle.db_doctor_report = { ok: false, error: errMsg };
    }

    // Step 2: Edge Preflight
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

    // Step 3: Normalize Sample (only if deps OK)
    const depsOk = newBundle.db_doctor_report?.ok && newBundle.edge_preflight?.ok;
    if (depsOk && newBundle.tenant_ids.length > 0) {
      updateStep("normalize_test", { status: "running" });
      try {
        const { data: session } = await supabase.auth.getSession();
        const accessToken = session?.session?.access_token;
        
        const response = await fetch(`${edgeBaseUrl}/lead-normalize`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { "Authorization": `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            tenant_id: newBundle.tenant_ids[0],
            lead: {
              email: `proof_gate_${Date.now()}@test.local`,
              phone: "5550000001",
              source: "proof_gate",
            },
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
          newBundle.last_edge_error = data;
        }
        newBundle.edge_console_runs.push({
          timestamp: new Date().toISOString(),
          function_name: "lead-normalize",
          request: { method: "POST", headers: {}, body: { tenant_id: "...", lead: "..." } },
          response: { status: response.status, headers: {}, body: data },
          duration_ms: data.duration_ms || 0,
        });
        updateStep("normalize_test", { status: response.ok && data.ok ? "pass" : "fail", result: data });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        updateStep("normalize_test", { status: "fail", error: errMsg });
        newBundle.last_edge_error = { error: errMsg };
      }
    } else {
      updateStep("normalize_test", { status: "skip", result: { reason: "Dependencies not OK or no tenants" } });
    }

    // Step 4: Route & Nav Audit
    updateStep("route_audit", { status: "running" });
    try {
      const roleContext = {
        isAdmin: isAdmin ?? false,
        isOwner: isOwner ?? false,
        isClient: false,
        isAuthenticated: true,
      };
      
      const registryRoutes = getAllPlatformRoutes();
      const visibleTools = getVisibleTools(roleContext);
      const navRoutes = getNavRoutesForRole(roleContext);
      const routePolicies = getRouteAccessPolicies();
      
      // Run basic audit checks
      const auditFindings: Array<{ severity: string; issue_code: string; tool_id: string; route: string; description: string }> = [];
      
      for (const tool of platformTools) {
        if (tool.id === "tools-hub") continue;
        const isVisibleInToolsHub = visibleTools.some(t => t.id === tool.id);
        const shouldBeVisible = (
          (tool.requires === "authenticated") ||
          (tool.requires === "owner" && (roleContext.isOwner || roleContext.isAdmin)) ||
          (tool.requires === "admin" && roleContext.isAdmin)
        );
        
        if (shouldBeVisible && !isVisibleInToolsHub) {
          auditFindings.push({
            severity: "warning",
            issue_code: "tools_hub_missing",
            tool_id: tool.id,
            route: tool.route,
            description: `Tool "${tool.name}" should be visible but is not`,
          });
        }
      }
      
      newBundle.route_nav_audit = {
        summary: {
          critical: auditFindings.filter(f => f.severity === "critical").length,
          warning: auditFindings.filter(f => f.severity === "warning").length,
          passed: platformTools.length - auditFindings.length,
          total_tools: platformTools.length,
        },
        findings: auditFindings,
        counters: {},
      };
      
      updateStep("route_audit", { 
        status: auditFindings.length === 0 ? "pass" : "fail", 
        result: { findings_count: auditFindings.length } 
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      updateStep("route_audit", { status: "fail", error: errMsg });
    }

    // Step 5: Audit Logs
    updateStep("audit_logs", { status: "running" });
    try {
      const { data: logs, error } = await supabase
        .from("platform_audit_log")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(20);
      if (error) throw error;
      newBundle.recent_audit_logs = logs || [];
      updateStep("audit_logs", { status: "pass", result: { count: logs?.length || 0 } });
    } catch (err) {
      updateStep("audit_logs", { status: "skip", error: "No access to audit logs" });
    }

    // Step 5: Compose Bundle
    updateStep("bundle", { status: "running" });
    
    // Determine human actions required
    if ((newBundle.db_doctor_report?.suspect_count ?? 0) > 0) {
      newBundle.human_actions_required.push({
        action: "Run Fix SQL in Supabase",
        location: "Supabase Dashboard → SQL Editor",
        value: newBundle.db_doctor_report?.suspects?.map(s => s.fix_sql).join("\n\n"),
      });
    }
    
    newBundle.timestamp = new Date().toISOString();
    setBundle(newBundle);
    
    const result = await copyBundleToClipboard(newBundle);
    if (!result.success) {
      setShowTextarea(true);
    }
    
    updateStep("bundle", { status: "pass" });
    setRunning(false);
    toast.success("Proof Gate complete! Bundle copied.");
  };

  const progress = (steps.filter(s => s.status !== "pending").length / steps.length) * 100;
  const hasBlockers = preflightStatus && (!preflightStatus.ok || (preflightStatus.suspect_count ?? 0) > 0);
  const allPass = steps.every(s => s.status === "pass" || s.status === "skip");

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
            One-click diagnostic that runs checks, captures evidence, and copies the Support Bundle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex gap-4">
            <Button 
              onClick={runProofGate} 
              disabled={running}
              size="lg"
              className="bg-primary"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Run Proof Gate
            </Button>
            
            {bundle && (
              <>
                <Button variant="outline" onClick={() => copyBundleToClipboard(bundle).then(r => {
                  if (!r.success) setShowTextarea(true);
                  else toast.success("Bundle copied");
                })}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Bundle
                </Button>
                <Button variant="outline" onClick={() => downloadBundle(bundle)}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Bundle
                </Button>
              </>
            )}
          </div>

          {running && <Progress value={progress} className="h-2" />}

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

          {!running && allPass && bundle && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>✅ Proof Gate PASS</AlertTitle>
              <AlertDescription>
                All checks passed. Bundle has been copied to clipboard.
              </AlertDescription>
            </Alert>
          )}

          {bundle?.human_actions_required && bundle.human_actions_required.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Human Action Required</AlertTitle>
              <AlertDescription>
                {bundle.human_actions_required.map((action, i) => (
                  <div key={i} className="mt-2 p-2 bg-muted rounded">
                    <strong>{action.action}</strong>
                    <div className="text-sm text-muted-foreground">{action.location}</div>
                  </div>
                ))}
              </AlertDescription>
            </Alert>
          )}

          {showTextarea && bundle && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Clipboard access denied. Copy from below:</p>
              <Textarea 
                value={JSON.stringify(bundle, null, 2)} 
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
