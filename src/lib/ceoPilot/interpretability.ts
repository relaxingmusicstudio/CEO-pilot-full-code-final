import {
  CausalAlternative,
  CausalChainRecord,
  CausalTrigger,
  CounterfactualRecord,
  CostEventRecord,
  CostShockEvent,
  CooperationMetric,
  EmergencyModeState,
  HumanExplanation,
  ImprovementCandidate,
  LineageMetadata,
  QualityMetricRecord,
  QualityRegressionRecord,
  TaskOutcomeRecord,
} from "./contracts";
import { clamp, createId, nowIso } from "./utils";

type InterpretabilitySources = {
  outcomes: TaskOutcomeRecord[];
  metrics: QualityMetricRecord[];
  regressions: QualityRegressionRecord[];
  costEvents: CostEventRecord[];
  cooperationMetrics: CooperationMetric[];
};

type TriggerContext = {
  metric?: QualityMetricRecord;
  regression?: QualityRegressionRecord;
  costEvent?: CostEventRecord;
  cooperationMetric?: CooperationMetric;
  outcomeSample?: TaskOutcomeRecord;
  successCount?: number;
  failureRate?: number;
};

const DEFAULT_REVIEW_DAYS = 30;
const CONFIDENCE_HALF_LIFE_DAYS = 30;
const MAX_LINEAGE_OUTCOMES = 25;

const computeReviewBy = (now: string, days: number): string => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const computeConfidenceDecay = (endAt: string | undefined, now: string): number | undefined => {
  if (!endAt) return undefined;
  const ageMs = Math.max(0, Date.parse(now) - Date.parse(endAt));
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const factor = Math.pow(0.5, ageDays / Math.max(CONFIDENCE_HALF_LIFE_DAYS, 1));
  return clamp(factor, 0, 1);
};

const sortByCreatedAt = <T extends { createdAt: string }>(records: T[]): T[] =>
  records.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt));

const pickLatest = <T extends { createdAt: string }>(records: T[]): T | undefined =>
  sortByCreatedAt(records).slice(-1)[0];

const pickRecentOutcomes = (records: TaskOutcomeRecord[], limit: number): TaskOutcomeRecord[] => {
  if (records.length <= limit) return records.slice();
  return sortByCreatedAt(records).slice(-limit);
};

export const buildLineageMetadata = (
  outcomes: TaskOutcomeRecord[],
  now: string = nowIso(),
  reviewDays: number = DEFAULT_REVIEW_DAYS
): LineageMetadata => {
  const recent = pickRecentOutcomes(outcomes, MAX_LINEAGE_OUTCOMES);
  const sorted = sortByCreatedAt(recent);
  const timeWindowStart = sorted[0]?.createdAt;
  const timeWindowEnd = sorted[sorted.length - 1]?.createdAt;
  return {
    sourceOutcomeIds: sorted.map((record) => record.outcomeId),
    timeWindowStart,
    timeWindowEnd,
    confidenceDecay: computeConfidenceDecay(timeWindowEnd, now),
    reviewBy: reviewDays > 0 ? computeReviewBy(now, reviewDays) : undefined,
  };
};

const buildTrigger = (
  type: CausalTrigger["type"],
  summary: string,
  now: string,
  refId?: string
): CausalTrigger => ({
  triggerId: createId("trigger"),
  type,
  refId,
  summary,
  recordedAt: now,
});

const formatPct = (value?: number): string => (value === undefined ? "n/a" : value.toFixed(2));

const selectMetric = (
  metrics: QualityMetricRecord[],
  taskType: string,
  modelTier?: QualityMetricRecord["modelTier"]
): QualityMetricRecord | undefined => {
  const candidates = metrics.filter(
    (metric) => metric.taskType === taskType && (!modelTier || metric.modelTier === modelTier)
  );
  if (candidates.length === 0) return undefined;
  return candidates.slice().sort((a, b) => b.sampleCount - a.sampleCount)[0];
};

const selectRegression = (
  regressions: QualityRegressionRecord[],
  taskType: string,
  modelTier?: QualityRegressionRecord["modelTier"]
): QualityRegressionRecord | undefined => {
  const candidates = regressions.filter(
    (regression) => regression.taskType === taskType && (!modelTier || regression.modelTier === modelTier)
  );
  if (candidates.length === 0) return undefined;
  return candidates.slice().sort((a, b) => a.detectedAt.localeCompare(b.detectedAt)).slice(-1)[0];
};

const deriveConfidenceBounds = (context: TriggerContext): { lower?: number; upper?: number } => {
  const base =
    context.metric?.decayedConfidence ??
    context.metric?.confidence ??
    (context.regression ? clamp(1 - Math.abs(context.regression.delta), 0, 1) : undefined) ??
    (context.cooperationMetric ? clamp(1 - context.cooperationMetric.deadlockScore, 0, 1) : undefined);
  if (base === undefined) return {};
  return {
    lower: clamp(base - 0.1, 0, 1),
    upper: clamp(base + 0.1, 0, 1),
  };
};

const buildAlternatives = (candidate: ImprovementCandidate, taskType: string): CausalAlternative[] => {
  switch (candidate.type) {
    case "routing_downgrade":
      return [
        {
          action: "keep_current_routing",
          reason: "wait_for_more_quality_samples",
          expectedDownside: "sustained higher cost per task",
        },
      ];
    case "routing_upgrade":
      return [
        {
          action: "keep_economy_tier",
          reason: "avoid immediate cost increase",
          expectedDownside: "quality regression persists",
        },
      ];
    case "cache_policy":
      return [
        {
          action: "skip_cache",
          reason: "avoid stale outputs",
          expectedDownside: "repeated higher execution cost",
        },
      ];
    case "schedule_policy":
      return [
        {
          action: "execute_immediately",
          reason: "prioritize latency over cost",
          expectedDownside: "budget pressure escalates",
        },
      ];
    case "freeze_behavior":
      return [
        {
          action: "continue_executions",
          reason: "avoid disruption for task type",
          expectedDownside: "failures continue for " + taskType,
        },
      ];
    case "escalation_adjustment":
      return [
        {
          action: "retain_current_thresholds",
          reason: "avoid extra human escalations",
          expectedDownside: "deadlocks may repeat",
        },
      ];
    case "distill_rule":
      return [
        {
          action: "keep_model_execution",
          reason: "preserve flexibility for " + taskType,
          expectedDownside: "higher per-run cost",
        },
      ];
    default:
      return [
        {
          action: "no_change",
          reason: "insufficient evidence",
          expectedDownside: "improvement delayed",
        },
      ];
  }
};

const buildCounterfactuals = (
  candidate: ImprovementCandidate,
  taskType: string,
  context: TriggerContext
): CounterfactualRecord[] => {
  const bounds = deriveConfidenceBounds(context);
  const base: CounterfactualRecord = {
    alternative: "no_change",
    expectedDownside: "missed efficiency or safety improvement",
    uncertainty: "signal strength may shift with new data",
    confidenceLowerBound: bounds.lower,
    confidenceUpperBound: bounds.upper,
  };

  switch (candidate.type) {
    case "routing_downgrade":
      return [
        {
          ...base,
          alternative: "keep_current_routing",
          expectedDownside: "cost savings delayed",
          uncertainty: "quality metrics may drift",
        },
      ];
    case "routing_upgrade":
      return [
        {
          ...base,
          alternative: "keep_economy_tier",
          expectedDownside: "quality regression continues",
          uncertainty: "regression severity may change",
        },
      ];
    case "cache_policy":
      return [
        {
          ...base,
          alternative: "skip_cache",
          expectedDownside: "repeat model/tool spend",
          uncertainty: "task mix may change",
        },
      ];
    case "schedule_policy":
      return [
        {
          ...base,
          alternative: "execute_immediately",
          expectedDownside: "budget pressure rises",
          uncertainty: "cost events may resolve",
        },
      ];
    case "freeze_behavior":
      return [
        {
          ...base,
          alternative: "continue_executions",
          expectedDownside: "failures persist for " + taskType,
          uncertainty: "failure rate may normalize",
        },
      ];
    case "escalation_adjustment":
      return [
        {
          ...base,
          alternative: "retain_current_thresholds",
          expectedDownside: "deadlock repeat",
          uncertainty: "agent trust may recover",
        },
      ];
    case "distill_rule":
      return [
        {
          ...base,
          alternative: "keep_model_execution",
          expectedDownside: "higher per-run cost",
          uncertainty: "output variance may increase",
        },
      ];
    default:
      return [base];
  }
};

const buildExplanation = (
  candidate: ImprovementCandidate,
  taskType: string,
  context: TriggerContext,
  now: string
): HumanExplanation => {
  const reviewBy = computeReviewBy(now, DEFAULT_REVIEW_DAYS);
  const metric = context.metric;
  const regression = context.regression;
  const costEvent = context.costEvent;
  const cooperationMetric = context.cooperationMetric;
  const successCount = context.successCount ?? 0;
  const failureRate = context.failureRate;

  switch (candidate.type) {
    case "routing_downgrade":
      return {
        summary: `Routing capped to ${candidate.target.modelTier ?? "economy"} for ${taskType}.`,
        whatChanged: `Max routing tier set to ${candidate.target.modelTier ?? "economy"} for ${taskType}.`,
        whyNow: metric
          ? `Quality held at ${formatPct(metric.avgQuality)} with ${metric.sampleCount} samples.`
          : `Sustained successful outcomes for ${taskType}.`,
        riskAccepted: "Quality could dip if metrics drift.",
        riskAvoided: "Unnecessary higher-tier spend.",
        reevaluateBy: reviewBy,
      };
    case "routing_upgrade":
      return {
        summary: `Routing raised to ${candidate.target.modelTier ?? "standard"} for ${taskType}.`,
        whatChanged: `Min routing tier raised for ${taskType}.`,
        whyNow: regression
          ? `Regression detected (delta ${formatPct(regression.delta)}).`
          : "Quality regression signals triggered.",
        riskAccepted: "Higher cost per task.",
        riskAvoided: "Persistent quality regression.",
        reevaluateBy: reviewBy,
      };
    case "cache_policy":
      return {
        summary: `Caching enabled for ${taskType} outputs.`,
        whatChanged: `Cache preference activated for ${taskType}.`,
        whyNow: `Observed ${successCount} successful outcomes with stable quality.`,
        riskAccepted: "Cached outputs may become stale.",
        riskAvoided: "Repeated model/tool cost for identical work.",
        reevaluateBy: reviewBy,
      };
    case "schedule_policy":
      return {
        summary: `Scheduling deferred for ${taskType} tasks.`,
        whatChanged: `Scheduling policy set to deferred for ${taskType}.`,
        whyNow: costEvent
          ? `Cost event ${costEvent.type} recorded.`
          : "Cost backpressure detected.",
        riskAccepted: "Latency increases for non-critical tasks.",
        riskAvoided: "Budget overrun under load.",
        reevaluateBy: reviewBy,
      };
    case "freeze_behavior":
      return {
        summary: `Execution frozen for ${taskType}.`,
        whatChanged: `Behavior freeze applied to ${taskType}.`,
        whyNow:
          failureRate !== undefined
            ? `Failure rate reached ${formatPct(failureRate)}.`
            : "Repeated failures detected.",
        riskAccepted: "Throughput reduction for this task type.",
        riskAvoided: "Compounding failures.",
        reevaluateBy: reviewBy,
      };
    case "escalation_adjustment":
      return {
        summary: "Escalation thresholds tightened.",
        whatChanged: "Escalation override activated to prevent deadlock.",
        whyNow: cooperationMetric
          ? `Deadlock score ${formatPct(cooperationMetric.deadlockScore)} recorded.`
          : "Repeated disagreement detected.",
        riskAccepted: "More human escalations.",
        riskAvoided: "Agent deadlock loops.",
        reevaluateBy: reviewBy,
      };
    case "distill_rule":
      return {
        summary: `Distilled rule created for ${taskType}.`,
        whatChanged: `Rule-based execution added for ${taskType}.`,
        whyNow: `Repeated success (${successCount} runs) with stable outputs.`,
        riskAccepted: "Rule may lag when inputs drift.",
        riskAvoided: "Unnecessary model cost on identical work.",
        reevaluateBy: reviewBy,
      };
    default:
      return {
        summary: "Change considered without sufficient explanation.",
        whatChanged: "No change applied.",
        whyNow: "Explanation signals were insufficient.",
        riskAccepted: "None.",
        riskAvoided: "Unverifiable improvement.",
        reevaluateBy: reviewBy,
      };
  }
};

const buildTriggersForCandidate = (
  candidate: ImprovementCandidate,
  taskType: string,
  sources: InterpretabilitySources,
  now: string
): { triggers: CausalTrigger[]; context: TriggerContext } => {
  const context: TriggerContext = {};
  const triggers: CausalTrigger[] = [];
  const outcomesForTask = sources.outcomes.filter((record) => record.taskType === taskType);

  switch (candidate.type) {
    case "routing_downgrade": {
      const metric = selectMetric(sources.metrics, taskType, candidate.target.modelTier ?? "economy");
      if (metric) {
        context.metric = metric;
        triggers.push(
          buildTrigger(
            "quality_metric",
            `avgQuality=${formatPct(metric.avgQuality)} passRate=${formatPct(metric.passRate)} samples=${metric.sampleCount}`,
            now,
            metric.metricId
          )
        );
      } else {
        const sample = pickLatest(outcomesForTask);
        if (sample) {
          context.outcomeSample = sample;
          triggers.push(
            buildTrigger(
              "outcome_sample",
              `qualityScore=${formatPct(sample.qualityScore)} evaluationPassed=${sample.evaluationPassed}`,
              now,
              sample.outcomeId
            )
          );
        }
      }
      break;
    }
    case "routing_upgrade": {
      const regression = selectRegression(sources.regressions, taskType, "economy");
      if (regression) {
        context.regression = regression;
        triggers.push(
          buildTrigger(
            "quality_regression",
            `delta=${formatPct(regression.delta)} baseline=${formatPct(regression.baselineQuality)} recent=${formatPct(
              regression.recentQuality
            )}`,
            now,
            regression.regressionId
          )
        );
      }
      break;
    }
    case "cache_policy": {
      const successes = outcomesForTask.filter((record) => record.evaluationPassed);
      context.successCount = successes.length;
      const sample = pickLatest(successes);
      if (sample) {
        context.outcomeSample = sample;
        triggers.push(
          buildTrigger(
            "outcome_sample",
            `successes=${successes.length} qualityScore=${formatPct(sample.qualityScore)}`,
            now,
            sample.outcomeId
          )
        );
      }
      break;
    }
    case "schedule_policy": {
      const event = pickLatest(
        sources.costEvents.filter((record) => record.type === "soft_limit_exceeded" || record.type === "hard_limit_exceeded")
      );
      if (event) {
        context.costEvent = event;
        triggers.push(
          buildTrigger("cost_event", `type=${event.type} reason=${event.reason}`, now, event.eventId)
        );
      }
      break;
    }
    case "freeze_behavior": {
      const failures = outcomesForTask.filter((record) => !record.evaluationPassed);
      const failureRate = outcomesForTask.length === 0 ? 0 : failures.length / outcomesForTask.length;
      context.failureRate = failureRate;
      const sample = pickLatest(failures.length > 0 ? failures : outcomesForTask);
      if (sample) {
        context.outcomeSample = sample;
        triggers.push(
          buildTrigger(
            "outcome_sample",
            `failureRate=${formatPct(failureRate)} evaluationPassed=${sample.evaluationPassed}`,
            now,
            sample.outcomeId
          )
        );
      }
      break;
    }
    case "escalation_adjustment": {
      const metric = sources.cooperationMetrics
        .slice()
        .sort((a, b) => b.deadlockScore - a.deadlockScore)[0];
      if (metric) {
        context.cooperationMetric = metric;
        triggers.push(
          buildTrigger(
            "cooperation_metric",
            `deadlockScore=${formatPct(metric.deadlockScore)} trustScore=${formatPct(metric.trustScore)}`,
            now,
            metric.metricId
          )
        );
      }
      break;
    }
    case "distill_rule": {
      const matches = sources.outcomes.filter(
        (record) =>
          record.taskType === taskType &&
          record.goalId === candidate.target.goalId &&
          record.inputHash === candidate.target.inputHash
      );
      const successes = matches.filter((record) => record.evaluationPassed);
      context.successCount = successes.length;
      const sample = pickLatest(successes);
      if (sample) {
        context.outcomeSample = sample;
        triggers.push(
          buildTrigger(
            "outcome_sample",
            `successes=${successes.length} qualityScore=${formatPct(sample.qualityScore)}`,
            now,
            sample.outcomeId
          )
        );
      }
      break;
    }
    default:
      break;
  }

  return { triggers, context };
};

export const buildCausalChainForCandidate = (input: {
  candidate: ImprovementCandidate;
  identityKey: string;
  sources: InterpretabilitySources;
  now?: string;
}): CausalChainRecord => {
  const now = input.now ?? nowIso();
  const taskType = input.candidate.target.taskType ?? "unknown";
  const { triggers, context } = buildTriggersForCandidate(input.candidate, taskType, input.sources, now);
  const alternatives = buildAlternatives(input.candidate, taskType);
  const counterfactuals = buildCounterfactuals(input.candidate, taskType, context);
  const explanation = buildExplanation(input.candidate, taskType, context, now);
  const failureReasons: string[] = [];

  if (triggers.length === 0) failureReasons.push("missing_triggers");
  if (alternatives.length === 0) failureReasons.push("missing_alternatives");
  if (counterfactuals.length === 0) failureReasons.push("missing_counterfactuals");

  const explanationQuality = failureReasons.length > 0 ? "insufficient" : "clear";

  return {
    chainId: createId("chain"),
    candidateId: input.candidate.candidateId,
    identityKey: input.identityKey,
    actionType: input.candidate.type,
    status: explanationQuality === "clear" ? "complete" : "explanation_failed",
    triggers,
    alternatives,
    counterfactuals,
    explanation,
    explanationQuality,
    requiresHumanReview: explanationQuality !== "clear",
    failureReason: failureReasons.length > 0 ? failureReasons.join("; ") : undefined,
    createdAt: now,
  };
};

export const buildEmergencyCausalChain = (input: {
  identityKey: string;
  mode: EmergencyModeState;
  event?: CostShockEvent;
  now?: string;
  actionId?: string;
}): CausalChainRecord => {
  const now = input.now ?? nowIso();
  const triggers: CausalTrigger[] = [];

  if (input.event) {
    triggers.push(
      buildTrigger(
        "cost_event",
        `shock=${input.event.type} severity=${input.event.severity}`,
        now,
        input.event.shockId
      )
    );
  }
  triggers.push(
    buildTrigger(
      "emergency_mode",
      `mode=${input.mode.mode} reason=${input.mode.reason}`,
      now,
      input.event?.shockId
    )
  );

  const alternatives: CausalAlternative[] = [
    {
      action: "remain_normal",
      reason: "avoid degraded service",
      expectedDownside: "budget or stability risk persists",
    },
  ];

  const counterfactuals: CounterfactualRecord[] = [
    {
      alternative: "remain_normal",
      expectedDownside: "cost shock could exceed limits",
      uncertainty: "shock severity may change quickly",
    },
  ];

  const explanation: HumanExplanation = {
    summary: `Emergency mode set to ${input.mode.mode}.`,
    whatChanged: `Emergency mode activated with max tier ${input.mode.maxModelTier ?? "unspecified"}.`,
    whyNow: input.event
      ? `Shock event ${input.event.type} recorded at severity ${input.event.severity}.`
      : "Emergency mode requested by governance.",
    riskAccepted: "Reduced capability for cost stability.",
    riskAvoided: "Runaway spend or instability.",
    reevaluateBy: input.mode.expiresAt ?? computeReviewBy(now, 7),
  };

  return {
    chainId: createId("chain"),
    candidateId: input.actionId ?? input.event?.shockId ?? createId("emergency"),
    identityKey: input.identityKey,
    actionType: "emergency_mode",
    status: "complete",
    triggers,
    alternatives,
    counterfactuals,
    explanation,
    explanationQuality: "clear",
    requiresHumanReview: false,
    createdAt: now,
    appliedAt: now,
  };
};
