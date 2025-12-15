import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Start automation log
  const { data: logEntry } = await supabase
    .from('automation_logs')
    .insert({
      function_name: 'lead-score-refresher',
      status: 'running',
      metadata: { triggered_at: new Date().toISOString() }
    })
    .select()
    .single();

  console.log('Lead Score Refresher started');

  try {
    // Get all active leads
    const { data: leads, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .in('status', ['new', 'contacted', 'qualified']);

    if (fetchError) {
      throw new Error(`Failed to fetch leads: ${fetchError.message}`);
    }

    let itemsProcessed = 0;
    let itemsUpdated = 0;
    const hotLeads: { name: string; score: number; previous: number }[] = [];

    for (const lead of leads || []) {
      itemsProcessed++;
      const previousScore = lead.lead_score || 0;

      // Calculate new score based on various factors
      let newScore = previousScore;

      // Boost score based on buying signals
      const buyingSignals = lead.buying_signals || [];
      if (buyingSignals.includes('Asked about pricing')) newScore += 5;
      if (buyingSignals.includes('Mentioned timeline')) newScore += 10;
      if (buyingSignals.includes('Multiple team members')) newScore += 8;
      if (buyingSignals.includes('High call volume')) newScore += 12;

      // Boost based on timeline urgency
      if (lead.timeline === 'immediately') newScore += 15;
      else if (lead.timeline === 'this_week') newScore += 10;
      else if (lead.timeline === 'this_month') newScore += 5;

      // Boost based on team size
      if (lead.team_size === '10+') newScore += 10;
      else if (lead.team_size === '5-10') newScore += 7;
      else if (lead.team_size === '2-5') newScore += 4;

      // Cap at 100
      newScore = Math.min(100, newScore);

      // Determine temperature
      let temperature = 'cold';
      if (newScore >= 80) temperature = 'hot';
      else if (newScore >= 50) temperature = 'warm';

      // Check if lead became hot
      const previousTemp = previousScore >= 80 ? 'hot' : previousScore >= 50 ? 'warm' : 'cold';
      const becameHot = temperature === 'hot' && previousTemp !== 'hot';

      if (newScore !== previousScore) {
        const { error: updateError } = await supabase
          .from('leads')
          .update({
            lead_score: newScore,
            lead_temperature: temperature
          })
          .eq('id', lead.id);

        if (!updateError) {
          itemsUpdated++;
          if (becameHot) {
            hotLeads.push({
              name: lead.name || lead.business_name || 'Unknown',
              score: newScore,
              previous: previousScore
            });
          }
        }
      }
    }

    // Create work item if leads became hot
    if (hotLeads.length > 0) {
      await supabase
        .from('work_queue')
        .insert({
          agent_type: 'inbox',
          title: `🔥 ${hotLeads.length} lead(s) became HOT`,
          description: `Priority follow-up needed: ${hotLeads.map(l => `${l.name} (${l.score}pts)`).join(', ')}`,
          type: 'alert',
          priority: 'urgent',
          source: 'automation',
          metadata: {
            hot_leads: hotLeads,
            refreshed_at: new Date().toISOString()
          }
        });

      console.log(`Created urgent work item for ${hotLeads.length} hot leads`);
    }

    // Also create a summary if we updated many leads
    if (itemsUpdated >= 5) {
      await supabase
        .from('work_queue')
        .insert({
          agent_type: 'analytics',
          title: `Lead scores refreshed: ${itemsUpdated} updated`,
          description: `Daily lead scoring completed. ${hotLeads.length} leads are now hot.`,
          type: 'task',
          priority: 'low',
          source: 'automation',
          metadata: {
            total_processed: itemsProcessed,
            total_updated: itemsUpdated,
            hot_count: hotLeads.length
          }
        });
    }

    // Update log entry
    if (logEntry) {
      await supabase
        .from('automation_logs')
        .update({
          status: 'success',
          completed_at: new Date().toISOString(),
          items_processed: itemsProcessed,
          items_created: itemsUpdated,
          metadata: { hot_leads_count: hotLeads.length }
        })
        .eq('id', logEntry.id);
    }

    // Trigger CEO style learning after significant scoring changes
    if (itemsUpdated >= 3 || hotLeads.length > 0) {
      try {
        await supabase.functions.invoke('ceo-style-learner', { body: { action: 'lead_update' } });
        console.log('Triggered CEO style learning from lead scoring');
      } catch (e) {
        console.log('CEO style learning trigger skipped:', e);
      }
    }

    console.log(`Lead Score Refresher completed: ${itemsProcessed} processed, ${itemsUpdated} updated, ${hotLeads.length} hot`);

    return new Response(JSON.stringify({
      success: true,
      items_processed: itemsProcessed,
      items_updated: itemsUpdated,
      hot_leads: hotLeads
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    const error = err as Error;
    console.error('Lead Score Refresher error:', error);

    if (logEntry) {
      await supabase
        .from('automation_logs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error.message
        })
        .eq('id', logEntry.id);
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
