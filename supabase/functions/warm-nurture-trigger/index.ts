import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, campaign_id, contact_id, lead_id, trigger_event } = await req.json();

    if (action === 'create_campaign') {
      const { name, description, trigger_type, trigger_conditions } = trigger_event;
      
      const { data: campaign, error } = await supabase
        .from('warm_nurture_campaigns')
        .insert({
          name,
          description,
          trigger_type,
          trigger_conditions,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, campaign }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'add_touchpoint') {
      const { data, error } = await supabase
        .from('nurture_touchpoints')
        .insert({
          campaign_id,
          ...trigger_event,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, touchpoint: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'enroll_contact') {
      // Check if already enrolled
      const { data: existing } = await supabase
        .from('nurture_enrollments')
        .select('id')
        .eq('campaign_id', campaign_id)
        .eq('contact_id', contact_id)
        .eq('status', 'active')
        .single();

      if (existing) {
        return new Response(JSON.stringify({ 
          success: false, 
          message: 'Contact already enrolled',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get first touchpoint
      const { data: firstTouchpoint } = await supabase
        .from('nurture_touchpoints')
        .select('*')
        .eq('campaign_id', campaign_id)
        .eq('step_number', 1)
        .single();

      const nextTouchpointAt = firstTouchpoint
        ? new Date(Date.now() + (firstTouchpoint.delay_minutes * 60 * 1000)).toISOString()
        : null;

      const { data: enrollment, error } = await supabase
        .from('nurture_enrollments')
        .insert({
          campaign_id,
          contact_id,
          lead_id,
          next_touchpoint_at: nextTouchpointAt,
        })
        .select()
        .single();

      if (error) throw error;

      // Update campaign enrolled count
      await supabase.rpc('increment_enrolled_count', { p_campaign_id: campaign_id });

      return new Response(JSON.stringify({ success: true, enrollment }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'process_touchpoints') {
      // Process due touchpoints
      const { data: dueEnrollments } = await supabase
        .from('nurture_enrollments')
        .select(`
          *,
          campaign:warm_nurture_campaigns(*),
          contact:contacts_unified(*),
          lead:leads(*)
        `)
        .eq('status', 'active')
        .lte('next_touchpoint_at', new Date().toISOString())
        .limit(50);

      let processed = 0;

      for (const enrollment of dueEnrollments || []) {
        // Get current touchpoint
        const { data: touchpoint } = await supabase
          .from('nurture_touchpoints')
          .select('*')
          .eq('campaign_id', enrollment.campaign_id)
          .eq('step_number', enrollment.current_step + 1)
          .single();

        if (!touchpoint) {
          // No more touchpoints, complete enrollment
          await supabase
            .from('nurture_enrollments')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            .eq('id', enrollment.id);
          continue;
        }

        // Execute touchpoint based on type
        if (touchpoint.touchpoint_type === 'email') {
          const content = touchpoint.content as any;
          console.log('[NURTURE] Sending email to:', enrollment.contact?.email, '- Subject:', content?.subject);
          
          // Would integrate with Resend here
        } else if (touchpoint.touchpoint_type === 'sms') {
          const content = touchpoint.content as any;
          console.log('[NURTURE] Sending SMS to:', enrollment.contact?.phone, '- Message:', content?.message);
          
          // Call SMS function
          await supabase.functions.invoke('sms-blast', {
            body: {
              action: 'send_single',
              phone_number: enrollment.contact?.phone,
              message: content?.message,
            },
          });
        } else if (touchpoint.touchpoint_type === 'call') {
          console.log('[NURTURE] Adding to dialer queue:', enrollment.contact?.phone);
          
          // Add to dialer queue
          await supabase.from('dialer_queue').insert({
            contact_id: enrollment.contact_id,
            lead_id: enrollment.lead_id,
            phone_number: enrollment.contact?.phone || enrollment.lead?.phone,
            priority: 70, // Higher priority for nurture calls
          });
        } else if (touchpoint.touchpoint_type === 'tag') {
          const content = touchpoint.content as any;
          
          // Add tag to contact
          await supabase
            .from('contacts_unified')
            .update({
              tags: supabase.rpc('array_append_unique', {
                arr: enrollment.contact?.tags || [],
                val: content?.tag,
              }),
            })
            .eq('id', enrollment.contact_id);
        }

        // Update touchpoint executed count
        await supabase
          .from('nurture_touchpoints')
          .update({ executed_count: touchpoint.executed_count + 1 })
          .eq('id', touchpoint.id);

        // Get next touchpoint
        const { data: nextTouchpoint } = await supabase
          .from('nurture_touchpoints')
          .select('*')
          .eq('campaign_id', enrollment.campaign_id)
          .eq('step_number', enrollment.current_step + 2)
          .single();

        const nextTouchpointAt = nextTouchpoint
          ? new Date(Date.now() + (nextTouchpoint.delay_minutes * 60 * 1000)).toISOString()
          : null;

        // Update enrollment
        await supabase
          .from('nurture_enrollments')
          .update({
            current_step: enrollment.current_step + 1,
            next_touchpoint_at: nextTouchpointAt,
          })
          .eq('id', enrollment.id);

        processed++;
      }

      return new Response(JSON.stringify({ success: true, processed }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'check_triggers') {
      // Check behavioral triggers and auto-enroll
      const { data: campaigns } = await supabase
        .from('warm_nurture_campaigns')
        .select('*')
        .eq('status', 'active')
        .neq('trigger_type', 'manual');

      for (const campaign of campaigns || []) {
        if (campaign.trigger_type === 'score_threshold') {
          const conditions = campaign.trigger_conditions as any;
          const minScore = conditions?.min_score || 50;

          // Find leads above threshold not yet enrolled
          const { data: hotLeads } = await supabase
            .from('leads')
            .select('*, contact:contacts_unified(*)')
            .gte('lead_score', minScore)
            .eq('status', 'new');

          for (const lead of hotLeads || []) {
            // Auto-enroll
            await supabase.functions.invoke('warm-nurture-trigger', {
              body: {
                action: 'enroll_contact',
                campaign_id: campaign.id,
                contact_id: lead.contact?.id,
                lead_id: lead.id,
              },
            });
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'get_campaigns') {
      const { data, error } = await supabase
        .from('warm_nurture_campaigns')
        .select(`
          *,
          touchpoints:nurture_touchpoints(count),
          enrollments:nurture_enrollments(count)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, campaigns: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Warm nurture error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
