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

    // TEST 6: Scheduler Health Check (should work without auth)
    tests.push(await runSchedulerHealthTest());

    // TEST 7: Cron auth rejection (no secret)
    tests.push(await runCronAuthTest());

    // TEST 8: Webhook POST (real)
    tests.push(await runWebhookInsertionTest(tenantIdA));

    // TEST 9: Admin Scheduler Trigger (real)
    tests.push(await runAdminSchedulerTest(tenantIdA));

    // TEST 10: PG_NET Reconciliation Proof
    tests.push(await runReconciliationProofTest());

    // Schema sanity check before lead normalization tests
    const schemaCheck = await runSchemaSanityCheck();
    tests.push(schemaCheck);

    // TEST 11-15: Only run if schema is valid
    if (schemaCheck.status === "pass") {
      tests.push(await runLeadNormalizationTest(tenantIdA));
      tests.push(await runDedupProofTest(tenantIdA));
      tests.push(await runPrimaryProfileUniquenessTest(tenantIdA));
      tests.push(await runRateLimitTest(tenantIdA));
      tests.push(await runAtomicNormalizeRpcTest(tenantIdA));
    } else {
      tests.push({
        name: "TEST 11 - Lead Normalization",
        status: "error",
        details: { skipped: true, reason: "Schema sanity check failed" },
        duration_ms: 0,
      });
      tests.push({
        name: "TEST 12 - Dedup Proof",
        status: "error",
        details: { skipped: true, reason: "Schema sanity check failed" },
        duration_ms: 0,
      });
      tests.push({
        name: "TEST 13 - Primary Profile Uniqueness",
        status: "error",
        details: { skipped: true, reason: "Schema sanity check failed" },
        duration_ms: 0,
      });
      tests.push({
        name: "TEST 14 - Rate Limit",
        status: "error",
        details: { skipped: true, reason: "Schema sanity check failed" },
        duration_ms: 0,
      });
      tests.push({
        name: "TEST 15 - Atomic Normalize RPC",
        status: "error",
        details: { skipped: true, reason: "Schema sanity check failed" },
        duration_ms: 0,
      });
    }

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

  const runSchedulerHealthTest = async (): Promise<TestResult> => {
    const start = Date.now();
    const name = "TEST 6 - Scheduler Health Check";
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ceo-scheduler`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "health" }),
      });
      
      const responseBody = await response.json().catch(() => ({}));
      const passed = response.ok && (responseBody.status === "ok" || responseBody.ok === true);
      
      return {
        name,
        status: passed ? "pass" : "fail",
        details: { 
          response_status: response.status,
          body: responseBody,
        },
        error: passed ? undefined : `Health check failed: status=${response.status}`,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return { 
        name, 
        status: "error", 
        details: { hint: "Check if ceo-scheduler edge function is deployed" }, 
        error: err instanceof Error ? err.message : String(err), 
        duration_ms: Date.now() - start 
      };
    }
  };

  const runCronAuthTest = async (): Promise<TestResult> => {
    const start = Date.now();
    const name = "TEST 7 - Cron Auth Rejection (No Secret)";
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ceo-scheduler`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check_job_status" }),
      });
      const passed = response.status === 401 || response.status === 403;
      return { 
        name, 
        status: passed ? "pass" : "fail", 
        details: { 
          response_status: response.status,
          hint: passed ? "Privileged actions correctly require auth" : "Check INTERNAL_SCHEDULER_SECRET config"
        }, 
        error: passed ? undefined : `Expected 401/403, got ${response.status}`, 
        duration_ms: Date.now() - start 
      };
    } catch (err) {
      return { name, status: "error", details: {}, error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - start };
    }
  };

  const runWebhookInsertionTest = async (tenantId: string): Promise<TestResult> => {
    const start = Date.now();
    const name = "TEST 8 - Webhook POST (Real)";
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
    const name = "TEST 9 - Admin Scheduler Trigger + Audit Proof";
    
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

      const triggerTimestamp = new Date().toISOString();

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-run-scheduler`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ 
          action: "run_daily_briefs",
          tenant_ids: [tenantId]
        }),
      });

      const responseBody = await response.json().catch(() => ({}));
      
      if (response.status === 401 || response.status === 403) {
        return {
          name,
          status: "fail",
          details: { status: response.status, response: responseBody },
          error: "Admin was rejected - check RBAC configuration",
          duration_ms: Date.now() - start,
        };
      }

      await new Promise(resolve => setTimeout(resolve, 1500));

      const { data: auditLogs, error: auditError } = await supabase
        .from("platform_audit_log")
        .select("id, action_type, entity_id, success, timestamp")
        .eq("entity_type", "scheduler")
        .eq("entity_id", "run_daily_briefs")
        .gte("timestamp", triggerTimestamp)
        .order("timestamp", { ascending: false });

      if (auditError) {
        return {
          name,
          status: "error",
          details: { audit_error: auditError.message },
          error: "Failed to query audit logs",
          duration_ms: Date.now() - start,
        };
      }

      const startedLogs = auditLogs?.filter(l => l.action_type === "cron_invocation_started") || [];
      const finishedLogs = auditLogs?.filter(l => l.action_type === "cron_invocation_finished") || [];
      
      const hasStarted = startedLogs.length > 0;
      const hasFinished = finishedLogs.length > 0;
      const passed = response.ok && hasStarted && hasFinished;

      return {
        name,
        status: passed ? "pass" : (response.ok ? "fail" : "error"),
        details: {
          status: response.status,
          response: responseBody,
          trigger_timestamp: triggerTimestamp,
          audit_logs_found: auditLogs?.length || 0,
          has_started_log: hasStarted,
          has_finished_log: hasFinished,
          started_count: startedLogs.length,
          finished_count: finishedLogs.length,
        },
        error: passed ? undefined : 
          !response.ok ? `Scheduler returned ${response.status}` :
          !hasStarted ? "Missing cron_invocation_started audit log" :
          !hasFinished ? "Missing cron_invocation_finished audit log" : undefined,
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

  const runReconciliationProofTest = async (): Promise<TestResult> => {
    const start = Date.now();
    const name = "TEST 10 - PG_NET Reconciliation Proof (Strict)";
    
    try {
      // Call the reconciliation RPC function
      const { data: reconcileResult, error: reconcileError } = await supabase
        .rpc('reconcile_scheduler_pg_net');

      if (reconcileError) {
        return {
          name,
          status: "error",
          details: { rpc_error: reconcileError.message, code: reconcileError.code },
          error: `RPC failed: ${reconcileError.message}`,
          duration_ms: Date.now() - start,
        };
      }

      // Query recent pg_net audit logs
      const { data: auditLogs, error: auditError } = await supabase
        .from("platform_audit_log")
        .select("*")
        .eq("entity_type", "scheduler")
        .eq("action_type", "cron_invocation_finished")
        .order("timestamp", { ascending: false })
        .limit(20);

      if (auditError) {
        return {
          name,
          status: "error",
          details: { audit_error: auditError.message },
          error: "Failed to query audit logs",
          duration_ms: Date.now() - start,
        };
      }

      const logs = auditLogs as Array<Record<string, unknown>> | null;

      // Filter pg_net logs
      const pgNetLogs = logs?.filter(l => {
        const meta = l.metadata as Record<string, unknown> | null;
        return meta?.method === 'pg_net';
      }) || [];

      // Count delivered statuses
      const deliveredTrueLogs = pgNetLogs.filter(l => {
        const meta = l.metadata as Record<string, unknown> | null;
        return meta?.delivered === 'true';
      });

      const deliveredUnknownLogs = pgNetLogs.filter(l => {
        const meta = l.metadata as Record<string, unknown> | null;
        return meta?.delivered === 'unknown';
      });

      // Check for at least one TRULY delivered log with status code or delivered_at
      const hasProvenDelivery = deliveredTrueLogs.some(l => {
        const meta = l.metadata as Record<string, unknown> | null;
        return meta?.delivered_status_code !== undefined || meta?.delivered_at !== undefined;
      });

      const result = reconcileResult as Record<string, unknown> | null;

      // STRICT MODE: Must have at least one proven delivery (delivered=true with status code)
      const passed = hasProvenDelivery;

      // Build sample logs with full detail
      const sampleLogs = pgNetLogs.slice(0, 5).map(l => {
        const meta = l.metadata as Record<string, unknown> | null;
        return {
          id: l.id,
          entity_id: l.entity_id,
          request_id: meta?.request_id,
          method: meta?.method,
          delivered: meta?.delivered,
          delivered_status_code: meta?.delivered_status_code,
          delivered_at: meta?.delivered_at,
          delivered_error: meta?.delivered_error,
        };
      });

      return {
        name,
        status: passed ? "pass" : "fail",
        details: {
          reconcile_result: reconcileResult,
          pg_net_logs_found: pgNetLogs.length,
          delivered_true_count: deliveredTrueLogs.length,
          delivered_unknown_count: deliveredUnknownLogs.length,
          has_proven_delivery: hasProvenDelivery,
          sample_logs: sampleLogs,
          strict_mode: true,
          pass_criteria: "At least one log with delivered=true AND (delivered_status_code OR delivered_at)",
        },
        error: passed ? undefined : 
          pgNetLogs.length === 0 
            ? "No pg_net cron_invocation_finished logs found. Run scheduler first." 
            : deliveredUnknownLogs.length > 0 && deliveredTrueLogs.length === 0
              ? "Only delivered=unknown logs found. pg_net response table may not be available."
              : "No proven delivery found. Need delivered=true with status_code or delivered_at.",
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

  // Schema Sanity Check - verify audit log columns exist before lead normalization tests
  const runSchemaSanityCheck = async (): Promise<TestResult> => {
    const start = Date.now();
    const name = "Schema Sanity Check - Audit Log Columns";

    try {
      // Check lead_profiles table exists first
      const { error: profilesError } = await supabase
        .from("lead_profiles")
        .select("id")
        .limit(0);

      const leadProfilesExists = !profilesError;
      const profilesErrorDetails = profilesError ? {
        code: profilesError.code,
        message: profilesError.message,
        isRlsBlocked: profilesError.code === "42501",
      } : null;

      // Check platform_audit_log critical columns
      const criticalColumns = ["timestamp", "request_snapshot"];
      const optionalColumns = ["response_snapshot", "user_id"];
      
      const columnResults: Record<string, { exists: boolean; rlsBlocked: boolean; error?: string }> = {};

      // Check critical columns
      for (const col of criticalColumns) {
        const { error } = await supabase
          .from("platform_audit_log")
          .select(col)
          .limit(0);
        
        columnResults[col] = {
          exists: !error,
          rlsBlocked: error?.code === "42501",
          error: error?.message,
        };
      }

      // Check optional columns (don't fail if missing or RLS blocked)
      for (const col of optionalColumns) {
        const { error } = await supabase
          .from("platform_audit_log")
          .select(col)
          .limit(0);
        
        columnResults[col] = {
          exists: !error,
          rlsBlocked: error?.code === "42501",
          error: error?.message,
        };
      }

      // Check normalization functions via RPC with correct parameter names
      const { data: fpResult, error: fpError } = await supabase.rpc("compute_lead_fingerprint", {
        p_email: "test@test.com",
        p_phone: "1234567890",
        p_company_name: "Test",
      });

      const fingerprintRpcWorks = !fpError && typeof fpResult === "string" && fpResult.length === 32;
      const fpErrorDetails = fpError ? {
        code: fpError.code,
        message: fpError.message,
        hint: fpError.code === "42883" 
          ? "RPC signature mismatch - check function parameter names (p_email, p_phone, p_company_name)"
          : undefined,
      } : null;

      // Critical checks
      const hasTimestamp = columnResults["timestamp"]?.exists || columnResults["timestamp"]?.rlsBlocked;
      const hasRequestSnapshot = columnResults["request_snapshot"]?.exists || columnResults["request_snapshot"]?.rlsBlocked;
      
      // Optional columns - warn only, don't fail
      const hasResponseSnapshot = columnResults["response_snapshot"]?.exists;
      const hasUserId = columnResults["user_id"]?.exists;
      const optionalWarnings: string[] = [];

      if (!hasResponseSnapshot && !columnResults["response_snapshot"]?.rlsBlocked) {
        optionalWarnings.push("response_snapshot column missing (edge function will omit it)");
      }
      if (!hasUserId && !columnResults["user_id"]?.rlsBlocked) {
        optionalWarnings.push("user_id column missing (edge function will omit it)");
      }

      // Check for unique partial index via pg_indexes catalog
      const expectedIndexName = "lead_profiles_one_primary_per_fingerprint";
      let hasUniqueIndex: boolean | null = null; // null = unknown/blocked, true = exists, false = readable but missing
      let indexRlsBlocked = false;
      let indexCheckError: string | undefined;
      
      try {
        // Query pg_indexes for the specific index
        const { data: indexData, error: indexError } = await supabase
          .from("pg_indexes" as any)
          .select("indexname")
          .eq("schemaname", "public")
          .eq("tablename", "lead_profiles")
          .eq("indexname", expectedIndexName)
          .maybeSingle();
        
        if (indexError) {
          if (indexError.code === "42501" || indexError.code === "42P01" || indexError.code === "PGRST200") {
            // RLS blocked or table not found - non-fatal, set null
            indexRlsBlocked = true;
            hasUniqueIndex = null;
            indexCheckError = `pg_indexes query blocked (${indexError.code}). Index assumed via TEST 13.`;
          } else {
            // Other error - treat as blocked/unknown
            indexRlsBlocked = true;
            hasUniqueIndex = null;
            indexCheckError = `pg_indexes query failed: ${indexError.message}`;
          }
        } else {
          // Query succeeded - we can determine if index exists
          hasUniqueIndex = indexData !== null;
        }
      } catch (err) {
        indexRlsBlocked = true;
        hasUniqueIndex = null;
        indexCheckError = `pg_indexes check exception: ${err instanceof Error ? err.message : String(err)}`;
      }
      
      // Determine warning message
      const indexWarning = indexRlsBlocked 
        ? `Index check blocked by permissions; TEST 13 validates behaviorally.`
        : hasUniqueIndex === false
          ? `MISSING: Index '${expectedIndexName}' not found. Run migration to create it.`
          : undefined;

      // Add warning to optionalWarnings for display
      if (indexWarning) {
        optionalWarnings.push(indexWarning);
      }

      // hasUniqueIndex: true = ok, false = fail, null = ok (warn only)
      const indexOk = hasUniqueIndex !== false;
      const passed = leadProfilesExists && fingerprintRpcWorks && hasTimestamp && hasRequestSnapshot && indexOk;

      return {
        name,
        status: passed ? "pass" : "fail",
        details: {
          lead_profiles: {
            exists: leadProfilesExists,
            error: profilesErrorDetails,
          },
          fingerprint_rpc: {
            works: fingerprintRpcWorks,
            result_sample: fpResult ? `${String(fpResult).substring(0, 8)}...` : null,
            error: fpErrorDetails,
          },
          audit_columns: columnResults,
          critical_checks: {
            lead_profiles_exists: leadProfilesExists,
            fingerprint_rpc_works: fingerprintRpcWorks,
            timestamp_column: hasTimestamp,
            request_snapshot_column: hasRequestSnapshot,
          },
          unique_index_check: {
            expected: expectedIndexName,
            exists: hasUniqueIndex === true,
            rls_blocked: indexRlsBlocked,
            error: indexCheckError,
          },
          optional_warnings: optionalWarnings.length > 0 ? optionalWarnings : undefined,
        },
        error: !passed
          ? !leadProfilesExists 
            ? `lead_profiles table missing or inaccessible: ${profilesError?.message}`
            : !fingerprintRpcWorks
              ? `Fingerprint RPC failed: ${fpError?.message}. ${fpError?.code === "42883" ? "Check function signature." : "Check if pgcrypto is enabled."}`
              : !hasTimestamp
                ? "timestamp column missing from platform_audit_log"
                : !hasRequestSnapshot
                  ? "request_snapshot column missing from platform_audit_log"
                  : !indexOk
                    ? `MISSING: Index '${expectedIndexName}' not found. Run migration to create it.`
                    : "Unknown schema issue"
          : undefined,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        name,
        status: "error",
        details: { exception: err instanceof Error ? err.stack : String(err) },
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  };

  // TEST 11: Lead Normalization (Hardened)
  const runLeadNormalizationTest = async (tenantId: string): Promise<TestResult> => {
    const start = Date.now();
    const name = "TEST 11 - Lead Normalization";
    const testNonce = `qa_norm_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        return {
          name,
          status: "error",
          details: { reason: "No auth session", hint: "Login required to run this test" },
          error: "Must be logged in to run this test",
          duration_ms: Date.now() - start,
        };
      }

      const testEmail = `test_${testNonce}@qatest.local`;
      const testPhone = "(555) 123-4567";
      const testCompany = "QA Test Company";

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lead-normalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          lead: {
            email: testEmail,
            phone: testPhone,
            company_name: testCompany,
            first_name: "QA",
            last_name: "Test",
            source: "qa_tests",
          },
        }),
      });

      const responseBody = await response.json().catch(() => ({ parse_error: "Failed to parse response" }));

      // Check for RPC signature mismatch errors
      if (responseBody.details?.includes?.("function") || responseBody.error?.includes?.("function")) {
        return {
          name,
          status: "fail",
          details: { 
            response_status: response.status, 
            body: responseBody,
            hint: "RPC signature mismatch - check SQL function parameter names match edge function calls"
          },
          error: `RPC error: ${responseBody.error || responseBody.details}`,
          duration_ms: Date.now() - start,
        };
      }

      if (!response.ok) {
        return {
          name,
          status: "fail",
          details: { 
            response_status: response.status, 
            body: responseBody,
            hint: response.status === 403 ? "Check user roles (needs admin/owner)" : 
                  response.status === 401 ? "JWT validation failed" : "Edge function error"
          },
          error: `Normalize returned ${response.status}: ${responseBody.error || JSON.stringify(responseBody)}`,
          duration_ms: Date.now() - start,
        };
      }

      // Verify response structure
      if (!responseBody.ok || !responseBody.fingerprint || !["created", "deduped"].includes(responseBody.status)) {
        return {
          name,
          status: "fail",
          details: { response: responseBody, hint: "Response missing required fields (ok, fingerprint, status)" },
          error: "Invalid response structure from lead-normalize",
          duration_ms: Date.now() - start,
        };
      }

      // Verify lead_profile exists in DB and fingerprint matches
      const { data: profiles, error: profileError } = await supabase
        .from("lead_profiles")
        .select("id, fingerprint, segment, is_primary, tenant_id")
        .eq("tenant_id", tenantId)
        .eq("fingerprint", responseBody.fingerprint)
        .limit(1);

      if (profileError) {
        return {
          name,
          status: "error",
          details: { 
            db_error: profileError.message, 
            code: profileError.code,
            hint: profileError.code === "42501" ? "RLS blocking query - check tenant isolation" : "DB query failed"
          },
          error: profileError.message,
          duration_ms: Date.now() - start,
        };
      }

      const profileExists = profiles && profiles.length > 0;
      const fingerprintMatches = profileExists && profiles[0].fingerprint === responseBody.fingerprint;

      // Verify RLS by attempting cross-tenant query (should return nothing for other tenants)
      const { data: crossTenantCheck } = await supabase
        .from("lead_profiles")
        .select("id, tenant_id")
        .neq("tenant_id", tenantId)
        .limit(1);

      const rlsWorking = !crossTenantCheck || crossTenantCheck.length === 0;

      return {
        name,
        status: profileExists && fingerprintMatches ? "pass" : "fail",
        details: {
          normalize_response: responseBody,
          lead_profile_id: responseBody.lead_profile_id,
          fingerprint: responseBody.fingerprint,
          segment: responseBody.segment,
          normalized: responseBody.normalized,
          profile_verified_in_db: profileExists,
          fingerprint_matches: fingerprintMatches,
          rls_blocking_cross_tenant: rlsWorking,
          db_profile: profiles?.[0] || null,
        },
        error: !profileExists ? "lead_profile not found in database after creation" :
               !fingerprintMatches ? "Fingerprint in DB doesn't match response" : undefined,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        name,
        status: "error",
        details: { exception: err instanceof Error ? err.stack : String(err) },
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  };

  // TEST 12: Dedup Proof (Hardened)
  const runDedupProofTest = async (tenantId: string): Promise<TestResult> => {
    const start = Date.now();
    const name = "TEST 12 - Dedup Proof";
    const testNonce = `qa_dedup_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        return {
          name,
          status: "error",
          details: { reason: "No auth session", hint: "Login required" },
          error: "Must be logged in to run this test",
          duration_ms: Date.now() - start,
        };
      }

      const baseEmail = `dedup_${testNonce}@qatest.local`;
      const basePhone = "5559876543";

      // First call - should create
      const firstResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lead-normalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          lead: { email: baseEmail, phone: basePhone, source: "qa_dedup_test_1" },
        }),
      });

      const firstBody = await firstResponse.json().catch(() => ({ parse_error: true }));

      if (!firstResponse.ok) {
        return {
          name,
          status: "fail",
          details: { 
            first_call: firstBody, 
            http_status: firstResponse.status,
            hint: firstBody.details || "Check edge function logs"
          },
          error: `First call failed: ${firstBody.error || JSON.stringify(firstBody)}`,
          duration_ms: Date.now() - start,
        };
      }

      if (firstBody.status !== "created") {
        return {
          name,
          status: "fail",
          details: { first_call: firstBody, hint: "Expected status=created on first call" },
          error: `First call should return status=created, got ${firstBody.status || "no status"}`,
          duration_ms: Date.now() - start,
        };
      }

      const fingerprint = firstBody.fingerprint;

      // Second call with same data but different casing/format
      const secondResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lead-normalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          lead: {
            email: baseEmail.toUpperCase(), // Different casing
            phone: `(555) 987-6543`, // Different format  
            source: "qa_dedup_test_2",
          },
        }),
      });

      const secondBody = await secondResponse.json().catch(() => ({ parse_error: true }));

      if (!secondResponse.ok) {
        return {
          name,
          status: "fail",
          details: { 
            first_call: firstBody, 
            second_call: secondBody,
            hint: "Second call failed - check normalization functions"
          },
          error: `Second call failed: ${secondBody.error || JSON.stringify(secondBody)}`,
          duration_ms: Date.now() - start,
        };
      }

      // Second call should be deduped
      if (secondBody.status !== "deduped") {
        return {
          name,
          status: "fail",
          details: { 
            first_call: firstBody, 
            second_call: secondBody,
            hint: "Normalization should produce same fingerprint for equivalent inputs"
          },
          error: `Second call should return status=deduped, got ${secondBody.status}`,
          duration_ms: Date.now() - start,
        };
      }

      // Fingerprints should match
      if (secondBody.fingerprint !== fingerprint) {
        return {
          name,
          status: "fail",
          details: { 
            first_fingerprint: fingerprint, 
            second_fingerprint: secondBody.fingerprint,
            first_normalized: firstBody.normalized,
            second_normalized: secondBody.normalized,
            hint: "Normalization is inconsistent - check normalize_email/normalize_phone functions"
          },
          error: "Fingerprints don't match - normalization is inconsistent",
          duration_ms: Date.now() - start,
        };
      }

      // Verify only ONE is_primary=true profile exists for this fingerprint
      const { data: profiles, error: profileError } = await supabase
        .from("lead_profiles")
        .select("id, is_primary, fingerprint, tenant_id")
        .eq("tenant_id", tenantId)
        .eq("fingerprint", fingerprint)
        .eq("is_primary", true);

      if (profileError) {
        return {
          name,
          status: "error",
          details: { 
            db_error: profileError.message, 
            code: profileError.code,
            hint: profileError.code === "42501" ? "RLS blocking - check tenant isolation" : "DB query failed"
          },
          error: profileError.message,
          duration_ms: Date.now() - start,
        };
      }

      const primaryCount = profiles?.length || 0;
      if (primaryCount !== 1) {
        return {
          name,
          status: "fail",
          details: { 
            primary_profiles_found: primaryCount,
            profiles: profiles,
            hint: "Unique constraint on (tenant_id, fingerprint) WHERE is_primary may not be working"
          },
          error: `Expected exactly 1 primary profile, found ${primaryCount}`,
          duration_ms: Date.now() - start,
        };
      }

      // Verify the profile fingerprint matches what we got from the API
      const dbFingerprint = profiles[0]?.fingerprint;
      if (dbFingerprint !== fingerprint) {
        return {
          name,
          status: "fail",
          details: { 
            api_fingerprint: fingerprint,
            db_fingerprint: dbFingerprint,
            hint: "Database fingerprint doesn't match API response"
          },
          error: "Fingerprint mismatch between API and DB",
          duration_ms: Date.now() - start,
        };
      }

      // Check audit log for normalization entries (use timestamp correctly)
      const { data: auditLogs, error: auditError } = await supabase
        .from("platform_audit_log")
        .select("id, action_type, entity_type, entity_id, timestamp, request_snapshot")
        .eq("entity_type", "lead_profile")
        .in("action_type", ["lead_profile_created", "lead_profile_updated", "lead_profile_merged"])
        .gte("timestamp", new Date(start).toISOString())
        .order("timestamp", { ascending: false })
        .limit(10);

      const hasAuditEntries = !auditError && auditLogs && auditLogs.length > 0;

      return {
        name,
        status: "pass",
        details: {
          first_call: { status: firstBody.status, fingerprint: firstBody.fingerprint, normalized: firstBody.normalized },
          second_call: { status: secondBody.status, fingerprint: secondBody.fingerprint, normalized: secondBody.normalized },
          fingerprints_match: true,
          primary_profiles_count: primaryCount,
          db_fingerprint_verified: dbFingerprint === fingerprint,
          audit_log_entries_found: auditLogs?.length || 0,
          audit_entries: auditLogs?.slice(0, 3).map(l => ({ 
            id: l.id, 
            action: l.action_type, 
            timestamp: l.timestamp,
            entity_id: l.entity_id
          })),
          has_audit_trail: hasAuditEntries,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        name,
        status: "error",
        details: { exception: err instanceof Error ? err.stack : String(err) },
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  };

  // TEST 13: Primary Profile Uniqueness (concurrent requests)
  const runPrimaryProfileUniquenessTest = async (tenantId: string): Promise<TestResult> => {
    const start = Date.now();
    const name = "TEST 13 - Primary Profile Uniqueness";
    const testNonce = `qa_uniq_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        return {
          name,
          status: "error",
          details: { reason: "No auth session" },
          error: "Must be logged in to run this test",
          duration_ms: Date.now() - start,
        };
      }

      const testEmail = `unique_${testNonce}@qatest.local`;
      const testPhone = "5551234567";

      // Fire two simultaneous requests with same data
      const makeRequest = () =>
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lead-normalize`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            tenant_id: tenantId,
            lead: {
              email: testEmail,
              phone: testPhone,
              source: "qa_uniqueness_test",
            },
          }),
        }).then(async (r) => ({
          ok: r.ok,
          status: r.status,
          body: await r.json().catch(() => ({})),
        }));

      // Fire both requests simultaneously
      const [result1, result2] = await Promise.all([makeRequest(), makeRequest()]);

      if (!result1.ok || !result2.ok) {
        return {
          name,
          status: "fail",
          details: { result1, result2 },
          error: `One or both requests failed: r1=${result1.status}, r2=${result2.status}`,
          duration_ms: Date.now() - start,
        };
      }

      const fingerprint = result1.body.fingerprint || result2.body.fingerprint;

      // Verify only ONE primary profile exists
      const { data: profiles, error: profileError } = await supabase
        .from("lead_profiles")
        .select("id, is_primary, fingerprint")
        .eq("tenant_id", tenantId)
        .eq("fingerprint", fingerprint)
        .eq("is_primary", true);

      if (profileError) {
        return {
          name,
          status: "error",
          details: { db_error: profileError.message },
          error: profileError.message,
          duration_ms: Date.now() - start,
        };
      }

      const primaryCount = profiles?.length || 0;
      const statuses = [result1.body.status, result2.body.status].sort();

      // One should be created, one should be deduped (or both deduped if very fast)
      const validStatuses =
        (statuses[0] === "created" && statuses[1] === "deduped") ||
        (statuses[0] === "deduped" && statuses[1] === "deduped");

      const passed = primaryCount === 1 && validStatuses;

      return {
        name,
        status: passed ? "pass" : "fail",
        details: {
          result1_status: result1.body.status,
          result2_status: result2.body.status,
          fingerprint,
          primary_profiles_found: primaryCount,
          valid_status_combination: validStatuses,
          profiles: profiles?.map((p) => ({ id: p.id, is_primary: p.is_primary })),
        },
        error: !passed
          ? primaryCount !== 1
            ? `Expected 1 primary profile, found ${primaryCount}. Missing unique partial index or non-atomic create path.`
            : `Invalid status combination: ${statuses.join(", ")}`
          : undefined,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        name,
        status: "error",
        details: { exception: err instanceof Error ? err.stack : String(err) },
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  };

  // TEST 14: Rate Limit
  const runRateLimitTest = async (tenantId: string): Promise<TestResult> => {
    const start = Date.now();
    const name = "TEST 14 - Rate Limit";

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        return {
          name,
          status: "error",
          details: { reason: "No auth session" },
          error: "Must be logged in to run this test",
          duration_ms: Date.now() - start,
        };
      }

      const testNonce = `qa_rate_${Date.now()}`;
      let got429 = false;
      let totalRequests = 0;
      const results: { status: number; ok: boolean }[] = [];

      // Fire 70 requests rapidly
      const makeRequest = (i: number) =>
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lead-normalize`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            tenant_id: tenantId,
            lead: {
              email: `rate_${testNonce}_${i}@qatest.local`,
              phone: `555000${String(i).padStart(4, "0")}`,
              source: "qa_rate_test",
            },
          }),
        }).then((r) => {
          totalRequests++;
          if (r.status === 429) got429 = true;
          return { status: r.status, ok: r.ok };
        });

      // Fire in batches to avoid connection limits
      const batchSize = 10;
      for (let batch = 0; batch < 7; batch++) {
        const promises = [];
        for (let i = 0; i < batchSize; i++) {
          promises.push(makeRequest(batch * batchSize + i));
        }
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
        
        // Check if we got 429 already
        if (got429) break;
      }

      const count429 = results.filter((r) => r.status === 429).length;
      const countOk = results.filter((r) => r.ok).length;

      return {
        name,
        status: got429 ? "pass" : "fail",
        details: {
          total_requests: totalRequests,
          count_429: count429,
          count_ok: countOk,
          got_rate_limited: got429,
          hint: !got429 ? "Rate limit not triggered - check RATE_LIMIT_MAX setting" : undefined,
        },
        error: !got429 ? `Expected at least one 429 response, got none after ${totalRequests} requests` : undefined,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        name,
        status: "error",
        details: { exception: err instanceof Error ? err.stack : String(err) },
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  };

  // TEST 15: Atomic Normalize RPC
  const runAtomicNormalizeRpcTest = async (tenantId: string): Promise<TestResult> => {
    const start = Date.now();
    const name = "TEST 15 - Atomic Normalize RPC";
    const testNonce = `qa_atomic_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        return {
          name,
          status: "error",
          details: { reason: "No auth session" },
          error: "Must be logged in to run this test",
          duration_ms: Date.now() - start,
        };
      }

      // First check if the RPC exists
      const { data: rpcCheck, error: rpcCheckError } = await supabase.rpc("normalize_lead_atomic", {
        p_tenant_id: tenantId,
        p_email: `rpc_check_${testNonce}@qatest.local`,
        p_phone: null,
        p_company_name: null,
        p_first_name: "RPC",
        p_last_name: "Check",
        p_job_title: null,
        p_source: "qa_rpc_check",
      });

      if (rpcCheckError) {
        return {
          name,
          status: "fail",
          details: { 
            rpc_error: rpcCheckError.message,
            hint: "normalize_lead_atomic RPC may not exist or has permission issues"
          },
          error: `RPC call failed: ${rpcCheckError.message}`,
          duration_ms: Date.now() - start,
        };
      }

      // Verify RPC returned expected structure
      const checkResult = rpcCheck as { ok?: boolean; status?: string; fingerprint?: string };
      if (!checkResult.ok || !checkResult.fingerprint) {
        return {
          name,
          status: "fail",
          details: { rpc_result: checkResult },
          error: "RPC did not return expected structure (ok, fingerprint)",
          duration_ms: Date.now() - start,
        };
      }

      // Now test concurrent calls via edge function (which now uses the RPC)
      const testEmail = `atomic_${testNonce}@qatest.local`;
      const testPhone = "5559876543";

      const makeRequest = () =>
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lead-normalize`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            tenant_id: tenantId,
            lead: {
              email: testEmail,
              phone: testPhone,
              first_name: "Atomic",
              last_name: "Test",
              source: "qa_atomic_test",
            },
          }),
        }).then(async (r) => ({
          ok: r.ok,
          status: r.status,
          body: await r.json().catch(() => ({})),
        }));

      // Fire two simultaneous requests
      const [result1, result2] = await Promise.all([makeRequest(), makeRequest()]);

      if (!result1.ok || !result2.ok) {
        return {
          name,
          status: "fail",
          details: { result1, result2 },
          error: `One or both requests failed: r1=${result1.status}, r2=${result2.status}`,
          duration_ms: Date.now() - start,
        };
      }

      const fingerprint = result1.body.fingerprint || result2.body.fingerprint;
      const fingerprintsMatch = result1.body.fingerprint === result2.body.fingerprint;

      // Verify only ONE primary profile exists
      const { data: profiles, error: profileError } = await supabase
        .from("lead_profiles")
        .select("id, is_primary, fingerprint")
        .eq("tenant_id", tenantId)
        .eq("fingerprint", fingerprint)
        .eq("is_primary", true);

      if (profileError) {
        return {
          name,
          status: "error",
          details: { db_error: profileError.message },
          error: profileError.message,
          duration_ms: Date.now() - start,
        };
      }

      const primaryCount = profiles?.length || 0;
      const statuses = [result1.body.status, result2.body.status].sort();

      // One should be created, one should be deduped (or both deduped if very fast)
      const validStatuses =
        (statuses[0] === "created" && statuses[1] === "deduped") ||
        (statuses[0] === "deduped" && statuses[1] === "deduped");

      const passed = primaryCount === 1 && validStatuses && fingerprintsMatch;

      return {
        name,
        status: passed ? "pass" : "fail",
        details: {
          rpc_exists: true,
          rpc_initial_check: { ok: checkResult.ok, status: checkResult.status },
          result1_status: result1.body.status,
          result2_status: result2.body.status,
          fingerprint,
          fingerprints_match: fingerprintsMatch,
          primary_profiles_found: primaryCount,
          valid_status_combination: validStatuses,
          profiles: profiles?.map((p) => ({ id: p.id, is_primary: p.is_primary })),
        },
        error: !passed
          ? primaryCount !== 1
            ? `Expected 1 primary profile, found ${primaryCount}. Atomic RPC may have race issue.`
            : !fingerprintsMatch
            ? "Fingerprints do not match between concurrent calls"
            : `Invalid status combination: ${statuses.join(", ")}`
          : undefined,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        name,
        status: "error",
        details: { exception: err instanceof Error ? err.stack : String(err) },
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
