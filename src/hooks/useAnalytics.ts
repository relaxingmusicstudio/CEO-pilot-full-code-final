import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AnalyticsEvent {
  eventType: string;
  eventData?: Record<string, any>;
  pageUrl?: string;
}

export const useAnalytics = () => {
  const sessionIdRef = useRef<string>(
    `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );

  // Save or update visitor in database
  const saveVisitor = useCallback(async (visitorData: {
    visitorId: string;
    device?: string;
    browser?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    landingPage?: string;
    referrer?: string;
  }) => {
    try {
      await supabase.functions.invoke("save-analytics", {
        body: {
          action: "upsert_visitor",
          data: visitorData,
        },
      });
    } catch (error) {
      console.error("Failed to save visitor:", error);
    }
  }, []);

  // Track an analytics event
  const trackEvent = useCallback(async (
    visitorId: string,
    event: AnalyticsEvent,
    utmData?: { utmSource?: string; utmMedium?: string; utmCampaign?: string }
  ) => {
    try {
      await supabase.functions.invoke("save-analytics", {
        body: {
          action: "track_event",
          data: {
            visitorId,
            sessionId: sessionIdRef.current,
            eventType: event.eventType,
            eventData: event.eventData,
            pageUrl: event.pageUrl || window.location.pathname,
            ...utmData,
          },
        },
      });
    } catch (error) {
      console.error("Failed to track event:", error);
    }
  }, []);

  // Save conversation data
  const saveConversation = useCallback(async (data: {
    visitorId: string;
    messages: any[];
    leadData?: any;
    aiAnalysis?: any;
    conversationPhase?: string;
    outcome?: string;
    durationSeconds?: number;
  }) => {
    try {
      const result = await supabase.functions.invoke("save-analytics", {
        body: {
          action: "save_conversation",
          data: {
            ...data,
            sessionId: sessionIdRef.current,
            messageCount: data.messages.length,
          },
        },
      });
      return result.data?.conversationId;
    } catch (error) {
      console.error("Failed to save conversation:", error);
      return null;
    }
  }, []);

  // Save lead data
  const saveLead = useCallback(async (data: {
    visitorId: string;
    conversationId?: string;
    name: string;
    email: string;
    phone?: string;
    businessName?: string;
    trade?: string;
    teamSize?: string;
    callVolume?: string;
    timeline?: string;
    interests?: string[];
    leadScore?: number;
    leadTemperature?: string;
    conversionProbability?: number;
    buyingSignals?: string[];
    objections?: string[];
    ghlContactId?: string;
  }) => {
    try {
      const result = await supabase.functions.invoke("save-analytics", {
        body: {
          action: "save_lead",
          data,
        },
      });
      return result.data?.leadId;
    } catch (error) {
      console.error("Failed to save lead:", error);
      return null;
    }
  }, []);

  // Update lead status (for feedback loop)
  const updateLeadStatus = useCallback(async (
    leadId: string,
    status: string,
    options?: { notes?: string; revenueValue?: number; convertedAt?: string }
  ) => {
    try {
      await supabase.functions.invoke("save-analytics", {
        body: {
          action: "update_lead_status",
          data: { leadId, status, ...options },
        },
      });
    } catch (error) {
      console.error("Failed to update lead status:", error);
    }
  }, []);

  // Get session ID
  const getSessionId = useCallback(() => sessionIdRef.current, []);

  return {
    saveVisitor,
    trackEvent,
    saveConversation,
    saveLead,
    updateLeadStatus,
    getSessionId,
  };
};
