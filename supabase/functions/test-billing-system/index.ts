import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestResult {
  action: string;
  iteration: number;
  success: boolean;
  duration_ms: number;
  error?: string;
  result?: unknown;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { action = 'run_all_tests', iterations = 10 } = body;

    console.log(`Running billing system tests: ${action} with ${iterations} iterations`);

    const results: TestResult[] = [];

    // Helper to invoke billing agent
    const invokeBillingAgent = async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke('billing-agent', { body: payload });
      if (error) throw error;
      return data;
    };

    // Helper to run test iterations
    const runTest = async (
      testName: string, 
      testFn: (iteration: number) => Promise<unknown>
    ) => {
      for (let i = 1; i <= iterations; i++) {
        const start = Date.now();
        try {
          const result = await testFn(i);
          results.push({
            action: testName,
            iteration: i,
            success: true,
            duration_ms: Date.now() - start,
            result,
          });
        } catch (err) {
          results.push({
            action: testName,
            iteration: i,
            success: false,
            duration_ms: Date.now() - start,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };

    // ========== TEST SUITES ==========

    if (action === 'run_all_tests' || action === 'test_check_pending_work') {
      await runTest('check_pending_work', async () => {
        return await invokeBillingAgent({ action: 'check_pending_work' });
      });
    }

    if (action === 'run_all_tests' || action === 'test_get_products') {
      await runTest('get_products', async () => {
        return await invokeBillingAgent({ action: 'get_products' });
      });
    }

    if (action === 'run_all_tests' || action === 'test_get_agent_activity') {
      await runTest('get_agent_activity', async (i) => {
        const filters = ['all', 'pending', 'all', 'pending', 'all'];
        return await invokeBillingAgent({ 
          action: 'get_agent_activity',
          filter: filters[i % filters.length]
        });
      });
    }

    if (action === 'run_all_tests' || action === 'test_usage_summary') {
      // Get a client to test with
      const { data: clients } = await supabase.from('clients').select('id').limit(5);
      if (clients?.length) {
        await runTest('get_usage_summary', async (i) => {
          const client = clients[i % clients.length];
          return await invokeBillingAgent({ 
            action: 'get_usage_summary',
            client_id: client.id,
            days: [7, 14, 30, 60, 90][i % 5]
          });
        });
      }
    }

    if (action === 'run_all_tests' || action === 'test_auto_dunning') {
      await runTest('auto_dunning', async () => {
        return await invokeBillingAgent({ action: 'auto_dunning' });
      });
    }

    if (action === 'run_all_tests' || action === 'test_sync_usage') {
      const { data: clients } = await supabase.from('clients').select('id').limit(5);
      if (clients?.length) {
        await runTest('sync_usage_to_stripe', async (i) => {
          const client = clients[i % clients.length];
          return await invokeBillingAgent({ 
            action: 'sync_usage_to_stripe',
            client_id: client.id
          });
        });
      }
    }

    if (action === 'run_all_tests' || action === 'test_customer_portal') {
      const { data: clients } = await supabase
        .from('clients')
        .select('id')
        .not('stripe_customer_id', 'is', null)
        .limit(5);
      
      if (clients?.length) {
        await runTest('get_customer_portal_link', async (i) => {
          const client = clients[i % clients.length];
          return await invokeBillingAgent({ 
            action: 'get_customer_portal_link',
            client_id: client.id
          });
        });
      }
    }

    if (action === 'run_all_tests' || action === 'test_health_check') {
      await runTest('health_check', async () => {
        return await invokeBillingAgent({ action: 'health_check' });
      });
    }

    // ========== SIMULATE CREATE/UPDATE (without actually calling Stripe) ==========
    if (action === 'test_simulated_create_product') {
      await runTest('simulated_create_product', async (i) => {
        // Just log what would be created
        const productTypes = ['recurring', 'metered', 'one_time'];
        const intervals = ['month', 'year'];
        return {
          simulated: true,
          would_create: {
            name: `Test Product ${i}`,
            pricing_type: productTypes[i % productTypes.length],
            unit_amount: 1000 + (i * 100),
            billing_interval: intervals[i % intervals.length],
          }
        };
      });
    }

    if (action === 'test_simulated_refund') {
      // Get some invoices to test with
      const { data: invoices } = await supabase
        .from('client_invoices')
        .select('id, amount')
        .limit(10);
      
      await runTest('simulated_refund', async (i) => {
        if (!invoices?.length) {
          return { simulated: true, message: 'No invoices to test' };
        }
        const invoice = invoices[i % invoices.length];
        const refundAmounts = [50, 100, 250, 500, 750, 1000];
        return {
          simulated: true,
          would_refund: {
            invoice_id: invoice.id,
            invoice_amount: invoice.amount,
            refund_amount: refundAmounts[i % refundAmounts.length],
            requires_approval: refundAmounts[i % refundAmounts.length] >= 500,
          }
        };
      });
    }

    // ========== CALCULATE SUMMARY ==========
    const totalTests = results.length;
    const passedTests = results.filter(r => r.success).length;
    const failedTests = results.filter(r => !r.success).length;
    const avgDuration = results.length 
      ? Math.round(results.reduce((sum, r) => sum + r.duration_ms, 0) / results.length)
      : 0;

    // Group by action
    const byAction = results.reduce((acc, r) => {
      if (!acc[r.action]) {
        acc[r.action] = { passed: 0, failed: 0, avg_ms: 0, durations: [] };
      }
      if (r.success) acc[r.action].passed++;
      else acc[r.action].failed++;
      acc[r.action].durations.push(r.duration_ms);
      return acc;
    }, {} as Record<string, { passed: number; failed: number; avg_ms: number; durations: number[] }>);

    // Calculate avg for each action
    for (const key of Object.keys(byAction)) {
      byAction[key].avg_ms = Math.round(
        byAction[key].durations.reduce((a, b) => a + b, 0) / byAction[key].durations.length
      );
      delete (byAction[key] as unknown).durations;
    }

    // Log test completion to CRM
    await supabase.from('automation_logs').insert({
      function_name: 'test-billing-system',
      status: failedTests === 0 ? 'completed' : 'completed_with_errors',
      items_processed: totalTests,
      items_created: passedTests,
      metadata: { 
        failed: failedTests, 
        avg_duration_ms: avgDuration,
        by_action: byAction,
      },
      completed_at: new Date().toISOString(),
    });

    // If all tests pass, log to CRM that testing is complete
    if (failedTests === 0 && totalTests > 0) {
      await supabase.from('billing_agent_actions').insert({
        action_type: 'system_test',
        target_type: 'billing_system',
        reason: `All ${totalTests} billing system tests passed`,
        ai_confidence: 1.0,
        executed_at: new Date().toISOString(),
        result: { 
          tests_run: totalTests,
          all_passed: true,
          by_action: byAction,
        },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      summary: {
        total_tests: totalTests,
        passed: passedTests,
        failed: failedTests,
        pass_rate: totalTests ? `${Math.round((passedTests / totalTests) * 100)}%` : '0%',
        avg_duration_ms: avgDuration,
        by_action: byAction,
      },
      details: results,
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error('Test system error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
