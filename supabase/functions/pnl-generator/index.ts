import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

  try {
    const { action, period = 'mtd' } = await req.json();
    console.log(`P&L Generator action: ${action}, period: ${period}`);

    // Calculate date ranges
    const now = new Date();
    let startDate: Date;
    let previousStartDate: Date;
    let previousEndDate: Date;

    switch (period) {
      case 'ytd':
        startDate = new Date(now.getFullYear(), 0, 1);
        previousStartDate = new Date(now.getFullYear() - 1, 0, 1);
        previousEndDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      case 'qtd': {
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        previousStartDate = new Date(now.getFullYear(), (quarter - 1) * 3, 1);
        previousEndDate = new Date(now.getFullYear(), quarter * 3, 0);
        break;
      }
      case 'mtd':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
    }

    switch (action) {
      case 'generate_pnl': {
        // Fetch revenue from client_payments
        const { data: payments } = await supabase
          .from('client_payments')
          .select('amount, created_at')
          .gte('created_at', startDate.toISOString())
          .eq('status', 'completed');

        const revenue = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

        // Fetch AI costs from agent_cost_tracking
        const { data: aiCosts } = await supabase
          .from('agent_cost_tracking')
          .select('cost_cents, date')
          .gte('date', startDate.toISOString().split('T')[0]);

        const totalAiCosts = aiCosts?.reduce((sum, c) => sum + (c.cost_cents || 0), 0) || 0;
        const aiCostsDollars = totalAiCosts / 100;

        // Fetch bank transaction expenses (negative amounts = expenses)
        const { data: bankExpenses } = await supabase
          .from('bank_transactions')
          .select('amount, ai_category, date')
          .gte('date', startDate.toISOString().split('T')[0])
          .lt('amount', 0);

        const operatingExpenses = bankExpenses?.reduce((sum, t) => sum + Math.abs(t.amount), 0) || 0;

        // Calculate MRR from active clients
        const { data: clients } = await supabase
          .from('clients')
          .select('mrr')
          .eq('status', 'active');

        const mrr = clients?.reduce((sum, c) => sum + (c.mrr || 0), 0) || 0;

        // Calculate margins
        const grossProfit = revenue - aiCostsDollars;
        const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
        const netProfit = grossProfit - operatingExpenses;
        const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

        // Build expense breakdown by category
        const expensesByCategory: Record<string, number> = {};
        bankExpenses?.forEach(t => {
          const category = t.ai_category || 'Uncategorized';
          expensesByCategory[category] = (expensesByCategory[category] || 0) + Math.abs(t.amount);
        });
        expensesByCategory['AI Services'] = aiCostsDollars;

        // Generate trend data for charts
        const trendData = await generateTrendData(supabase, period, startDate);

        return new Response(JSON.stringify({
          period,
          summary: {
            revenue,
            mrr,
            ai_costs: aiCostsDollars,
            operating_expenses: operatingExpenses,
            gross_profit: grossProfit,
            gross_margin: grossMargin,
            net_profit: netProfit,
            net_margin: netMargin,
          },
          expenses_breakdown: expensesByCategory,
          trend_data: trendData,
          generated_at: new Date().toISOString(),
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_mrr_breakdown': {
        const { data: clients } = await supabase
          .from('clients')
          .select('plan, mrr, status')
          .eq('status', 'active');

        const byPlan: Record<string, { count: number; mrr: number }> = {};
        
        clients?.forEach(c => {
          const plan = c.plan || 'unknown';
          if (!byPlan[plan]) {
            byPlan[plan] = { count: 0, mrr: 0 };
          }
          byPlan[plan].count++;
          byPlan[plan].mrr += c.mrr || 0;
        });

        const totalMrr = Object.values(byPlan).reduce((sum, p) => sum + p.mrr, 0);
        const totalClients = Object.values(byPlan).reduce((sum, p) => sum + p.count, 0);

        return new Response(JSON.stringify({
          total_mrr: totalMrr,
          total_clients: totalClients,
          by_plan: byPlan,
          arr: totalMrr * 12,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_cost_analysis': {
        // Get AI costs by agent type
        const { data: aiCosts } = await supabase
          .from('agent_cost_tracking')
          .select('agent_type, cost_cents, api_calls, tokens_used')
          .gte('date', startDate.toISOString().split('T')[0]);

        const byAgent: Record<string, { cost: number; calls: number; tokens: number }> = {};
        
        aiCosts?.forEach(c => {
          const agent = c.agent_type;
          if (!byAgent[agent]) {
            byAgent[agent] = { cost: 0, calls: 0, tokens: 0 };
          }
          byAgent[agent].cost += (c.cost_cents || 0) / 100;
          byAgent[agent].calls += c.api_calls || 0;
          byAgent[agent].tokens += c.tokens_used || 0;
        });

        const totalCost = Object.values(byAgent).reduce((sum, a) => sum + a.cost, 0);

        return new Response(JSON.stringify({
          period,
          total_cost: totalCost,
          by_agent: byAgent,
          average_cost_per_call: totalCost / Math.max(Object.values(byAgent).reduce((sum, a) => sum + a.calls, 0), 1),
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: unknown) {
    console.error('P&L Generator error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateTrendData(supabase: unknown, period: string, startDate: Date) {
  const data: Array<{ date: string; revenue: number; costs: number; profit: number }> = [];
  const now = new Date();

  // Determine granularity based on period
  const daysDiff = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const granularity = daysDiff > 60 ? 'week' : 'day';

  // Fetch payments grouped by date
  const { data: payments } = await supabase
    .from('client_payments')
    .select('amount, created_at')
    .gte('created_at', startDate.toISOString())
    .eq('status', 'completed');

  // Fetch AI costs grouped by date
  const { data: aiCosts } = await supabase
    .from('agent_cost_tracking')
    .select('cost_cents, date')
    .gte('date', startDate.toISOString().split('T')[0]);

  // Group by date
  const revenueByDate: Record<string, number> = {};
  const costsByDate: Record<string, number> = {};

  payments?.forEach((p: unknown) => {
    const date = new Date(p.created_at).toISOString().split('T')[0];
    revenueByDate[date] = (revenueByDate[date] || 0) + Number(p.amount || 0);
  });

  aiCosts?.forEach((c: unknown) => {
    costsByDate[c.date] = (costsByDate[c.date] || 0) + (c.cost_cents || 0) / 100;
  });

  // Generate data points
  const currentDate = new Date(startDate);
  while (currentDate <= now) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const revenue = revenueByDate[dateStr] || 0;
    const costs = costsByDate[dateStr] || 0;
    
    data.push({
      date: dateStr,
      revenue,
      costs,
      profit: revenue - costs,
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return data;
}
