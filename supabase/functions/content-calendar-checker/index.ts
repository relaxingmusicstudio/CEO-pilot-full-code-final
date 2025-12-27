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
      function_name: 'content-calendar-checker',
      status: 'running',
      metadata: { triggered_at: new Date().toISOString() }
    })
    .select()
    .single();

  console.log('Content Calendar Checker started');

  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const twoDaysFromNow = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
    const twoDaysStr = twoDaysFromNow.toISOString().split('T')[0];

    // Get overdue content
    const { data: overdueContent, error: overdueError } = await supabase
      .from('content_calendar')
      .select(`
        *,
        content:content_id (id, title, status, platform)
      `)
      .lt('scheduled_date', todayStr)
      .neq('status', 'published');

    if (overdueError) {
      throw new Error(`Failed to fetch overdue content: ${overdueError.message}`);
    }

    // Get upcoming content (next 2 days)
    const { data: upcomingContent, error: upcomingError } = await supabase
      .from('content_calendar')
      .select(`
        *,
        content:content_id (id, title, status, platform)
      `)
      .gte('scheduled_date', todayStr)
      .lte('scheduled_date', twoDaysStr)
      .eq('status', 'pending');

    if (upcomingError) {
      throw new Error(`Failed to fetch upcoming content: ${upcomingError.message}`);
    }

    // Get content stuck in draft for more than 3 days
    const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
    const { data: stuckContent, error: stuckError } = await supabase
      .from('content')
      .select('*')
      .eq('status', 'pending')
      .lt('created_at', threeDaysAgo.toISOString());

    if (stuckError) {
      throw new Error(`Failed to fetch stuck content: ${stuckError.message}`);
    }

    const itemsProcessed = (overdueContent?.length || 0) + (upcomingContent?.length || 0) + (stuckContent?.length || 0);
    let workItemsCreated = 0;

    // Create urgent work item for overdue content
    if (overdueContent && overdueContent.length > 0) {
      const overdueItems = overdueContent.map(item => ({
        title: item.content?.title || 'Untitled',
        platform: item.content?.platform || item.platform,
        scheduled_date: item.scheduled_date
      }));

      await supabase
        .from('work_queue')
        .insert({
          agent_type: 'content',
          title: `⚠️ ${overdueContent.length} overdue content item(s)`,
          description: `Content past deadline: ${overdueItems.map(i => `"${i.title}" (${i.platform})`).join(', ')}`,
          type: 'alert',
          priority: 'urgent',
          source: 'automation',
          metadata: {
            overdue_items: overdueItems,
            checked_at: new Date().toISOString()
          }
        });

      workItemsCreated++;
      console.log(`Created work item for ${overdueContent.length} overdue items`);
    }

    // Create high priority work item for content due soon
    if (upcomingContent && upcomingContent.length > 0) {
      const upcomingItems = upcomingContent.map(item => ({
        title: item.content?.title || 'Untitled',
        platform: item.content?.platform || item.platform,
        scheduled_date: item.scheduled_date,
        time_slot: item.time_slot
      }));

      await supabase
        .from('work_queue')
        .insert({
          agent_type: 'content',
          title: `📅 ${upcomingContent.length} content item(s) due within 48hrs`,
          description: `Upcoming deadlines: ${upcomingItems.map(i => `"${i.title}" on ${i.scheduled_date}`).join(', ')}`,
          type: 'task',
          priority: 'high',
          source: 'automation',
          metadata: {
            upcoming_items: upcomingItems,
            checked_at: new Date().toISOString()
          }
        });

      workItemsCreated++;
      console.log(`Created work item for ${upcomingContent.length} upcoming items`);
    }

    // Create work item for stuck content
    if (stuckContent && stuckContent.length > 0) {
      const stuckItems = stuckContent.map(item => ({
        title: item.title || 'Untitled',
        platform: item.platform,
        created_at: item.created_at,
        days_stuck: Math.floor((today.getTime() - new Date(item.created_at).getTime()) / (24 * 60 * 60 * 1000))
      }));

      await supabase
        .from('work_queue')
        .insert({
          agent_type: 'content',
          title: `🔄 ${stuckContent.length} content stuck in draft`,
          description: `Review needed: ${stuckItems.map(i => `"${i.title}" (${i.days_stuck} days)`).join(', ')}`,
          type: 'review',
          priority: 'medium',
          source: 'automation',
          metadata: {
            stuck_items: stuckItems,
            checked_at: new Date().toISOString()
          }
        });

      workItemsCreated++;
      console.log(`Created work item for ${stuckContent.length} stuck items`);
    }

    // Update log entry
    if (logEntry) {
      await supabase
        .from('automation_logs')
        .update({
          status: 'success',
          completed_at: new Date().toISOString(),
          items_processed: itemsProcessed,
          items_created: workItemsCreated,
          metadata: {
            overdue_count: overdueContent?.length || 0,
            upcoming_count: upcomingContent?.length || 0,
            stuck_count: stuckContent?.length || 0
          }
        })
        .eq('id', logEntry.id);
    }

    console.log(`Content Calendar Checker completed: ${itemsProcessed} items checked, ${workItemsCreated} work items created`);

    return new Response(JSON.stringify({
      success: true,
      items_processed: itemsProcessed,
      work_items_created: workItemsCreated,
      overdue: overdueContent?.length || 0,
      upcoming: upcomingContent?.length || 0,
      stuck: stuckContent?.length || 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    const error = err as Error;
    console.error('Content Calendar Checker error:', error);

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
