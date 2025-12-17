import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat } from "../_shared/ai.ts";

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
    console.log(`Strategic Planner: ${action}`);

    switch (action) {
      case 'get_goals': {
        const { status, goal_type } = data || {};
        
        let query = supabase
          .from('strategic_goals')
          .select('*')
          .order('deadline', { ascending: true });

        if (status) query = query.eq('status', status);
        if (goal_type) query = query.eq('goal_type', goal_type);

        const { data: goals, error } = await query;
        if (error) throw error;

        // Update progress percentages
        for (const goal of goals || []) {
          if (goal.target_value && goal.current_value !== null) {
            goal.progress_percentage = Math.min(100, (goal.current_value / goal.target_value) * 100);
          }
        }

        return new Response(JSON.stringify({
          success: true,
          goals: goals || [],
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'update_goal_progress': {
        const { goal_id, current_value } = data;
        
        const { data: goal, error: fetchError } = await supabase
          .from('strategic_goals')
          .select('target_value')
          .eq('id', goal_id)
          .single();

        if (fetchError) throw fetchError;

        const progress = goal.target_value ? Math.min(100, (current_value / goal.target_value) * 100) : 0;
        const status = progress >= 100 ? 'achieved' : 'active';

        const { error } = await supabase
          .from('strategic_goals')
          .update({
            current_value,
            progress_percentage: progress,
            status,
          })
          .eq('id', goal_id);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true, progress, status }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_recommendations': {
        const { status, limit = 20 } = data || {};
        
        let query = supabase
          .from('strategic_recommendations')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (status) query = query.eq('status', status);

        const { data: recs, error } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({
          success: true,
          recommendations: recs || [],
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'generate_recommendations': {
        // Fetch current business data
        const [leadsRes, clientsRes, costsRes, goalsRes] = await Promise.all([
          supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(100),
          supabase.from('clients').select('*'),
          supabase.from('agent_cost_tracking').select('*').gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
          supabase.from('strategic_goals').select('*').eq('status', 'active'),
        ]);

        const leads = leadsRes.data || [];
        const clients = clientsRes.data || [];
        const costs = costsRes.data || [];
        const goals = goalsRes.data || [];

        // Calculate metrics
        const totalMRR = clients.reduce((sum, c) => sum + (c.mrr || 0), 0);
        const totalCosts = costs.reduce((sum, c) => sum + (c.cost_cents || 0), 0) / 100;
        const conversionRate = leads.length > 0 ? leads.filter(l => l.status === 'converted').length / leads.length : 0;
        const avgLeadScore = leads.length > 0 ? leads.reduce((sum, l) => sum + (l.lead_score || 0), 0) / leads.length : 0;

        // Generate AI recommendations
        const prompt = `As a strategic business advisor, analyze this data and provide 3-5 actionable recommendations:

Current Metrics:
- MRR: $${totalMRR}
- Monthly AI/API Costs: $${totalCosts.toFixed(2)}
- Lead Conversion Rate: ${(conversionRate * 100).toFixed(1)}%
- Average Lead Score: ${avgLeadScore.toFixed(1)}
- Active Clients: ${clients.filter(c => c.status === 'active').length}
- Total Leads (30 days): ${leads.length}

Active Goals:
${goals.map(g => `- ${g.title}: ${g.current_value || 0}/${g.target_value} ${g.unit}`).join('\n')}

Provide recommendations in JSON format:
[{"type": "optimization|expansion|cost_reduction|risk_mitigation|experiment", "title": "...", "description": "...", "expected_impact": {"metric": "...", "change": "...%"}, "confidence": 0.0-1.0, "priority": "low|medium|high|critical"}]`;

        try {
          const aiResponse = await aiChat({
            messages: [
              { role: 'system', content: 'You are a strategic business advisor specializing in SaaS and AI-powered businesses. Provide actionable, data-driven recommendations.' },
              { role: 'user', content: prompt }
            ],
            purpose: 'ceo_strategy',
          });

          const content = aiResponse.text || '';
          
          // Parse recommendations
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const recommendations = JSON.parse(jsonMatch[0]);
            
            // Store recommendations
            for (const rec of recommendations) {
              await supabase.from('strategic_recommendations').insert({
                recommendation_type: rec.type,
                title: rec.title,
                description: rec.description,
                expected_impact: rec.expected_impact,
                confidence_score: rec.confidence * 100,
                priority: rec.priority,
                source_analysis: `Generated from ${leads.length} leads, ${clients.length} clients, $${totalMRR} MRR`,
              });
            }

            return new Response(JSON.stringify({
              success: true,
              recommendations,
              metrics: { totalMRR, totalCosts, conversionRate, avgLeadScore },
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        } catch (aiError) {
          console.error('AI generation error:', aiError);
        }

        // Fallback: rule-based recommendations
        const recommendations = [];
        
        if (conversionRate < 0.1) {
          recommendations.push({
            type: 'optimization',
            title: 'Improve Lead Conversion',
            description: `Current conversion rate of ${(conversionRate * 100).toFixed(1)}% is below target. Consider improving follow-up sequences.`,
            expected_impact: { metric: 'conversion_rate', change: '+5%' },
            confidence: 75,
            priority: 'high',
          });
        }

        if (totalCosts > totalMRR * 0.3) {
          recommendations.push({
            type: 'cost_reduction',
            title: 'Optimize AI Costs',
            description: `AI costs ($${totalCosts.toFixed(2)}) represent ${((totalCosts / totalMRR) * 100).toFixed(1)}% of MRR. Consider caching or model optimization.`,
            expected_impact: { metric: 'ai_costs', change: '-20%' },
            confidence: 80,
            priority: 'medium',
          });
        }

        // Store fallback recommendations
        for (const rec of recommendations) {
          await supabase.from('strategic_recommendations').insert({
            recommendation_type: rec.type,
            title: rec.title,
            description: rec.description,
            expected_impact: rec.expected_impact,
            confidence_score: rec.confidence,
            priority: rec.priority,
            source_analysis: 'Rule-based analysis',
          });
        }

        return new Response(JSON.stringify({
          success: true,
          recommendations,
          metrics: { totalMRR, totalCosts, conversionRate, avgLeadScore },
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'run_simulation': {
        const { scenario_name, parameters } = data;
        
        // Fetch baseline data
        const { data: clients } = await supabase.from('clients').select('*');
        const { data: leads } = await supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(100);

        const baseline = {
          mrr: (clients || []).reduce((sum, c) => sum + (c.mrr || 0), 0),
          clientCount: (clients || []).filter(c => c.status === 'active').length,
          leadCount: (leads || []).length,
          conversionRate: (leads || []).length > 0 ? (leads || []).filter(l => l.status === 'converted').length / (leads || []).length : 0,
        };

        // Simple projection based on parameters
        const projectedOutcomes: any = { ...baseline };
        
        if (parameters.budget_change) {
          // Assume budget change affects lead generation proportionally
          const changeMultiplier = 1 + (parameters.budget_change / 100);
          projectedOutcomes.leadCount = Math.round(baseline.leadCount * changeMultiplier);
          projectedOutcomes.mrr = Math.round(baseline.mrr * (1 + (parameters.budget_change / 100) * baseline.conversionRate));
        }

        if (parameters.pricing_change) {
          projectedOutcomes.mrr = Math.round(baseline.mrr * (1 + parameters.pricing_change / 100));
        }

        // Store simulation
        const { data: simulation, error } = await supabase
          .from('scenario_simulations')
          .insert({
            scenario_name,
            scenario_type: 'what_if',
            input_parameters: parameters,
            baseline_metrics: baseline,
            projected_outcomes: projectedOutcomes,
            confidence_interval: {
              low: Math.round(projectedOutcomes.mrr * 0.85),
              high: Math.round(projectedOutcomes.mrr * 1.15),
            },
            conclusion: `Projected MRR change: ${((projectedOutcomes.mrr - baseline.mrr) / baseline.mrr * 100).toFixed(1)}%`,
          })
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify({
          success: true,
          simulation,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'approve_recommendation': {
        const { recommendation_id, approved_by, notes } = data;
        
        const { error } = await supabase
          .from('strategic_recommendations')
          .update({
            status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by,
            implementation_notes: notes,
          })
          .eq('id', recommendation_id);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error: any) {
    console.error('Strategic Planner error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
