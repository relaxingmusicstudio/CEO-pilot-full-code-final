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

  try {
    const { action, cohort_type = 'monthly' } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === 'get_retention_cohorts') {
      console.log(`Generating ${cohort_type} retention cohorts`);

      const { data: clients } = await supabase
        .from('clients')
        .select('*')
        .order('start_date');

      if (!clients || clients.length === 0) {
        return new Response(JSON.stringify({ cohorts: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Group clients by cohort (month of signup)
      const cohorts: Record<string, any[]> = {};
      
      for (const client of clients) {
        const startDate = new Date(client.start_date);
        const cohortKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
        
        if (!cohorts[cohortKey]) {
          cohorts[cohortKey] = [];
        }
        cohorts[cohortKey].push(client);
      }

      // Calculate retention for each cohort
      const retentionData = Object.entries(cohorts).map(([cohortMonth, cohortClients]) => {
        const cohortStart = new Date(cohortMonth + '-01');
        const now = new Date();
        const monthsSinceStart = Math.floor((now.getTime() - cohortStart.getTime()) / (1000 * 60 * 60 * 24 * 30));

        const retention: number[] = [];
        for (let month = 0; month <= Math.min(monthsSinceStart, 12); month++) {
          const checkDate = new Date(cohortStart);
          checkDate.setMonth(checkDate.getMonth() + month);
          
          const activeAtMonth = cohortClients.filter(c => {
            const churnDate = c.churned_at ? new Date(c.churned_at) : null;
            return !churnDate || churnDate > checkDate;
          }).length;

          retention.push(Math.round((activeAtMonth / cohortClients.length) * 100));
        }

        const totalMRR = cohortClients.reduce((sum, c) => sum + (c.status === 'active' ? c.mrr : 0), 0);
        const avgMRR = cohortClients.length > 0 ? Math.round(totalMRR / cohortClients.filter(c => c.status === 'active').length) || 0 : 0;

        return {
          cohort: cohortMonth,
          size: cohortClients.length,
          active: cohortClients.filter(c => c.status === 'active').length,
          churned: cohortClients.filter(c => c.status === 'churned').length,
          retention,
          current_retention: retention[retention.length - 1] || 100,
          total_mrr: totalMRR,
          avg_mrr: avgMRR
        };
      });

      return new Response(JSON.stringify({
        cohorts: retentionData.sort((a, b) => b.cohort.localeCompare(a.cohort))
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'get_plan_cohorts') {
      const { data: clients } = await supabase
        .from('clients')
        .select('*');

      const planCohorts = ['starter', 'professional', 'enterprise'].map(plan => {
        const planClients = clients?.filter(c => c.plan === plan) || [];
        const active = planClients.filter(c => c.status === 'active');
        const churned = planClients.filter(c => c.status === 'churned');

        return {
          plan,
          total: planClients.length,
          active: active.length,
          churned: churned.length,
          retention_rate: planClients.length > 0 ? Math.round((active.length / planClients.length) * 100) : 0,
          total_mrr: active.reduce((sum, c) => sum + c.mrr, 0),
          avg_mrr: active.length > 0 ? Math.round(active.reduce((sum, c) => sum + c.mrr, 0) / active.length) : 0,
          avg_health_score: active.length > 0 ? Math.round(active.reduce((sum, c) => sum + (c.health_score || 0), 0) / active.length) : 0
        };
      });

      return new Response(JSON.stringify({ cohorts: planCohorts }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'get_source_cohorts') {
      const { data: clients } = await supabase
        .from('clients')
        .select('*, leads!lead_id(visitor_id)');

      const { data: visitors } = await supabase
        .from('visitors')
        .select('visitor_id, utm_source, utm_medium, utm_campaign');

      // Group by source
      const sourceCohorts: Record<string, any[]> = {};
      
      for (const client of clients || []) {
        const visitor = visitors?.find(v => v.visitor_id === client.leads?.visitor_id);
        const source = visitor?.utm_source || 'direct';
        
        if (!sourceCohorts[source]) {
          sourceCohorts[source] = [];
        }
        sourceCohorts[source].push(client);
      }

      const cohortData = Object.entries(sourceCohorts).map(([source, sourceClients]) => {
        const active = sourceClients.filter(c => c.status === 'active');
        const churned = sourceClients.filter(c => c.status === 'churned');

        return {
          source,
          total: sourceClients.length,
          active: active.length,
          churned: churned.length,
          retention_rate: sourceClients.length > 0 ? Math.round((active.length / sourceClients.length) * 100) : 0,
          total_mrr: active.reduce((sum, c) => sum + c.mrr, 0),
          avg_ltv: active.length > 0 ? Math.round(active.reduce((sum, c) => sum + c.mrr, 0) * 24 / active.length) : 0 // Assuming 24 month LTV
        };
      });

      return new Response(JSON.stringify({
        cohorts: cohortData.sort((a, b) => b.total_mrr - a.total_mrr)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'get_ltv_by_cohort') {
      const { data: clients } = await supabase
        .from('clients')
        .select('*');

      // Calculate LTV for each client
      const clientsWithLTV = clients?.map(c => {
        const startDate = new Date(c.start_date);
        const endDate = c.churned_at ? new Date(c.churned_at) : new Date();
        const monthsActive = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
        const ltv = c.mrr * monthsActive;
        
        return {
          ...c,
          months_active: monthsActive,
          ltv
        };
      }) || [];

      // Group by signup month
      const cohorts: Record<string, any[]> = {};
      for (const client of clientsWithLTV) {
        const startDate = new Date(client.start_date);
        const cohortKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
        
        if (!cohorts[cohortKey]) {
          cohorts[cohortKey] = [];
        }
        cohorts[cohortKey].push(client);
      }

      const ltvData = Object.entries(cohorts).map(([month, cohortClients]) => ({
        cohort: month,
        clients: cohortClients.length,
        avg_ltv: Math.round(cohortClients.reduce((sum, c) => sum + c.ltv, 0) / cohortClients.length),
        total_ltv: cohortClients.reduce((sum, c) => sum + c.ltv, 0),
        avg_months_active: Math.round(cohortClients.reduce((sum, c) => sum + c.months_active, 0) / cohortClients.length * 10) / 10
      }));

      return new Response(JSON.stringify({
        cohorts: ltvData.sort((a, b) => b.cohort.localeCompare(a.cohort))
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in cohort-analysis:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
