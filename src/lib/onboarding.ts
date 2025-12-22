export type OnboardingStatus = "not_started" | "in_progress" | "complete";

export type OnboardingData = {
  businessName: string;
  industry: string;
  serviceArea: string;
  primaryGoal: string;
  offerPricing: string;
  targetCustomer: string;
  leadSources: string;
  calendarLink?: string;
  contactPhone?: string;
};

export type OnboardingState = {
  status: OnboardingStatus;
  data: OnboardingData;
  updatedAt: string | null;
};

const STORAGE_PREFIX = "ppp:onboarding:v1::";
const LEGACY_STORAGE_PREFIX = "onboarding_v1::";

const DEFAULT_DATA: OnboardingData = {
  businessName: "",
  industry: "",
  serviceArea: "",
  primaryGoal: "",
  offerPricing: "",
  targetCustomer: "",
  leadSources: "",
  calendarLink: "",
  contactPhone: "",
};

export const defaultOnboardingState: OnboardingState = {
  status: "not_started",
  data: DEFAULT_DATA,
  updatedAt: null,
};

const makeStorageKey = (prefix: string, userId?: string | null, email?: string | null) =>
  `${prefix}${userId || email || "anonymous"}`;

export const loadOnboardingState = (userId?: string | null, email?: string | null): OnboardingState => {
  const key = makeStorageKey(STORAGE_PREFIX, userId, email);
  const legacyKey = makeStorageKey(LEGACY_STORAGE_PREFIX, userId, email);
  try {
    const raw = localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
    if (!raw) return defaultOnboardingState;
    const parsed = JSON.parse(raw) as OnboardingState;
    const normalized: OnboardingState = {
      status: parsed.status ?? "not_started",
      data: { ...DEFAULT_DATA, ...(parsed.data || {}) },
      updatedAt: parsed.updatedAt ?? null,
    };
    // Migrate legacy key forward
    localStorage.setItem(key, JSON.stringify(normalized));
    if (legacyKey !== key) {
      localStorage.removeItem(legacyKey);
    }
    return normalized;
  } catch {
    return defaultOnboardingState;
  }
};

export const saveOnboardingState = (
  state: OnboardingState,
  userId?: string | null,
  email?: string | null
) => {
  const key = makeStorageKey(STORAGE_PREFIX, userId, email);
  localStorage.setItem(key, JSON.stringify(state));
};

export const clearOnboardingState = (userId?: string | null, email?: string | null) => {
  const key = makeStorageKey(STORAGE_PREFIX, userId, email);
  const legacyKey = makeStorageKey(LEGACY_STORAGE_PREFIX, userId, email);
  localStorage.removeItem(key);
  localStorage.removeItem(legacyKey);
};

export const getOnboardingData = (userId?: string | null, email?: string | null): OnboardingData => {
  const state = loadOnboardingState(userId, email);
  return state.data;
};
