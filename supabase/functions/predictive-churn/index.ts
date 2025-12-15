import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChurnPrediction {
  clientId: string;
  clientName: string;
  mrr: number;
  churnProbability: number;
  riskFactors: string[];
  recommendedActions: string[];
  daysUntilLikelyChurn: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('Running predictive churn analysis...');

    // Get all active clients with their metrics
    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .eq('status', 'active');

    if (!clients || clients.length === 0) {
      return new Response(JSON.stringify({ predictions: [], summary: 'No active clients' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const predictions: ChurnPrediction[] = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const client of clients) {
      const riskFactors: string[] = [];
      let churnScore = 0;

      // Factor 1: Health score (40% weight)
      const healthScore = client.health_score || 100;
      if (healthScore < 30) {
        churnScore += 40;
        riskFactors.push(`Critical health score: ${healthScore}`);
      } else if (healthScore < 50) {
        churnScore += 25;
        riskFactors.push(`Low health score: ${healthScore}`);
      } else if (healthScore < 70) {
        churnScore += 10;
        riskFactors.push(`Below-average health: ${healthScore}`);
      }

      // Factor 2: Days since last contact (25% weight)
      const lastContact = client.last_contact ? new Date(client.last_contact) : null;
      const daysSinceContact = lastContact 
        ? Math.floor((Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      if (daysSinceContact > 60) {
        churnScore += 25;
        riskFactors.push(`No contact in ${daysSinceContact} days`);
      } else if (daysSinceContact > 30) {
        churnScore += 15;
        riskFactors.push(`Limited contact (${daysSinceContact} days)`);
      } else if (daysSinceContact > 14) {
        churnScore += 5;
      }

      // Factor 3: Usage data (20% weight)
      const { data: usageData } = await supabase
        .from('client_usage')
        .select('*')
        .eq('client_id', client.id)
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0]);

      const totalLogins = usageData?.reduce((sum, d) => sum + (d.login_count || 0), 0) || 0;
      const totalConversations = usageData?.reduce((sum, d) => sum + (d.conversations_handled || 0), 0) || 0;

      if (totalLogins === 0 && totalConversations === 0) {
        churnScore += 20;
        riskFactors.push('Zero product usage in 30 days');
      } else if (totalLogins < 5) {
        churnScore += 12;
        riskFactors.push(`Very low login activity: ${totalLogins}`);
      } else if (totalLogins < 15) {
        churnScore += 5;
      }

      // Factor 4: Open tickets (15% weight)
      const { data: tickets } = await supabase
        .from('client_tickets')
        .select('*')
        .eq('client_id', client.id)
        .in('status', ['open', 'in_progress']);

      const urgentTickets = tickets?.filter(t => t.priority === 'urgent').length || 0;
      const openTickets = tickets?.length || 0;

      if (urgentTickets > 0) {
        churnScore += 15;
        riskFactors.push(`${urgentTickets} urgent unresolved ticket(s)`);
      } else if (openTickets > 3) {
        churnScore += 8;
        riskFactors.push(`${openTickets} open tickets`);
      }

      // Calculate probability and timeline
      const churnProbability = Math.min(100, Math.max(0, churnScore));
      const daysUntilLikelyChurn = churnProbability > 70 
        ? 14 
        : churnProbability > 50 
          ? 30 
          : churnProbability > 30 
            ? 60 
            : 90;

      // Generate recommendations
      const recommendedActions: string[] = [];
      if (daysSinceContact > 14) {
        recommendedActions.push('Schedule check-in call immediately');
      }
      if (healthScore < 50) {
        recommendedActions.push('Conduct health score review meeting');
      }
      if (totalLogins < 5) {
        recommendedActions.push('Send product adoption tips & training offer');
      }
      if (urgentTickets > 0) {
        recommendedActions.push('Escalate and resolve urgent tickets');
      }
      if (churnProbability > 60) {
        recommendedActions.push('Consider retention offer or discount');
      }

      if (churnProbability >= 20) {
        predictions.push({
          clientId: client.id,
          clientName: client.business_name || client.name || 'Unknown',
          mrr: client.mrr || 0,
          churnProbability,
          riskFactors,
          recommendedActions,
          daysUntilLikelyChurn,
        });
      }
    }

    // Sort by churn probability (highest risk first)
    predictions.sort((a, b) => b.churnProbability - a.churnProbability);

    // Calculate summary stats
    const highRisk = predictions.filter(p => p.churnProbability >= 70);
    const atRiskMRR = highRisk.reduce((sum, p) => sum + p.mrr, 0);

    // Create urgent alerts for high-risk clients
    for (const pred of highRisk) {
      await supabase.from('work_queue').upsert({
        agent_type: 'inbox',
        title: `🚨 HIGH CHURN RISK: ${pred.clientName}`,
        description: `${pred.churnProbability}% probability. MRR at risk: $${pred.mrr}. Actions: ${pred.recommendedActions.join(', ')}`,
        type: 'alert',
        priority: 'urgent',
        source: 'predictive-churn',
        status: 'pending',
        metadata: {
          client_id: pred.clientId,
          churn_probability: pred.churnProbability,
          mrr: pred.mrr,
          risk_factors: pred.riskFactors,
        },
      }, {
        onConflict: 'id',
        ignoreDuplicates: false,
      });

      // Send SMS for critical churn risk
      if (pred.churnProbability >= 80) {
        await supabase.functions.invoke('sms-alert', {
          body: {
            alertType: 'churn_critical',
            title: `CHURN ALERT: ${pred.clientName}`,
            message: `${pred.churnProbability}% churn risk. $${pred.mrr}/mo at stake. Top factor: ${pred.riskFactors[0]}`,
            priority: 'urgent',
            metadata: { clientId: pred.clientId },
          },
        });
      }
    }

    // Log automation run
    await supabase.from('automation_logs').insert({
      function_name: 'predictive-churn',
      status: 'success',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      items_processed: clients.length,
      items_created: highRisk.length,
      metadata: {
        total_predictions: predictions.length,
        high_risk_count: highRisk.length,
        at_risk_mrr: atRiskMRR,
      },
    });

    console.log(`Churn analysis complete: ${predictions.length} at-risk, ${highRisk.length} critical`);

    return new Response(JSON.stringify({
      success: true,
      predictions: predictions.slice(0, 20),
      summary: {
        totalAnalyzed: clients.length,
        atRiskCount: predictions.length,
        highRiskCount: highRisk.length,
        atRiskMRR,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Predictive churn error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
