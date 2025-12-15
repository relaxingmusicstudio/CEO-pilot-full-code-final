import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PatternResult {
  trigger_type: string;
  action_type: string;
  confidence_score: number;
  trigger_details: Record<string, unknown>;
  action_payload: Record<string, unknown>;
  visitor_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action = "analyze", daysBack = 30 } = await req.json().catch(() => ({}));

    console.log(`[Pattern Detector] Starting analysis with action=${action}, daysBack=${daysBack}`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Fetch agent memories for analysis
    const { data: memories, error: memoriesError } = await supabase
      .from('agent_memories')
      .select('*')
      .gte('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: true });

    if (memoriesError) {
      console.error('[Pattern Detector] Error fetching memories:', memoriesError);
      throw memoriesError;
    }

    console.log(`[Pattern Detector] Analyzing ${memories?.length || 0} memories`);

    if (!memories || memories.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        patterns: [],
        message: "No memories to analyze" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const detectedPatterns: PatternResult[] = [];

    // Pattern 1: Time-based patterns (day of week analysis)
    const dayOfWeekCounts: Record<number, { count: number; queries: string[] }> = {};
    memories.forEach(m => {
      const day = new Date(m.created_at).getDay();
      if (!dayOfWeekCounts[day]) {
        dayOfWeekCounts[day] = { count: 0, queries: [] };
      }
      dayOfWeekCounts[day].count++;
      dayOfWeekCounts[day].queries.push(m.query?.substring(0, 50) || '');
    });

    const avgQueriesPerDay = memories.length / 7;
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    Object.entries(dayOfWeekCounts).forEach(([day, data]) => {
      if (data.count > avgQueriesPerDay * 1.5) {
        detectedPatterns.push({
          trigger_type: 'day_of_week',
          action_type: 'proactive_briefing',
          confidence_score: Math.min(0.9, data.count / memories.length),
          trigger_details: {
            day_name: dayNames[parseInt(day)],
            day_number: parseInt(day),
            query_count: data.count,
            sample_queries: data.queries.slice(0, 3),
          },
          action_payload: {
            message: `User is most active on ${dayNames[parseInt(day)]}s. Consider proactive morning briefing.`,
            suggested_action: 'send_morning_summary',
          },
        });
      }
    });

    // Pattern 2: Hour of day patterns
    const hourCounts: Record<number, number> = {};
    memories.forEach(m => {
      const hour = new Date(m.created_at).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    const avgQueriesPerHour = memories.length / 24;
    Object.entries(hourCounts).forEach(([hour, count]) => {
      if (count > avgQueriesPerHour * 2) {
        const hourNum = parseInt(hour);
        const timeLabel = hourNum < 12 ? 'morning' : hourNum < 17 ? 'afternoon' : 'evening';
        detectedPatterns.push({
          trigger_type: 'time_of_day',
          action_type: 'proactive_briefing',
          confidence_score: Math.min(0.85, count / memories.length),
          trigger_details: {
            hour: hourNum,
            time_label: timeLabel,
            query_count: count,
          },
          action_payload: {
            message: `User frequently active at ${hourNum}:00 (${timeLabel}). Good time for proactive insights.`,
            suggested_action: 'schedule_notification',
          },
        });
      }
    });

    // Pattern 3: Topic frequency patterns
    const topicKeywords = {
      'revenue': ['revenue', 'sales', 'income', 'earnings', 'profit'],
      'leads': ['leads', 'prospects', 'pipeline', 'opportunities'],
      'clients': ['clients', 'customers', 'accounts', 'retention'],
      'metrics': ['metrics', 'kpis', 'performance', 'dashboard', 'analytics'],
      'forecasting': ['forecast', 'prediction', 'projection', 'future'],
      'health': ['health', 'churn', 'risk', 'at-risk'],
    };

    const topicCounts: Record<string, number> = {};
    memories.forEach(m => {
      const queryLower = (m.query || '').toLowerCase();
      Object.entries(topicKeywords).forEach(([topic, keywords]) => {
        if (keywords.some(kw => queryLower.includes(kw))) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
      });
    });

    Object.entries(topicCounts).forEach(([topic, count]) => {
      if (count >= 3) {
        detectedPatterns.push({
          trigger_type: 'high_frequency_topic',
          action_type: 'topic_suggestion',
          confidence_score: Math.min(0.8, count / 10),
          trigger_details: {
            topic,
            query_count: count,
            keywords: topicKeywords[topic as keyof typeof topicKeywords],
          },
          action_payload: {
            message: `User frequently asks about ${topic}. Include in proactive updates.`,
            suggested_action: 'include_in_summary',
            topic_priority: count >= 5 ? 'high' : 'medium',
          },
        });
      }
    });

    // Pattern 4: Topic sequences (what users ask after certain topics)
    const topicSequences: Record<string, Record<string, number>> = {};
    for (let i = 0; i < memories.length - 1; i++) {
      const currentQuery = (memories[i].query || '').toLowerCase();
      const nextQuery = (memories[i + 1].query || '').toLowerCase();
      
      // Time between queries should be within 30 minutes
      const timeDiff = new Date(memories[i + 1].created_at).getTime() - new Date(memories[i].created_at).getTime();
      if (timeDiff > 30 * 60 * 1000) continue;

      Object.entries(topicKeywords).forEach(([currentTopic, currentKeywords]) => {
        Object.entries(topicKeywords).forEach(([nextTopic, nextKeywords]) => {
          if (currentTopic !== nextTopic &&
              currentKeywords.some(kw => currentQuery.includes(kw)) &&
              nextKeywords.some(kw => nextQuery.includes(kw))) {
            if (!topicSequences[currentTopic]) topicSequences[currentTopic] = {};
            topicSequences[currentTopic][nextTopic] = (topicSequences[currentTopic][nextTopic] || 0) + 1;
          }
        });
      });
    }

    Object.entries(topicSequences).forEach(([fromTopic, toTopics]) => {
      Object.entries(toTopics).forEach(([toTopic, count]) => {
        if (count >= 2) {
          detectedPatterns.push({
            trigger_type: 'topic_sequence',
            action_type: 'predictive_suggestion',
            confidence_score: Math.min(0.75, count / 5),
            trigger_details: {
              from_topic: fromTopic,
              to_topic: toTopic,
              sequence_count: count,
            },
            action_payload: {
              message: `When user asks about ${fromTopic}, they often follow up with ${toTopic}.`,
              suggested_action: 'offer_related_topic',
            },
          });
        }
      });
    });

    // Pattern 5: Success score patterns (what types of queries get good responses)
    const successfulQueries = memories.filter(m => (m.success_score || 0) >= 0.7);
    const unsuccessfulQueries = memories.filter(m => (m.success_score || 0) < 0.3 && m.success_score !== null);

    if (unsuccessfulQueries.length >= 2) {
      detectedPatterns.push({
        trigger_type: 'improvement_needed',
        action_type: 'learning_opportunity',
        confidence_score: 0.9,
        trigger_details: {
          unsuccessful_count: unsuccessfulQueries.length,
          sample_queries: unsuccessfulQueries.slice(0, 3).map(q => q.query?.substring(0, 100)),
        },
        action_payload: {
          message: `${unsuccessfulQueries.length} queries had low success scores. Review and improve.`,
          suggested_action: 'review_and_improve',
        },
      });
    }

    console.log(`[Pattern Detector] Detected ${detectedPatterns.length} patterns`);

    // Upsert patterns to user_patterns table
    let upsertedCount = 0;
    for (const pattern of detectedPatterns) {
      const { error: upsertError } = await supabase
        .from('user_patterns')
        .upsert({
          trigger_type: pattern.trigger_type,
          action_type: pattern.action_type,
          confidence_score: pattern.confidence_score,
          trigger_details: pattern.trigger_details,
          action_payload: pattern.action_payload,
          visitor_id: pattern.visitor_id || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'trigger_type,action_type',
          ignoreDuplicates: false,
        });

      if (upsertError) {
        console.error('[Pattern Detector] Upsert error:', upsertError);
        // Try insert instead if upsert fails due to missing unique constraint
        const { error: insertError } = await supabase
          .from('user_patterns')
          .insert({
            trigger_type: pattern.trigger_type,
            action_type: pattern.action_type,
            confidence_score: pattern.confidence_score,
            trigger_details: pattern.trigger_details,
            action_payload: pattern.action_payload,
            visitor_id: pattern.visitor_id || null,
            is_active: true,
          });
        
        if (!insertError) upsertedCount++;
      } else {
        upsertedCount++;
      }
    }

    console.log(`[Pattern Detector] Upserted ${upsertedCount} patterns to database`);

    return new Response(JSON.stringify({ 
      success: true,
      patterns: detectedPatterns,
      patternsCount: detectedPatterns.length,
      upsertedCount,
      memoriesAnalyzed: memories.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Pattern Detector] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
