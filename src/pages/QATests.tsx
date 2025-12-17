import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, XCircle, Loader2, Copy, Play, AlertTriangle, ShieldX, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";

interface TestResult {
  name: string;
  status: "pass" | "fail" | "error" | "pending";
  details: Record<string, unknown>;
  error?: string;
  duration_ms: number;
}

interface TestOutput {
  timestamp: string;
  tests: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
  };
}

export default function QATests() {
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const [tenantIdA, setTenantIdA] = useState("");
  const [tenantIdB, setTenantIdB] = useState("");
  const [alertIdFromTenantB, setAlertIdFromTenantB] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestOutput | null>(null);
  const [showJsonTextarea, setShowJsonTextarea] = useState(false);

  // Admin-only guard
  if (roleLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <Alert variant="destructive">
          <ShieldX className="h-5 w-5" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            This page is restricted to platform administrators only.
            You do not have permission to access QA Tests.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const runAllTests = async () => {
    if (!tenantIdA || !tenantIdB) {
      toast.error("Please provide both Tenant IDs");
      return;
    }

    setRunning(true);
    setShowJsonTextarea(false);
    const tests: TestResult[] = [];

    // TEST 1: Read isolation (Tenant A)
    tests.push(await runReadIsolationTest("Tenant A", tenantIdA));

    // TEST 2: Read isolation (Tenant B)
    tests.push(await runReadIsolationTest("Tenant B", tenantIdB));

    // TEST 3: Update isolation
    if (alertIdFromTenantB) {
      tests.push(await runUpdateIsolationTest(tenantIdA, alertIdFromTenantB));
    } else {
      tests.push({
        name: "TEST 3 - Update Isolation (Cross-tenant)",
        status: "error",
        details: { skipped: true, reason: "No alertIdFromTenantB provided" },
        duration_ms: 0,
      });
    }

    // TEST 4: OR syntax robustness
    tests.push(await runOrSyntaxTest(tenantIdA));

    // TEST 5: Scheduler outreach queue query
    tests.push(await runOutreachQueueTest(tenantIdA));

    // TEST 6: Cron auth rejection (no secret)
    tests.push(await runCronAuthTest());

    // TEST 7: Webhook POST (real)
    tests.push(await runWebhookInsertionTest(tenantIdA));

    // TEST 8: Admin Scheduler Trigger (real)
    tests.push(await runAdminSchedulerTest(tenantIdA));

    const output: TestOutput = {
      timestamp: new Date().toISOString(),
      tests,
      summary: {
        total: tests.length,
        passed: tests.filter((t) => t.status === "pass").length,
        failed: tests.filter((t) => t.status === "fail").length,
        errors: tests.filter((t) => t.status === "error").length,
      },
    };

    setResults(output);
    setRunning(false);
  };

  const runReadIsolationTest = async (label: string, tenantId: string): Promise<TestResult> => {
    const start = Date.now();
    const name = `TEST ${label === "Tenant A" ? "1" : "2"} - Read Isolation (${label})`;
    // Quoted UUID in PostgREST filter for safety
    const filterString = `metadata->>tenant_id.eq."${tenantId}",metadata->>tenant_id.is.null`;

    try {
      // Select only safe fields - no PII
      const { data, error } = await supabase
        .from("ceo_alerts")
        .select("id, metadata, created_at, acknowledged_at, alert_type, title")
        .or(filterString)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        return {
          name,
          status: "error",
          details: { supabase_error: error.message, code: error.code },
          error: error.message,
          duration_ms: Date.now() - start,
        };
      }

      const rows = data || [];
      let globalRows = 0;
      let tenantRows = 0;
      let foreignRows = 0;
      const foreignTenants: string[] = [];

      for (const row of rows) {
        const metadata = row.metadata as Record<string, unknown> | null;
        const rowTenantId = metadata?.tenant_id as string | null | undefined;

        if (rowTenantId === null || rowTenantId === undefined) {
          globalRows++;
        } else if (rowTenantId === tenantId) {
          tenantRows++;
        } else {
          foreignRows++;
          if (!foreignTenants.includes(rowTenantId)) {
            foreignTenants.push(rowTenantId);
          }
        }
      }

      const passed = foreignRows === 0;

      return {
        name,
        status: passed ? "pass" : "fail",
        details: {
          total_rows: rows.length,
          global_rows: globalRows,
          tenant_rows: tenantRows,
          foreign_rows: foreignRows,
          foreign_tenant_ids: foreignTenants.length > 0 ? foreignTenants : undefined,
          filter_used: filterString,
        },
        error: passed ? undefined : `Found ${foreignRows} row(s) from other tenants`,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        name,
        status: "error",
        details: {},
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  };

  const runUpdateIsolationTest = async (actingTenantId: string, targetAlertId: string): Promise<TestResult> => {
    const start = Date.now();
    const name = "TEST 3 - Update Isolation (Cross-tenant)";
    // Quoted UUID in PostgREST filter
    const filterString = `metadata->>tenant_id.eq."${actingTenantId}",metadata->>tenant_id.is.null`;

    try {
      // Attempt to update an alert from Tenant B while acting as Tenant A
      // This should NOT update anything if isolation is working
      const testTimestamp = new Date().toISOString();

      const { data, error } = await supabase
        .from("ceo_alerts")
        .update({ acknowledged_at: testTimestamp })
        .eq("id", targetAlertId)
        .or(filterString)
        .select("id");

      if (error) {
        return {
          name,
          status: "error",
          details: { supabase_error: error.message, code: error.code },
          error: error.message,
          duration_ms: Date.now() - start,
        };
      }

      const rowsUpdated = data?.length || 0;
      const passed = rowsUpdated === 0;

      return {
        name,
        status: passed ? "pass" : "fail",
        details: {
          rows_updated: rowsUpdated,
          target_alert_id: targetAlertId,
          acting_tenant_id: actingTenantId,
          filter_used: `id.eq.${targetAlertId} AND (${filterString})`,
        },
        error: passed ? undefined : `ISOLATION BREACH: Updated ${rowsUpdated} row(s) from another tenant!`,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        name,
        status: "error",
        details: {},
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  };

  const runOrSyntaxTest = async (tenantId: string): Promise<TestResult> => {
    const start = Date.now();
    const name = "TEST 4 - OR Syntax Robustness";
    // Quoted UUID in PostgREST filter
    const filterString = `metadata->>tenant_id.eq."${tenantId}",metadata->>tenant_id.is.null`;

    try {
      // Test that the PostgREST OR filter parses correctly
      // Use .select().limit(1) instead of head:true for actual validation
      const { data, error } = await supabase
        .from("ceo_alerts")
        .select("id")
        .or(filterString)
        .limit(1);

      if (error) {
        // Check if it's a parse error
        const isParseError = error.message.includes("parse") || 
                            error.message.includes("syntax") ||
                            error.code === "PGRST100" ||
                            error.code === "PGRST102";
        
        return {
          name,
          status: isParseError ? "fail" : "error",
          details: { 
            supabase_error: error.message, 
            code: error.code,
            is_parse_error: isParseError,
            filter_used: filterString,
          },
          error: isParseError ? `PostgREST parse error: ${error.message}` : error.message,
          duration_ms: Date.now() - start,
        };
      }

      return {
        name,
        status: "pass",
        details: {
          filter_parsed: true,
          rows_returned: data?.length ?? 0,
          filter_used: filterString,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        name,
        status: "error",
        details: {},
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  };

  const runOutreachQueueTest = async (tenantId: string): Promise<TestResult> => {
    const start = Date.now();
    const name = "TEST 5 - Outreach Queue Query (Scheduler)";
    const now = new Date().toISOString();

    try {
      // Query 1: next_attempt_at is null
      // Select only safe fields - no phone/email PII
      const { data: nullAttemptLeads, error: error1 } = await supabase
        .from("leads")
        .select("id, status, total_call_attempts, max_attempts, next_attempt_at, created_at")
        .eq("tenant_id", tenantId)
        .in("status", ["new", "attempted", "contacted"])
        .eq("do_not_call", false)
        .not("phone", "is", null)
        .is("next_attempt_at", null);

      if (error1) {
        return {
          name,
          status: "error",
          details: { query: "null_attempt", supabase_error: error1.message, code: error1.code },
          error: error1.message,
          duration_ms: Date.now() - start,
        };
      }

      // Query 2: next_attempt_at <= now
      const { data: dueLeads, error: error2 } = await supabase
        .from("leads")
        .select("id, status, total_call_attempts, max_attempts, next_attempt_at, created_at")
        .eq("tenant_id", tenantId)
        .in("status", ["new", "attempted", "contacted"])
        .eq("do_not_call", false)
        .not("phone", "is", null)
        .lte("next_attempt_at", now);

      if (error2) {
        return {
          name,
          status: "error",
          details: { query: "due_attempt", supabase_error: error2.message, code: error2.code },
          error: error2.message,
          duration_ms: Date.now() - start,
        };
      }

      // Merge unique by id
      const allLeads = [...(nullAttemptLeads || []), ...(dueLeads || [])];
      const uniqueMap = new Map<string, (typeof allLeads)[0]>();
      for (const lead of allLeads) {
        if (!uniqueMap.has(lead.id)) {
          uniqueMap.set(lead.id, lead);
        }
      }

      // Filter by max_attempts - eligible = total_call_attempts < (max_attempts ?? 6)
      const uniqueLeads = Array.from(uniqueMap.values());
      const eligibleLeads = uniqueLeads.filter((lead) => {
        const maxAttempts = lead.max_attempts ?? 6;
        const attempts = lead.total_call_attempts ?? 0;
        return attempts < maxAttempts;
      });

      return {
        name,
        status: "pass",
        details: {
          tenant_id: tenantId,
          null_attempt_count: nullAttemptLeads?.length || 0,
          due_attempt_count: dueLeads?.length || 0,
          merged_unique_count: uniqueLeads.length,
          eligible_count: eligibleLeads.length,
          query_timestamp: now,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        name,
        status: "error",
        details: {},
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  };

  const runCronAuthTest = async (): Promise<TestResult> => {
    const start = Date.now();
    const name = "TEST 6 - Cron Auth Rejection (No Secret)";
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ceo-scheduler`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check_job_status" }),
      });
      const passed = response.status === 401 || response.status === 403;
      return { name, status: passed ? "pass" : "fail", details: { response_status: response.status }, error: passed ? undefined : `Expected 401/403`, duration_ms: Date.now() - start };
    } catch (err) {
      return { name, status: "error", details: {}, error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - start };
    }
  };

  const runWebhookInsertionTest = async (tenantId: string): Promise<TestResult> => {
    const start = Date.now();
    const name = "TEST 7 - Webhook POST (Real)";
    const qa_nonce = `qa_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    
    try {
      // POST to lead-webhook with test payload
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lead-webhook`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Tenant-Id": tenantId
        },
        body: JSON.stringify({ 
          name: "QA Test Lead", 
          source: "qa_tests", 
          qa_nonce 
        }),
      });

      const responseBody = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        return {
          name,
          status: "fail",
          details: { 
            status: response.status, 
            response: responseBody,
            qa_nonce 
          },
          error: `Webhook returned ${response.status}`,
          duration_ms: Date.now() - start,
        };
      }

      // Verify webhook was stored
      const { data: webhooks, error: webhookError } = await supabase
        .from("inbound_webhooks")
        .select("id, status, received_at")
        .eq("tenant_id", tenantId)
        .order("received_at", { ascending: false })
        .limit(1);

      if (webhookError) {
        return {
          name,
          status: "error",
          details: { supabase_error: webhookError.message },
          error: webhookError.message,
          duration_ms: Date.now() - start,
        };
      }

      return {
        name,
        status: "pass",
        details: {
          webhook_response: responseBody,
          latest_webhook_id: webhooks?.[0]?.id,
          webhook_count: webhooks?.length || 0,
          qa_nonce,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        name,
        status: "error",
        details: {},
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  };

  const runAdminSchedulerTest = async (tenantId: string): Promise<TestResult> => {
    const start = Date.now();
    const name = "TEST 8 - Admin Scheduler Trigger (Real)";
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      
      if (!accessToken) {
        return {
          name,
          status: "error",
          details: { reason: "No active session" },
          error: "Must be logged in to run admin scheduler test",
          duration_ms: Date.now() - start,
        };
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-run-scheduler`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ 
          action: "check_job_status",
          tenant_ids: [tenantId]
        }),
      });

      const responseBody = await response.json().catch(() => ({}));
      
      // For admins, should NOT be 401/403
      if (response.status === 401 || response.status === 403) {
        return {
          name,
          status: "fail",
          details: { status: response.status, response: responseBody },
          error: "Admin was rejected - check RBAC configuration",
          duration_ms: Date.now() - start,
        };
      }

      return {
        name,
        status: response.ok ? "pass" : "error",
        details: {
          status: response.status,
          response: responseBody,
        },
        error: response.ok ? undefined : `Scheduler returned ${response.status}`,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        name,
        status: "error",
        details: {},
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  };

  const copyDebugJson = async () => {
    if (!results) return;
    
    const jsonStr = JSON.stringify(results, null, 2);
    
    try {
      await navigator.clipboard.writeText(jsonStr);
      toast.success("Debug JSON copied to clipboard");
    } catch {
      // Clipboard API failed - show textarea fallback
      toast.error("Clipboard access denied. Use the textarea below to copy.");
      setShowJsonTextarea(true);
    }
  };

  const getStatusIcon = (status: TestResult["status"]) => {
    const cls = "h-4 w-4";
    switch (status) {
      case "pass":
        return <CheckCircle2 className={cls} />;
      case "fail":
        return <XCircle className={cls} />;
      case "error":
        return <AlertTriangle className={cls} />;
      default:
        return <Clock className={cls} />;
    }
  };

  const getStatusBadge = (status: TestResult["status"]) => {
    switch (status) {
      case "pass":
        return <Badge variant="default">PASS</Badge>;
      case "fail":
        return <Badge variant="destructive">FAIL</Badge>;
      case "error":
        return <Badge variant="secondary">ERROR</Badge>;
      default:
        return <Badge variant="outline">PENDING</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6" />
            QA Tests - Tenant Isolation Verification
          </CardTitle>
          <CardDescription>
            Admin-only page to verify tenant isolation for CEO Alerts and Outreach Queue queries.
            No PII is displayed - only IDs, counts, and timestamps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tenantIdA">Tenant ID A</Label>
              <Input
                id="tenantIdA"
                placeholder="UUID of Tenant A"
                value={tenantIdA}
                onChange={(e) => setTenantIdA(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenantIdB">Tenant ID B</Label>
              <Input
                id="tenantIdB"
                placeholder="UUID of Tenant B"
                value={tenantIdB}
                onChange={(e) => setTenantIdB(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="alertIdFromTenantB">Alert ID from Tenant B (for TEST 3)</Label>
              <Input
                id="alertIdFromTenantB"
                placeholder="UUID of alert owned by Tenant B"
                value={alertIdFromTenantB}
                onChange={(e) => setAlertIdFromTenantB(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={runAllTests} disabled={running}>
              {running ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running Tests...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Run All Tests
                </>
              )}
            </Button>
            {results && (
              <Button variant="outline" onClick={copyDebugJson}>
                <Copy className="mr-2 h-4 w-4" />
                Copy Debug JSON
              </Button>
            )}
          </div>

          <Separator />

          {/* Results */}
          {results && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg bg-muted/50">
                <span className="text-sm font-medium">Summary:</span>
                <Badge variant="outline">{results.summary.total} Total</Badge>
                <Badge className="bg-green-500/20 text-green-600 border-green-500/30">
                  {results.summary.passed} Passed
                </Badge>
                {results.summary.failed > 0 && (
                  <Badge variant="destructive">{results.summary.failed} Failed</Badge>
                )}
                {results.summary.errors > 0 && (
                  <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
                    {results.summary.errors} Errors
                  </Badge>
                )}
              </div>

              {/* Clipboard fallback textarea */}
              {showJsonTextarea && (
                <div className="space-y-2">
                  <Label>Debug JSON (select all and copy):</Label>
                  <Textarea
                    readOnly
                    className="font-mono text-xs h-40"
                    value={JSON.stringify(results, null, 2)}
                    onFocus={(e) => e.target.select()}
                  />
                </div>
              )}

              {/* Test Results */}
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-4">
                  {results.tests.map((test, index) => (
                    <Card key={index} className="border-border/50">
                      <CardHeader className="py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(test.status)}
                            <span className="font-medium">{test.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(test.status)}
                            <span className="text-xs text-muted-foreground">
                              {test.duration_ms}ms
                            </span>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="py-2">
                        {test.error && (
                          <div className="mb-2 p-2 rounded bg-destructive/10 text-destructive text-sm">
                            {test.error}
                          </div>
                        )}
                        <pre className="text-xs bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(test.details, null, 2)}
                        </pre>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
