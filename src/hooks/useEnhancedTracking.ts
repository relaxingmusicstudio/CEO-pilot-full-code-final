import { useEffect, useCallback, useRef } from "react";
import { initAnalyticsQueue, trackEvent, queueEvent } from "@/lib/analytics/trackEvent";

const CONSENT_STORAGE_KEY = "enhanced_tracking_consent";
const BATCH_INTERVAL_MS = 5000; // Batch events every 5 seconds

interface EnhancedClickEvent {
  x: number;
  y: number;
  element_tag: string;
  element_text: string;
  element_classes: string;
  element_id: string;
  viewport_width: number;
  viewport_height: number;
  scroll_position: number;
  timestamp: number;
  page_url: string;
}

export const useEnhancedTracking = () => {
  const eventQueueRef = useRef<EnhancedClickEvent[]>([]);
  const isEnabledRef = useRef(false);
  const sessionIdRef = useRef<string>(
    `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );

  // Check if enhanced tracking is enabled
  const checkConsent = useCallback(() => {
    try {
      const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (stored) {
        const prefs = JSON.parse(stored);
        isEnabledRef.current = prefs.enhanced_analytics === true;
      }
    } catch {
      isEnabledRef.current = false;
    }
  }, []);

  // Get visitor ID
  const getVisitorId = useCallback((): string => {
    let visitorId = localStorage.getItem("visitor_id");
    if (!visitorId) {
      visitorId = `v_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("visitor_id", visitorId);
    }
    return visitorId;
  }, []);

  // Flush events to database
  const flushEvents = useCallback(async () => {
    if (eventQueueRef.current.length === 0) return;

    const events = [...eventQueueRef.current];
    eventQueueRef.current = [];

    const visitorId = getVisitorId();

    for (const event of events) {
      await trackEvent({
        visitorId,
        sessionId: sessionIdRef.current,
        eventType: "click_enhanced",
        pageUrl: event.page_url,
        eventData: {
          x: event.x,
          y: event.y,
          element_tag: event.element_tag,
          element_text: event.element_text?.slice(0, 100),
          element_classes: event.element_classes,
          element_id: event.element_id,
          viewport_width: event.viewport_width,
          viewport_height: event.viewport_height,
          scroll_position: event.scroll_position,
          timestamp: event.timestamp,
        },
      });
    }
  }, [getVisitorId]);

  // Handle click events
  const handleClick = useCallback((e: MouseEvent) => {
    if (!isEnabledRef.current) return;

    const target = e.target as HTMLElement;
    if (!target) return;

    const event: EnhancedClickEvent = {
      x: e.clientX,
      y: e.clientY,
      element_tag: target.tagName.toLowerCase(),
      element_text: target.textContent || '',
      element_classes: target.className || '',
      element_id: target.id || '',
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      scroll_position: window.scrollY,
      timestamp: Date.now(),
      page_url: window.location.pathname,
    };

    eventQueueRef.current.push(event);
  }, []);

  useEffect(() => {
    initAnalyticsQueue();
    checkConsent();

    // Listen for consent changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CONSENT_STORAGE_KEY) {
        checkConsent();
      }
    };

    // Add click listener
    document.addEventListener('click', handleClick, { passive: true });
    window.addEventListener('storage', handleStorageChange);

    // Set up batch interval
    const intervalId = setInterval(flushEvents, BATCH_INTERVAL_MS);

    // Flush on page unload
    const handleUnload = () => {
      if (eventQueueRef.current.length > 0) {
      const visitorId = getVisitorId();
      eventQueueRef.current.forEach((event) => {
        queueEvent({
          visitorId,
          sessionId: sessionIdRef.current,
          eventType: "click_enhanced",
          pageUrl: event.page_url,
          eventData: event,
        });
      });
    }
  };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      document.removeEventListener('click', handleClick);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('beforeunload', handleUnload);
      clearInterval(intervalId);
      flushEvents(); // Flush remaining events
    };
  }, [checkConsent, handleClick, flushEvents, getVisitorId]);

  // Manual trigger for consent refresh
  const refreshConsent = useCallback(() => {
    checkConsent();
  }, [checkConsent]);

  return { refreshConsent, isEnabled: isEnabledRef.current };
};
