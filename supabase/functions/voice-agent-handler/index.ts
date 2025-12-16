import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TCPA Call Time Restrictions - 8am to 9pm in lead's timezone
const CALL_START_HOUR = 8;
const CALL_END_HOUR = 21;

// US Timezone mapping by area code (simplified)
const TIMEZONE_BY_AREA_CODE: Record<string, string> = {
  // Eastern
  '201': 'America/New_York', '202': 'America/New_York', '203': 'America/New_York',
  '212': 'America/New_York', '215': 'America/New_York', '216': 'America/New_York',
  '305': 'America/New_York', '404': 'America/New_York', '407': 'America/New_York',
  // Central
  '214': 'America/Chicago', '312': 'America/Chicago', '314': 'America/Chicago',
  '469': 'America/Chicago', '512': 'America/Chicago', '713': 'America/Chicago',
  // Mountain
  '303': 'America/Denver', '480': 'America/Phoenix', '602': 'America/Phoenix',
  // Pacific
  '206': 'America/Los_Angeles', '213': 'America/Los_Angeles', '310': 'America/Los_Angeles',
  '415': 'America/Los_Angeles', '503': 'America/Los_Angeles', '619': 'America/Los_Angeles',
};

function getTimezoneFromPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  const areaCode = cleaned.length >= 10 ? cleaned.slice(-10, -7) : cleaned.slice(0, 3);
  return TIMEZONE_BY_AREA_CODE[areaCode] || 'America/New_York';
}

function isWithinCallHours(timezone: string): { allowed: boolean; reason?: string } {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const hour = parseInt(formatter.format(now), 10);
    
    if (hour < CALL_START_HOUR || hour >= CALL_END_HOUR) {
      return {
        allowed: false,
        reason: `Cannot call - outside permitted hours (8am-9pm in ${timezone}). Current hour: ${hour}`,
      };
    }
    return { allowed: true };
  } catch {
    return { allowed: true }; // Default to allowed if timezone detection fails
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    const { action, ...params } = await req.json();
    console.log(`Voice agent handler: ${action}`, params);

    switch (action) {
      // Check if call is within permitted hours
      case 'check_call_time': {
        const { phone_number } = params;
        const timezone = getTimezoneFromPhone(phone_number);
        const result = isWithinCallHours(timezone);
        
        return new Response(JSON.stringify({
          ...result,
          timezone,
          phone_number,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check human availability
      case 'check_human_availability': {
        // Check if any team member is marked as available
        const { data: directives } = await supabase
          .from('user_directives')
          .select('*')
          .eq('directive_key', 'human_available')
          .eq('is_active', true)
          .single();

        const isAvailable = directives?.directive_value === 'true';
        
        return new Response(JSON.stringify({
          available: isAvailable,
          message: isAvailable 
            ? 'Human agent is available for transfer'
            : 'No human agent currently available',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Collect message when human is not available
      case 'collect_message': {
        const { 
          call_log_id, 
          lead_id, 
          contact_id,
          topic, 
          contact_preference, 
          timeline_expectation,
          caller_phone,
          caller_email,
        } = params;

        // Create follow-up task
        const { data: task, error: taskError } = await supabase
          .from('follow_up_tasks')
          .insert({
            call_log_id,
            lead_id,
            contact_id,
            topic,
            contact_preference: contact_preference || 'call',
            timeline_expectation: timeline_expectation || 'end of day tomorrow',
            caller_phone,
            caller_email,
            status: 'pending',
            priority: 'high',
          })
          .select()
          .single();

        if (taskError) {
          console.error('Error creating follow-up task:', taskError);
          throw taskError;
        }

        // Update call log with message collected info
        if (call_log_id) {
          await supabase
            .from('call_logs')
            .update({
              human_requested: true,
              message_collected: {
                topic,
                contact_preference,
                timeline_expectation,
                collected_at: new Date().toISOString(),
              },
              follow_up_task_id: task.id,
            })
            .eq('id', call_log_id);
        }

        // Log to CRM - automation_logs
        await supabase.from('automation_logs').insert({
          function_name: 'voice-agent-handler',
          status: 'completed',
          metadata: {
            event: 'message_collected',
            lead_id,
            topic,
            contact_preference,
            task_id: task.id,
            timestamp: new Date().toISOString(),
          },
        });

        // Log to lead_activities if lead_id exists
        if (lead_id) {
          await supabase.from('lead_activities').insert({
            lead_id,
            activity_type: 'voice_message_collected',
            description: `AI collected message: ${topic}`,
            metadata: { task_id: task.id, contact_preference, timeline_expectation },
          });
        }

        // Log activity
        await supabase.from('api_logs').insert({
          service: 'voice-agent-handler',
          endpoint: 'collect_message',
          method: 'POST',
          request_body: { lead_id, topic, contact_preference },
          response_status: 200,
        });

        return new Response(JSON.stringify({
          success: true,
          task_id: task.id,
          message: 'Follow-up task created successfully',
          confirmation_script: `Perfect. I've noted that you need to discuss ${topic} and to expect a ${contact_preference} by ${timeline_expectation}. Is that correct?`,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Generate AI draft for follow-up
      case 'generate_draft': {
        const { task_id, draft_type } = params;

        // Get task details
        const { data: task, error: taskError } = await supabase
          .from('follow_up_tasks')
          .select(`
            *,
            call_logs!follow_up_tasks_call_log_id_fkey(transcription, duration_seconds),
            leads(name, email, phone, company, notes)
          `)
          .eq('id', task_id)
          .single();

        if (taskError || !task) {
          throw new Error('Task not found');
        }

        // Get business profile for context
        const { data: profile } = await supabase
          .from('business_profile')
          .select('*')
          .limit(1)
          .single();

        const businessName = profile?.business_name || 'our team';
        const leadName = task.leads?.name || 'there';
        const topic = task.topic || 'your inquiry';

        let prompt = '';
        let systemPrompt = `You are a professional business communication assistant for ${businessName}. Generate warm, professional follow-up communications that acknowledge the customer's request and provide value.`;

        if (draft_type === 'email') {
          prompt = `Generate a follow-up email for a customer who requested human contact during a call.

Customer: ${leadName}
Topic they wanted to discuss: ${topic}
Contact preference: ${task.contact_preference}
Call transcript excerpt: ${task.call_logs?.transcription?.slice(0, 500) || 'Not available'}

Generate a JSON response with:
- subject: A professional email subject line
- body: A warm, professional email body (use their name, acknowledge their request, offer to help)`;
        } else if (draft_type === 'script') {
          prompt = `Generate call-back talking points for a customer who requested human contact.

Customer: ${leadName}
Topic: ${topic}
Call transcript excerpt: ${task.call_logs?.transcription?.slice(0, 500) || 'Not available'}

Generate a brief, natural script with:
- Opening greeting
- Reference to their previous call
- How to address their topic
- Next steps to offer`;
        } else {
          prompt = `Generate a brief SMS follow-up for a customer who requested contact.

Customer: ${leadName}
Topic: ${topic}
Business: ${businessName}

Generate a professional but friendly SMS (under 160 characters).`;
        }

        // Call Lovable AI
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('AI gateway error:', errorText);
          throw new Error('Failed to generate draft');
        }

        const aiData = await response.json();
        const draftContent = aiData.choices?.[0]?.message?.content || '';

        // Update task with draft
        const updateData: Record<string, any> = {};
        if (draft_type === 'email') {
          try {
            const parsed = JSON.parse(draftContent);
            updateData.ai_draft_email = {
              subject: parsed.subject,
              body: parsed.body,
              generated_at: new Date().toISOString(),
            };
          } catch {
            updateData.ai_draft_email = {
              subject: `Follow-up: ${topic}`,
              body: draftContent,
              generated_at: new Date().toISOString(),
            };
          }
        } else if (draft_type === 'script') {
          updateData.ai_draft_script = draftContent;
        } else {
          updateData.ai_draft_sms = draftContent;
        }

        await supabase
          .from('follow_up_tasks')
          .update(updateData)
          .eq('id', task_id);

        // Log draft generation to CRM
        await supabase.from('automation_logs').insert({
          function_name: 'voice-agent-handler',
          status: 'completed',
          metadata: {
            event: 'draft_generated',
            task_id,
            draft_type,
            lead_name: task.leads?.name,
            topic: task.topic,
            timestamp: new Date().toISOString(),
          },
        });

        return new Response(JSON.stringify({
          success: true,
          draft_type,
          content: updateData,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Send follow-up reply
      case 'send_reply': {
        const { task_id, reply_method, reply_content, recipient } = params;

        // Get task
        const { data: task } = await supabase
          .from('follow_up_tasks')
          .select('*, leads(id, name, email, phone)')
          .eq('id', task_id)
          .single();

        if (!task) {
          throw new Error('Task not found');
        }

        let sendResult = { success: false, message: '' };

        if (reply_method === 'email') {
          // Use messaging-send function
          const { data, error } = await supabase.functions.invoke('messaging-send', {
            body: {
              channel: 'email',
              to: recipient || task.leads?.email,
              subject: reply_content.subject,
              body: reply_content.body,
            },
          });

          sendResult = error 
            ? { success: false, message: error.message }
            : { success: true, message: 'Email sent successfully' };
        } else if (reply_method === 'sms') {
          const { data, error } = await supabase.functions.invoke('messaging-send', {
            body: {
              channel: 'sms',
              to: recipient || task.leads?.phone,
              body: reply_content,
            },
          });

          sendResult = error
            ? { success: false, message: error.message }
            : { success: true, message: 'SMS sent successfully' };
        } else {
          // For call, just mark as ready for callback
          sendResult = { success: true, message: 'Call script prepared' };
        }

        // Update task status
        await supabase
          .from('follow_up_tasks')
          .update({
            status: 'completed',
            reply_sent_at: new Date().toISOString(),
            reply_method,
            reply_content: typeof reply_content === 'string' 
              ? reply_content 
              : JSON.stringify(reply_content),
          })
          .eq('id', task_id);

        // Log to CRM (lead activities)
        if (task.lead_id) {
          await supabase.from('lead_activities').insert({
            lead_id: task.lead_id,
            activity_type: 'follow_up_sent',
            description: `Sent ${reply_method} follow-up regarding: ${task.topic}`,
            metadata: { task_id, reply_method },
          });

          // Update task with CRM log
          await supabase
            .from('follow_up_tasks')
            .update({ 
              crm_logged_at: new Date().toISOString(),
              crm_activity_id: task.lead_id,
            })
            .eq('id', task_id);
        }

        return new Response(JSON.stringify({
          success: sendResult.success,
          message: sendResult.message,
          task_id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get pending follow-up tasks
      case 'get_pending_tasks': {
        const { limit = 20 } = params;

        const { data: tasks, error } = await supabase
          .from('follow_up_tasks')
          .select(`
            *,
            call_logs!follow_up_tasks_call_log_id_fkey(transcription, duration_seconds, from_number),
            leads(name, email, phone, company)
          `)
          .in('status', ['pending', 'in_progress'])
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;

        return new Response(JSON.stringify({ tasks }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Mark task as reviewed
      case 'mark_reviewed': {
        const { task_id } = params;

        await supabase
          .from('follow_up_tasks')
          .update({
            status: 'in_progress',
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', task_id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('Voice agent handler error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
