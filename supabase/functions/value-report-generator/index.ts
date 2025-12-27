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
    const { client_id, report_type = 'monthly' } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Generating ${report_type} value report for client ${client_id}`);

    // Get client details
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', client_id)
      .maybeSingle();

    if (clientError || !client) {
      throw new Error(`Client not found: ${clientError?.message}`);
    }

    // Calculate date range
    const now = new Date();
    let periodStart: Date;
    const periodEnd = now;

    if (report_type === 'monthly') {
      periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    } else if (report_type === 'quarterly') {
      periodStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    } else {
      periodStart = new Date(now.getFullYear(), 0, 1);
    }

    // Get usage data for the period
    const { data: usage } = await supabase
      .from('client_usage')
      .select('*')
      .eq('client_id', client_id)
      .gte('date', periodStart.toISOString().split('T')[0])
      .lte('date', periodEnd.toISOString().split('T')[0]);

    // Calculate metrics
    const totalConversations = usage?.reduce((sum, u) => sum + (u.conversations_handled || 0), 0) || 0;
    const totalLeads = usage?.reduce((sum, u) => sum + (u.leads_captured || 0), 0) || 0;
    const totalAppointments = usage?.reduce((sum, u) => sum + (u.appointments_booked || 0), 0) || 0;
    const totalApiCalls = usage?.reduce((sum, u) => sum + (u.api_calls || 0), 0) || 0;

    // Calculate estimated value
    const avgLeadValue = 351; // HVAC industry average
    const capturedValue = totalLeads * avgLeadValue;
    const missedCallRate = 0.27; // Industry average
    const potentialMissedCalls = Math.round(totalConversations * missedCallRate);
    const savedRevenue = potentialMissedCalls * avgLeadValue;

    // Calculate time saved (assuming 3 minutes per call handled by AI)
    const timeSavedMinutes = totalConversations * 3;
    const timeSavedHours = Math.round(timeSavedMinutes / 60);

    // ROI calculation
    const monthlyInvestment = client.mrr;
    const totalValue = capturedValue + savedRevenue;
    const roi = monthlyInvestment > 0 ? Math.round((totalValue / monthlyInvestment) * 100) : 0;

    const metrics = {
      period: {
        start: periodStart.toISOString().split('T')[0],
        end: periodEnd.toISOString().split('T')[0],
        type: report_type
      },
      activity: {
        conversations_handled: totalConversations,
        leads_captured: totalLeads,
        appointments_booked: totalAppointments,
        api_calls: totalApiCalls
      },
      value: {
        captured_lead_value: capturedValue,
        potential_missed_calls: potentialMissedCalls,
        saved_revenue: savedRevenue,
        total_value: totalValue
      },
      efficiency: {
        time_saved_hours: timeSavedHours,
        calls_after_hours: Math.round(totalConversations * 0.35),
        avg_response_time_seconds: 3
      },
      roi: {
        monthly_investment: monthlyInvestment,
        total_value_delivered: totalValue,
        roi_percentage: roi
      },
      highlights: [
        `Captured ${totalLeads} new leads worth an estimated $${capturedValue.toLocaleString()}`,
        `Saved approximately ${timeSavedHours} hours of staff time`,
        `Handled ${Math.round(totalConversations * 0.35)} after-hours calls that would have been missed`,
        `${roi}% return on your AI agent investment`
      ]
    };

    // Store the report
    const { data: report, error: reportError } = await supabase
      .from('client_value_reports')
      .insert({
        client_id,
        report_type,
        period_start: periodStart.toISOString().split('T')[0],
        period_end: periodEnd.toISOString().split('T')[0],
        metrics,
        generated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (reportError) {
      console.error('Error storing report:', reportError);
    }

    // Create work queue item for review/sending
    await supabase
      .from('work_queue')
      .insert({
        agent_type: 'csm',
        type: 'report',
        title: `Value Report Ready: ${client.name}`,
        description: `${report_type} value report generated showing ${roi}% ROI. Review and send to client.`,
        priority: 'medium',
        metadata: { client_id, report_id: report?.id, metrics }
      });

    console.log(`Value report generated for client ${client_id}: ${roi}% ROI`);

    return new Response(JSON.stringify({
      success: true,
      report_id: report?.id,
      metrics
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Error in value-report-generator:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
