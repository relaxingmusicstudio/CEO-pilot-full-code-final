import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createAuditContext } from '../_shared/auditLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const audit = createAuditContext(supabase, 'finance-agent', 'finance_operation');

  try {
    const { action, ...params } = await req.json();
    console.log(`Finance Agent action: ${action}`);
    await audit.logStart(`Starting finance action: ${action}`, { action, params });

    switch (action) {
      case 'categorize_transaction': {
        const { transaction_id } = params;

        // Get transaction
        const { data: transaction, error } = await supabase
          .from('bank_transactions')
          .select('*')
          .eq('id', transaction_id)
          .single();

        if (error || !transaction) {
          await audit.logError('Transaction not found', error, { transaction_id });
          throw new Error('Transaction not found');
        }

        // Use AI to categorize - leverage Lovable AI
        const category = await categorizeWithAI(transaction);

        // Update transaction
        await supabase
          .from('bank_transactions')
          .update({
            ai_category: category.category,
            ai_confidence: category.confidence,
            needs_review: category.confidence < 0.8,
          })
          .eq('id', transaction_id);

        await audit.logSuccess(`Categorized transaction: ${category.category}`, 'transaction', transaction_id, { category });

        return new Response(JSON.stringify({
          success: true,
          category: category.category,
          confidence: category.confidence,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'bulk_categorize': {
        // Get uncategorized transactions
        const { data: transactions } = await supabase
          .from('bank_transactions')
          .select('*')
          .is('ai_category', null)
          .limit(50);

        if (!transactions || transactions.length === 0) {
          await audit.logSuccess('No transactions to categorize', 'bulk_categorize', undefined, { categorized: 0 });
          return new Response(JSON.stringify({ 
            success: true, 
            categorized: 0 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        let categorized = 0;
        for (const tx of transactions) {
          const category = await categorizeWithAI(tx);
          
          await supabase
            .from('bank_transactions')
            .update({
              ai_category: category.category,
              ai_confidence: category.confidence,
              needs_review: category.confidence < 0.8,
            })
            .eq('id', tx.id);
          
          categorized++;
        }

        await audit.logSuccess(`Bulk categorized ${categorized} transactions`, 'bulk_categorize', undefined, { categorized });

        return new Response(JSON.stringify({
          success: true,
          categorized,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'detect_anomalies': {
        // Get recent transactions
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: transactions } = await supabase
          .from('bank_transactions')
          .select('*')
          .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
          .order('date', { ascending: false });

        if (!transactions) {
          await audit.logSuccess('No transactions for anomaly detection', 'anomaly_detection');
          return new Response(JSON.stringify({ anomalies: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Calculate average and std dev
        const amounts = transactions.map(t => Math.abs(t.amount));
        const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const stdDev = Math.sqrt(
          amounts.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / amounts.length
        );

        // Flag transactions > 2 std devs from mean
        const anomalies = transactions
          .filter(t => Math.abs(Math.abs(t.amount) - avg) > 2 * stdDev)
          .map(t => ({
            id: t.id,
            name: t.name,
            amount: t.amount,
            date: t.date,
            reason: `Amount ${Math.abs(t.amount).toFixed(2)} is significantly different from average ${avg.toFixed(2)}`,
            severity: Math.abs(Math.abs(t.amount) - avg) > 3 * stdDev ? 'high' : 'medium',
          }));

        await audit.logSuccess(`Detected ${anomalies.length} anomalies`, 'anomaly_detection', undefined, { anomaly_count: anomalies.length });

        return new Response(JSON.stringify({ anomalies }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'finance_qa': {
        const { question } = params;

        // Gather context
        const { data: summary } = await supabase.functions.invoke('pnl-generator', {
          body: { action: 'generate_pnl', period: 'mtd' },
        });

        const { data: mrrBreakdown } = await supabase.functions.invoke('pnl-generator', {
          body: { action: 'get_mrr_breakdown' },
        });

        // Generate response using context
        const response = await generateFinanceAnswer(question, summary, mrrBreakdown);

        await audit.logSuccess('Answered finance question', 'finance_qa', undefined, { question: question?.substring(0, 100) });

        return new Response(JSON.stringify({ answer: response }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'sync_all_providers': {
        const results: Record<string, unknown> = {};

        // Sync Plaid transactions
        const { data: plaidConnections } = await supabase
          .from('bank_connections')
          .select('id')
          .eq('provider', 'plaid')
          .eq('is_active', true);

        if (plaidConnections?.length) {
          for (const conn of plaidConnections) {
            try {
              const { data } = await supabase.functions.invoke('plaid-integration', {
                body: { action: 'sync_transactions', connection_id: conn.id },
              });
              results.plaid = data;
            } catch (e) {
              results.plaid = { error: String(e) };
            }
          }
        }

        // Check QuickBooks status
        const { data: qbStatus } = await supabase.functions.invoke('quickbooks-integration', {
          body: { action: 'get_connection_status' },
        });
        results.quickbooks = qbStatus;

        await audit.logSuccess('Synced all providers', 'provider_sync', undefined, { providers: Object.keys(results) });

        return new Response(JSON.stringify({ 
          success: true, 
          results,
          synced_at: new Date().toISOString(),
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_finance_health': {
        // Aggregate finance health metrics
        const { data: pnl } = await supabase.functions.invoke('pnl-generator', {
          body: { action: 'generate_pnl', period: 'mtd' },
        });

        const { data: qbStatus } = await supabase.functions.invoke('quickbooks-integration', {
          body: { action: 'get_connection_status' },
        });

        const { data: plaidConnections } = await supabase
          .from('bank_connections')
          .select('id, institution_name, last_sync_at')
          .eq('provider', 'plaid')
          .eq('is_active', true);

        const { data: uncategorized } = await supabase
          .from('bank_transactions')
          .select('id', { count: 'exact' })
          .is('ai_category', null);

        const healthData = {
          mrr: pnl?.summary?.mrr || 0,
          ai_costs_mtd: pnl?.summary?.ai_costs || 0,
          gross_margin: pnl?.summary?.gross_margin || 0,
          quickbooks_connected: qbStatus?.connected || false,
          plaid_connections: plaidConnections?.length || 0,
          uncategorized_transactions: uncategorized?.length || 0,
          last_sync: plaidConnections?.[0]?.last_sync_at || null,
        };

        await audit.logSuccess('Retrieved finance health', 'finance_health', undefined, { mrr: healthData.mrr });

        return new Response(JSON.stringify(healthData), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        await audit.logError('Unknown action', new Error(`Unknown action: ${action}`), { action });
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: unknown) {
    console.error('Finance Agent error:', error);
    await audit.logError('Finance agent failed', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// AI categorization using rule-based + keyword matching
async function categorizeWithAI(transaction: unknown): Promise<{ category: string; confidence: number }> {
  const name = (transaction.name || '').toLowerCase();
  const merchantName = (transaction.merchant_name || '').toLowerCase();
  const combined = `${name} ${merchantName}`;

  // Rule-based categorization
  const categories: Record<string, { keywords: string[]; category: string }> = {
    payroll: { keywords: ['payroll', 'salary', 'wages', 'adp', 'gusto', 'paychex'], category: 'Payroll' },
    software: { keywords: ['software', 'saas', 'subscription', 'aws', 'google', 'microsoft', 'adobe', 'slack', 'zoom'], category: 'Software & Tools' },
    marketing: { keywords: ['facebook', 'google ads', 'marketing', 'advertising', 'meta', 'tiktok'], category: 'Marketing & Ads' },
    utilities: { keywords: ['electric', 'water', 'gas', 'utility', 'internet', 'phone', 'verizon', 'att'], category: 'Utilities' },
    office: { keywords: ['office', 'supplies', 'amazon', 'staples'], category: 'Office Supplies' },
    insurance: { keywords: ['insurance', 'liability', 'health', 'dental'], category: 'Insurance' },
    professional: { keywords: ['legal', 'accounting', 'consulting', 'lawyer', 'cpa'], category: 'Professional Services' },
    travel: { keywords: ['airline', 'hotel', 'uber', 'lyft', 'gas', 'parking'], category: 'Travel & Transportation' },
  };

  for (const [, config] of Object.entries(categories)) {
    for (const keyword of config.keywords) {
      if (combined.includes(keyword)) {
        return { category: config.category, confidence: 0.85 };
      }
    }
  }

  // Use Plaid category if available
  if (transaction.category && transaction.category.length > 0) {
    return { category: transaction.category[0], confidence: 0.7 };
  }

  return { category: 'Uncategorized', confidence: 0.3 };
}

// Generate finance answer
async function generateFinanceAnswer(question: string, pnl: unknown, mrr: unknown): Promise<string> {
  const q = question.toLowerCase();

  if (q.includes('mrr') || q.includes('recurring revenue')) {
    return `Current MRR is $${mrr?.total_mrr?.toLocaleString() || 0} from ${mrr?.total_clients || 0} active clients. ARR projection: $${(mrr?.total_mrr * 12 || 0).toLocaleString()}.`;
  }

  if (q.includes('margin') || q.includes('profit')) {
    return `Gross margin is ${pnl?.summary?.gross_margin?.toFixed(1) || 0}% with net margin at ${pnl?.summary?.net_margin?.toFixed(1) || 0}%. Gross profit: $${pnl?.summary?.gross_profit?.toLocaleString() || 0}.`;
  }

  if (q.includes('cost') || q.includes('expense')) {
    return `AI costs MTD: $${pnl?.summary?.ai_costs?.toFixed(2) || 0}. Operating expenses: $${pnl?.summary?.operating_expenses?.toLocaleString() || 0}.`;
  }

  if (q.includes('revenue')) {
    return `Revenue MTD: $${pnl?.summary?.revenue?.toLocaleString() || 0}. MRR: $${pnl?.summary?.mrr?.toLocaleString() || 0}.`;
  }

  return `Based on current data: Revenue $${pnl?.summary?.revenue?.toLocaleString() || 0}, MRR $${pnl?.summary?.mrr?.toLocaleString() || 0}, Gross Margin ${pnl?.summary?.gross_margin?.toFixed(1) || 0}%. What specific aspect would you like to explore?`;
}