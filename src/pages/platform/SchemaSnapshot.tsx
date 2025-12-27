/**
 * Schema Snapshot Viewer - Read-only visibility into table/RPC access
 * Safe diagnostic tool - no destructive operations
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  Table, Database, CheckCircle2, XCircle, Loader2, 
  RefreshCw, Copy, AlertTriangle, Info
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database as SupabaseDatabase } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { PlatformStatusBanner } from "@/components/platform/PlatformStatusBanner";

interface TableCheck {
  name: string;
  canSelect: boolean | null;
  count: number | null;
  error?: string;
  checking: boolean;
}

interface RpcCheck {
  name: string;
  canCall: boolean | null;
  error?: string;
  checking: boolean;
}

const CORE_TABLES = [
  "tenants",
  "ceo_alerts",
  "lead_profiles",
  "leads",
  "platform_audit_log",
  "action_queue",
  "user_roles",
  "business_profile",
];

const CORE_RPCS = [
  "qa_dependency_check",
  "qa_seed_ceo_alerts",
  "qa_seed_minimal_lead_data",
  "normalize_lead_atomic",
  "compute_lead_fingerprint",
];

export default function SchemaSnapshot() {
  const [tables, setTables] = useState<TableCheck[]>(
    CORE_TABLES.map(name => ({ name, canSelect: null, count: null, checking: false }))
  );
  const [rpcs, setRpcs] = useState<RpcCheck[]>(
    CORE_RPCS.map(name => ({ name, canCall: null, checking: false }))
  );
  const [running, setRunning] = useState(false);

  const checkTable = async (tableName: string): Promise<Partial<TableCheck>> => {
    try {
      const tableKey = tableName as keyof SupabaseDatabase["public"]["Tables"];
      const { count, error } = await supabase
        .from(tableKey)
        .select("*", { count: "exact", head: true });
      
      if (error) {
        return { canSelect: false, error: error.message };
      }
      return { canSelect: true, count: count ?? 0 };
    } catch (err) {
      return { canSelect: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  };

  const checkRpc = async (rpcName: string): Promise<Partial<RpcCheck>> => {
    try {
      // Try calling with empty/null params - this tests if RPC exists and is callable
      const runRpc = (fn: string, args?: Record<string, unknown>) =>
        supabase.rpc(fn, args) as unknown as Promise<{ error: { code?: string; message?: string } | null }>;
      const { error } = await runRpc(rpcName, {});
      
      // Some RPCs might fail due to missing params but still be callable
      if (error) {
        // 42883 = function does not exist
        // 42501 = permission denied
        if (error.code === "42883") {
          return { canCall: false, error: "Function does not exist" };
        }
        if (error.code === "42501") {
          return { canCall: false, error: "Permission denied" };
        }
        // Other errors mean function exists but had param issues - that's OK
        return { canCall: true, error: `Callable (${error.message.substring(0, 50)})` };
      }
      return { canCall: true };
    } catch (err) {
      return { canCall: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  };

  const runAllChecks = async () => {
    setRunning(true);
    
    // Check tables
    setTables(prev => prev.map(t => ({ ...t, checking: true })));
    
    const tableResults = await Promise.all(
      CORE_TABLES.map(async (name) => {
        const result = await checkTable(name);
        return { name, ...result, checking: false };
      })
    );
    setTables(tableResults as TableCheck[]);
    
    // Check RPCs
    setRpcs(prev => prev.map(r => ({ ...r, checking: true })));
    
    const rpcResults = await Promise.all(
      CORE_RPCS.map(async (name) => {
        const result = await checkRpc(name);
        return { name, ...result, checking: false };
      })
    );
    setRpcs(rpcResults as RpcCheck[]);
    
    setRunning(false);
    toast.success("Schema check complete");
  };

  const copySnapshot = () => {
    const snapshot = {
      timestamp: new Date().toISOString(),
      tables: tables.map(t => ({
        name: t.name,
        canSelect: t.canSelect,
        count: t.count,
        error: t.error,
      })),
      rpcs: rpcs.map(r => ({
        name: r.name,
        canCall: r.canCall,
        error: r.error,
      })),
    };
    navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    toast.success("Snapshot copied to clipboard");
  };

  const tablesOk = tables.filter(t => t.canSelect === true).length;
  const tablesFailed = tables.filter(t => t.canSelect === false).length;
  const rpcsOk = rpcs.filter(r => r.canCall === true).length;
  const rpcsFailed = rpcs.filter(r => r.canCall === false).length;

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
      <PlatformStatusBanner />
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-6 w-6" />
                Schema Snapshot
              </CardTitle>
              <CardDescription>
                Read-only view of table access and RPC availability
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copySnapshot}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Snapshot
              </Button>
              <Button onClick={runAllChecks} disabled={running}>
                {running ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Run Checks
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary */}
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Table className="h-4 w-4" />
              <span className="text-sm">Tables:</span>
              {tablesOk > 0 && <Badge className="bg-green-500">{tablesOk} OK</Badge>}
              {tablesFailed > 0 && <Badge variant="destructive">{tablesFailed} Failed</Badge>}
              {tablesOk === 0 && tablesFailed === 0 && <Badge variant="secondary">Not checked</Badge>}
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span className="text-sm">RPCs:</span>
              {rpcsOk > 0 && <Badge className="bg-green-500">{rpcsOk} OK</Badge>}
              {rpcsFailed > 0 && <Badge variant="destructive">{rpcsFailed} Failed</Badge>}
              {rpcsOk === 0 && rpcsFailed === 0 && <Badge variant="secondary">Not checked</Badge>}
            </div>
          </div>

          {/* Tables Section */}
          <div>
            <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-3">
              Core Tables
            </h3>
            <div className="space-y-2">
              {tables.map(table => (
                <div 
                  key={table.name}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    {table.checking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {!table.checking && table.canSelect === true && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {!table.checking && table.canSelect === false && <XCircle className="h-4 w-4 text-red-500" />}
                    {!table.checking && table.canSelect === null && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
                    <code className="text-sm">{table.name}</code>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {table.count !== null && (
                      <Badge variant="outline">{table.count} rows</Badge>
                    )}
                    {table.error && (
                      <span className="text-xs text-destructive max-w-[200px] truncate">
                        {table.error}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* RPCs Section */}
          <div>
            <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-3">
              Core RPCs
            </h3>
            <div className="space-y-2">
              {rpcs.map(rpc => (
                <div 
                  key={rpc.name}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    {rpc.checking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {!rpc.checking && rpc.canCall === true && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {!rpc.checking && rpc.canCall === false && <XCircle className="h-4 w-4 text-red-500" />}
                    {!rpc.checking && rpc.canCall === null && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
                    <code className="text-sm">{rpc.name}()</code>
                  </div>
                  <div className="text-sm">
                    {rpc.error && (
                      <span className={`text-xs max-w-[250px] truncate ${rpc.canCall ? 'text-muted-foreground' : 'text-destructive'}`}>
                        {rpc.error}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Issues Alert */}
          {(tablesFailed > 0 || rpcsFailed > 0) && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Access Issues Detected</AlertTitle>
              <AlertDescription className="text-sm">
                Some tables or RPCs are not accessible. This may be due to:
                <ul className="list-disc pl-4 mt-2">
                  <li>Missing RLS policies</li>
                  <li>Insufficient user permissions</li>
                  <li>Missing database objects</li>
                </ul>
                Visit <strong>DB Doctor</strong> to generate fix SQL, or request admin access.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>About Schema Snapshot</AlertTitle>
        <AlertDescription className="text-sm">
          This tool performs read-only checks to verify your access to core tables and functions.
          No data is modified. Use this to quickly identify permission issues.
        </AlertDescription>
      </Alert>
    </div>
  );
}
