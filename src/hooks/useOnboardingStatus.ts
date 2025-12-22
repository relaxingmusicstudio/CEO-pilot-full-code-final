import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  clearOnboardingState,
  defaultOnboardingState,
  loadOnboardingState,
  OnboardingData,
  OnboardingState,
  OnboardingStatus,
  saveOnboardingState,
} from "@/lib/onboarding";

let sharedOnboardingState: OnboardingState = defaultOnboardingState;
const onboardingSubscribers = new Set<(state: OnboardingState) => void>();

const broadcastOnboardingState = (next: OnboardingState) => {
  sharedOnboardingState = next;
  onboardingSubscribers.forEach((listener) => listener(next));
};

export function useOnboardingStatus() {
  const { userId, email, isLoading: authLoading } = useAuth();
  const storageKey = useMemo(() => `${userId || email || "anonymous"}`, [userId, email]);

  const [state, setState] = useState<OnboardingState>(sharedOnboardingState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const listener = (next: OnboardingState) => setState(next);
    onboardingSubscribers.add(listener);
    return () => {
      onboardingSubscribers.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const next = loadOnboardingState(userId, email);
    setState(next);
    broadcastOnboardingState(next);
    setHydrated(true);
  }, [authLoading, userId, email, storageKey]);

  const persist = useCallback(
    (next: OnboardingState) => {
      setState(next);
      broadcastOnboardingState(next);
      saveOnboardingState(next, userId, email);
    },
    [userId, email]
  );

  const updateData = useCallback(
    (partial: Partial<OnboardingData>) => {
      const next: OnboardingState = {
        ...state,
        status: state.status === "complete" ? "complete" : "in_progress",
        data: { ...state.data, ...partial },
        updatedAt: new Date().toISOString(),
      };
      persist(next);
    },
    [state, persist]
  );

  const markStatus = useCallback(
    (status: OnboardingStatus) => {
      const next: OnboardingState = {
        ...state,
        status,
        updatedAt: new Date().toISOString(),
      };
      persist(next);
    },
    [state, persist]
  );

  const markComplete = useCallback(() => markStatus("complete"), [markStatus]);
  const completeWithData = useCallback(
    (data: OnboardingData) => {
      const next: OnboardingState = {
        status: "complete",
        data: { ...state.data, ...data },
        updatedAt: new Date().toISOString(),
      };
      persist(next);
    },
    [state.data, persist]
  );

  const reset = useCallback(() => {
    clearOnboardingState(userId, email);
    setState(defaultOnboardingState);
    broadcastOnboardingState(defaultOnboardingState);
    setHydrated(true);
  }, [userId, email]);

  return {
    status: state.status,
    data: state.data,
    updatedAt: state.updatedAt,
    isOnboardingComplete: state.status === "complete",
    isLoading: authLoading || !hydrated,
    updateData,
    markStatus,
    markComplete,
    completeWithData,
    reset,
  };
}
