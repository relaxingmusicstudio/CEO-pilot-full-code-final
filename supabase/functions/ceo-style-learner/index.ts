import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StylePattern {
  category: string;
  key: string;
  value: unknown;
  confidence: number;
  examples: unknown[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { action = 'full_learn' } = await req.json().catch(() => ({}));
    console.log(`CEO Style Learner: Running ${action}`);

    const patterns: StylePattern[] = [];
    const learningStats = {
      leads_analyzed: 0,
      decisions_analyzed: 0,
      conversations_analyzed: 0,
      patterns_extracted: 0,
      profile_updates: 0
    };

    // 1. Analyze Lead Scoring Patterns
    const { data: leads } = await supabase
      .from('leads')
      .select('*')
      .order('lead_score', { ascending: false });

    if (leads && leads.length > 0) {
      learningStats.leads_analyzed = leads.length;

      // Extract source preferences
      const sourceScores: Record<string, { total: number; count: number; examples: unknown[] }> = {};
      const timelineScores: Record<string, { total: number; count: number }> = {};
      const temperatureThresholds = { hot: 0, warm: 0, cold: 0 };

      for (const lead of leads) {
        // Source analysis
        const source = lead.source || 'unknown';
        if (!sourceScores[source]) {
          sourceScores[source] = { total: 0, count: 0, examples: [] };
        }
        sourceScores[source].total += lead.lead_score || 0;
        sourceScores[source].count++;
        if (sourceScores[source].examples.length < 3) {
          sourceScores[source].examples.push({ name: lead.name, score: lead.lead_score });
        }

        // Timeline analysis
        const timeline = lead.timeline || 'unknown';
        if (!timelineScores[timeline]) {
          timelineScores[timeline] = { total: 0, count: 0 };
        }
        timelineScores[timeline].total += lead.lead_score || 0;
        timelineScores[timeline].count++;

        // Temperature thresholds
        const temp = lead.lead_temperature || 'cold';
        const score = lead.lead_score || 0;
        if (temp === 'hot') temperatureThresholds.hot = Math.max(temperatureThresholds.hot, score);
        else if (temp === 'warm') temperatureThresholds.warm = Math.max(temperatureThresholds.warm, score);
        else temperatureThresholds.cold = Math.max(temperatureThresholds.cold, score);
      }

      // Add source preference patterns
      const sortedSources = Object.entries(sourceScores)
        .map(([source, data]) => ({ source, avgScore: data.total / data.count, count: data.count, examples: data.examples }))
        .sort((a, b) => b.avgScore - a.avgScore);

      if (sortedSources.length > 0) {
        patterns.push({
          category: 'lead_preferences',
          key: 'source_priority',
          value: sortedSources.map(s => s.source),
          confidence: Math.min(0.9, sortedSources[0].count / 10),
          examples: sortedSources.slice(0, 3).map(s => ({ source: s.source, avgScore: Math.round(s.avgScore) }))
        });
      }

      // Add timeline urgency patterns
      const sortedTimelines = Object.entries(timelineScores)
        .map(([timeline, data]) => ({ timeline, avgScore: data.total / data.count }))
        .sort((a, b) => b.avgScore - a.avgScore);

      if (sortedTimelines.length > 0) {
        patterns.push({
          category: 'lead_preferences',
          key: 'timeline_priority',
          value: sortedTimelines.map(t => t.timeline),
          confidence: Math.min(0.85, leads.length / 20),
          examples: sortedTimelines.slice(0, 3)
        });
      }

      // Add temperature thresholds
      patterns.push({
        category: 'scoring_thresholds',
        key: 'temperature_thresholds',
        value: {
          hot_min: temperatureThresholds.warm + 1 || 80,
          warm_min: temperatureThresholds.cold + 1 || 50,
          cold_max: temperatureThresholds.cold || 49
        },
        confidence: Math.min(0.8, leads.length / 15),
        examples: [{ hot: temperatureThresholds.hot, warm: temperatureThresholds.warm, cold: temperatureThresholds.cold }]
      });
    }

    // 2. Analyze Work Queue Decisions (approved/rejected)
    const { data: decisions } = await supabase
      .from('work_queue')
      .select('*')
      .in('status', ['approved', 'rejected', 'completed'])
      .order('updated_at', { ascending: false })
      .limit(100);

    if (decisions && decisions.length > 0) {
      learningStats.decisions_analyzed = decisions.length;

      const agentApprovals: Record<string, { approved: number; rejected: number; examples: unknown[] }> = {};
      const priorityPatterns: Record<string, { approved: number; rejected: number }> = {};

      for (const decision of decisions) {
        const agent = decision.agent_type || 'unknown';
        const priority = decision.priority || 'normal';
        const wasApproved = decision.status === 'approved' || decision.status === 'completed';

        // Agent trust levels
        if (!agentApprovals[agent]) {
          agentApprovals[agent] = { approved: 0, rejected: 0, examples: [] };
        }
        if (wasApproved) agentApprovals[agent].approved++;
        else agentApprovals[agent].rejected++;
        
        if (agentApprovals[agent].examples.length < 2) {
          agentApprovals[agent].examples.push({ title: decision.title, status: decision.status });
        }

        // Priority handling
        if (!priorityPatterns[priority]) {
          priorityPatterns[priority] = { approved: 0, rejected: 0 };
        }
        if (wasApproved) priorityPatterns[priority].approved++;
        else priorityPatterns[priority].rejected++;
      }

      // Calculate agent trust scores
      const agentTrust = Object.entries(agentApprovals)
        .map(([agent, data]) => ({
          agent,
          trustScore: data.approved / (data.approved + data.rejected),
          totalDecisions: data.approved + data.rejected,
          examples: data.examples
        }))
        .filter(a => a.totalDecisions >= 2)
        .sort((a, b) => b.trustScore - a.trustScore);

      if (agentTrust.length > 0) {
        patterns.push({
          category: 'agent_preferences',
          key: 'agent_trust_levels',
          value: agentTrust.reduce((acc, a) => ({ ...acc, [a.agent]: Math.round(a.trustScore * 100) }), {}),
          confidence: Math.min(0.9, decisions.length / 50),
          examples: agentTrust.slice(0, 3)
        });
      }

      // Priority approval patterns
      const priorityApprovalRates = Object.entries(priorityPatterns)
        .map(([priority, data]) => ({
          priority,
          approvalRate: data.approved / (data.approved + data.rejected),
          total: data.approved + data.rejected
        }))
        .sort((a, b) => b.approvalRate - a.approvalRate);

      if (priorityApprovalRates.length > 0) {
        patterns.push({
          category: 'approval_preferences',
          key: 'priority_approval_rates',
          value: priorityApprovalRates.reduce((acc, p) => ({ ...acc, [p.priority]: Math.round(p.approvalRate * 100) }), {}),
          confidence: Math.min(0.85, decisions.length / 30),
          examples: priorityApprovalRates
        });
      }
    }

    // 3. Analyze Client Interventions
    const { data: interventions } = await supabase
      .from('client_interventions')
      .select('*')
      .in('status', ['completed', 'cancelled'])
      .order('completed_at', { ascending: false })
      .limit(50);

    if (interventions && interventions.length > 0) {
      const interventionOutcomes: Record<string, { success: number; total: number }> = {};

      for (const intervention of interventions) {
        const type = intervention.intervention_type;
        if (!interventionOutcomes[type]) {
          interventionOutcomes[type] = { success: 0, total: 0 };
        }
        interventionOutcomes[type].total++;
        if (intervention.status === 'completed' && intervention.outcome === 'positive') {
          interventionOutcomes[type].success++;
        }
      }

      const effectiveInterventions = Object.entries(interventionOutcomes)
        .map(([type, data]) => ({ type, successRate: data.success / data.total, total: data.total }))
        .filter(i => i.total >= 2)
        .sort((a, b) => b.successRate - a.successRate);

      if (effectiveInterventions.length > 0) {
        patterns.push({
          category: 'intervention_preferences',
          key: 'effective_interventions',
          value: effectiveInterventions.map(i => i.type),
          confidence: Math.min(0.75, interventions.length / 20),
          examples: effectiveInterventions.slice(0, 3)
        });
      }
    }

    // 4. Analyze Conversation Patterns
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id, converted, messages, lead_id')
      .order('created_at', { ascending: false })
      .limit(50);

    if (conversations && conversations.length > 0) {
      learningStats.conversations_analyzed = conversations.length;

      let totalConverted = 0;
      let avgMessagesConverted = 0;
      let avgMessagesNotConverted = 0;
      let convertedCount = 0;
      let notConvertedCount = 0;

      for (const conv of conversations) {
        const messageCount = Array.isArray(conv.messages) ? conv.messages.length : 0;
        if (conv.converted) {
          totalConverted++;
          avgMessagesConverted += messageCount;
          convertedCount++;
        } else {
          avgMessagesNotConverted += messageCount;
          notConvertedCount++;
        }
      }

      const conversionRate = totalConverted / conversations.length;
      const avgMsgConverted = convertedCount > 0 ? avgMessagesConverted / convertedCount : 0;
      const avgMsgNotConverted = notConvertedCount > 0 ? avgMessagesNotConverted / notConvertedCount : 0;

      patterns.push({
        category: 'conversation_insights',
        key: 'conversion_patterns',
        value: {
          conversion_rate: Math.round(conversionRate * 100),
          optimal_message_count: Math.round(avgMsgConverted),
          avg_messages_lost: Math.round(avgMsgNotConverted)
        },
        confidence: Math.min(0.7, conversations.length / 30),
        examples: [{ converted: totalConverted, total: conversations.length }]
      });
    }

    // 5. Save patterns to ceo_style_profile
    learningStats.patterns_extracted = patterns.length;

    for (const pattern of patterns) {
      const { data: existing } = await supabase
        .from('ceo_style_profile')
        .select('id, confidence_score, learned_from_count')
        .eq('category', pattern.category)
        .eq('key', pattern.key)
        .maybeSingle();

      if (existing) {
        // Update existing - increase confidence if pattern is consistent
        const newConfidence = Math.min(0.95, (existing.confidence_score + pattern.confidence) / 2 + 0.05);
        const newCount = (existing.learned_from_count || 0) + 1;

        await supabase
          .from('ceo_style_profile')
          .update({
            value: pattern.value,
            confidence_score: newConfidence,
            learned_from_count: newCount,
            examples: pattern.examples,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        // Insert new pattern
        await supabase
          .from('ceo_style_profile')
          .insert({
            category: pattern.category,
            key: pattern.key,
            value: pattern.value,
            confidence_score: pattern.confidence,
            learned_from_count: 1,
            examples: pattern.examples
          });
      }
      learningStats.profile_updates++;
    }

    // 6. Log learning activity
    await supabase
      .from('automation_logs')
      .insert({
        function_name: 'ceo-style-learner',
        status: 'success',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        items_processed: learningStats.leads_analyzed + learningStats.decisions_analyzed + learningStats.conversations_analyzed,
        items_created: learningStats.profile_updates,
        metadata: learningStats
      });

    console.log('CEO Style Learner completed:', learningStats);

    return new Response(JSON.stringify({
      success: true,
      patterns_learned: patterns.length,
      stats: learningStats,
      patterns: patterns.map(p => ({ category: p.category, key: p.key, confidence: p.confidence }))
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    const error = err as Error;
    console.error('CEO Style Learner error:', error);

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
