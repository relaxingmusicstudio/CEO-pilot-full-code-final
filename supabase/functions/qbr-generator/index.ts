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

  try {
    const { client_id } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Generating QBR for client ${client_id}`);

    // Get client details
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', client_id)
      .maybeSingle();

    if (clientError || !client) {
      throw new Error(`Client not found: ${clientError?.message}`);
    }

    // Calculate quarter dates
    const now = new Date();
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - 3, 1);
    const quarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 0);

    // Get usage data for the quarter
    const { data: usage } = await supabase
      .from('client_usage')
      .select('*')
      .eq('client_id', client_id)
      .gte('date', quarterStart.toISOString().split('T')[0])
      .lte('date', quarterEnd.toISOString().split('T')[0]);

    // Get tickets for the quarter
    const { data: tickets } = await supabase
      .from('client_tickets')
      .select('*')
      .eq('client_id', client_id)
      .gte('created_at', quarterStart.toISOString());

    // Get NPS scores
    const { data: npsData } = await supabase
      .from('nps_surveys')
      .select('score')
      .eq('client_id', client_id)
      .not('score', 'is', null);

    // Calculate metrics
    const totalConversations = usage?.reduce((sum, u) => sum + (u.conversations_handled || 0), 0) || 0;
    const totalLeads = usage?.reduce((sum, u) => sum + (u.leads_captured || 0), 0) || 0;
    const totalAppointments = usage?.reduce((sum, u) => sum + (u.appointments_booked || 0), 0) || 0;

    const avgLeadValue = 351;
    const capturedValue = totalLeads * avgLeadValue;
    const quarterlyInvestment = client.mrr * 3;
    const roi = quarterlyInvestment > 0 ? Math.round((capturedValue / quarterlyInvestment) * 100) : 0;

    const avgNPS = npsData?.length ? Math.round(npsData.reduce((sum, n) => sum + n.score!, 0) / npsData.length * 10) / 10 : null;
    const ticketsResolved = tickets?.filter(t => t.status === 'resolved').length || 0;
    const avgResolutionTime = tickets?.length ? '24 hours' : 'N/A';

    const qbrReport = {
      client: {
        name: client.name,
        business_name: client.business_name,
        plan: client.plan,
        mrr: client.mrr,
        start_date: client.start_date,
        health_score: client.health_score
      },
      period: {
        quarter: `Q${Math.floor(quarterEnd.getMonth() / 3) + 1} ${quarterEnd.getFullYear()}`,
        start: quarterStart.toISOString().split('T')[0],
        end: quarterEnd.toISOString().split('T')[0]
      },
      performance: {
        conversations_handled: totalConversations,
        leads_captured: totalLeads,
        appointments_booked: totalAppointments,
        lead_capture_rate: totalConversations > 0 ? Math.round((totalLeads / totalConversations) * 100) : 0
      },
      value: {
        estimated_lead_value: capturedValue,
        quarterly_investment: quarterlyInvestment,
        roi_percentage: roi
      },
      satisfaction: {
        nps_score: avgNPS,
        tickets_opened: tickets?.length || 0,
        tickets_resolved: ticketsResolved,
        avg_resolution_time: avgResolutionTime
      },
      recommendations: generateRecommendations(client, totalConversations, totalLeads, roi),
      next_quarter_goals: generateGoals(client, totalConversations, totalLeads)
    };

    // Store the report
    const { data: report, error: reportError } = await supabase
      .from('client_value_reports')
      .insert({
        client_id,
        report_type: 'quarterly',
        period_start: quarterStart.toISOString().split('T')[0],
        period_end: quarterEnd.toISOString().split('T')[0],
        metrics: qbrReport,
        generated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (reportError) {
      console.error('Error storing QBR:', reportError);
    }

    // Create work item for CSM to review
    await supabase
      .from('work_queue')
      .insert({
        agent_type: 'csm',
        type: 'qbr',
        title: `QBR Ready: ${client.name}`,
        description: `Quarterly Business Review generated for ${qbrReport.period.quarter}. ROI: ${roi}%`,
        priority: 'high',
        metadata: { client_id, report_id: report?.id }
      });

    console.log(`QBR generated for client ${client_id}: ${roi}% ROI`);

    return new Response(JSON.stringify({
      success: true,
      report_id: report?.id,
      qbr: qbrReport
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Error in qbr-generator:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function generateRecommendations(client: unknown, conversations: number, leads: number, roi: number): string[] {
  const recommendations: string[] = [];

  if (leads / Math.max(conversations, 1) < 0.1) {
    recommendations.push('Optimize AI script to improve lead capture rate');
  }

  if (roi < 200) {
    recommendations.push('Consider expanding AI agent usage to after-hours calls');
  }

  if (client.plan === 'starter' && conversations > 500) {
    recommendations.push('Upgrade to Professional plan to unlock advanced features');
  }

  if (client.health_score < 70) {
    recommendations.push('Schedule a check-in call to address any concerns');
  }

  if (recommendations.length === 0) {
    recommendations.push('Continue current strategy - strong performance!');
    recommendations.push('Explore referral program to grow your network');
  }

  return recommendations;
}

function generateGoals(client: unknown, conversations: number, leads: number): string[] {
  const goals: string[] = [];

  goals.push(`Increase lead capture rate to ${Math.min(Math.round(leads / Math.max(conversations, 1) * 100) + 5, 25)}%`);
  goals.push(`Handle ${Math.round(conversations * 1.15)} conversations (+15%)`);
  
  if (client.plan !== 'enterprise') {
    goals.push('Evaluate plan upgrade for additional features');
  }

  goals.push('Maintain health score above 80');

  return goals;
}
