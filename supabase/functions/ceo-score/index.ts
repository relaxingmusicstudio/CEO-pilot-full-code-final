import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScoreComponent {
  score: number;
  weight: number;
  insights: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action } = await req.json();

    if (action === 'calculate') {
      const scores = await calculateAllScores(supabase);
      const ceoScore = calculateCEOScore(scores);

      // Store in history
      const { error: insertError } = await supabase
        .from('ceo_score_history')
        .insert({
          score: ceoScore.overall,
          client_health_score: scores.clientHealth.score,
          revenue_health_score: scores.revenueHealth.score,
          system_health_score: scores.systemHealth.score,
          task_health_score: scores.taskHealth.score,
          compliance_health_score: scores.complianceHealth.score,
          breakdown: scores,
          insights: ceoScore.insights,
        });

      if (insertError) {
        console.error('Failed to store CEO score:', insertError);
      }

      return new Response(JSON.stringify(ceoScore), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_latest') {
      const { data, error } = await supabase
        .from('ceo_score_history')
        .select('*')
        .order('calculated_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return new Response(JSON.stringify(data || null), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_history') {
      const requestBody = await req.json().catch(() => ({}));
      const days = requestBody.days || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('ceo_score_history')
        .select('*')
        .gte('calculated_at', startDate.toISOString())
        .order('calculated_at', { ascending: true });

      if (error) throw error;

      return new Response(JSON.stringify(data || []), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('CEO Score error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function calculateAllScores(supabase: unknown): Promise<Record<string, ScoreComponent>> {
  const scores: Record<string, ScoreComponent> = {
    clientHealth: { score: 50, weight: 0.25, insights: [] },
    revenueHealth: { score: 50, weight: 0.25, insights: [] },
    systemHealth: { score: 50, weight: 0.20, insights: [] },
    taskHealth: { score: 50, weight: 0.15, insights: [] },
    complianceHealth: { score: 50, weight: 0.15, insights: [] },
  };

  // Calculate Client Health Score
  try {
    const { data: clients } = await supabase
      .from('clients')
      .select('health_score, status')
      .eq('status', 'active');

    if (clients?.length) {
      const typedClients = clients as Array<{ health_score: number | null; status: string }>;
      const avgHealth = typedClients.reduce((sum, c) => sum + (c.health_score || 50), 0) / typedClients.length;
      scores.clientHealth.score = Math.round(avgHealth);
      
      const atRiskCount = typedClients.filter(c => (c.health_score || 50) < 40).length;
      if (atRiskCount > 0) {
        scores.clientHealth.insights.push(`${atRiskCount} clients at risk (health < 40)`);
      }
      if (avgHealth > 70) {
        scores.clientHealth.insights.push('Overall client health is strong');
      }
    }
  } catch (e) {
    console.error('Client health calculation error:', e);
  }

  // Calculate Revenue Health Score
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentClients } = await supabase
      .from('clients')
      .select('mrr, status, churned_at')
      .gte('created_at', thirtyDaysAgo.toISOString());

    const { data: allActiveClients } = await supabase
      .from('clients')
      .select('mrr')
      .eq('status', 'active');

    const typedActiveClients = (allActiveClients || []) as Array<{ mrr: number | null }>;
    const typedRecentClients = (recentClients || []) as Array<{ mrr: number | null; status: string }>;

    const totalMRR = typedActiveClients.reduce((sum, c) => sum + (c.mrr || 0), 0);
    const churnedCount = typedRecentClients.filter(c => c.status === 'churned').length;
    const newCount = typedRecentClients.filter(c => c.status === 'active').length;

    // Simple revenue health: base 50 + adjustments
    let revenueScore = 50;
    if (totalMRR > 10000) revenueScore += 20;
    else if (totalMRR > 5000) revenueScore += 10;
    
    if (newCount > churnedCount) revenueScore += 15;
    else if (churnedCount > newCount) revenueScore -= 15;

    scores.revenueHealth.score = Math.min(100, Math.max(0, revenueScore));
    scores.revenueHealth.insights.push(`Total MRR: $${totalMRR.toLocaleString()}`);
    
    if (churnedCount > 0) {
      scores.revenueHealth.insights.push(`${churnedCount} clients churned in last 30 days`);
    }
  } catch (e) {
    console.error('Revenue health calculation error:', e);
  }

  // Calculate System Health Score
  try {
    const { data: systemHealth } = await supabase
      .from('system_health')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(10);

    if (systemHealth?.length) {
      const typedHealth = systemHealth as Array<{ status: string }>;
      const healthyCount = typedHealth.filter(h => h.status === 'healthy').length;
      scores.systemHealth.score = Math.round((healthyCount / typedHealth.length) * 100);
      
      const unhealthy = typedHealth.filter(h => h.status !== 'healthy');
      if (unhealthy.length > 0) {
        scores.systemHealth.insights.push(`${unhealthy.length} system components degraded`);
      } else {
        scores.systemHealth.insights.push('All systems operational');
      }
    }

    // Check for active lockdowns
    const { data: lockdowns } = await supabase
      .from('security_lockdowns')
      .select('agent_type, reason')
      .eq('status', 'active');

    if (lockdowns?.length) {
      scores.systemHealth.score -= lockdowns.length * 10;
      scores.systemHealth.insights.push(`${lockdowns.length} active security lockdowns`);
    }
  } catch (e) {
    console.error('System health calculation error:', e);
  }

  // Calculate Task Health Score
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: tasks } = await supabase
      .from('orchestration_tasks')
      .select('status, created_at')
      .gte('created_at', sevenDaysAgo.toISOString());

    if (tasks?.length) {
      const typedTasks = tasks as Array<{ status: string; created_at: string }>;
      const completedCount = typedTasks.filter(t => t.status === 'completed').length;
      const failedCount = typedTasks.filter(t => t.status === 'failed').length;
      const stalledCount = typedTasks.filter(t => t.status === 'stalled').length;
      
      const completionRate = (completedCount / typedTasks.length) * 100;
      scores.taskHealth.score = Math.round(completionRate - (failedCount * 5) - (stalledCount * 3));
      scores.taskHealth.score = Math.max(0, Math.min(100, scores.taskHealth.score));

      scores.taskHealth.insights.push(`${completedCount}/${typedTasks.length} tasks completed this week`);
      
      if (failedCount > 0) {
        scores.taskHealth.insights.push(`${failedCount} tasks failed`);
      }
      if (stalledCount > 0) {
        scores.taskHealth.insights.push(`${stalledCount} tasks stalled`);
      }
    }
  } catch (e) {
    console.error('Task health calculation error:', e);
  }

  // Calculate Compliance Health Score
  try {
    const { data: auditLog } = await supabase
      .from('compliance_audit_log')
      .select('compliance_status, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (auditLog?.length) {
      const typedLogs = auditLog as Array<{ compliance_status: string }>;
      const approvedCount = typedLogs.filter(a => a.compliance_status === 'approved').length;
      scores.complianceHealth.score = Math.round((approvedCount / typedLogs.length) * 100);
      
      const blockedCount = typedLogs.filter(a => a.compliance_status === 'blocked').length;
      if (blockedCount > 0) {
        scores.complianceHealth.insights.push(`${blockedCount} actions blocked by compliance`);
      } else {
        scores.complianceHealth.insights.push('No compliance violations detected');
      }
    }
  } catch (e) {
    console.error('Compliance health calculation error:', e);
  }

  return scores;
}

function calculateCEOScore(scores: Record<string, ScoreComponent>): {
  overall: number;
  breakdown: Record<string, number>;
  insights: string[];
  trend: 'up' | 'down' | 'stable';
  grade: string;
} {
  let weightedSum = 0;
  let totalWeight = 0;
  const breakdown: Record<string, number> = {};
  const allInsights: string[] = [];

  for (const [key, component] of Object.entries(scores)) {
    weightedSum += component.score * component.weight;
    totalWeight += component.weight;
    breakdown[key] = component.score;
    allInsights.push(...component.insights);
  }

  const overall = Math.round(weightedSum / totalWeight);

  // Determine grade
  let grade: string;
  if (overall >= 90) grade = 'A+';
  else if (overall >= 80) grade = 'A';
  else if (overall >= 70) grade = 'B';
  else if (overall >= 60) grade = 'C';
  else if (overall >= 50) grade = 'D';
  else grade = 'F';

  return {
    overall,
    breakdown,
    insights: allInsights.slice(0, 10), // Top 10 insights
    trend: 'stable', // Would need historical data to calculate
    grade,
  };
}
