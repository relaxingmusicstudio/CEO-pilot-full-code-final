export const nowIso = () => new Date().toISOString();

export const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const stableStringify = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",");
    return `{${body}}`;
  }
  return JSON.stringify(value);
};

export const hashString = (input: string): string => {
  let hash = 5381;
  for (let idx = 0; idx < input.length; idx += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(idx);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};
