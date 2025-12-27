import { ValueAnchor, ValueAnchorSchema } from "./contracts";

const DEFAULT_CREATED_AT = "2025-01-01T00:00:00.000Z";

export const DEFAULT_VALUE_ANCHORS: ValueAnchor[] = [
  ValueAnchorSchema.parse({
    anchorId: "value-anchor-core",
    version: "v1",
    createdAt: DEFAULT_CREATED_AT,
    coreObjectives: [
      {
        objectiveId: "governance_integrity",
        rank: 1,
        description: "Preserve governance integrity and human oversight.",
      },
      {
        objectiveId: "safety_and_legibility",
        rank: 2,
        description: "Maintain safe, explainable, and auditable behavior.",
      },
      {
        objectiveId: "output_quality",
        rank: 3,
        description: "Deliver correct, verifiable outcomes.",
      },
      {
        objectiveId: "cost_efficiency",
        rank: 4,
        description: "Reduce cost without harming safety or quality.",
      },
    ],
    doNotOptimize: [
      {
        constraintId: "no_safety_tradeoff",
        description: "Do not trade safety or governance for performance.",
        rationale: "Safety and oversight are non-negotiable.",
      },
      {
        constraintId: "no_hidden_policy_change",
        description: "No unreviewed policy or routing changes.",
        rationale: "All changes must remain auditable and reversible in understanding.",
      },
      {
        constraintId: "no_autonomy_escalation_without_evidence",
        description: "No autonomy promotion without sustained evidence.",
        rationale: "Long-horizon trust depends on verified performance.",
      },
    ],
    escalationThresholds: {
      decisionDistribution: 0.2,
      routingDistribution: 0.25,
      outcomeFailureDelta: 0.1,
      rollbackRateDelta: 0.05,
      constraintViolationRate: 0.02,
      nearMissRate: 0.1,
    },
    reviewCadence: "biweekly",
  }),
];

export const pickPrimaryValueAnchor = (anchors: ValueAnchor[]): ValueAnchor | null => {
  if (anchors.length === 0) return null;
  return anchors
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
};
