import { createContext } from "react";
import type { VisitorSession } from "@/lib/visitorTracking";

export interface VisitorContextType {
  session: VisitorSession;
  trackSectionView: (sectionId: string) => void;
  trackCtaClick: (ctaId: string) => void;
  trackCalculatorUse: (inputs?: Record<string, string | number>) => void;
  trackDemoPlay: () => void;
  trackDemoProgress: (seconds: number) => void;
  trackChatbotOpen: () => void;
  trackChatbotEngage: () => void;
  updateScrollDepth: (depth: number) => void;
  getGHLData: () => ReturnType<typeof import("@/lib/visitorTracking").formatSessionForGHL>;
}

export const VisitorContext = createContext<VisitorContextType | undefined>(undefined);
