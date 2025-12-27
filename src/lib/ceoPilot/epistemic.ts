import { ActionImpact, EpistemicAssessment, EpistemicAssessmentSchema, TaskHistoryRecord } from "./contracts";
import { clamp } from "./utils";

export type EpistemicPolicy = {
  noveltyThreshold: number;
  evidenceRequiredByImpact: Record<ActionImpact, number>;
};

export const defaultEpistemicPolicy: EpistemicPolicy = {
  noveltyThreshold: 0.7,
  evidenceRequiredByImpact: {
    reversible: 1,
    difficult: 2,
    irreversible: 3,
  },
};

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");

const tokenize = (value: string): string[] => normalize(value).split(" ").filter(Boolean);

const jaccardSimilarity = (left: string[], right: string[]): number => {
  if (left.length === 0 || right.length === 0) return 0;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = new Set([...leftSet].filter((token) => rightSet.has(token)));
  const union = new Set([...leftSet, ...rightSet]);
  return union.size === 0 ? 0 : intersection.size / union.size;
};

export type NoveltyResult = {
  noveltyScore: number;
  nearestTaskId?: string;
  nearestSimilarity: number;
};

export const computeNoveltyScore = (
  description: string,
  history: TaskHistoryRecord[]
): NoveltyResult => {
  if (!description.trim()) {
    return { noveltyScore: 1, nearestSimilarity: 0 };
  }
  if (history.length === 0) {
    return { noveltyScore: 1, nearestSimilarity: 0 };
  }
  const tokens = tokenize(description);
  let bestSimilarity = 0;
  let nearestTaskId: string | undefined;

  history.forEach((record) => {
    const similarity = jaccardSimilarity(tokens, tokenize(record.description));
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      nearestTaskId = record.taskId;
    }
  });

  const noveltyScore = clamp(1 - bestSimilarity, 0, 1);
  return { noveltyScore, nearestTaskId, nearestSimilarity: bestSimilarity };
};

export type EpistemicInputs = {
  description: string;
  impact: ActionImpact;
  confidenceScore: number;
  evidenceRefs: string[];
  explorationMode: boolean;
  history: TaskHistoryRecord[];
  policy?: EpistemicPolicy;
};

export type EpistemicDecision = {
  assessment: EpistemicAssessment;
  allowed: boolean;
  reason?: string;
  requiresHumanReview: boolean;
  requiresExploration: boolean;
};

const confidenceLevelFor = (score: number): EpistemicAssessment["confidenceLevel"] => {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
};

export const assessEpistemic = (input: EpistemicInputs): EpistemicDecision => {
  const policy = input.policy ?? defaultEpistemicPolicy;
  const novelty = computeNoveltyScore(input.description, input.history);
  const evidenceCount = input.evidenceRefs.length;
  const requiredEvidence = policy.evidenceRequiredByImpact[input.impact];
  const evidenceSufficient = evidenceCount >= requiredEvidence;

  const reasons: string[] = [];
  if (novelty.noveltyScore >= policy.noveltyThreshold) reasons.push("high_novelty");
  if (!evidenceSufficient) reasons.push("insufficient_evidence");

  const assessment: EpistemicAssessment = {
    noveltyScore: novelty.noveltyScore,
    confidenceScore: clamp(input.confidenceScore, 0, 1),
    confidenceLevel: confidenceLevelFor(input.confidenceScore),
    evidenceCount,
    evidenceSufficient,
    mode: input.explorationMode ? "exploration" : "normal",
    reasons,
  };

  const parsed = EpistemicAssessmentSchema.safeParse(assessment);
  if (!parsed.success) {
    throw new Error("epistemic_assessment_invalid");
  }

  if (reasons.length === 0) {
    return {
      assessment: parsed.data,
      allowed: true,
      requiresHumanReview: false,
      requiresExploration: false,
    };
  }

  if (input.explorationMode) {
    if (input.impact === "irreversible") {
      return {
        assessment: parsed.data,
        allowed: false,
        reason: "exploration_blocks_irreversible",
        requiresHumanReview: true,
        requiresExploration: false,
      };
    }
    return {
      assessment: parsed.data,
      allowed: true,
      requiresHumanReview: false,
      requiresExploration: false,
    };
  }

  return {
    assessment: parsed.data,
    allowed: false,
    reason: "epistemic_exploration_required",
    requiresHumanReview: input.impact !== "reversible" || !evidenceSufficient,
    requiresExploration: true,
  };
};
