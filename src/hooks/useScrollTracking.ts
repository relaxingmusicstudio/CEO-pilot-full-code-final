import { useEffect, useRef } from 'react';
import { useVisitor } from '@/contexts/useVisitor';

export const useScrollTracking = () => {
  const { updateScrollDepth, trackSectionView } = useVisitor();
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Track scroll depth
    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight - windowHeight;
      const scrolled = window.scrollY;
      const depth = Math.round((scrolled / documentHeight) * 100);
      updateScrollDepth(depth);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    // Track section visibility
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const sectionId = entry.target.id;
            if (sectionId) {
              trackSectionView(sectionId);
            }
          }
        });
      },
      { threshold: 0.3 }
    );

    // Observe all sections with IDs
    const sections = document.querySelectorAll('section[id]');
    sections.forEach((section) => {
      observerRef.current?.observe(section);
    });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [updateScrollDepth, trackSectionView]);
};
