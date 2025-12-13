import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  VisitorSession,
  getOrCreateVisitorId,
  getDeviceType,
  getBrowser,
  parseUTMParams,
  initializeVisitTracking,
  calculateEngagementScore,
  determineBehavioralIntent,
  getInterestSignals,
  formatSessionForGHL,
  saveSession,
  loadSession,
} from '@/lib/visitorTracking';
import { useAnalytics } from '@/hooks/useAnalytics';

interface VisitorContextType {
  session: VisitorSession;
  trackSectionView: (sectionId: string) => void;
  trackCtaClick: (ctaId: string) => void;
  trackCalculatorUse: (inputs?: Record<string, string | number>) => void;
  trackDemoPlay: () => void;
  trackDemoProgress: (seconds: number) => void;
  trackChatbotOpen: () => void;
  trackChatbotEngage: () => void;
  updateScrollDepth: (depth: number) => void;
  getGHLData: () => ReturnType<typeof formatSessionForGHL>;
}

const defaultSession: VisitorSession = {
  visitorId: '',
  isReturning: false,
  visitCount: 1,
  firstVisit: new Date().toISOString(),
  lastVisit: new Date().toISOString(),
  currentSessionStart: new Date().toISOString(),
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  utmTerm: null,
  referrer: '',
  entryPage: '',
  landingUrl: '',
  device: 'desktop',
  browser: 'Unknown',
  pagesViewed: [],
  sectionsViewed: [],
  ctaClicks: [],
  calculatorUsed: false,
  calculatorInputs: {},
  demoPlayed: false,
  demoWatchTime: 0,
  scrollDepth: 0,
  timeOnSite: 0,
  chatbotOpened: false,
  chatbotEngaged: false,
  engagementScore: 0,
  interestSignals: [],
  behavioralIntent: 'Just Browsing',
};

const VisitorContext = createContext<VisitorContextType | undefined>(undefined);

export const VisitorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<VisitorSession>(defaultSession);
  const sessionStartTime = useRef<number>(Date.now());
  const timeInterval = useRef<NodeJS.Timeout | null>(null);
  const hasSavedVisitor = useRef(false);
  const { saveVisitor, trackEvent, getSessionId } = useAnalytics();

  // Initialize session on mount
  useEffect(() => {
    const visitorId = getOrCreateVisitorId();
    const { isReturning, visitCount, firstVisit, lastVisit } = initializeVisitTracking();
    const utmParams = parseUTMParams();
    const device = getDeviceType();
    const browser = getBrowser();
    
    // Try to load existing session or create new
    const existingSession = loadSession();
    const currentPath = window.location.pathname;
    
    const initialSession: VisitorSession = {
      ...defaultSession,
      visitorId,
      isReturning,
      visitCount,
      firstVisit,
      lastVisit,
      currentSessionStart: new Date().toISOString(),
      utmSource: utmParams.utmSource,
      utmMedium: utmParams.utmMedium,
      utmCampaign: utmParams.utmCampaign,
      utmContent: utmParams.utmContent,
      utmTerm: utmParams.utmTerm,
      referrer: document.referrer || 'Direct',
      entryPage: currentPath,
      landingUrl: window.location.href,
      device,
      browser,
      pagesViewed: existingSession?.pagesViewed || [currentPath],
      sectionsViewed: existingSession?.sectionsViewed || [],
      ctaClicks: existingSession?.ctaClicks || [],
      calculatorUsed: existingSession?.calculatorUsed || false,
      calculatorInputs: existingSession?.calculatorInputs || {},
      demoPlayed: existingSession?.demoPlayed || false,
      demoWatchTime: existingSession?.demoWatchTime || 0,
      chatbotOpened: existingSession?.chatbotOpened || false,
      chatbotEngaged: existingSession?.chatbotEngaged || false,
    };
    
    // Calculate initial scores
    initialSession.engagementScore = calculateEngagementScore(initialSession);
    initialSession.interestSignals = getInterestSignals(initialSession);
    initialSession.behavioralIntent = determineBehavioralIntent(initialSession);
    
    setSession(initialSession);
    saveSession(initialSession);
    
    // Save visitor to database (only once per session)
    if (!hasSavedVisitor.current) {
      hasSavedVisitor.current = true;
      saveVisitor({
        visitorId,
        device,
        browser,
        utmSource: utmParams.utmSource || undefined,
        utmMedium: utmParams.utmMedium || undefined,
        utmCampaign: utmParams.utmCampaign || undefined,
        landingPage: window.location.href,
        referrer: document.referrer || undefined,
      });
      
      // Track page view event
      trackEvent(visitorId, {
        eventType: 'page_view',
        eventData: { path: currentPath, title: document.title },
        pageUrl: currentPath,
      }, {
        utmSource: utmParams.utmSource || undefined,
        utmMedium: utmParams.utmMedium || undefined,
        utmCampaign: utmParams.utmCampaign || undefined,
      });
    }
    
    // Track time on site
    sessionStartTime.current = Date.now();
    timeInterval.current = setInterval(() => {
      setSession(prev => {
        const timeOnSite = Math.round((Date.now() - sessionStartTime.current) / 1000);
        const updated = { ...prev, timeOnSite };
        updated.engagementScore = calculateEngagementScore(updated);
        updated.interestSignals = getInterestSignals(updated);
        updated.behavioralIntent = determineBehavioralIntent(updated);
        saveSession(updated);
        return updated;
      });
    }, 10000); // Update every 10 seconds
    
    return () => {
      if (timeInterval.current) clearInterval(timeInterval.current);
    };
  }, [saveVisitor, trackEvent]);

  // Track section views
  const trackSectionView = useCallback((sectionId: string) => {
    setSession(prev => {
      if (prev.sectionsViewed.includes(sectionId)) return prev;
      const updated = {
        ...prev,
        sectionsViewed: [...prev.sectionsViewed, sectionId],
      };
      updated.engagementScore = calculateEngagementScore(updated);
      updated.interestSignals = getInterestSignals(updated);
      updated.behavioralIntent = determineBehavioralIntent(updated);
      saveSession(updated);
      return updated;
    });
  }, []);

  // Track CTA clicks
  const trackCtaClick = useCallback((ctaId: string) => {
    setSession(prev => {
      const updated = {
        ...prev,
        ctaClicks: [...prev.ctaClicks, ctaId],
      };
      updated.engagementScore = calculateEngagementScore(updated);
      updated.interestSignals = getInterestSignals(updated);
      updated.behavioralIntent = determineBehavioralIntent(updated);
      saveSession(updated);
      return updated;
    });
  }, []);

  // Track calculator usage
  const trackCalculatorUse = useCallback((inputs?: Record<string, string | number>) => {
    setSession(prev => {
      const updated = {
        ...prev,
        calculatorUsed: true,
        calculatorInputs: inputs || prev.calculatorInputs,
      };
      updated.engagementScore = calculateEngagementScore(updated);
      updated.interestSignals = getInterestSignals(updated);
      updated.behavioralIntent = determineBehavioralIntent(updated);
      saveSession(updated);
      return updated;
    });
  }, []);

  // Track demo play
  const trackDemoPlay = useCallback(() => {
    setSession(prev => {
      const updated = {
        ...prev,
        demoPlayed: true,
      };
      updated.engagementScore = calculateEngagementScore(updated);
      updated.interestSignals = getInterestSignals(updated);
      updated.behavioralIntent = determineBehavioralIntent(updated);
      saveSession(updated);
      return updated;
    });
  }, []);

  // Track demo watch progress
  const trackDemoProgress = useCallback((seconds: number) => {
    setSession(prev => {
      const updated = {
        ...prev,
        demoWatchTime: Math.max(prev.demoWatchTime, seconds),
      };
      updated.engagementScore = calculateEngagementScore(updated);
      updated.interestSignals = getInterestSignals(updated);
      updated.behavioralIntent = determineBehavioralIntent(updated);
      saveSession(updated);
      return updated;
    });
  }, []);

  // Track chatbot opened
  const trackChatbotOpen = useCallback(() => {
    setSession(prev => {
      const updated = {
        ...prev,
        chatbotOpened: true,
      };
      updated.engagementScore = calculateEngagementScore(updated);
      updated.interestSignals = getInterestSignals(updated);
      updated.behavioralIntent = determineBehavioralIntent(updated);
      saveSession(updated);
      return updated;
    });
  }, []);

  // Track chatbot engagement (user sent a message)
  const trackChatbotEngage = useCallback(() => {
    setSession(prev => {
      const updated = {
        ...prev,
        chatbotEngaged: true,
      };
      updated.engagementScore = calculateEngagementScore(updated);
      updated.interestSignals = getInterestSignals(updated);
      updated.behavioralIntent = determineBehavioralIntent(updated);
      saveSession(updated);
      return updated;
    });
  }, []);

  // Update scroll depth
  const updateScrollDepth = useCallback((depth: number) => {
    setSession(prev => {
      if (depth <= prev.scrollDepth) return prev;
      const updated = {
        ...prev,
        scrollDepth: depth,
      };
      updated.engagementScore = calculateEngagementScore(updated);
      updated.interestSignals = getInterestSignals(updated);
      updated.behavioralIntent = determineBehavioralIntent(updated);
      saveSession(updated);
      return updated;
    });
  }, []);

  // Get formatted data for GHL
  const getGHLData = useCallback(() => {
    return formatSessionForGHL(session);
  }, [session]);

  return (
    <VisitorContext.Provider
      value={{
        session,
        trackSectionView,
        trackCtaClick,
        trackCalculatorUse,
        trackDemoPlay,
        trackDemoProgress,
        trackChatbotOpen,
        trackChatbotEngage,
        updateScrollDepth,
        getGHLData,
      }}
    >
      {children}
    </VisitorContext.Provider>
  );
};

export const useVisitor = () => {
  const context = useContext(VisitorContext);
  if (!context) {
    throw new Error('useVisitor must be used within a VisitorProvider');
  }
  return context;
};
