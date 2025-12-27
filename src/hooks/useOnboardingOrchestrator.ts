/**
 * useOnboardingOrchestrator - Manages in-dashboard onboarding flow
 * 
 * Responsibilities:
 * - Track onboarding progress (step 0-3)
 * - Trigger onboarding conversation in CEO chat
 * - Parse agent responses for completion signals
 * - Update database when onboarding completes
 * - Notify parent via callback when status changes
 * 
 * CRITICAL: completeOnboarding is ONLY called here in processAgentResponse.
 * Parent components should NOT call completeOnboarding separately.
 */

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface OnboardingData {
  businessName?: string;
  industry?: string;
  biggestChallenge?: string;
  primaryGoal?: string;
}

interface UseOnboardingOrchestratorReturn {
  currentStep: number;
  totalSteps: number;
  isComplete: boolean;
  isLoading: boolean;
  startOnboarding: () => string;
  processAgentResponse: (response: string) => void;
  onCompletionCallback?: () => void;
}

interface UseOnboardingOrchestratorOptions {
  onComplete?: () => void;
}

const ONBOARDING_SYSTEM_PROMPT = `You are helping a new user set up their AI CEO Command Center. Have a friendly, conversational exchange to gather their business information.

Ask these questions one at a time (wait for their response before the next):
1. "What's your business name?"
2. "What industry are you in? (e.g., HVAC, plumbing, landscaping, etc.)"
3. "What's your biggest challenge right now? (e.g., getting more leads, managing time, following up with customers)"
4. "What's your primary goal - generating more leads, improving customer retention, creating content, or streamlining operations?"

After they answer all questions, summarize what you learned and tell them their Command Center is ready.

When you have all the information, include this exact tag in your response:
[ONBOARDING_COMPLETE:{"businessName":"NAME","industry":"INDUSTRY","biggestChallenge":"CHALLENGE","primaryGoal":"GOAL"}]

Be warm, encouraging, and keep responses brief.`;

export function useOnboardingOrchestrator(
  options?: UseOnboardingOrchestratorOptions
): UseOnboardingOrchestratorReturn {
  const { user } = useAuth();
  const tenantId = user?.user_metadata?.tenant_id;
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const totalSteps = 3;

  const startOnboarding = useCallback(() => {
    setCurrentStep(1);
    return ONBOARDING_SYSTEM_PROMPT;
  }, []);

  // Internal function - only called from processAgentResponse
  const completeOnboardingInternal = useCallback(async (data: OnboardingData) => {
    if (!user || isLoading || isComplete) return;
    
    setIsLoading(true);
    
    try {
      // Update business_profile with onboarding data (tenant-scoped)
      if (!tenantId) throw new Error("Missing tenantId");

      const { error: profileError } = await supabase
        .from("business_profile")
        .upsert(
          {
            tenant_id: tenantId,
            business_name: data.businessName,
            industry: data.industry,
            pain_points: data.biggestChallenge ? [data.biggestChallenge] : [],
            onboarding_completed_at: new Date().toISOString(),
            onboarding_progress: {
              primaryGoal: data.primaryGoal,
              completedAt: new Date().toISOString(),
            },
          },
          { onConflict: "tenant_id" }
        );

      if (profileError) {
        throw profileError;
      }

      // Update local state - NO RELOAD
      setIsComplete(true);
      setCurrentStep(totalSteps);
      toast.success("Setup complete! Your Command Center is ready.");
      
      // Call the completion callback so parent can react
      options?.onComplete?.();
    } catch (error) {
      console.error("Error completing onboarding:", error);
      toast.error("Failed to save setup. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [user, tenantId, isLoading, isComplete, options]);

  const processAgentResponse = useCallback((response: string) => {
    // Prevent double processing if already complete
    if (isComplete) return;

    // Look for completion tag - THIS IS THE ONLY PLACE THAT TRIGGERS COMPLETION
    const completionMatch = response.match(/\[ONBOARDING_COMPLETE:(.*?)\]/);
    
    if (completionMatch) {
      try {
        const data = JSON.parse(completionMatch[1]) as OnboardingData;
        completeOnboardingInternal(data);
        return;
      } catch (e) {
        console.error("Failed to parse onboarding data:", e);
      }
    }

    // Track progress based on content
    if (response.toLowerCase().includes("industry")) {
      setCurrentStep(prev => Math.max(prev, 2));
    } else if (response.toLowerCase().includes("challenge") || response.toLowerCase().includes("goal")) {
      setCurrentStep(prev => Math.max(prev, 3));
    }
  }, [isComplete, completeOnboardingInternal]);

  return {
    currentStep,
    totalSteps,
    isComplete,
    isLoading,
    startOnboarding,
    processAgentResponse,
  };
}

export default useOnboardingOrchestrator;

