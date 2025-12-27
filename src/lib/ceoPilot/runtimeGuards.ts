export const isTestEnv = (): boolean => {
  const metaEnv = typeof import.meta !== "undefined" ? (import.meta as { env?: { MODE?: string } }).env : undefined;
  if (typeof process !== "undefined" && process.env?.PPP_FORCE_RUNTIME === "true") return false;
  if (metaEnv?.MODE === "test") return true;
  if (typeof process !== "undefined") {
    if (process.env?.NODE_ENV === "test") return true;
    if (process.env?.VITEST === "true") return true;
  }
  return false;
};

export const assertUnsafeTestBypass = (enabled: boolean | undefined, context: string): void => {
  if (!enabled) return;
  if (!isTestEnv()) {
    throw new Error(`unsafe_bypass_not_allowed:${context}`);
  }
};
