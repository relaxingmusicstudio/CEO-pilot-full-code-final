/**
 * ToolsHub - Central Platform Tools Dashboard
 * Always reachable at /platform/tools
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  Copy, Download, Wrench, Shield, CheckCircle2, XCircle, 
  AlertTriangle, Clock, ExternalLink, Play, Info
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { PlatformStatusBanner } from "@/components/platform/PlatformStatusBanner";
import { IssuePanel, BlockerItem } from "@/components/platform/IssuePanel";
import { platformTools, getToolsForAccessLevel, PlatformTool } from "@/lib/toolRegistry";
import { 
  SupportBundle, 
  createEmptyBundle, 
  copyBundleToClipboard, 
  downloadBundle 
} from "@/lib/supportBundle";

interface ToolRunResult {
  toolId: string;
  timestamp: string;
  status: "pass" | "fail" | "skip";
  message?: string;
}

export default function ToolsHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { role, isOwner, isAdmin, isLoading } = useUserRole();
  
  const [toolRuns, setToolRuns] = useState<ToolRunResult[]>([]);
  const [blockers, setBlockers] = useState<BlockerItem[]>([]);
  const [tenantIds, setTenantIds] = useState<string[]>([]);
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "(not set)";
  const edgeBaseUrl = supabaseUrl !== "(not set)" ? `${supabaseUrl}/functions/v1` : "(not set)";
  
  // Fetch tenant IDs on mount
  useEffect(() => {
    async function fetchTenants() {
      try {
        const { data } = await supabase.from("tenants").select("id").limit(5);
        setTenantIds(data?.map(t => t.id) || []);
      } catch {}
    }
    fetchTenants();
  }, []);

  const availableTools = getToolsForAccessLevel(isAdmin ?? false, isOwner ?? false);

  const copyAllContext = () => {
    const context = {
      timestamp: new Date().toISOString(),
      user_id: user?.id?.substring(0, 8) + "...",
      role,
      isOwner,
      isAdmin,
      supabase_url: supabaseUrl,
      edge_base_url: edgeBaseUrl,
      tenant_ids: tenantIds,
      available_tools: availableTools.map(t => ({ id: t.id, route: t.route })),
    };
    navigator.clipboard.writeText(JSON.stringify(context, null, 2));
    toast.success("Context copied to clipboard");
  };

  const downloadEvidencePack = async () => {
    const bundle = createEmptyBundle();
    bundle.user_id = user?.id || null;
    bundle.role = role || null;
    bundle.isOwner = isOwner ?? false;
    bundle.isAdmin = isAdmin ?? false;
    bundle.tenant_ids = tenantIds;
    
    // Add tool runs
    (bundle as any).tool_runs = toolRuns;
    (bundle as any).ui_version = "1.0.0";
    (bundle as any).current_route = window.location.pathname;
    (bundle as any).timestamp_local = new Date().toLocaleString();
    
    downloadBundle(bundle);
    toast.success("Evidence pack downloaded");
  };

  const getRunResult = (toolId: string): ToolRunResult | undefined => {
    return toolRuns.find(r => r.toolId === toolId);
  };

  const getCategoryTools = (category: PlatformTool["category"]) => {
    return availableTools.filter(t => t.category === category && t.id !== "tools-hub");
  };

  const handleToolRerun = (toolId: string) => {
    const tool = platformTools.find(t => t.id === toolId);
    if (tool) {
      navigate(tool.route);
    }
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
              <Button variant="outline" size="sm" onClick={copyAllContext}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Context
              </Button>
              <Button variant="outline" size="sm" onClick={downloadEvidencePack}>
                <Download className="h-4 w-4 mr-2" />
                Evidence Pack
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Capabilities Panel */}
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Access Level:</span>
              {isAdmin && <Badge className="bg-red-500">Admin</Badge>}
              {isOwner && <Badge className="bg-blue-500">Owner</Badge>}
              {!isAdmin && !isOwner && <Badge variant="secondary">Standard</Badge>}
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="text-sm text-muted-foreground">
              {availableTools.length} tools available
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="text-xs text-muted-foreground font-mono">
              user: {user?.id?.substring(0, 8)}...
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Blockers Panel */}
      {blockers.length > 0 && (
        <IssuePanel 
          blockers={blockers} 
          onRerun={handleToolRerun}
          onMarkComplete={(id, completed) => {
            if (completed) {
              setBlockers(prev => prev.filter(b => b.id !== id));
            }
          }}
        />
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
          <Button variant="outline" onClick={() => navigate("/platform/db-doctor")} className="gap-2">
            Run DB Doctor
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
                  const runResult = getRunResult(tool.id);
                  
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
                        {tool.canRunInline && runResult && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(runResult, null, 2));
                              toast.success("Evidence copied");
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
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
        <AlertTitle>About Platform Tools</AlertTitle>
        <AlertDescription className="text-sm">
          These tools help diagnose issues, configure the platform, and generate evidence for debugging.
          Tools marked with access requirements need elevated permissions.
          Use "Evidence Pack" to download a complete diagnostic bundle.
        </AlertDescription>
      </Alert>
    </div>
  );
}
