/**
 * Ops Center - Central cockpit for all diagnostics
 * 
 * Features:
 * - Quick Run: Proof Gate, Evidence Pack, FS Reality Check
 * - Build Proof: Manual paste for build output
 * - Claim Log: Track prior claims for contradiction detection
 * - Results: View FS check + Evidence Pack
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { 
  Shield, Play, Copy, Download, FileJson, Terminal, 
  AlertTriangle, CheckCircle2, Trash2, Save, Clock,
  Zap, Eye, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { PlatformStatusBanner } from "@/components/platform/PlatformStatusBanner";
import {
  runFSRealityCheck,
  loadStoredFSRealityCheck,
  saveBuildOutput,
  loadBuildOutput,
  clearBuildOutput,
  getBuildOutputMeta,
  saveClaimLog,
  loadClaimLog,
  clearClaimLog,
  FSRealityCheckResult,
} from "@/lib/fsRealityCheck";
import {
  loadStoredEvidencePack,
  copyEvidencePackToClipboard,
  downloadEvidencePack,
  EvidencePack,
} from "@/lib/evidencePack";

export default function OpsCenter() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOwner, isAdmin, isLoading } = useUserRole();
  
  // FS Reality Check state
  const [fsResult, setFsResult] = useState<FSRealityCheckResult | null>(null);
  const [isRunningFS, setIsRunningFS] = useState(false);
  
  // Evidence Pack state
  const [evidencePack, setEvidencePack] = useState<EvidencePack | null>(null);
  
  // Build output state
  const [buildOutputText, setBuildOutputText] = useState("");
  const [buildOutputMeta, setBuildOutputMeta] = useState<{ timestamp: string; length: number } | null>(null);
  
  // Claim log state
  const [claimLogText, setClaimLogText] = useState("");
  
  // JSON display
  const [showFsJson, setShowFsJson] = useState(false);
  
  // Load stored data on mount
  useEffect(() => {
    const storedFS = loadStoredFSRealityCheck();
    if (storedFS) setFsResult(storedFS);
    
    const storedPack = loadStoredEvidencePack();
    if (storedPack) setEvidencePack(storedPack);
    
    const storedBuild = loadBuildOutput();
    setBuildOutputText(storedBuild);
    setBuildOutputMeta(getBuildOutputMeta());
    
    const storedClaim = loadClaimLog();
    setClaimLogText(storedClaim);
  }, []);
  
  // Run FS Reality Check
  const handleRunFSCheck = async () => {
    setIsRunningFS(true);
    try {
      const result = await runFSRealityCheck();
      setFsResult(result);
      
      if (result.all_imports_ok) {
        toast.success("FS Reality Check PASS - All imports OK");
      } else {
        toast.error(`FS Reality Check FAIL - ${result.failed_imports.length} import(s) failed`);
      }
    } catch (err) {
      toast.error("FS Reality Check failed: " + String(err));
    } finally {
      setIsRunningFS(false);
    }
  };
  
  // Save build output
  const handleSaveBuildOutput = () => {
    saveBuildOutput(buildOutputText);
    setBuildOutputMeta(getBuildOutputMeta());
    toast.success("Build output saved");
  };
  
  // Clear build output
  const handleClearBuildOutput = () => {
    clearBuildOutput();
    setBuildOutputText("");
    setBuildOutputMeta(null);
    toast.success("Build output cleared");
  };
  
  // Save claim log
  const handleSaveClaimLog = () => {
    saveClaimLog(claimLogText);
    toast.success("Claim log saved");
  };
  
  // Clear claim log
  const handleClearClaimLog = () => {
    clearClaimLog();
    setClaimLogText("");
    toast.success("Claim log cleared");
  };
  
  // Copy FS result JSON
  const handleCopyFsJson = async () => {
    if (!fsResult) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(fsResult, null, 2));
      toast.success("FS Reality Check JSON copied");
    } catch {
      setShowFsJson(true);
      toast.info("Copy from textarea below");
    }
  };
  
  // Download FS result JSON
  const handleDownloadFsJson = () => {
    if (!fsResult) return;
    const blob = new Blob([JSON.stringify(fsResult, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fs-reality-check-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Downloaded");
  };
  
  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <Card>
          <CardContent className="py-8 text-center">
            <div className="animate-pulse">Loading Ops Center...</div>
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
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Terminal className="h-6 w-6" />
            Ops Center
          </CardTitle>
          <CardDescription>
            Central cockpit for diagnostics, proof verification, and contradiction detection.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">User:</span>
              <Badge variant="outline">{user?.id?.substring(0, 8) || "(none)"}...</Badge>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Role:</span>
              {isAdmin && <Badge className="bg-red-500">Admin</Badge>}
              {isOwner && !isAdmin && <Badge className="bg-blue-500">Owner</Badge>}
              {!isAdmin && !isOwner && <Badge variant="secondary">Authenticated</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Run Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Quick Run
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          <Button onClick={() => navigate("/platform/proof-gate")} className="gap-2">
            <Shield className="h-4 w-4" />
            Run Proof Gate
          </Button>
          <Button variant="outline" onClick={() => navigate("/platform/tools")} className="gap-2">
            <FileJson className="h-4 w-4" />
            Run Evidence Pack
          </Button>
          <Button 
            variant="outline" 
            onClick={handleRunFSCheck}
            disabled={isRunningFS}
            className="gap-2"
          >
            {isRunningFS ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            Run FS Reality Check
          </Button>
          <Button variant="outline" onClick={() => navigate("/platform/vibes")} className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Vibes Inspector
          </Button>
          <Button variant="outline" onClick={() => navigate("/platform/route-nav-auditor")} className="gap-2">
            Route & Nav Auditor
          </Button>
        </CardContent>
      </Card>

      {/* FS Reality Check Results */}
      {fsResult && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Eye className="h-5 w-5" />
                FS Reality Check Results
                {fsResult.all_imports_ok ? (
                  <Badge className="bg-green-500">PASS</Badge>
                ) : (
                  <Badge variant="destructive">FAIL</Badge>
                )}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyFsJson}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy JSON
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadFsJson}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
            <CardDescription>
              Last run: {new Date(fsResult.timestamp).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Import Checks Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className={`text-lg font-bold ${fsResult.all_imports_ok ? 'text-green-500' : 'text-red-500'}`}>
                  {fsResult.import_checks.filter(c => c.ok).length}/{fsResult.import_checks.length}
                </div>
                <div className="text-xs text-muted-foreground">Imports OK</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-lg font-bold">{fsResult.critical_paths.length}</div>
                <div className="text-xs text-muted-foreground">Critical Paths</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className={`text-lg font-bold ${fsResult.env.supabase_url_present ? 'text-green-500' : 'text-yellow-500'}`}>
                  {fsResult.env.supabase_url_present ? "✓" : "✗"}
                </div>
                <div className="text-xs text-muted-foreground">Supabase URL</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className={`text-lg font-bold ${fsResult.build_output_present ? 'text-green-500' : 'text-yellow-500'}`}>
                  {fsResult.build_output_present ? "✓" : "✗"}
                </div>
                <div className="text-xs text-muted-foreground">Build Output</div>
              </div>
            </div>
            
            {/* Failed Imports Alert */}
            {fsResult.failed_imports.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Failed Imports</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4 mt-2">
                    {fsResult.import_checks.filter(c => !c.ok).map((check, i) => (
                      <li key={i}>
                        <code>{check.specifier}</code>: {check.error_message}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            
            {/* Success Alert */}
            {fsResult.all_imports_ok && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>All Imports OK</AlertTitle>
                <AlertDescription>
                  All {fsResult.import_checks.length} critical modules imported successfully.
                </AlertDescription>
              </Alert>
            )}
            
            {/* Import Check Details */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Import Checks:</h4>
              <div className="grid gap-2">
                {fsResult.import_checks.map((check, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm p-2 bg-muted/30 rounded">
                    {check.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                    <code className="flex-1">{check.specifier}</code>
                    <Badge variant={check.ok ? "default" : "destructive"} className="text-xs">
                      {check.ok ? "OK" : "FAIL"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Raw JSON */}
            {showFsJson && (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground mb-2">Copy from below:</p>
                <Textarea 
                  value={JSON.stringify(fsResult, null, 2)} 
                  readOnly 
                  className="font-mono text-xs h-64"
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Build Proof Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Build Proof (Manual Paste)
          </CardTitle>
          <CardDescription>
            Paste raw build/compile output here for evidence capture.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Paste build output here (e.g., vite build, tsc output, error logs)..."
            value={buildOutputText}
            onChange={(e) => setBuildOutputText(e.target.value)}
            className="font-mono text-xs h-40"
          />
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button onClick={handleSaveBuildOutput} size="sm" className="gap-2">
                <Save className="h-4 w-4" />
                Save
              </Button>
              <Button variant="outline" onClick={handleClearBuildOutput} size="sm" className="gap-2">
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            </div>
            {buildOutputMeta && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Saved: {new Date(buildOutputMeta.timestamp).toLocaleString()} ({buildOutputMeta.length} chars)
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Claim Log Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            Claim Log (For Contradiction Detection)
          </CardTitle>
          <CardDescription>
            Paste prior claims or assistant statements here. Used by Proof Gate to detect contradictions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder='Paste claims here (e.g., "The file src/lib/evidencePack.ts does not exist")...'
            value={claimLogText}
            onChange={(e) => setClaimLogText(e.target.value)}
            className="font-mono text-xs h-32"
          />
          <div className="flex gap-2">
            <Button onClick={handleSaveClaimLog} size="sm" className="gap-2">
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button variant="outline" onClick={handleClearClaimLog} size="sm" className="gap-2">
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Evidence Pack Summary with Proof Token */}
      {evidencePack && (
        <Card className={evidencePack.validation_result?.ok ? "border-green-500" : evidencePack.validation_result ? "border-destructive" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileJson className="h-5 w-5" />
                Last Evidence Pack
                {evidencePack.validation_result && (
                  <Badge variant={evidencePack.validation_result.ok ? "default" : "destructive"}>
                    {evidencePack.validation_result.ok ? "PASS" : "FAIL"}
                  </Badge>
                )}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => copyEvidencePackToClipboard(evidencePack).then(r => { if (r.success) toast.success("Copied!"); })}>
                  <Copy className="h-4 w-4 mr-2" />Copy
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadEvidencePack(evidencePack)}>
                  <Download className="h-4 w-4 mr-2" />Download
                </Button>
              </div>
            </div>
            <CardDescription>Last run: {new Date(evidencePack.timestamp).toLocaleString()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Proof Token Display */}
            {evidencePack.proof_token && (
              <div className="p-3 bg-muted rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Proof Token:</span>
                  <code className="font-mono text-sm bg-background px-2 py-1 rounded">{evidencePack.proof_token}</code>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(evidencePack.proof_token); toast.success("Token copied"); }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            )}
            {/* Run History */}
            {evidencePack.runs && evidencePack.runs.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium flex items-center gap-2"><Clock className="h-4 w-4" />Run History ({evidencePack.runs.length} steps)</div>
                <div className="flex gap-1 flex-wrap">
                  {evidencePack.runs.map((run, i) => (
                    <Badge key={i} variant={run.ok ? "default" : "destructive"} className="text-xs">{run.tool_id}: {run.duration_ms}ms</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className={`text-lg font-bold ${evidencePack.fs_reality_check?.all_imports_ok ? 'text-green-500' : 'text-yellow-500'}`}>
                  {evidencePack.fs_reality_check ? (evidencePack.fs_reality_check.all_imports_ok ? "✓" : "✗") : "—"}
                </div>
                <div className="text-xs text-muted-foreground">FS Check</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Alert */}
      <Alert>
        <Terminal className="h-4 w-4" />
        <AlertTitle>About Ops Center</AlertTitle>
        <AlertDescription>
          This cockpit centralizes all diagnostics. Run FS Reality Check to verify modules exist.
          Use Build Proof to paste compilation output. Use Claim Log to track statements for contradiction detection.
          The Proof Gate will automatically detect contradictions between claims and reality.
        </AlertDescription>
      </Alert>
    </div>
  );
}
