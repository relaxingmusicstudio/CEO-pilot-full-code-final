import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, data } = await req.json();
    console.log(`Financial Integrator: ${action}`);

    switch (action) {
      case 'record_revenue': {
        const { client_id, lead_id, amount, revenue_type, source, campaign_id, touchpoints, agent_contributions, stripe_payment_id } = data;
        
        const { data: attribution, error } = await supabase
          .from('revenue_attribution')
          .insert({
            client_id,
            lead_id,
            revenue_amount: amount,
            revenue_type: revenue_type || 'one_time',
            attribution_source: source,
            campaign_id,
            touchpoints: touchpoints || [],
            agent_contributions: agent_contributions || {},
            stripe_payment_id,
          })
          .select()
          .single();

        if (error) throw error;

        // Update agent ROI metrics
        if (agent_contributions) {
          const today = new Date().toISOString().split('T')[0];
          
          for (const [agentType, contribution] of Object.entries(agent_contributions)) {
            const contributedAmount = amount * ((contribution as number) / 100);
            
            const { data: existing } = await supabase
              .from('agent_roi_metrics')
              .select('*')
              .eq('date', today)
              .eq('agent_type', agentType)
              .single();

            if (existing) {
              await supabase.from('agent_roi_metrics').update({
                attributed_revenue: (existing.attributed_revenue || 0) + contributedAmount,
                conversions: (existing.conversions || 0) + (revenue_type === 'one_time' ? 1 : 0),
              }).eq('id', existing.id);
            } else {
              await supabase.from('agent_roi_metrics').insert({
                date: today,
                agent_type: agentType,
                attributed_revenue: contributedAmount,
                conversions: revenue_type === 'one_time' ? 1 : 0,
              });
            }
          }
        }

        return new Response(JSON.stringify({
          success: true,
          attribution_id: attribution.id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_revenue_metrics': {
        const { start_date, end_date, group_by } = data || {};
        
        let query = supabase
          .from('revenue_attribution')
          .select('*');

        if (start_date) query = query.gte('created_at', start_date);
        if (end_date) query = query.lte('created_at', end_date);

        const { data: attributions, error } = await query;
        if (error) throw error;

        // Calculate metrics
        const totalRevenue = (attributions || []).reduce((sum, a) => sum + (a.revenue_amount || 0), 0);
        const byType = (attributions || []).reduce((acc: Record<string, number>, a) => {
          acc[a.revenue_type] = (acc[a.revenue_type] || 0) + (a.revenue_amount || 0);
          return acc;
        }, {});
        const bySource = (attributions || []).reduce((acc: Record<string, number>, a) => {
          const source = a.attribution_source || 'Unknown';
          acc[source] = (acc[source] || 0) + (a.revenue_amount || 0);
          return acc;
        }, {});

        return new Response(JSON.stringify({
          success: true,
          metrics: {
            totalRevenue,
            byType,
            bySource,
            transactionCount: (attributions || []).length,
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_agent_roi': {
        const { days = 30 } = data || {};
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const [roiRes, costRes] = await Promise.all([
          supabase.from('agent_roi_metrics').select('*').gte('date', startDate),
          supabase.from('agent_cost_tracking').select('*').gte('date', startDate),
        ]);

        // Aggregate by agent
        const agentMetrics: Record<string, unknown> = {};

        for (const roi of roiRes.data || []) {
          if (!agentMetrics[roi.agent_type]) {
            agentMetrics[roi.agent_type] = { revenue: 0, cost: 0, conversions: 0, leads: 0 };
          }
          agentMetrics[roi.agent_type].revenue += roi.attributed_revenue || 0;
          agentMetrics[roi.agent_type].conversions += roi.conversions || 0;
          agentMetrics[roi.agent_type].leads += roi.leads_generated || 0;
        }

        for (const cost of costRes.data || []) {
          if (!agentMetrics[cost.agent_type]) {
            agentMetrics[cost.agent_type] = { revenue: 0, cost: 0, conversions: 0, leads: 0 };
          }
          agentMetrics[cost.agent_type].cost += (cost.cost_cents || 0) / 100;
        }

        // Calculate ROI
        for (const agent of Object.keys(agentMetrics)) {
          const m = agentMetrics[agent];
          m.roi = m.cost > 0 ? ((m.revenue - m.cost) / m.cost) * 100 : m.revenue > 0 ? 100 : 0;
        }

        return new Response(JSON.stringify({
          success: true,
          agentROI: agentMetrics,
          summary: {
            totalRevenue: Object.values(agentMetrics).reduce((sum: number, m: unknown) => sum + m.revenue, 0),
            totalCost: Object.values(agentMetrics).reduce((sum: number, m: unknown) => sum + m.cost, 0),
            averageROI: Object.values(agentMetrics).length > 0 
              ? Object.values(agentMetrics).reduce((sum: number, m: unknown) => sum + m.roi, 0) / Object.values(agentMetrics).length 
              : 0,
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'calculate_ltv_cac': {
        const { data: clients, error: clientError } = await supabase
          .from('clients')
          .select('*');

        const { data: leads, error: leadError } = await supabase
          .from('leads')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);

        const { data: costs, error: costError } = await supabase
          .from('agent_cost_tracking')
          .select('*');

        if (clientError || leadError || costError) throw clientError || leadError || costError;

        // Calculate metrics
        const activeClients = (clients || []).filter(c => c.status === 'active');
        const avgMRR = activeClients.length > 0 
          ? activeClients.reduce((sum, c) => sum + (c.mrr || 0), 0) / activeClients.length 
          : 0;

        // Estimate average customer lifespan (months)
        const churnedClients = (clients || []).filter(c => c.status === 'churned' && c.churned_at);
        let avgLifespanMonths = 24; // default
        if (churnedClients.length > 0) {
          const lifespans = churnedClients.map(c => {
            const start = new Date(c.start_date || c.created_at);
            const end = new Date(c.churned_at);
            return (end.getTime() - start.getTime()) / (30 * 24 * 60 * 60 * 1000);
          });
          avgLifespanMonths = lifespans.reduce((a, b) => a + b, 0) / lifespans.length;
        }

        const ltv = avgMRR * avgLifespanMonths;

        // Calculate CAC
        const totalAcquisitionCost = (costs || []).reduce((sum, c) => sum + (c.cost_cents || 0), 0) / 100;
        const newCustomers = (clients || []).length;
        const cac = newCustomers > 0 ? totalAcquisitionCost / newCustomers : 0;

        const ltvCacRatio = cac > 0 ? ltv / cac : ltv > 0 ? Infinity : 0;

        return new Response(JSON.stringify({
          success: true,
          metrics: {
            ltv,
            cac,
            ltvCacRatio,
            avgMRR,
            avgLifespanMonths,
            activeClients: activeClients.length,
            totalAcquisitionCost,
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'generate_forecast': {
        const { months = 3 } = data || {};
        
        // Get historical data
        const [clientsRes, revenueRes] = await Promise.all([
          supabase.from('clients').select('*'),
          supabase.from('revenue_attribution').select('*').order('created_at', { ascending: true }),
        ]);

        const clients = clientsRes.data || [];
        const revenues = revenueRes.data || [];

        const currentMRR = clients.filter(c => c.status === 'active').reduce((sum, c) => sum + (c.mrr || 0), 0);

        // Simple growth projection
        const monthlyRevenueGrowth = revenues.length > 30 ? 0.05 : 0.1; // 5-10% monthly growth estimate
        
        const forecasts = [];
        let projectedMRR = currentMRR;
        
        for (let i = 1; i <= months; i++) {
          projectedMRR = projectedMRR * (1 + monthlyRevenueGrowth);
          const forecastDate = new Date();
          forecastDate.setMonth(forecastDate.getMonth() + i);
          
          const forecast = {
            forecast_date: forecastDate.toISOString().split('T')[0],
            forecast_type: 'monthly',
            predicted_mrr: Math.round(projectedMRR),
            predicted_revenue: Math.round(projectedMRR), // For SaaS, MRR ~ monthly revenue
            confidence_score: Math.max(50, 95 - (i * 10)), // Confidence decreases over time
          };

          forecasts.push(forecast);
          
          await supabase.from('financial_forecasts').insert(forecast);
        }

        return new Response(JSON.stringify({
          success: true,
          currentMRR,
          forecasts,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error: unknown) {
    console.error('Financial Integrator error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
