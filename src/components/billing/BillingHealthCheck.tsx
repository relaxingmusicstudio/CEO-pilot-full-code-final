import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Play,
  Activity,
  Database,
  CreditCard,
  Clock,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: unknown;
}

interface TestSummary {
  total_tests: number;
  passed: number;
  failed: number;
  pass_rate: string;
  avg_duration_ms: number;
  by_action: Record<string, { passed: number; failed: number; avg_ms: number }>;
}

export default function BillingHealthCheck() {
  const queryClient = useQueryClient();
  const [testResults, setTestResults] = useState<TestSummary | null>(null);

  // Health checks query
  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['billing-health'],
    queryFn: async () => {
      const checks: HealthCheck[] = [];

      // Check 1: Stripe products sync
      const { data: products } = await supabase
        .from('stripe_products')
        .select('id, stripe_product_id, is_active')
        .eq('is_active', true);
      
      const productsWithoutStripe = products?.filter(p => !p.stripe_product_id) || [];
      checks.push({
        name: 'Stripe Products Sync',
        status: productsWithoutStripe.length === 0 ? 'pass' : 'warning',
        message: productsWithoutStripe.length === 0 
          ? `All ${products?.length || 0} products synced`
          : `${productsWithoutStripe.length} products missing Stripe ID`,
        details: { total: products?.length, unsynced: productsWithoutStripe.length }
      });

      // Check 2: Usage records sync
      const { data: unsyncedUsage, count } = await supabase
        .from('usage_records')
        .select('id', { count: 'exact' })
        .is('stripe_usage_record_id', null)
        .limit(1);
      
      checks.push({
        name: 'Usage Records Sync',
        status: (count || 0) === 0 ? 'pass' : (count || 0) > 10 ? 'fail' : 'warning',
        message: (count || 0) === 0 
          ? 'All usage synced to Stripe'
          : `${count} unsynced usage records`,
        details: { unsynced_count: count }
      });

      // Check 3: Overdue invoices
      const { data: overdueInvoices, count: overdueCount } = await supabase
        .from('client_invoices')
        .select('id', { count: 'exact' })
        .eq('status', 'overdue');
      
      checks.push({
        name: 'Overdue Invoices',
        status: (overdueCount || 0) === 0 ? 'pass' : (overdueCount || 0) > 5 ? 'fail' : 'warning',
        message: (overdueCount || 0) === 0 
          ? 'No overdue invoices'
          : `${overdueCount} invoices overdue`,
        details: { overdue_count: overdueCount }
      });

      // Check 4: Pending human reviews
      const { data: pendingReviews, count: reviewCount } = await supabase
        .from('billing_agent_actions')
        .select('id', { count: 'exact' })
        .eq('requires_human_review', true)
        .is('human_approved', null);
      
      checks.push({
        name: 'Pending Reviews',
        status: (reviewCount || 0) === 0 ? 'pass' : 'warning',
        message: (reviewCount || 0) === 0 
          ? 'No pending reviews'
          : `${reviewCount} actions awaiting approval`,
        details: { pending_count: reviewCount }
      });

      // Check 5: Client Stripe customer IDs
      const { data: clientsWithoutStripe, count: missingStripeCount } = await supabase
        .from('clients')
        .select('id', { count: 'exact' })
        .eq('status', 'active')
        .is('stripe_customer_id', null);
      
      checks.push({
        name: 'Client Stripe Integration',
        status: (missingStripeCount || 0) === 0 ? 'pass' : 'warning',
        message: (missingStripeCount || 0) === 0 
          ? 'All active clients have Stripe ID'
          : `${missingStripeCount} clients missing Stripe ID`,
        details: { missing_count: missingStripeCount }
      });

      // Check 6: Agent activity (last 24h)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentActions, count: actionCount } = await supabase
        .from('billing_agent_actions')
        .select('id', { count: 'exact' })
        .gte('created_at', yesterday);
      
      checks.push({
        name: 'Agent Activity (24h)',
        status: (actionCount || 0) > 0 ? 'pass' : 'warning',
        message: `${actionCount || 0} actions in last 24 hours`,
        details: { action_count: actionCount }
      });

      // Check 7: Failed actions
      const { data: failedActions, count: failedCount } = await supabase
        .from('billing_agent_actions')
        .select('id', { count: 'exact' })
        .not('error_message', 'is', null)
        .gte('created_at', yesterday);
      
      checks.push({
        name: 'Failed Actions (24h)',
        status: (failedCount || 0) === 0 ? 'pass' : 'fail',
        message: (failedCount || 0) === 0 
          ? 'No failed actions'
          : `${failedCount} failed actions`,
        details: { failed_count: failedCount }
      });

      // Calculate overall health score
      const passCount = checks.filter(c => c.status === 'pass').length;
      const warningCount = checks.filter(c => c.status === 'warning').length;
      const failCount = checks.filter(c => c.status === 'fail').length;
      const healthScore = Math.round(
        ((passCount * 1 + warningCount * 0.5) / checks.length) * 100
      );

      return {
        checks,
        score: healthScore,
        summary: { pass: passCount, warning: warningCount, fail: failCount },
        lastChecked: new Date().toISOString(),
      };
    },
    refetchInterval: 60000, // Auto-refresh every minute
  });

  // Run tests mutation
  const runTests = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('test-billing-system', {
        body: { action: 'run_all_tests', iterations: 10 }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setTestResults(data.summary);
      queryClient.invalidateQueries({ queryKey: ['billing-health'] });
      toast.success(`Tests completed: ${data.summary.passed}/${data.summary.total_tests} passed`);
    },
    onError: (error: Error) => {
      toast.error(`Test failed: ${error.message}`);
    }
  });

  // Seed test data mutation
  const seedData = useMutation({
    mutationFn: async () => {
      // Create usage records
      const { data: clients } = await supabase.from('clients').select('id').limit(4);
      if (!clients?.length) throw new Error('No clients found');

      const usageTypes = ['voice_minutes', 'ai_agent_minutes', 'sms_sent', 'emails_sent'];
      const usageRecords = [];

      for (let i = 0; i < 50; i++) {
        usageRecords.push({
          client_id: clients[i % clients.length].id,
          usage_type: usageTypes[i % usageTypes.length],
          quantity: Math.floor(Math.random() * 100) + 10,
          recorded_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      await supabase.from('usage_records').insert(usageRecords);

      // Create test invoices
      const invoices = [];
      const statuses = ['draft', 'sent', 'paid', 'overdue'];
      for (let i = 0; i < 10; i++) {
        invoices.push({
          client_id: clients[i % clients.length].id,
          invoice_number: `TEST-${Date.now()}-${i}`,
          amount: Math.floor(Math.random() * 5000) + 500,
          status: statuses[i % statuses.length],
          due_date: new Date(Date.now() + (i - 5) * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          items: [{ description: `Test service ${i}`, quantity: 1, unit_price: 500, total: 500 }],
        });
      }

      await supabase.from('client_invoices').insert(invoices);

      // Create billing agent actions
      const actionTypes = ['refund', 'usage_sync', 'dunning', 'create_price', 'update_price'];
      const actions = [];
      for (let i = 0; i < 20; i++) {
        actions.push({
          action_type: actionTypes[i % actionTypes.length],
          target_type: 'invoice',
          reason: `Test action ${i}`,
          ai_confidence: Math.random() * 0.5 + 0.5,
          requires_human_review: i % 5 === 0,
          executed_at: i % 3 === 0 ? new Date().toISOString() : null,
          client_id: clients[i % clients.length].id,
        });
      }

      await supabase.from('billing_agent_actions').insert(actions);

      return { usage: usageRecords.length, invoices: invoices.length, actions: actions.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['billing-health'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(`Seeded ${data.usage} usage records, ${data.invoices} invoices, ${data.actions} actions`);
    },
    onError: (error: Error) => {
      toast.error(`Seeding failed: ${error.message}`);
    }
  });

  const getStatusIcon = (status: 'pass' | 'fail' | 'warning') => {
    switch (status) {
      case 'pass': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'fail': return <XCircle className="h-5 w-5 text-destructive" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-destructive';
  };

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Billing System Health</h3>
          <p className="text-sm text-muted-foreground">
            {health?.lastChecked && `Last checked: ${format(new Date(health.lastChecked), 'PPp')}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetchHealth()} disabled={healthLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${healthLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => seedData.mutate()} disabled={seedData.isPending}>
            <Database className="h-4 w-4 mr-2" />
            {seedData.isPending ? 'Seeding...' : 'Seed Data'}
          </Button>
          <Button onClick={() => runTests.mutate()} disabled={runTests.isPending}>
            {runTests.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Run Tests
          </Button>
        </div>
      </div>

      {/* Health Score */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className={`text-4xl font-bold ${getScoreColor(health?.score || 0)}`}>
                {health?.score || 0}%
              </div>
              <p className="text-sm text-muted-foreground">Health Score</p>
            </div>
            <div className="flex-1">
              <Progress value={health?.score || 0} className="h-3" />
            </div>
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>{health?.summary.pass || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span>{health?.summary.warning || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <XCircle className="h-4 w-4 text-destructive" />
                <span>{health?.summary.fail || 0}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Health Checks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {health?.checks.map((check, i) => (
          <Card key={i}>
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                {getStatusIcon(check.status)}
                <div className="flex-1">
                  <p className="font-medium">{check.name}</p>
                  <p className="text-sm text-muted-foreground">{check.message}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Test Results */}
      {testResults && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Test Results
            </CardTitle>
            <CardDescription>
              {testResults.total_tests} tests run with {testResults.pass_rate} pass rate
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-500">{testResults.passed}</div>
                <p className="text-sm text-muted-foreground">Passed</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-destructive">{testResults.failed}</div>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{testResults.total_tests}</div>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{testResults.avg_duration_ms}ms</div>
                <p className="text-sm text-muted-foreground">Avg Duration</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">By Action</h4>
              {Object.entries(testResults.by_action).map(([action, stats]) => (
                <div key={action} className="flex items-center justify-between p-2 rounded bg-muted/50">
                  <span className="font-mono text-sm">{action}</span>
                  <div className="flex items-center gap-4">
                    <Badge variant={stats.failed === 0 ? "outline" : "destructive"}>
                      {stats.passed}/{stats.passed + stats.failed}
                    </Badge>
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {stats.avg_ms}ms
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
