import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Test phone numbers for each timezone
const TEST_PHONES = {
  eastern: '+12025551234',    // 202 - DC (Eastern)
  central: '+13125551234',    // 312 - Chicago (Central)
  mountain: '+13035551234',   // 303 - Denver (Mountain)
  pacific: '+14155551234',    // 415 - SF (Pacific)
};

interface TestResult {
  action: string;
  iteration: number;
  success: boolean;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  duration_ms: number;
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { action = 'run_all', iterations = 10 } = await req.json();
    const results: TestResult[] = [];
    const startTime = Date.now();

    // Create automation log entry
    const { data: logEntry } = await supabase
      .from('automation_logs')
      .insert({
        function_name: 'test-voice-agent',
        status: 'running',
        metadata: { action, iterations },
      })
      .select()
      .single();

    // Get test leads for testing
    const { data: testLeads } = await supabase
      .from('leads')
      .select('id, phone, email, name')
      .limit(5);

    const leadIds = testLeads?.map(l => l.id) || [];

    // Test 1: check_call_time - Test all 4 timezones
    if (action === 'run_all' || action === 'check_call_time') {
      console.log('Testing check_call_time...');
      const timezones = Object.entries(TEST_PHONES);
      
      for (let i = 0; i < iterations; i++) {
        for (const [tz, phone] of timezones) {
          const testStart = Date.now();
          try {
            const { data, error } = await supabase.functions.invoke('voice-agent-handler', {
              body: { action: 'check_call_time', phone_number: phone },
            });
            
            results.push({
              action: 'check_call_time',
              iteration: i + 1,
              success: !error && data?.timezone,
              input: { phone, timezone: tz },
              output: data || {},
              duration_ms: Date.now() - testStart,
              error: error?.message,
            });
          } catch (e) {
            results.push({
              action: 'check_call_time',
              iteration: i + 1,
              success: false,
              input: { phone, timezone: tz },
              output: {},
              duration_ms: Date.now() - testStart,
              error: e instanceof Error ? e.message : 'Unknown error',
            });
          }
        }
      }
    }

    // Test 2: check_human_availability
    if (action === 'run_all' || action === 'check_human_availability') {
      console.log('Testing check_human_availability...');
      
      for (let i = 0; i < iterations; i++) {
        const testStart = Date.now();
        try {
          const { data, error } = await supabase.functions.invoke('voice-agent-handler', {
            body: { action: 'check_human_availability' },
          });
          
          results.push({
            action: 'check_human_availability',
            iteration: i + 1,
            success: !error && typeof data?.available === 'boolean',
            input: {},
            output: data || {},
            duration_ms: Date.now() - testStart,
            error: error?.message,
          });
        } catch (e) {
          results.push({
            action: 'check_human_availability',
            iteration: i + 1,
            success: false,
            input: {},
            output: {},
            duration_ms: Date.now() - testStart,
            error: e instanceof Error ? e.message : 'Unknown error',
          });
        }
      }
    }

    // Test 3: collect_message - Create follow-up tasks
    if (action === 'run_all' || action === 'collect_message') {
      console.log('Testing collect_message...');
      const topics = ['emergency repair', 'maintenance contract', 'new installation', 'price quote', 'service complaint'];
      const preferences = ['call', 'email', 'sms'];
      const timelines = ['ASAP', 'end of day', 'tomorrow', 'this week'];
      
      for (let i = 0; i < iterations; i++) {
        const testStart = Date.now();
        const leadId = leadIds[i % leadIds.length] || null;
        const topic = topics[i % topics.length];
        const pref = preferences[i % preferences.length];
        const timeline = timelines[i % timelines.length];
        
        try {
          const { data, error } = await supabase.functions.invoke('voice-agent-handler', {
            body: {
              action: 'collect_message',
              lead_id: leadId,
              topic,
              contact_preference: pref,
              timeline_expectation: timeline,
              caller_phone: TEST_PHONES.eastern,
              caller_email: `test${i}@example.com`,
            },
          });
          
          results.push({
            action: 'collect_message',
            iteration: i + 1,
            success: !error && data?.task_id,
            input: { lead_id: leadId, topic, contact_preference: pref, timeline: timeline },
            output: data || {},
            duration_ms: Date.now() - testStart,
            error: error?.message,
          });
        } catch (e) {
          results.push({
            action: 'collect_message',
            iteration: i + 1,
            success: false,
            input: { lead_id: leadId, topic },
            output: {},
            duration_ms: Date.now() - testStart,
            error: e instanceof Error ? e.message : 'Unknown error',
          });
        }
      }
    }

    // Test 4: generate_draft - Test all 3 draft types
    if (action === 'run_all' || action === 'generate_draft') {
      console.log('Testing generate_draft...');
      
      // Get some existing tasks to generate drafts for
      const { data: tasks } = await supabase
        .from('follow_up_tasks')
        .select('id')
        .limit(Math.min(iterations, 10));
      
      const taskIds = tasks?.map(t => t.id) || [];
      const draftTypes = ['email', 'script', 'sms'];
      
      for (let i = 0; i < Math.min(iterations, taskIds.length * 3); i++) {
        const taskId = taskIds[i % taskIds.length];
        const draftType = draftTypes[i % draftTypes.length];
        const testStart = Date.now();
        
        try {
          const { data, error } = await supabase.functions.invoke('voice-agent-handler', {
            body: { action: 'generate_draft', task_id: taskId, draft_type: draftType },
          });
          
          results.push({
            action: 'generate_draft',
            iteration: i + 1,
            success: !error && data?.success,
            input: { task_id: taskId, draft_type: draftType },
            output: data || {},
            duration_ms: Date.now() - testStart,
            error: error?.message,
          });
        } catch (e) {
          results.push({
            action: 'generate_draft',
            iteration: i + 1,
            success: false,
            input: { task_id: taskId, draft_type: draftType },
            output: {},
            duration_ms: Date.now() - testStart,
            error: e instanceof Error ? e.message : 'Unknown error',
          });
        }
      }
    }

    // Test 5: get_pending_tasks
    if (action === 'run_all' || action === 'get_pending_tasks') {
      console.log('Testing get_pending_tasks...');
      
      const limits = [5, 10, 20, 50];
      
      for (let i = 0; i < iterations; i++) {
        const testStart = Date.now();
        const limit = limits[i % limits.length];
        
        try {
          const { data, error } = await supabase.functions.invoke('voice-agent-handler', {
            body: { action: 'get_pending_tasks', limit },
          });
          
          results.push({
            action: 'get_pending_tasks',
            iteration: i + 1,
            success: !error && Array.isArray(data?.tasks),
            input: { limit },
            output: { task_count: data?.tasks?.length || 0 },
            duration_ms: Date.now() - testStart,
            error: error?.message,
          });
        } catch (e) {
          results.push({
            action: 'get_pending_tasks',
            iteration: i + 1,
            success: false,
            input: { limit },
            output: {},
            duration_ms: Date.now() - testStart,
            error: e instanceof Error ? e.message : 'Unknown error',
          });
        }
      }
    }

    // Test 6: mark_reviewed
    if (action === 'run_all' || action === 'mark_reviewed') {
      console.log('Testing mark_reviewed...');
      
      const { data: pendingTasks } = await supabase
        .from('follow_up_tasks')
        .select('id')
        .eq('status', 'pending')
        .limit(iterations);
      
      const pendingIds = pendingTasks?.map(t => t.id) || [];
      
      for (let i = 0; i < Math.min(iterations, pendingIds.length); i++) {
        const taskId = pendingIds[i];
        const testStart = Date.now();
        
        try {
          const { data, error } = await supabase.functions.invoke('voice-agent-handler', {
            body: { action: 'mark_reviewed', task_id: taskId },
          });
          
          results.push({
            action: 'mark_reviewed',
            iteration: i + 1,
            success: !error && data?.success,
            input: { task_id: taskId },
            output: data || {},
            duration_ms: Date.now() - testStart,
            error: error?.message,
          });
        } catch (e) {
          results.push({
            action: 'mark_reviewed',
            iteration: i + 1,
            success: false,
            input: { task_id: taskId },
            output: {},
            duration_ms: Date.now() - testStart,
            error: e instanceof Error ? e.message : 'Unknown error',
          });
        }
      }
    }

    // Test 7: Outbound Dialer - TCPA compliance
    if (action === 'run_all' || action === 'outbound_dialer') {
      console.log('Testing outbound_dialer TCPA compliance...');
      
      for (let i = 0; i < iterations; i++) {
        const [tz, phone] = Object.entries(TEST_PHONES)[i % 4];
        const testStart = Date.now();
        
        try {
          const { data, error } = await supabase.functions.invoke('outbound-dialer', {
            body: { action: 'check_call_time', phone_number: phone },
          });
          
          results.push({
            action: 'outbound_dialer_tcpa',
            iteration: i + 1,
            success: !error && typeof data?.allowed === 'boolean',
            input: { phone, timezone: tz },
            output: data || {},
            duration_ms: Date.now() - testStart,
            error: error?.message,
          });
        } catch (e) {
          results.push({
            action: 'outbound_dialer_tcpa',
            iteration: i + 1,
            success: false,
            input: { phone, timezone: tz },
            output: {},
            duration_ms: Date.now() - testStart,
            error: e instanceof Error ? e.message : 'Unknown error',
          });
        }
      }
    }

    // Calculate summary
    const totalTests = results.length;
    const passedTests = results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const avgDuration = results.reduce((sum, r) => sum + r.duration_ms, 0) / totalTests;

    const summary = {
      total_tests: totalTests,
      passed: passedTests,
      failed: failedTests,
      pass_rate: `${((passedTests / totalTests) * 100).toFixed(1)}%`,
      avg_duration_ms: Math.round(avgDuration),
      total_duration_ms: Date.now() - startTime,
      by_action: {} as Record<string, { passed: number; failed: number; avg_ms: number }>,
    };

    // Group by action
    const actionGroups = results.reduce((acc, r) => {
      if (!acc[r.action]) acc[r.action] = [];
      acc[r.action].push(r);
      return acc;
    }, {} as Record<string, TestResult[]>);

    for (const [actionName, actionResults] of Object.entries(actionGroups)) {
      const passed = actionResults.filter(r => r.success).length;
      const avgMs = actionResults.reduce((sum, r) => sum + r.duration_ms, 0) / actionResults.length;
      summary.by_action[actionName] = {
        passed,
        failed: actionResults.length - passed,
        avg_ms: Math.round(avgMs),
      };
    }

    // Update automation log
    if (logEntry?.id) {
      await supabase
        .from('automation_logs')
        .update({
          status: failedTests === 0 ? 'completed' : 'completed_with_errors',
          completed_at: new Date().toISOString(),
          items_processed: totalTests,
          items_created: passedTests,
          metadata: { summary, results: results.slice(0, 50) }, // Limit stored results
        })
        .eq('id', logEntry.id);
    }

    // Log to CRM if all tests pass
    if (failedTests === 0) {
      await supabase.from('automation_logs').insert({
        function_name: 'voice-agent-tests',
        status: 'completed',
        metadata: {
          event: 'all_tests_passed',
          summary,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return new Response(JSON.stringify({ summary, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Test voice agent error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
