import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emitEvent } from "../_shared/event-bus.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VisitorData {
  visitorId: string;
  device?: string;
  browser?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  landingPage?: string;
  referrer?: string;
}

interface EventData {
  visitorId: string;
  sessionId: string;
  eventType: string;
  eventData?: Record<string, any>;
  pageUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

interface ConversationData {
  visitorId: string;
  sessionId: string;
  messages: any[];
  leadData?: any;
  aiAnalysis?: any;
  conversationPhase?: string;
  outcome?: string;
  durationSeconds?: number;
  messageCount?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, data } = await req.json();
    
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error("Missing env vars - URL:", !!SUPABASE_URL, "KEY:", !!SUPABASE_ANON_KEY);
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");

    // Default: use anon key with request auth forwarded (so RLS can evaluate authenticated users).
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
      auth: { persistSession: false },
    });

    // Admin client for server-controlled writes (analytics capture must not 500 the app).
    const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false },
        })
      : null;
    
    console.log(`Save analytics action: ${action}`);
    
    switch (action) {
      case "upsert_visitor": {
        const visitorData = data as VisitorData;
        
        // Use upsert to handle race conditions atomically
        // Prefer admin client so analytics capture does not 500 due to RLS.
        const db = supabaseAdmin ?? supabase;

        const { error } = await db
          .from("visitors")
          .upsert(
            {
              visitor_id: visitorData.visitorId,
              device: visitorData.device,
              browser: visitorData.browser,
              utm_source: visitorData.utmSource,
              utm_medium: visitorData.utmMedium,
              utm_campaign: visitorData.utmCampaign,
              landing_page: visitorData.landingPage,
              referrer: visitorData.referrer,
              last_seen_at: new Date().toISOString(),
            },
            {
              onConflict: "visitor_id",
              ignoreDuplicates: false,
            }
          );

        if (error) {
          console.error("Upsert visitor error:", error);
          // Analytics must never crash the app; report non-fatal failure.
          return new Response(
            JSON.stringify({
              success: false,
              error: "visitor_upsert_failed",
              details: (error as any)?.message ?? String(error),
              code: (error as any)?.code ?? null,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        
        console.log("Upserted visitor:", visitorData.visitorId);
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      case "track_event": {
        const eventData = data as EventData;
        
        const { error } = await supabase
          .from("analytics_events")
          .insert({
            visitor_id: eventData.visitorId,
            session_id: eventData.sessionId,
            event_type: eventData.eventType,
            event_data: eventData.eventData,
            page_url: eventData.pageUrl,
            utm_source: eventData.utmSource,
            utm_medium: eventData.utmMedium,
            utm_campaign: eventData.utmCampaign,
          });
        
        if (error) throw error;
        console.log("Tracked event:", eventData.eventType);
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      case "save_conversation": {
        const convData = data as ConversationData;
        
        // Upsert conversation (create or update)
        const { data: existing } = await supabase
          .from("conversations")
          .select("id")
          .eq("visitor_id", convData.visitorId)
          .eq("session_id", convData.sessionId)
          .maybeSingle();
        
        if (existing) {
          const { error } = await supabase
            .from("conversations")
            .update({
              messages: convData.messages,
              lead_data: convData.leadData,
              ai_analysis: convData.aiAnalysis,
              conversation_phase: convData.conversationPhase,
              outcome: convData.outcome,
              duration_seconds: convData.durationSeconds,
              message_count: convData.messageCount,
            })
            .eq("id", existing.id);
          
          if (error) throw error;
          console.log("Updated conversation:", existing.id);
          
          return new Response(JSON.stringify({ success: true, conversationId: existing.id }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } else {
          const { data: newConv, error } = await supabase
            .from("conversations")
            .insert({
              visitor_id: convData.visitorId,
              session_id: convData.sessionId,
              messages: convData.messages,
              lead_data: convData.leadData,
              ai_analysis: convData.aiAnalysis,
              conversation_phase: convData.conversationPhase,
              outcome: convData.outcome,
              duration_seconds: convData.durationSeconds,
              message_count: convData.messageCount,
            })
            .select("id")
            .single();
          
          if (error) throw error;
          console.log("Created conversation:", newConv.id);
          
          return new Response(JSON.stringify({ success: true, conversationId: newConv.id }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      
      case "save_lead": {
        const leadData = data;
        
        // Use admin client for lead insert (Funnels owner path)
        const db = supabaseAdmin ?? supabase;
        
        const { data: newLead, error } = await db
          .from("leads")
          .insert({
            visitor_id: leadData.visitorId,
            conversation_id: leadData.conversationId,
            name: leadData.name,
            email: leadData.email,
            phone: leadData.phone,
            business_name: leadData.businessName,
            trade: leadData.trade,
            team_size: leadData.teamSize,
            call_volume: leadData.callVolume,
            timeline: leadData.timeline,
            interests: leadData.interests,
            lead_score: leadData.leadScore,
            lead_temperature: leadData.leadTemperature,
            conversion_probability: leadData.conversionProbability,
            buying_signals: leadData.buyingSignals,
            objections: leadData.objections,
            ghl_contact_id: leadData.ghlContactId,
            status: "new",
            // Funnels owns these fields at create time
            source: leadData.source ?? "funnel",
            utm_source: leadData.utmSource,
            utm_medium: leadData.utmMedium,
            utm_campaign: leadData.utmCampaign,
          })
          .select("id, tenant_id")
          .single();
        
        if (error) throw error;
        console.log("Created lead:", newLead.id);
        
        // === EMIT lead_created EVENT (System Contract v1.1.1) ===
        try {
          const eventResult = await emitEvent({
            eventType: "lead_created",
            entityType: "lead",
            entityId: newLead.id,
            payload: {
              lead_id: newLead.id,
              source: leadData.source ?? "funnel",
              utm_source: leadData.utmSource,
              utm_medium: leadData.utmMedium,
              utm_campaign: leadData.utmCampaign,
              lead_score: leadData.leadScore ?? 0,
              consent_status: {
                call: leadData.consentToCall ?? false,
                sms: leadData.consentToSms ?? false,
                email: leadData.consentToEmail ?? false,
              },
              channel: leadData.channel ?? "web",
            },
            emittedBy: "funnels",
            tenantId: newLead.tenant_id,
            idempotencyKey: `lead_created:${newLead.id}`,
          });
          
          if (eventResult.success) {
            console.log("Emitted lead_created event:", eventResult.eventId ?? "(duplicate)");
          } else {
            console.error("Failed to emit lead_created event:", eventResult.error);
          }
        } catch (eventError) {
          // Don't fail the lead creation if event emission fails
          console.error("Event emission error (non-fatal):", eventError);
        }
        
        return new Response(JSON.stringify({ success: true, leadId: newLead.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      case "update_lead_status": {
        const { leadId, status, notes, revenueValue, convertedAt } = data;
        
        // Route to appropriate RPC based on status (ownership enforcement)
        const coldStatuses = ['cold', 'warm', 'contacted', 'nurturing', 'new'];
        const salesStatuses = ['qualified', 'disqualified', 'opportunity', 'negotiating', 'closed_won', 'closed_lost'];
        
        if (status === 'converted') {
          // Use convert_lead RPC
          const { error } = await supabase.rpc('convert_lead', {
            p_lead_id: leadId,
            p_converted_at: convertedAt || new Date().toISOString(),
            p_notes: notes,
            p_revenue_value: revenueValue,
          });
          if (error) throw error;
        } else if (coldStatuses.includes(status)) {
          // Use cold_update_lead_fields RPC
          const { error } = await supabase.rpc('cold_update_lead_fields', {
            p_lead_id: leadId,
            p_status: status,
          });
          if (error) throw error;
        } else if (salesStatuses.includes(status)) {
          // Use sales_update_lead_fields RPC
          const { error } = await supabase.rpc('sales_update_lead_fields', {
            p_lead_id: leadId,
            p_status: status,
          });
          if (error) throw error;
        } else {
          // For other statuses (new, etc.), use legacy RPC context
          const { error } = await supabase.rpc('cold_update_lead_fields', {
            p_lead_id: leadId,
            p_status: status,
          });
          if (error) throw error;
        }
        
        console.log("Updated lead status via RPC:", leadId, status);
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("Save analytics error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
