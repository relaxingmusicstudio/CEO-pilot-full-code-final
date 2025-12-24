import type { EvidenceRef, Signal, SignalDomainId } from "./types";

const BASE_TIME = "2024-01-15T12:00:00Z";
const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (days: number): string =>
  new Date(new Date(BASE_TIME).getTime() - days * DAY_MS).toISOString();

const makeEvidence = (
  domain: SignalDomainId,
  signalId: string,
  excerpt: string,
  timestamp: string
): EvidenceRef => ({
  id: `${domain}:${signalId}`,
  domain,
  signalId,
  excerpt,
  timestamp,
});

export const FIXTURE_SIGNALS: Record<SignalDomainId, Signal[]> = {
  local_listings: [
    {
      id: "local-northwind",
      domain: "local_listings",
      entityId: "northwind-hvac",
      title: "Northwind HVAC",
      summary: "Residential HVAC service with 24/7 dispatch listed in Austin.",
      url: "https://example.local/northwind",
      location: "Austin, TX",
      tags: ["hvac", "austin", "emergency", "residential"],
      confidence: 0.82,
      timestamp: daysAgo(4),
      evidence: makeEvidence(
        "local_listings",
        "local-northwind",
        "Listing shows 24/7 dispatch and Austin coverage.",
        daysAgo(4)
      ),
    },
    {
      id: "local-summit",
      domain: "local_listings",
      entityId: "summit-plumbing",
      title: "Summit Plumbing",
      summary: "Plumbing provider with same-day service in Phoenix.",
      url: "https://example.local/summit",
      location: "Phoenix, AZ",
      tags: ["plumbing", "phoenix", "same_day"],
      confidence: 0.78,
      timestamp: daysAgo(12),
      evidence: makeEvidence(
        "local_listings",
        "local-summit",
        "Listing highlights same-day service availability.",
        daysAgo(12)
      ),
    },
  ],
  websites: [
    {
      id: "web-northwind",
      domain: "websites",
      entityId: "northwind-hvac",
      title: "Northwind HVAC - Maintenance Plans",
      summary: "Website highlights commercial maintenance and response SLA.",
      url: "https://example.com/northwind",
      location: "Austin, TX",
      tags: ["hvac", "austin", "commercial", "maintenance"],
      confidence: 0.74,
      timestamp: daysAgo(18),
      evidence: makeEvidence(
        "websites",
        "web-northwind",
        "Commercial maintenance plan and response SLA noted.",
        daysAgo(18)
      ),
    },
    {
      id: "web-sunrise",
      domain: "websites",
      entityId: "sunrise-roofing",
      title: "Sunrise Roofing",
      summary: "Roofing contractor with storm repair services in Denver.",
      url: "https://example.com/sunrise",
      location: "Denver, CO",
      tags: ["roofing", "denver", "storm"],
      confidence: 0.7,
      timestamp: daysAgo(22),
      evidence: makeEvidence(
        "websites",
        "web-sunrise",
        "Storm repair services and coverage details listed.",
        daysAgo(22)
      ),
    },
  ],
  social_signals: [
    {
      id: "social-northwind",
      domain: "social_signals",
      entityId: "northwind-hvac",
      title: "Northwind HVAC response time",
      summary: "Public posts cite fast response and clear scheduling.",
      url: "https://example.social/northwind",
      location: "Austin, TX",
      tags: ["hvac", "austin", "response", "reviews"],
      confidence: 0.68,
      timestamp: daysAgo(6),
      evidence: makeEvidence(
        "social_signals",
        "social-northwind",
        "Posts mention fast response and clear scheduling.",
        daysAgo(6)
      ),
    },
    {
      id: "social-summit",
      domain: "social_signals",
      entityId: "summit-plumbing",
      title: "Summit Plumbing wait times",
      summary: "Discussion flags long wait times during peak hours.",
      url: "https://example.social/summit",
      location: "Phoenix, AZ",
      tags: ["plumbing", "phoenix", "wait_times"],
      confidence: 0.63,
      timestamp: daysAgo(3),
      evidence: makeEvidence(
        "social_signals",
        "social-summit",
        "Posts mention longer wait times during peak hours.",
        daysAgo(3)
      ),
    },
  ],
  user_submissions: [
    {
      id: "submission-bridgewater",
      domain: "user_submissions",
      entityId: "bridgewater-electrical",
      title: "Bridgewater Electrical",
      summary: "User submitted link for electrical safety audits.",
      url: "https://example.link/bridgewater",
      location: "Austin, TX",
      tags: ["electrical", "austin", "safety"],
      confidence: 0.6,
      timestamp: daysAgo(9),
      evidence: makeEvidence(
        "user_submissions",
        "submission-bridgewater",
        "User uploaded link for electrical safety audits.",
        daysAgo(9)
      ),
    },
  ],
  observations: [
    {
      id: "obs-after-hours",
      domain: "observations",
      entityId: "austin-after-hours-gap",
      title: "After-hours HVAC gap",
      summary: "Observation notes limited after-hours HVAC coverage in Austin.",
      location: "Austin, TX",
      tags: ["hvac", "austin", "gap", "after_hours"],
      confidence: 0.58,
      timestamp: daysAgo(2),
      evidence: makeEvidence(
        "observations",
        "obs-after-hours",
        "Observation flags limited after-hours HVAC availability.",
        daysAgo(2)
      ),
    },
  ],
};

export const FIXTURE_DOMAIN_ORDER: SignalDomainId[] = [
  "local_listings",
  "websites",
  "social_signals",
  "user_submissions",
  "observations",
];
