import type { IntentParse, IntentPrimitive } from "./types";
import { normalizeText } from "./utils";

const SERVICE_KEYWORDS = [
  { value: "hvac", terms: ["hvac", "heating", "air conditioning", "ac", "heat pump"] },
  { value: "plumbing", terms: ["plumbing", "plumber", "drain", "pipe", "water heater"] },
  { value: "roofing", terms: ["roof", "roofing", "shingle", "leak"] },
  { value: "electrical", terms: ["electrical", "electrician", "breaker", "panel"] },
  { value: "landscaping", terms: ["landscaping", "lawn", "yard", "trees"] },
];

const INDUSTRY_KEYWORDS = [
  { value: "home_services", terms: ["home service", "home services", "residential"] },
  { value: "commercial", terms: ["commercial", "enterprise", "b2b"] },
];

const LOCATION_KEYWORDS = [
  { value: "austin_tx", terms: ["austin", "tx", "texas", "atx"] },
  { value: "phoenix_az", terms: ["phoenix", "az", "arizona"] },
  { value: "denver_co", terms: ["denver", "co", "colorado"] },
  { value: "local", terms: ["near me", "nearby", "local"] },
];

const GOAL_KEYWORDS = [
  { value: "compare", terms: ["compare", "best", "top", "rank", "vs"] },
  { value: "price", terms: ["price", "cost", "quote", "estimate", "rate"] },
  { value: "availability", terms: ["availability", "open", "schedule", "booking"] },
];

const URGENCY_KEYWORDS = [
  { value: "urgent", terms: ["urgent", "asap", "today", "emergency"] },
  { value: "planned", terms: ["next week", "next month", "plan", "planning"] },
];

const addMatches = (
  primitives: IntentPrimitive[],
  normalized: string,
  type: IntentPrimitive["type"],
  entries: { value: string; terms: string[] }[],
  confidence: number
) => {
  entries.forEach((entry) => {
    entry.terms.forEach((term) => {
      if (normalized.includes(term)) {
        primitives.push({ type, value: entry.value, confidence, source: "keyword" });
      }
    });
  });
};

export const parseIntent = (query: string): IntentParse => {
  const normalized = normalizeText(query);
  const primitives: IntentPrimitive[] = [];

  addMatches(primitives, normalized, "service", SERVICE_KEYWORDS, 0.9);
  addMatches(primitives, normalized, "industry", INDUSTRY_KEYWORDS, 0.7);
  addMatches(primitives, normalized, "location", LOCATION_KEYWORDS, 0.7);
  addMatches(primitives, normalized, "goal", GOAL_KEYWORDS, 0.6);
  addMatches(primitives, normalized, "urgency", URGENCY_KEYWORDS, 0.6);

  if (normalized.length <= 3) {
    primitives.push({ type: "unknown", value: "too_short", confidence: 0.2, source: "pattern" });
  }

  if (primitives.length === 0) {
    primitives.push({ type: "unknown", value: "general", confidence: 0.2, source: "pattern" });
  }

  const hasService = primitives.some((primitive) => primitive.type === "service");
  const hasLocation = primitives.some((primitive) => primitive.type === "location");

  const reasons: string[] = [];
  if (!hasService) reasons.push("no service detected");
  if (!hasLocation) reasons.push("no location detected");

  const level = reasons.length >= 2 ? "high" : reasons.length === 1 ? "medium" : "low";

  return {
    raw: query,
    normalized,
    primitives,
    ambiguity: {
      level,
      reasons,
    },
  };
};
