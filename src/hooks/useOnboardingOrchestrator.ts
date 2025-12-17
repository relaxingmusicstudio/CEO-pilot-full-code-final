/**
 * useOnboardingOrchestrator - Manages in-dashboard onboarding flow
 * 
 * Responsibilities:
 * - Track onboarding progress (step 0-3)
 * - Trigger onboarding conversation in CEO chat
 * - Parse agent responses for completion signals
 * - Update database when onboarding completes
 * - Notify parent when status changes
 */

import { useState, useCallback, useEffect } from "react";
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
  startOnboarding: () => string; // Returns the system prompt to send
  processAgentResponse: (response: string) => void;
  completeOnboarding: (data: OnboardingData) => Promise<void>;
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

export function useOnboardingOrchestrator(): UseOnboardingOrchestratorReturn {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const totalSteps = 3;

  const startOnboarding = useCallback(() => {
    setCurrentStep(1);
    return ONBOARDING_SYSTEM_PROMPT;
  }, []);

  const processAgentResponse = useCallback((response: string) => {
    // Look for completion tag
    const completionMatch = response.match(/\[ONBOARDING_COMPLETE:(.*?)\]/);
    
    if (completionMatch) {
      try {
        const data = JSON.parse(completionMatch[1]) as OnboardingData;
        completeOnboarding(data);
        return;
      } catch (e) {
        console.error("Failed to parse onboarding data:", e);
      }
    }

    // Track progress based on content
    if (response.toLowerCase().includes("industry")) {
      setCurrentStep(Math.max(currentStep, 2));
    } else if (response.toLowerCase().includes("challenge") || response.toLowerCase().includes("goal")) {
      setCurrentStep(Math.max(currentStep, 3));
    }
  }, [currentStep]);

  const completeOnboarding = useCallback(async (data: OnboardingData) => {
    if (!user) return;
    
    setIsLoading(true);
    
    try {
      // Update business_profile with onboarding data
      const { error: profileError } = await supabase
        .from("business_profile")
        .upsert({
          business_name: data.businessName,
          industry: data.industry,
          pain_points: data.biggestChallenge ? [data.biggestChallenge] : [],
          onboarding_completed_at: new Date().toISOString(),
          onboarding_progress: {
            primaryGoal: data.primaryGoal,
            completedAt: new Date().toISOString(),
          },
        }, {
          onConflict: 'id'
        });

      if (profileError) {
        // If no profile exists, create one
        const { error: insertError } = await supabase
          .from("business_profile")
          .insert({
            business_name: data.businessName,
            industry: data.industry,
            pain_points: data.biggestChallenge ? [data.biggestChallenge] : [],
            onboarding_completed_at: new Date().toISOString(),
            onboarding_progress: {
              primaryGoal: data.primaryGoal,
              completedAt: new Date().toISOString(),
            },
          });

        if (insertError) {
          throw insertError;
        }
      }

      setIsComplete(true);
      setCurrentStep(totalSteps);
      toast.success("Setup complete! Your Command Center is ready.");
      
      // Force a page refresh to update all state
      window.location.reload();
    } catch (error) {
      console.error("Error completing onboarding:", error);
      toast.error("Failed to save setup. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  return {
    currentStep,
    totalSteps,
    isComplete,
    isLoading,
    startOnboarding,
    processAgentResponse,
    completeOnboarding,
  };
}

export default useOnboardingOrchestrator;
