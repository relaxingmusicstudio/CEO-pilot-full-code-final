import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const CONSENT_STORAGE_KEY = 'enhanced_tracking_consent';
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
    let visitorId = localStorage.getItem('visitor_id');
    if (!visitorId) {
      visitorId = `v_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('visitor_id', visitorId);
    }
    return visitorId;
  }, []);

  // Flush events to database
  const flushEvents = useCallback(async () => {
    if (eventQueueRef.current.length === 0) return;

    const events = [...eventQueueRef.current];
    eventQueueRef.current = [];

    const visitorId = getVisitorId();

    try {
      // Batch insert events
      const inserts = events.map(event => ({
        visitor_id: visitorId,
        event_type: 'click_enhanced',
        page_url: event.page_url,
        event_data: {
          x: event.x,
          y: event.y,
          element_tag: event.element_tag,
          element_text: event.element_text?.slice(0, 100), // Truncate long text
          element_classes: event.element_classes,
          element_id: event.element_id,
          viewport_width: event.viewport_width,
          viewport_height: event.viewport_height,
          scroll_position: event.scroll_position,
          timestamp: event.timestamp,
        },
      }));

      const { error } = await supabase.from('analytics_events').insert(inserts);
      
      if (error) {
        console.error('Failed to save enhanced events:', error);
        // Re-queue events on failure (up to a limit)
        if (eventQueueRef.current.length < 50) {
          eventQueueRef.current = [...events, ...eventQueueRef.current];
        }
      }
    } catch (err) {
      console.error('Enhanced tracking error:', err);
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
        // Use sendBeacon for reliability
        const visitorId = getVisitorId();
        const events = eventQueueRef.current.map(event => ({
          visitor_id: visitorId,
          event_type: 'click_enhanced',
          page_url: event.page_url,
          event_data: event,
        }));
        
        navigator.sendBeacon?.(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-analytics`,
          JSON.stringify({ events })
        );
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
