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
    const { action, client_id, survey_id, score, feedback, milestone } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === 'send_survey') {
      console.log(`Sending NPS survey to client ${client_id} for milestone: ${milestone}`);

      // Get client details
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', client_id)
        .maybeSingle();

      if (clientError || !client) {
        throw new Error(`Client not found: ${clientError?.message}`);
      }

      // Create survey record
      const { data: survey, error: surveyError } = await supabase
        .from('nps_surveys')
        .insert({
          client_id,
          survey_type: 'milestone',
          milestone,
          sent_at: new Date().toISOString()
        })
        .select()
        .single();

      if (surveyError) throw surveyError;

      // Generate survey link
      const surveyLink = `https://apexlocal360.com/nps?id=${survey.id}`;

      // Send email
      if (RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'ApexLocal360 <feedback@apexlocal360.com>',
            to: client.email,
            subject: `How are we doing, ${client.name}?`,
            html: `
              <h1>We'd love your feedback!</h1>
              <p>Hi ${client.name},</p>
              <p>You've been with us for ${milestone}. We'd love to hear how we're doing!</p>
              <p>On a scale of 0-10, how likely are you to recommend ApexLocal360 to a friend or colleague?</p>
              <p><a href="${surveyLink}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Share Your Feedback</a></p>
              <p>It only takes 30 seconds and helps us improve!</p>
            `
          })
        });
      }

      return new Response(JSON.stringify({
        success: true,
        survey_id: survey.id
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'submit_response') {
      console.log(`Recording NPS response: ${score} for survey ${survey_id}`);

      const { error } = await supabase
        .from('nps_surveys')
        .update({
          score,
          feedback,
          responded_at: new Date().toISOString()
        })
        .eq('id', survey_id);

      if (error) throw error;

      // Get the survey to find client
      const { data: survey } = await supabase
        .from('nps_surveys')
        .select('*, clients(*)')
        .eq('id', survey_id)
        .maybeSingle();

      // If score >= 9 (Promoter), trigger testimonial request
      if (score >= 9) {
        await supabase
          .from('work_queue')
          .insert({
            agent_type: 'csm',
            type: 'testimonial',
            title: `Request Testimonial: ${survey?.clients?.name || 'Client'}`,
            description: `NPS score of ${score}! Great opportunity to request a testimonial.`,
            priority: 'high',
            metadata: { client_id: survey?.client_id, nps_score: score, feedback }
          });
      }

      // If score <= 6 (Detractor), create intervention
      if (score <= 6) {
        await supabase
          .from('client_interventions')
          .insert({
            client_id: survey?.client_id,
            intervention_type: 'nps_followup',
            trigger_reason: `Low NPS score: ${score}. Feedback: ${feedback || 'None provided'}`,
            status: 'pending',
            scheduled_at: new Date().toISOString()
          });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'get_metrics') {
      // Get all NPS scores
      const { data: surveys } = await supabase
        .from('nps_surveys')
        .select('*')
        .not('score', 'is', null);

      if (!surveys || surveys.length === 0) {
        return new Response(JSON.stringify({
          nps_score: 0,
          promoters: 0,
          passives: 0,
          detractors: 0,
          total_responses: 0
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const promoters = surveys.filter(s => s.score >= 9).length;
      const passives = surveys.filter(s => s.score >= 7 && s.score <= 8).length;
      const detractors = surveys.filter(s => s.score <= 6).length;
      const total = surveys.length;

      const npsScore = Math.round(((promoters - detractors) / total) * 100);

      return new Response(JSON.stringify({
        nps_score: npsScore,
        promoters,
        passives,
        detractors,
        total_responses: total,
        promoter_rate: Math.round((promoters / total) * 100),
        detractor_rate: Math.round((detractors / total) * 100)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'schedule_milestones') {
      // Schedule NPS surveys for all active clients at key milestones
      const { data: clients } = await supabase
        .from('clients')
        .select('*')
        .eq('status', 'active');

      const milestones = [30, 90, 180, 365]; // Days
      let scheduled = 0;

      for (const client of clients || []) {
        const startDate = new Date(client.start_date);
        const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));

        for (const milestone of milestones) {
          if (daysSinceStart >= milestone - 1 && daysSinceStart <= milestone + 1) {
            // Check if survey already sent for this milestone
            const { data: existing } = await supabase
              .from('nps_surveys')
              .select('id')
              .eq('client_id', client.id)
              .eq('milestone', `${milestone} days`)
              .maybeSingle();

            if (!existing) {
              await supabase
                .from('work_queue')
                .insert({
                  agent_type: 'automation',
                  type: 'nps_survey',
                  title: `Send ${milestone}-day NPS: ${client.name}`,
                  description: `Client reached ${milestone}-day milestone`,
                  metadata: { client_id: client.id, milestone: `${milestone} days` }
                });
              scheduled++;
            }
          }
        }
      }

      return new Response(JSON.stringify({
        success: true,
        surveys_scheduled: scheduled
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in nps-survey:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
