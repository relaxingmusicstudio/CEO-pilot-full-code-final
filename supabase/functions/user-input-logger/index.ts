import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat } from "../_shared/ai.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LogInputRequest {
  action: 'log_input' | 'classify_intent' | 'get_pending_actions' | 'mark_handled' | 'get_recent_directives';
  source?: string;
  input_type?: string;
  content?: string;
  classify?: boolean;
  agent?: string;
  directive_id?: string;
  handled_by?: string;
  related_entity_type?: string;
  related_entity_id?: string;
  metadata?: Record<string, unknown>;
  limit?: number;
}

// Intent classification using AI
async function classifyIntent(content: string): Promise<{
  intent: string;
  action_required: boolean;
  priority: string;
  related_entity_type?: string;
}> {
  try {
    const aiResponse = await aiChat({
      messages: [
        {
          role: 'system',
          content: `You are an intent classifier for a business AI system. Classify user inputs into one of these intents:
- approval: User is approving, confirming, or saying yes to something
- pause: User wants to stop, pause, or halt an operation
- resume: User wants to resume or continue a paused operation
- priority_change: User is changing priority or urgency of something
- question: User is asking a question
- feedback: User is providing feedback or comments
- directive: User is giving a specific command or instruction
- settings: User is changing preferences or settings
- cancel: User wants to cancel something entirely

Also determine:
- action_required: true if this needs immediate agent action
- priority: urgent, high, normal, or low
- related_entity_type: lead, client, content, campaign, invoice, or null

Respond ONLY with valid JSON: {"intent": "...", "action_required": boolean, "priority": "...", "related_entity_type": "..." or null}`
        },
        { role: 'user', content: content }
      ],
      max_tokens: 100,
      temperature: 0.1,
      purpose: 'intent_classification',
    });

    const result = JSON.parse(aiResponse.text);
    return result;
  } catch (error) {
    console.error('Intent classification error:', error);
    return keywordClassify(content);
  }
}

// Fallback keyword-based classification
function keywordClassify(content: string): {
  intent: string;
  action_required: boolean;
  priority: string;
  related_entity_type?: string;
} {
  const lower = content.toLowerCase();
  
  // Check for approval patterns
  if (/\b(approve|yes|confirm|go ahead|looks good|proceed|accept)\b/.test(lower)) {
    return { intent: 'approval', action_required: true, priority: 'high' };
  }
  
  // Check for pause patterns
  if (/\b(pause|stop|halt|wait|hold|don't send|do not send)\b/.test(lower)) {
    return { intent: 'pause', action_required: true, priority: 'urgent' };
  }
  
  // Check for resume patterns
  if (/\b(resume|continue|start again|unpause|go|begin)\b/.test(lower)) {
    return { intent: 'resume', action_required: true, priority: 'high' };
  }
  
  // Check for cancel patterns
  if (/\b(cancel|delete|remove|abort|never mind)\b/.test(lower)) {
    return { intent: 'cancel', action_required: true, priority: 'high' };
  }
  
  // Check for priority patterns
  if (/\b(urgent|priority|asap|immediately|rush|critical)\b/.test(lower)) {
    return { intent: 'priority_change', action_required: true, priority: 'urgent' };
  }
  
  // Check for questions
  if (/\?$|\b(what|how|why|when|where|who|can you|could you|will you)\b/.test(lower)) {
    return { intent: 'question', action_required: false, priority: 'normal' };
  }
  
  // Check for entity mentions
  let related_entity_type: string | undefined;
  if (/\b(lead|prospect)\b/.test(lower)) related_entity_type = 'lead';
  else if (/\b(client|customer)\b/.test(lower)) related_entity_type = 'client';
  else if (/\b(content|post|article)\b/.test(lower)) related_entity_type = 'content';
  else if (/\b(campaign|outreach)\b/.test(lower)) related_entity_type = 'campaign';
  
  // Default to directive if it seems like a command
  if (/\b(send|create|update|change|set|make|do|run|execute|schedule)\b/.test(lower)) {
    return { intent: 'directive', action_required: true, priority: 'normal', related_entity_type };
  }
  
  return { intent: 'feedback', action_required: false, priority: 'normal', related_entity_type };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: LogInputRequest = await req.json();
    const { action } = body;

    console.log(`[user-input-logger] Action: ${action}`, body);

    switch (action) {
      case 'log_input': {
        const { source, input_type = 'text', content, classify = true, related_entity_type, related_entity_id, metadata } = body;
        
        if (!source || !content) {
          return new Response(
            JSON.stringify({ error: 'source and content are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Classify intent if requested
        let classification: { intent: string; action_required: boolean; priority: string; related_entity_type?: string } = { 
          intent: 'feedback', 
          action_required: false, 
          priority: 'normal', 
          related_entity_type: undefined 
        };
        if (classify) {
          classification = await classifyIntent(content);
        }

        // Insert directive
        const { data: directive, error } = await supabase
          .from('user_directives')
          .insert({
            source,
            input_type,
            content,
            intent: classification.intent,
            action_required: classification.action_required,
            priority: classification.priority,
            related_entity_type: related_entity_type || classification.related_entity_type,
            related_entity_id,
            metadata: metadata || {},
          })
          .select()
          .single();

        if (error) {
          console.error('Error inserting directive:', error);
          throw error;
        }

        console.log(`[user-input-logger] Logged directive:`, directive);

        return new Response(
          JSON.stringify({ success: true, directive }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_pending_actions': {
        const { agent, related_entity_type, limit = 50 } = body;
        
        let query = supabase
          .from('user_directives')
          .select('*')
          .eq('action_required', true)
          .eq('action_taken', false)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (related_entity_type) {
          query = query.eq('related_entity_type', related_entity_type);
        }

        const { data: directives, error } = await query;

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, directives, count: directives?.length || 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'mark_handled': {
        const { directive_id, handled_by } = body;
        
        if (!directive_id) {
          return new Response(
            JSON.stringify({ error: 'directive_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('user_directives')
          .update({
            action_taken: true,
            handled_by: handled_by || 'system',
            processed_at: new Date().toISOString(),
          })
          .eq('id', directive_id)
          .select()
          .single();

        if (error) throw error;

        console.log(`[user-input-logger] Marked directive handled:`, data);

        return new Response(
          JSON.stringify({ success: true, directive: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_recent_directives': {
        const { source, limit = 20 } = body;
        
        let query = supabase
          .from('user_directives')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (source) {
          query = query.eq('source', source);
        }

        const { data: directives, error } = await query;

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, directives }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'classify_intent': {
        const { content } = body;
        
        if (!content) {
          return new Response(
            JSON.stringify({ error: 'content is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const classification = await classifyIntent(content);

        return new Response(
          JSON.stringify({ success: true, classification }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: unknown) {
    console.error('[user-input-logger] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
