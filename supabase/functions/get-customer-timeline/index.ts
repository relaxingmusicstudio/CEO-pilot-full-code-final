import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TimelineEvent {
  id: string;
  type: string;
  channel: string;
  timestamp: string;
  title: string;
  description: string;
  agent_type: string | null;
  is_ai: boolean;
  metadata: Record<string, unknown>;
  content_snapshot?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { lead_id, contact_id, limit = 50, offset = 0 } = await req.json();

    if (!lead_id && !contact_id) {
      return new Response(
        JSON.stringify({ error: "lead_id or contact_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const timeline: TimelineEvent[] = [];

    // 1. Fetch lead_activities
    if (lead_id) {
      const { data: activities, error: actError } = await supabase
        .from("lead_activities")
        .select("*")
        .eq("lead_id", lead_id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!actError && activities) {
        activities.forEach((act: Record<string, unknown>) => {
          timeline.push({
            id: `activity-${act.id}`,
            type: "activity",
            channel: (act.channel as string) || "system",
            timestamp: act.created_at as string,
            title: act.activity_type as string,
            description: act.description as string || "",
            agent_type: act.agent_type as string | null,
            is_ai: !!act.agent_type,
            metadata: (act.metadata as Record<string, unknown>) || {},
            content_snapshot: act.content_snapshot as string,
          });
        });
      }
    }

    // 2. Fetch conversations
    const { data: leadData } = lead_id 
      ? await supabase.from("leads").select("visitor_id").eq("id", lead_id).single()
      : { data: null };

    if (leadData?.visitor_id) {
      const { data: convos, error: convError } = await supabase
        .from("conversations")
        .select("*")
        .eq("visitor_id", leadData.visitor_id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!convError && convos) {
        convos.forEach((conv: Record<string, unknown>) => {
          timeline.push({
            id: `conversation-${conv.id}`,
            type: "conversation",
            channel: "chat",
            timestamp: conv.created_at as string,
            title: "Chat Conversation",
            description: `${conv.message_count || 0} messages, ${conv.outcome || "ongoing"}`,
            agent_type: "alex",
            is_ai: true,
            metadata: {
              session_id: conv.session_id,
              outcome: conv.outcome,
              duration: conv.duration_seconds,
              phase: conv.conversation_phase,
            },
          });
        });
      }
    }

    // 3. Fetch messages from messages_unified (if contact_id)
    if (contact_id) {
      const { data: messages, error: msgError } = await supabase
        .from("messages_unified")
        .select("*")
        .eq("contact_id", contact_id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!msgError && messages) {
        messages.forEach((msg: Record<string, unknown>) => {
          timeline.push({
            id: `message-${msg.id}`,
            type: "message",
            channel: msg.channel_type as string || "unknown",
            timestamp: msg.created_at as string,
            title: msg.direction === "inbound" ? "Received Message" : "Sent Message",
            description: (msg.content as string)?.substring(0, 200) || "",
            agent_type: msg.ai_generated ? "alex" : null,
            is_ai: !!msg.ai_generated,
            metadata: {
              direction: msg.direction,
              status: msg.status,
            },
            content_snapshot: msg.content as string,
          });
        });
      }
    }

    // 4. Fetch call_logs
    if (lead_id) {
      const { data: calls, error: callError } = await supabase
        .from("call_logs")
        .select("*")
        .eq("lead_id", lead_id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!callError && calls) {
        calls.forEach((call: Record<string, unknown>) => {
          timeline.push({
            id: `call-${call.id}`,
            type: "call",
            channel: "phone",
            timestamp: call.created_at as string,
            title: call.direction === "inbound" ? "Incoming Call" : "Outgoing Call",
            description: `${call.status} - ${call.duration_seconds || 0}s`,
            agent_type: call.ai_handled ? "vapi" : null,
            is_ai: !!call.ai_handled,
            metadata: {
              disposition: call.disposition,
              from: call.from_number,
              to: call.to_number,
              recording_url: call.recording_url,
            },
            content_snapshot: call.transcription as string,
          });
        });
      }
    }

    // 5. Fetch funnel events
    if (lead_id) {
      const { data: funnelEvents, error: funnelError } = await supabase
        .from("funnel_enrollments")
        .select("*, funnels(name), funnel_stages(name)")
        .eq("lead_id", lead_id)
        .order("enrolled_at", { ascending: false })
        .limit(limit);

      if (!funnelError && funnelEvents) {
        funnelEvents.forEach((fe: Record<string, unknown>) => {
          const funnels = fe.funnels as Record<string, unknown> | null;
          timeline.push({
            id: `funnel-${fe.id}`,
            type: "funnel",
            channel: "automation",
            timestamp: fe.enrolled_at as string,
            title: `Funnel: ${funnels?.name || "Unknown"}`,
            description: fe.converted ? "Converted" : "In progress",
            agent_type: fe.ai_assigned ? "funnel-ai" : null,
            is_ai: !!fe.ai_assigned,
            metadata: {
              funnel_id: fe.funnel_id,
              converted: fe.converted,
              assignment_reason: fe.assignment_reason,
            },
          });
        });
      }
    }

    // Sort all events by timestamp descending
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    const paginatedTimeline = timeline.slice(offset, offset + limit);

    // Generate summary stats
    const stats = {
      total_events: timeline.length,
      ai_events: timeline.filter(e => e.is_ai).length,
      human_events: timeline.filter(e => !e.is_ai).length,
      channels: [...new Set(timeline.map(e => e.channel))],
      last_activity: timeline[0]?.timestamp || null,
    };

    console.log(`Timeline fetched: ${timeline.length} events for lead ${lead_id}`);

    return new Response(
      JSON.stringify({
        timeline: paginatedTimeline,
        stats,
        pagination: {
          total: timeline.length,
          limit,
          offset,
          has_more: offset + limit < timeline.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Timeline error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
