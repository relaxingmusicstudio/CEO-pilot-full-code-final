export const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
};

export const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const slugify = (value: string): string =>
  normalizeText(value)
    .replace(/\s+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

export const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

export const simulateLatency = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
