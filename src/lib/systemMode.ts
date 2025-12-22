export enum SystemMode {
  SHAPE = "SHAPE",
  EXECUTION = "EXECUTION",
  VALIDATION = "VALIDATION",
}

const SYSTEM_MODE_PREFIX = "ppp:systemMode:v1::";

const makeSystemModeKey = (userId?: string | null, email?: string | null) =>
  `${SYSTEM_MODE_PREFIX}${userId || email || "anonymous"}`;

const isSystemMode = (value: unknown): value is SystemMode =>
  value === SystemMode.SHAPE || value === SystemMode.EXECUTION || value === SystemMode.VALIDATION;

export const loadSystemMode = (userId?: string | null, email?: string | null): SystemMode => {
  if (typeof window === "undefined") return SystemMode.EXECUTION;
  const key = makeSystemModeKey(userId, email);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return SystemMode.EXECUTION;

    const trimmed = raw.trim();
    if (isSystemMode(trimmed)) return trimmed;

    try {
      const parsed = JSON.parse(trimmed);
      if (isSystemMode(parsed)) return parsed;
      if (parsed && typeof parsed === "object" && isSystemMode((parsed as any).mode)) return (parsed as any).mode;
    } catch {
      // ignore
    }

    return SystemMode.EXECUTION;
  } catch {
    return SystemMode.EXECUTION;
  }
};

export const saveSystemMode = (mode: SystemMode, userId?: string | null, email?: string | null) => {
  if (typeof window === "undefined") return;
  const key = makeSystemModeKey(userId, email);
  try {
    window.localStorage.setItem(key, mode);
  } catch {
    // ignore
  }
};

export const getSystemModeDescription = (mode: SystemMode): string => {
  switch (mode) {
    case SystemMode.SHAPE:
      return "Zoom out. Shape strategy: read the CEO Plan, but do not edit the checklist or run Do Next.";
    case SystemMode.EXECUTION:
      return "Zoom in. Execute: update the checklist and run Do Next to drive one concrete action forward.";
    case SystemMode.VALIDATION:
      return "Zoom back. Validate outcomes: review proof/outputs only (no checklist edits, no Do Next).";
    default:
      return "Execute: update the checklist and run Do Next.";
  }
};

