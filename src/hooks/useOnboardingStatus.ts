/**
 * Hook to check if user has completed onboarding
 * Used for #5: Conversation-first for NEW users only
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useOnboardingStatus() {
  const { user, isLoading: authLoading } = useAuth();
  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsOnboardingComplete(null);
      setIsLoading(false);
      return;
    }

    const checkOnboarding = async () => {
      try {
        // Check business_profile for onboarding_completed_at
        const { data: profile } = await supabase
          .from("business_profile")
          .select("onboarding_completed_at")
          .limit(1)
          .maybeSingle();

        // User has completed onboarding if they have a profile with completed timestamp
        const completed = !!(profile?.onboarding_completed_at);
        setIsOnboardingComplete(completed);
      } catch (error) {
        console.error("Error checking onboarding status:", error);
        // Default to complete on error to not block returning users
        setIsOnboardingComplete(true);
      } finally {
        setIsLoading(false);
      }
    };

    checkOnboarding();
  }, [user, authLoading]);

  return {
    isOnboardingComplete,
    isLoading: authLoading || isLoading,
    isNewUser: isOnboardingComplete === false,
  };
}
