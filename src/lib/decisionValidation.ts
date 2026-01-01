export const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidDecisionId = (value: string): boolean => {
  const trimmed = value.trim();
  if (!UUID_REGEX.test(trimmed)) return false;
  return trimmed.toLowerCase() !== ZERO_UUID;
};

export const VALID_FEEDBACK_OUTCOMES = ["worked", "didnt_work", "unknown"] as const;
export type FeedbackOutcome = (typeof VALID_FEEDBACK_OUTCOMES)[number];

export const isValidFeedbackOutcome = (value: string): value is FeedbackOutcome =>
  VALID_FEEDBACK_OUTCOMES.includes(value as FeedbackOutcome);
