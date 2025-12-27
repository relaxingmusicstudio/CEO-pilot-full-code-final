import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AnalyticsEvent {
  eventType: string;
  eventData?: Record<string, unknown>;
  pageUrl?: string;
}

// Infer traffic source from referrer URL
const inferSourceFromReferrer = (referrer?: string): string | undefined => {
  if (!referrer) return undefined;
  const url = referrer.toLowerCase();
  
  if (url.includes('google.com')) return 'google';
  if (url.includes('facebook.com') || url.includes('fb.com')) return 'facebook';
  if (url.includes('instagram.com')) return 'instagram';
  if (url.includes('youtube.com')) return 'youtube';
  if (url.includes('tiktok.com')) return 'tiktok';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
  if (url.includes('linkedin.com')) return 'linkedin';
  if (url.includes('bing.com')) return 'bing';
  if (url.includes('yahoo.com')) return 'yahoo';
  if (url.includes('yelp.com')) return 'yelp';
  if (url.includes('nextdoor.com')) return 'nextdoor';
  
  // Return domain as source for other referrers
  try {
    const domain = new URL(referrer).hostname.replace('www.', '');
    return domain.split('.')[0];
  } catch {
    return undefined;
  }
};

// Infer medium from referrer
const inferMediumFromReferrer = (referrer?: string): string | undefined => {
  if (!referrer) return 'direct';
  const url = referrer.toLowerCase();
  
  if (url.includes('google.com') || url.includes('bing.com') || url.includes('yahoo.com')) return 'organic';
  if (url.includes('facebook.com') || url.includes('instagram.com') || url.includes('twitter.com') || 
      url.includes('linkedin.com') || url.includes('tiktok.com')) return 'social';
  if (url.includes('youtube.com')) return 'video';
  if (url.includes('yelp.com') || url.includes('nextdoor.com')) return 'referral';
  
  return 'referral';
};

export const useAnalytics = () => {
  const sessionIdRef = useRef<string>(
    `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );

  // Save or update visitor in database with enhanced UTM tracking
  const saveVisitor = useCallback(async (visitorData: {
    visitorId: string;
    device?: string;
    browser?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    landingPage?: string;
    referrer?: string;
    gclid?: string;
    fbclid?: string;
  }) => {
    try {
      // Parse additional tracking params from URL
      const params = new URLSearchParams(window.location.search);
      const enhancedData = {
        ...visitorData,
        utmSource: visitorData.utmSource || params.get('utm_source') || inferSourceFromReferrer(visitorData.referrer),
        utmMedium: visitorData.utmMedium || params.get('utm_medium') || inferMediumFromReferrer(visitorData.referrer),
        utmCampaign: visitorData.utmCampaign || params.get('utm_campaign'),
        gclid: params.get('gclid') || undefined,
        fbclid: params.get('fbclid') || undefined,
      };
      
      await supabase.functions.invoke("save-analytics", {
        body: {
          action: "upsert_visitor",
          data: enhancedData,
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
    messages: Array<Record<string, unknown>>;
    leadData?: Record<string, unknown>;
    aiAnalysis?: Record<string, unknown>;
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
