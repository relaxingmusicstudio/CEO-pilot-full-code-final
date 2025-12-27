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
    const { client_id, plan } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Provisioning product for client ${client_id} on plan ${plan}`);

    // Get client details
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', client_id)
      .maybeSingle();

    if (clientError || !client) {
      throw new Error(`Client not found: ${clientError?.message}`);
    }

    // Create onboarding record
    const taskCount = plan === 'professional' ? 12 : plan === 'enterprise' ? 15 : 10;
    const { data: onboarding, error: onboardingError } = await supabase
      .from('client_onboarding')
      .insert({
        client_id,
        status: 'in_progress',
        total_steps: taskCount,
        current_step: 0,
        progress_percentage: 0
      })
      .select()
      .single();

    if (onboardingError) {
      console.error('Error creating onboarding:', onboardingError);
    }

    // Create plan-based onboarding tasks
    const baseTasks = [
      { task_name: 'Welcome Call Scheduled', category: 'kickoff', priority: 1 },
      { task_name: 'Account Setup Complete', category: 'setup', priority: 1 },
      { task_name: 'AI Agent Configured', category: 'setup', priority: 2 },
      { task_name: 'Phone Number Provisioned', category: 'setup', priority: 2 },
      { task_name: 'CRM Integration Connected', category: 'integration', priority: 3 },
      { task_name: 'Calendar Integration Setup', category: 'integration', priority: 3 },
      { task_name: 'Training Session 1 Completed', category: 'training', priority: 4 },
      { task_name: 'Test Calls Verified', category: 'testing', priority: 5 },
      { task_name: 'Go-Live Checklist Complete', category: 'golive', priority: 6 },
      { task_name: 'First Week Review', category: 'review', priority: 7 }
    ];

    const professionalTasks = [
      { task_name: 'Advanced Reporting Setup', category: 'setup', priority: 3 },
      { task_name: 'Custom Script Configuration', category: 'setup', priority: 4 }
    ];

    const enterpriseTasks = [
      { task_name: 'SSO Configuration', category: 'setup', priority: 2 },
      { task_name: 'Custom API Integration', category: 'integration', priority: 3 },
      { task_name: 'Dedicated Success Manager Assigned', category: 'kickoff', priority: 1 }
    ];

    let allTasks = [...baseTasks];
    if (plan === 'professional') allTasks = [...allTasks, ...professionalTasks];
    if (plan === 'enterprise') allTasks = [...allTasks, ...professionalTasks, ...enterpriseTasks];

    const tasksToInsert = allTasks.map((task, idx) => ({
      client_id,
      ...task,
      due_date: new Date(Date.now() + (idx + 1) * 3 * 24 * 60 * 60 * 1000).toISOString()
    }));

    const { error: tasksError } = await supabase
      .from('onboarding_tasks')
      .insert(tasksToInsert);

    if (tasksError) {
      console.error('Error creating tasks:', tasksError);
    }

    // Create deliverables based on plan
    const baseDeliverables = [
      { deliverable_type: 'ai_agent', name: 'AI Voice Agent', description: '24/7 AI receptionist' },
      { deliverable_type: 'phone_number', name: 'Dedicated Phone Number', description: 'Local or toll-free number' },
      { deliverable_type: 'dashboard', name: 'Analytics Dashboard', description: 'Real-time reporting' }
    ];

    const professionalDeliverables = [
      { deliverable_type: 'integration', name: 'CRM Integration', description: 'Two-way sync with your CRM' },
      { deliverable_type: 'reporting', name: 'Advanced Reporting', description: 'Custom reports and exports' }
    ];

    const enterpriseDeliverables = [
      { deliverable_type: 'api', name: 'API Access', description: 'Full API access for custom integrations' },
      { deliverable_type: 'support', name: 'Priority Support', description: 'Dedicated support channel' },
      { deliverable_type: 'training', name: 'Quarterly Training', description: 'Scheduled training sessions' }
    ];

    let allDeliverables = [...baseDeliverables];
    if (plan === 'professional') allDeliverables = [...allDeliverables, ...professionalDeliverables];
    if (plan === 'enterprise') allDeliverables = [...allDeliverables, ...professionalDeliverables, ...enterpriseDeliverables];

    const deliverablesInsert = allDeliverables.map(d => ({
      client_id,
      ...d,
      status: 'pending'
    }));

    const { error: deliverablesError } = await supabase
      .from('client_deliverables')
      .insert(deliverablesInsert);

    if (deliverablesError) {
      console.error('Error creating deliverables:', deliverablesError);
    }

    // Schedule initial training session
    const { error: trainingError } = await supabase
      .from('client_training_sessions')
      .insert({
        client_id,
        session_type: 'onboarding',
        title: 'Welcome & Platform Overview',
        scheduled_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        duration_minutes: 45,
        status: 'scheduled'
      });

    if (trainingError) {
      console.error('Error scheduling training:', trainingError);
    }

    // Create product configuration
    const { error: configError } = await supabase
      .from('product_configurations')
      .insert([
        { client_id, config_key: 'ai_agent_settings', config_value: { voice: 'professional', language: 'en-US' } },
        { client_id, config_key: 'notification_preferences', config_value: { email: true, sms: false } },
        { client_id, config_key: 'business_hours', config_value: { start: '09:00', end: '17:00', timezone: 'America/New_York' } }
      ]);

    if (configError) {
      console.error('Error creating config:', configError);
    }

    // Generate referral code
    const referralCode = `${client.name?.substring(0, 3).toUpperCase() || 'REF'}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    const { error: referralError } = await supabase
      .from('referral_program')
      .insert({
        referrer_client_id: client_id,
        referred_email: 'placeholder',
        referral_code: referralCode,
        status: 'active',
        reward_amount: plan === 'enterprise' ? 500 : plan === 'professional' ? 250 : 100
      });

    if (referralError) {
      console.error('Error creating referral:', referralError);
    }

    // Create work queue item for CSM
    await supabase
      .from('work_queue')
      .insert({
        agent_type: 'csm',
        type: 'onboarding',
        title: `New Client Onboarding: ${client.name}`,
        description: `${plan} plan client ready for onboarding. Schedule welcome call and begin setup.`,
        priority: plan === 'enterprise' ? 'high' : 'medium',
        metadata: { client_id, plan, referral_code: referralCode }
      });

    console.log(`Provisioning complete for client ${client_id}`);

    return new Response(JSON.stringify({
      success: true,
      client_id,
      onboarding_id: onboarding?.id,
      tasks_created: tasksToInsert.length,
      deliverables_created: deliverablesInsert.length,
      referral_code: referralCode
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Error in product-provisioning:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
