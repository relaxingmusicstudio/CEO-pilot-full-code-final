import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    console.log(`Save analytics action: ${action}`);
    
    switch (action) {
      case "upsert_visitor": {
        const visitorData = data as VisitorData;
        
        // Check if visitor exists
        const { data: existing } = await supabase
          .from("visitors")
          .select("id, total_visits")
          .eq("visitor_id", visitorData.visitorId)
          .maybeSingle();
        
        if (existing) {
          // Update existing visitor
          const { error } = await supabase
            .from("visitors")
            .update({
              last_seen_at: new Date().toISOString(),
              total_visits: (existing.total_visits || 1) + 1,
            })
            .eq("visitor_id", visitorData.visitorId);
          
          if (error) throw error;
          console.log("Updated existing visitor:", visitorData.visitorId);
        } else {
          // Create new visitor
          const { error } = await supabase
            .from("visitors")
            .insert({
              visitor_id: visitorData.visitorId,
              device: visitorData.device,
              browser: visitorData.browser,
              utm_source: visitorData.utmSource,
              utm_medium: visitorData.utmMedium,
              utm_campaign: visitorData.utmCampaign,
              landing_page: visitorData.landingPage,
              referrer: visitorData.referrer,
            });
          
          if (error) throw error;
          console.log("Created new visitor:", visitorData.visitorId);
        }
        
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
        
        const { data: newLead, error } = await supabase
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
          })
          .select("id")
          .single();
        
        if (error) throw error;
        console.log("Created lead:", newLead.id);
        
        return new Response(JSON.stringify({ success: true, leadId: newLead.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      case "update_lead_status": {
        const { leadId, status, notes, revenueValue, convertedAt } = data;
        
        const updateData: any = { status };
        if (notes) updateData.notes = notes;
        if (revenueValue) updateData.revenue_value = revenueValue;
        if (convertedAt) updateData.converted_at = convertedAt;
        
        const { error } = await supabase
          .from("leads")
          .update(updateData)
          .eq("id", leadId);
        
        if (error) throw error;
        console.log("Updated lead status:", leadId, status);
        
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
