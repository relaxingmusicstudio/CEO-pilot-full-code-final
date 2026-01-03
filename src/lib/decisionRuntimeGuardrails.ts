import { appendDecisionAudit, type DecisionAuditScope } from "./decisionAuditStream";
import { isValidDecisionId } from "./decisionValidation";

export const DEFAULT_DECISION_CONFIDENCE_THRESHOLD = 0.6;

type ConfidenceScale = "unit" | "percent";

export type DecisionGuardrailViolation = {
  scope: DecisionAuditScope;
  code: string;
  message: string;
  field?: string;
  source: string;
  decision_id?: string;
  context?: Record<string, unknown>;
};

export type DecisionGuardrailResult =
  | { ok: true }
  | { ok: false; violations: DecisionGuardrailViolation[] };

export class DecisionGuardrailError extends Error {
  kind: "input" | "output";
  violations: DecisionGuardrailViolation[];

  constructor(kind: "input" | "output", violations: DecisionGuardrailViolation[]) {
    super(`decision_${kind}_invalid`);
    this.name = "DecisionGuardrailError";
    this.kind = kind;
    this.violations = violations;
  }
}

type DecisionInputGuardOptions = {
  source: string;
  allowedDomains?: string[];
};

type DecisionOutputGuardOptions = {
  source: string;
  confidenceScale?: ConfidenceScale;
  confidenceThreshold?: number;
};

const recordViolations = (violations: DecisionGuardrailViolation[]) => {
  violations.forEach((violation) => {
    appendDecisionAudit({
      source: violation.source,
      scope: violation.scope,
      code: violation.code,
      message: violation.message,
      decision_id: violation.decision_id,
      context: violation.context,
    });
  });
};

const addViolation = (
  violations: DecisionGuardrailViolation[],
  violation: Omit<DecisionGuardrailViolation, "source"> & { source: string }
) => {
  violations.push(violation);
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const validateDecisionInput = (
  input: { query?: unknown; context?: unknown; domains?: unknown },
  options: DecisionInputGuardOptions
): DecisionGuardrailResult => {
  const violations: DecisionGuardrailViolation[] = [];
  const source = options.source;

  if (!isNonEmptyString(input.query)) {
    addViolation(violations, {
      source,
      scope: "decision_input",
      code: "query_required",
      message: "decision query is required",
      field: "query",
      context: { provided: typeof input.query },
    });
  }

  if (input.context !== undefined && input.context !== null && typeof input.context !== "string") {
    addViolation(violations, {
      source,
      scope: "decision_input",
      code: "context_invalid",
      message: "decision context must be a string",
      field: "context",
      context: { provided: typeof input.context },
    });
  }

  if (input.domains !== undefined) {
    if (!Array.isArray(input.domains)) {
      addViolation(violations, {
        source,
        scope: "decision_input",
        code: "domains_invalid",
        message: "decision domains must be an array of strings",
        field: "domains",
        context: { provided: typeof input.domains },
      });
    } else {
      const invalid = input.domains.filter((domain) => typeof domain !== "string" || !domain.trim());
      if (invalid.length > 0) {
        addViolation(violations, {
          source,
          scope: "decision_input",
          code: "domains_invalid",
          message: "decision domains must be non-empty strings",
          field: "domains",
          context: { invalid_count: invalid.length },
        });
      }
      if (options.allowedDomains) {
        const allowed = new Set(options.allowedDomains);
        const unknown = input.domains.filter((domain) => typeof domain === "string" && !allowed.has(domain));
        if (unknown.length > 0) {
          addViolation(violations, {
            source,
            scope: "decision_input",
            code: "domains_not_allowed",
            message: "decision domains must be in the allowed set",
            field: "domains",
            context: { unknown_domains: unknown.slice(0, 5) },
          });
        }
      }
    }
  }

  if (violations.length > 0) {
    recordViolations(violations);
    return { ok: false, violations };
  }
  return { ok: true };
};

export const validateDecisionOutput = (
  decision: unknown,
  options: DecisionOutputGuardOptions
): DecisionGuardrailResult => {
  const violations: DecisionGuardrailViolation[] = [];
  const source = options.source;
  const confidenceScale = options.confidenceScale ?? "unit";
  const confidenceThreshold = options.confidenceThreshold ?? DEFAULT_DECISION_CONFIDENCE_THRESHOLD;

  if (!decision || typeof decision !== "object") {
    addViolation(violations, {
      source,
      scope: "decision_output",
      code: "decision_missing",
      message: "decision output is missing",
    });
    recordViolations(violations);
    return { ok: false, violations };
  }

  const data = decision as Record<string, unknown>;
  const decisionId = typeof data.decision_id === "string" ? data.decision_id.trim() : "";

  if (!decisionId) {
    addViolation(violations, {
      source,
      scope: "decision_output",
      code: "decision_id_missing",
      message: "decision_id is required",
      field: "decision_id",
    });
  } else if (!isValidDecisionId(decisionId)) {
    addViolation(violations, {
      source,
      scope: "decision_output",
      code: "decision_id_invalid",
      message: "decision_id must be a non-zero UUID",
      field: "decision_id",
      decision_id: decisionId,
    });
  }

  const rationale = data.rationale;
  if (!rationale || typeof rationale !== "object") {
    addViolation(violations, {
      source,
      scope: "decision_output",
      code: "rationale_missing",
      message: "rationale is required",
      field: "rationale",
      decision_id: decisionId || undefined,
    });
  } else {
    const rationaleData = rationale as Record<string, unknown>;
    const reasonCode = typeof rationaleData.reason_code === "string" ? rationaleData.reason_code.trim() : "";
    const factors = rationaleData.factors;
    if (!reasonCode) {
      addViolation(violations, {
        source,
        scope: "decision_output",
        code: "rationale_code_missing",
        message: "rationale.reason_code is required",
        field: "rationale.reason_code",
        decision_id: decisionId || undefined,
      });
    } else if (!/^[a-z][a-z0-9_]+$/.test(reasonCode)) {
      addViolation(violations, {
        source,
        scope: "decision_output",
        code: "rationale_code_invalid",
        message: "rationale.reason_code must be snake_case",
        field: "rationale.reason_code",
        decision_id: decisionId || undefined,
      });
    }
    if (!Array.isArray(factors) || factors.some((factor) => typeof factor !== "string")) {
      addViolation(violations, {
        source,
        scope: "decision_output",
        code: "rationale_factors_invalid",
        message: "rationale.factors must be an array of strings",
        field: "rationale.factors",
        decision_id: decisionId || undefined,
      });
    }
  }

  const uncertaintyScore = data.uncertainty_score;
  if (typeof uncertaintyScore !== "number" || !Number.isFinite(uncertaintyScore)) {
    addViolation(violations, {
      source,
      scope: "confidence_bounds",
      code: "uncertainty_invalid",
      message: "uncertainty_score must be a finite number",
      field: "uncertainty_score",
      decision_id: decisionId || undefined,
    });
  } else if (uncertaintyScore < 0 || uncertaintyScore > 1) {
    addViolation(violations, {
      source,
      scope: "confidence_bounds",
      code: "uncertainty_out_of_bounds",
      message: "uncertainty_score must be between 0 and 1",
      field: "uncertainty_score",
      decision_id: decisionId || undefined,
      context: { value: uncertaintyScore },
    });
  }

  const confidence = data.confidence;
  const confidenceBounds = confidenceScale === "percent" ? { min: 0, max: 100 } : { min: 0, max: 1 };
  let normalizedConfidence: number | null = null;
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    addViolation(violations, {
      source,
      scope: "confidence_bounds",
      code: "confidence_invalid",
      message: "confidence must be a finite number",
      field: "confidence",
      decision_id: decisionId || undefined,
    });
  } else if (confidence < confidenceBounds.min || confidence > confidenceBounds.max) {
    addViolation(violations, {
      source,
      scope: "confidence_bounds",
      code: "confidence_out_of_bounds",
      message: `confidence must be between ${confidenceBounds.min} and ${confidenceBounds.max}`,
      field: "confidence",
      decision_id: decisionId || undefined,
      context: { value: confidence },
    });
  } else {
    normalizedConfidence = confidenceScale === "percent" ? confidence / 100 : confidence;
  }

  const fallbackPath = data.fallback_path;
  if (normalizedConfidence !== null && normalizedConfidence < confidenceThreshold) {
    if (!isNonEmptyString(fallbackPath)) {
      addViolation(violations, {
        source,
        scope: "decision_output",
        code: "fallback_path_required",
        message: "fallback_path is required when confidence is below threshold",
        field: "fallback_path",
        decision_id: decisionId || undefined,
        context: { threshold: confidenceThreshold, confidence: normalizedConfidence },
      });
    }
  } else if (fallbackPath !== undefined && fallbackPath !== null && typeof fallbackPath !== "string") {
    addViolation(violations, {
      source,
      scope: "decision_output",
      code: "fallback_path_invalid",
      message: "fallback_path must be a string or null",
      field: "fallback_path",
      decision_id: decisionId || undefined,
    });
  }

  if (violations.length > 0) {
    recordViolations(violations);
    return { ok: false, violations };
  }
  return { ok: true };
};

export const enforceDecisionInput = (
  input: { query?: unknown; context?: unknown; domains?: unknown },
  options: DecisionInputGuardOptions
) => {
  const result = validateDecisionInput(input, options);
  if (!result.ok) {
    throw new DecisionGuardrailError("input", result.violations);
  }
};

export const enforceDecisionOutput = (decision: unknown, options: DecisionOutputGuardOptions) => {
  const result = validateDecisionOutput(decision, options);
  if (!result.ok) {
    throw new DecisionGuardrailError("output", result.violations);
  }
};
