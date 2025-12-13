import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { client_id, email_number } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get client details
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', client_id)
      .maybeSingle();

    if (clientError || !client) {
      throw new Error(`Client not found: ${clientError?.message}`);
    }

    // Welcome email sequence templates
    const emailSequence = [
      {
        subject: `Welcome to ApexLocal360, ${client.name}! 🎉`,
        body: `
          <h1>Welcome aboard, ${client.name}!</h1>
          <p>We're thrilled to have you join the ApexLocal360 family. Your AI voice agent is being set up and will be ready to capture every call for your business.</p>
          <h2>What happens next?</h2>
          <ul>
            <li>📞 We'll schedule your welcome call within 24 hours</li>
            <li>🤖 Your AI agent will be configured to your business</li>
            <li>📊 You'll get access to your real-time dashboard</li>
          </ul>
          <p>In the meantime, check out your <a href="https://apexlocal360.com/portal">client portal</a> to track your onboarding progress.</p>
        `
      },
      {
        subject: `Your AI Agent Setup Guide - Day 2`,
        body: `
          <h1>Let's set up your AI agent, ${client.name}!</h1>
          <p>Your AI voice agent is almost ready. Here's what we need from you:</p>
          <ol>
            <li>Business hours and availability</li>
            <li>Common questions your customers ask</li>
            <li>Your preferred greeting and tone</li>
          </ol>
          <p>Reply to this email or complete these in your <a href="https://apexlocal360.com/portal">portal</a>.</p>
        `
      },
      {
        subject: `Training Session Reminder - Day 3`,
        body: `
          <h1>Your training session is coming up!</h1>
          <p>Hi ${client.name},</p>
          <p>Don't forget about your scheduled training session. We'll walk you through:</p>
          <ul>
            <li>How to customize your AI agent's responses</li>
            <li>Understanding your analytics dashboard</li>
            <li>Best practices for maximizing captured leads</li>
          </ul>
          <p>See you soon!</p>
        `
      },
      {
        subject: `You're Almost Live! - Day 5`,
        body: `
          <h1>Final steps before go-live, ${client.name}!</h1>
          <p>Your AI agent is configured and ready. Before we flip the switch, let's make sure everything is perfect:</p>
          <ul>
            <li>✅ Test call verification</li>
            <li>✅ Integration checks</li>
            <li>✅ Final script review</li>
          </ul>
          <p>Once you confirm, your AI agent will start handling calls 24/7!</p>
        `
      },
      {
        subject: `🎉 You're Live! First Week Success Tips`,
        body: `
          <h1>Congratulations, ${client.name}! You're live!</h1>
          <p>Your AI agent is now answering calls for your business. Here's how to make the most of your first week:</p>
          <ol>
            <li><strong>Check your dashboard daily</strong> - Monitor calls and leads</li>
            <li><strong>Review AI responses</strong> - Fine-tune as needed</li>
            <li><strong>Follow up on leads quickly</strong> - Speed wins deals</li>
          </ol>
          <p>We'll check in at the end of your first week to review performance and make any adjustments.</p>
          <p>Questions? Reply to this email or call us anytime!</p>
        `
      }
    ];

    const emailIndex = (email_number || 1) - 1;
    const emailTemplate = emailSequence[emailIndex] || emailSequence[0];

    if (!RESEND_API_KEY) {
      console.log('Resend API key not configured, logging email instead');
      console.log(`Would send email ${email_number} to ${client.email}:`, emailTemplate.subject);
      
      return new Response(JSON.stringify({
        success: true,
        simulated: true,
        email_number,
        subject: emailTemplate.subject
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Send email via Resend
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'ApexLocal360 <onboarding@apexlocal360.com>',
        to: client.email,
        subject: emailTemplate.subject,
        html: emailTemplate.body
      })
    });

    const emailResult = await emailResponse.json();

    // Log the email send
    await supabase
      .from('work_queue')
      .insert({
        agent_type: 'email',
        type: 'notification',
        title: `Welcome Email ${email_number} Sent`,
        description: `Sent "${emailTemplate.subject}" to ${client.email}`,
        status: 'completed',
        metadata: { client_id, email_number, email_id: emailResult.id }
      });

    console.log(`Welcome email ${email_number} sent to ${client.email}`);

    return new Response(JSON.stringify({
      success: true,
      email_number,
      email_id: emailResult.id,
      subject: emailTemplate.subject
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in welcome-sequence:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
