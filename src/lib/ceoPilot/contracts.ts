import { z } from "zod";

const ISODateSchema = z.string().datetime();

export const PermissionTierSchema = z.enum(["draft", "suggest", "execute"]);
export type PermissionTier = z.infer<typeof PermissionTierSchema>;

export const ActionImpactSchema = z.enum(["reversible", "difficult", "irreversible"]);
export type ActionImpact = z.infer<typeof ActionImpactSchema>;

export const TaskClassSchema = z.enum(["routine", "novel", "high_risk"]);
export type TaskClass = z.infer<typeof TaskClassSchema>;

export const CostCategorySchema = z.enum(["compute", "reasoning", "io", "human_attention", "risk"]);
export type CostCategory = z.infer<typeof CostCategorySchema>;

export const EconomicCostSourceSchema = z.enum(["action", "tool", "pipeline"]);
export type EconomicCostSource = z.infer<typeof EconomicCostSourceSchema>;

export const FailureTypeSchema = z.enum([
  "schema_validation_error",
  "tool_runtime_error",
  "timeout",
  "permission_denied",
  "budget_exceeded",
  "policy_blocked",
  "unknown",
]);
export type FailureType = z.infer<typeof FailureTypeSchema>;

export const PlanTaskSchema = z
  .object({
    taskId: z.string().min(1),
    description: z.string().min(1),
    intent: z.string().min(1),
    expectedOutcome: z.string().min(1),
    constraints: z.array(z.string()).default([]),
    requiresApproval: z.boolean().default(false),
  })
  .strict();
export type PlanTask = z.infer<typeof PlanTaskSchema>;

export const ExecutionPlanSchema = z
  .object({
    planId: z.string().min(1),
    objective: z.string().min(1),
    tasks: z.array(PlanTaskSchema).min(1),
    createdAt: ISODateSchema,
    source: z.enum(["planner", "human", "system"]).default("planner"),
  })
  .strict();
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

export const ToolCallSchema = z
  .object({
    requestId: z.string().min(1),
    tool: z.string().min(1),
    intent: z.string().min(1),
    permissionTier: PermissionTierSchema,
    input: z.record(z.unknown()),
    costUnits: z.number().int().nonnegative(),
    costCategory: CostCategorySchema,
    estimatedCostCents: z.number().int().nonnegative().default(0),
    estimatedTokens: z.number().int().nonnegative().default(0),
    sideEffectCount: z.number().int().nonnegative().default(0),
    impact: ActionImpactSchema,
    createdAt: ISODateSchema,
  })
  .strict();
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ToolFailureSchema = z
  .object({
    type: FailureTypeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    details: z.record(z.unknown()).optional(),
  })
  .strict();
export type ToolFailure = z.infer<typeof ToolFailureSchema>;

export const ToolMetricsSchema = z
  .object({
    latencyMs: z.number().int().nonnegative(),
    costCents: z.number().int().nonnegative(),
    tokens: z.number().int().nonnegative(),
    sideEffects: z.number().int().nonnegative(),
  })
  .strict();
export type ToolMetrics = z.infer<typeof ToolMetricsSchema>;

export const ToolResultSchema = z
  .object({
    requestId: z.string().min(1),
    tool: z.string().min(1),
    status: z.enum(["success", "failure"]),
    output: z.record(z.unknown()).optional(),
    failure: ToolFailureSchema.optional(),
    metrics: ToolMetricsSchema,
    completedAt: ISODateSchema,
  })
  .strict();
export type ToolResult = z.infer<typeof ToolResultSchema>;

export const ExecutionReportSchema = z
  .object({
    executionId: z.string().min(1),
    planId: z.string().min(1),
    taskId: z.string().min(1),
    toolCalls: z.array(ToolCallSchema),
    toolResults: z.array(ToolResultSchema),
    startedAt: ISODateSchema,
    completedAt: ISODateSchema,
  })
  .strict();
export type ExecutionReport = z.infer<typeof ExecutionReportSchema>;

export const VerificationCheckSchema = z
  .object({
    checkId: z.string().min(1),
    description: z.string().min(1),
    passed: z.boolean(),
    evidenceRefs: z.array(z.string()).default([]),
    details: z.record(z.unknown()).optional(),
  })
  .strict();
export type VerificationCheck = z.infer<typeof VerificationCheckSchema>;

export const VerificationReportSchema = z
  .object({
    reportId: z.string().min(1),
    planId: z.string().min(1),
    taskId: z.string().min(1),
    status: z.enum(["pass", "fail", "warn"]),
    checks: z.array(VerificationCheckSchema).min(1),
    verifiedAt: ISODateSchema,
  })
  .strict();
export type VerificationReport = z.infer<typeof VerificationReportSchema>;

export const LoopResultSchema = z
  .object({
    loopId: z.string().min(1),
    plan: ExecutionPlanSchema,
    execution: ExecutionReportSchema,
    verification: VerificationReportSchema,
    nextPlan: ExecutionPlanSchema.optional(),
    status: z.enum(["complete", "replan_required", "blocked"]),
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();
export type LoopResult = z.infer<typeof LoopResultSchema>;

export const MemoryScopeSchema = z
  .object({
    tenantId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    sessionId: z.string().min(1).optional(),
    topic: z.string().min(1).optional(),
  })
  .strict();
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

export const MemoryRecordSchema = z
  .object({
    memoryId: z.string().min(1),
    kind: z.enum(["fact", "decision", "preference", "outcome"]),
    subject: z.string().min(1),
    data: z.record(z.unknown()),
    confidence: z.number().min(0).max(1),
    createdAt: ISODateSchema,
    updatedAt: ISODateSchema,
    expiresAt: ISODateSchema.optional(),
    scope: MemoryScopeSchema,
    source: z.enum(["system", "human", "tool", "simulation"]),
    tags: z.array(z.string()).default([]),
    lineage: z
      .object({
        originId: z.string().min(1).optional(),
        traceId: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;

export const ToolUsageEventSchema = z
  .object({
    eventId: z.string().min(1),
    tool: z.string().min(1),
    status: z.enum(["success", "failure"]),
    failureType: FailureTypeSchema.optional(),
    latencyMs: z.number().int().nonnegative(),
    costCents: z.number().int().nonnegative().default(0),
    timestamp: ISODateSchema,
  })
  .strict();
export type ToolUsageEvent = z.infer<typeof ToolUsageEventSchema>;

export const AgentScopeSchema = z
  .object({
    domains: z.array(z.string().min(1)).min(1),
    decisionScopes: z.array(z.string().min(1)).min(1),
    allowedTools: z.array(z.string().min(1)).min(1),
    prohibitedActions: z.array(z.string()).default([]),
  })
  .strict();
export type AgentScope = z.infer<typeof AgentScopeSchema>;

export const AgentProfileSchema = z
  .object({
    agentId: z.string().min(1),
    displayName: z.string().min(1),
    role: z.string().min(1),
    scope: AgentScopeSchema,
    maxPermissionTier: PermissionTierSchema,
    createdAt: ISODateSchema,
    updatedAt: ISODateSchema,
    supervisorId: z.string().min(1).optional(),
  })
  .strict();
export type AgentProfile = z.infer<typeof AgentProfileSchema>;

export const RoleJurisdictionSchema = z
  .object({
    domains: z.array(z.string().min(1)).min(1),
    actions: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type RoleJurisdiction = z.infer<typeof RoleJurisdictionSchema>;

export const RoleAuthorityCeilingSchema = z
  .object({
    maxPermissionTier: PermissionTierSchema,
    maxTaskClass: TaskClassSchema,
    maxImpact: ActionImpactSchema,
    maxEstimatedCostCents: z.number().int().nonnegative(),
  })
  .strict();
export type RoleAuthorityCeiling = z.infer<typeof RoleAuthorityCeilingSchema>;

export const RoleEscalationRulesSchema = z
  .object({
    alwaysEscalateActions: z.array(z.string()).default([]),
    alwaysEscalateDomains: z.array(z.string()).default([]),
    escalateAboveTaskClass: TaskClassSchema.optional(),
    escalateAboveImpact: ActionImpactSchema.optional(),
    escalateAboveCostCents: z.number().int().nonnegative().optional(),
  })
  .strict();
export type RoleEscalationRules = z.infer<typeof RoleEscalationRulesSchema>;

export const RoleChainOfCommandSchema = z
  .object({
    canRequestFromRoles: z.array(z.string()).default([]),
    canApproveForRoles: z.array(z.string()).default([]),
  })
  .strict();
export type RoleChainOfCommand = z.infer<typeof RoleChainOfCommandSchema>;

export const RoleDataAccessSchema = z
  .object({
    allowedCategories: z.array(z.string()).default([]),
  })
  .strict();
export type RoleDataAccess = z.infer<typeof RoleDataAccessSchema>;

export const RoleToolAccessSchema = z
  .object({
    allowedTools: z.array(z.string()).default([]),
    allowedContracts: z.array(z.string()).default([]),
  })
  .strict();
export type RoleToolAccess = z.infer<typeof RoleToolAccessSchema>;

export const RoleEconomicsSchema = z
  .object({
    allowedCostCategories: z.array(CostCategorySchema).min(1),
  })
  .strict();
export type RoleEconomics = z.infer<typeof RoleEconomicsSchema>;

export const RoleAuditRequirementsSchema = z
  .object({
    requiredFields: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type RoleAuditRequirements = z.infer<typeof RoleAuditRequirementsSchema>;

export const RolePolicySchema = z
  .object({
    policyId: z.string().min(1),
    roleId: z.string().min(1),
    roleName: z.string().min(1),
    version: z.string().min(1),
    jurisdiction: RoleJurisdictionSchema,
    authorityCeiling: RoleAuthorityCeilingSchema,
    deniedActions: z.array(z.string()).default([]),
    escalationRules: RoleEscalationRulesSchema,
    chainOfCommand: RoleChainOfCommandSchema,
    dataAccess: RoleDataAccessSchema,
    toolAccess: RoleToolAccessSchema,
    economics: RoleEconomicsSchema,
    auditRequirements: RoleAuditRequirementsSchema,
    createdAt: ISODateSchema,
    updatedAt: ISODateSchema,
  })
  .strict();
export type RolePolicy = z.infer<typeof RolePolicySchema>;

export const RoleConstitutionDecisionSchema = z
  .object({
    decision: z.enum(["allow", "deny", "escalate"]),
    reasonCode: z.string().min(1),
    roleId: z.string().min(1),
    policyId: z.string().min(1),
    policyVersion: z.string().min(1),
    timestamp: ISODateSchema,
  })
  .strict();
export type RoleConstitutionDecision = z.infer<typeof RoleConstitutionDecisionSchema>;

export const RoleConstitutionAuditRecordSchema = z
  .object({
    auditId: z.string().min(1),
    identityKey: z.string().min(1),
    roleId: z.string().min(1),
    roleName: z.string().min(1),
    policyId: z.string().min(1),
    policyVersion: z.string().min(1),
    action: z.string().min(1),
    domain: z.string().min(1),
    tool: z.string().min(1).optional(),
    decision: z.enum(["allow", "deny", "escalate"]),
    reasonCode: z.string().min(1),
    requestedByRoleId: z.string().min(1).optional(),
    requestedByAgentId: z.string().min(1).optional(),
    taskClass: TaskClassSchema.optional(),
    impact: ActionImpactSchema.optional(),
    estimatedCostCents: z.number().int().nonnegative().optional(),
    createdAt: ISODateSchema,
  })
  .strict();
export type RoleConstitutionAuditRecord = z.infer<typeof RoleConstitutionAuditRecordSchema>;

export const AgentProposalSchema = z
  .object({
    proposalId: z.string().min(1),
    agentId: z.string().min(1),
    summary: z.string().min(1),
    justification: z.string().min(1),
    confidence: z.number().min(0).max(1),
    riskLevel: z.number().min(0).max(1),
    evidenceRefs: z.array(z.string()).default([]),
    assumptions: z.array(z.string()).default([]),
    unresolvedRisks: z.array(z.string()).default([]),
    impact: ActionImpactSchema,
    createdAt: ISODateSchema,
  })
  .strict();
export type AgentProposal = z.infer<typeof AgentProposalSchema>;

export const DisagreementRecordSchema = z
  .object({
    disagreementId: z.string().min(1),
    topic: z.string().min(1),
    proposals: z.array(AgentProposalSchema).min(2),
    status: z.enum(["open", "resolved", "escalated"]),
    createdAt: ISODateSchema,
    refereeDecisionId: z.string().min(1).optional(),
  })
  .strict();
export type DisagreementRecord = z.infer<typeof DisagreementRecordSchema>;

export const RefereeDecisionSchema = z
  .object({
    decisionId: z.string().min(1),
    disagreementId: z.string().min(1),
    action: z.enum(["select", "merge", "escalate"]),
    rationale: z.string().min(1),
    confidence: z.number().min(0).max(1),
    selectedProposalIds: z.array(z.string()).default([]),
    mergedSummary: z.string().min(1).optional(),
    requiresHumanReview: z.boolean(),
    allowedImpact: z.enum(["reversible", "difficult"]),
    createdAt: ISODateSchema,
  })
  .strict();
export type RefereeDecision = z.infer<typeof RefereeDecisionSchema>;

export const HandoffContractSchema = z
  .object({
    handoffId: z.string().min(1),
    fromAgentId: z.string().min(1),
    toAgentId: z.string().min(1),
    taskId: z.string().min(1),
    summary: z.string().min(1),
    assumptions: z.array(z.string()).default([]),
    unresolvedRisks: z.array(z.string()).default([]),
    confidence: z.number().min(0).max(1),
    requiredTools: z.array(z.string()).default([]),
    createdAt: ISODateSchema,
    overrideAgentId: z.string().min(1).optional(),
    governance: z
      .object({
        refereeDecisionId: z.string().min(1).optional(),
        approvedByHuman: z.string().min(1).optional(),
        approvedAt: ISODateSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type HandoffContract = z.infer<typeof HandoffContractSchema>;

export const ConfidenceDisclosureSchema = z
  .object({
    confidenceScore: z.number().min(0).max(1),
    uncertaintyExplanation: z.string().min(1),
    knownBlindSpots: z.array(z.string()).min(1),
    evidenceRefs: z.array(z.string()).default([]),
  })
  .strict();
export type ConfidenceDisclosure = z.infer<typeof ConfidenceDisclosureSchema>;

export const ExplainabilitySnapshotSchema = z
  .object({
    whyDecision: z.string().min(1),
    alternativesRejected: z.array(z.string()).min(1),
    whatWouldChangeDecision: z.array(z.string()).min(1),
  })
  .strict();
export type ExplainabilitySnapshot = z.infer<typeof ExplainabilitySnapshotSchema>;

export const RecommendationSchema = z
  .object({
    recommendationId: z.string().min(1),
    agentId: z.string().min(1),
    intent: z.string().min(1),
    summary: z.string().min(1),
    impact: ActionImpactSchema,
    confidence: ConfidenceDisclosureSchema,
    explainability: ExplainabilitySnapshotSchema.optional(),
    requiresHumanReview: z.boolean(),
    createdAt: ISODateSchema,
  })
  .strict();
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const TrustAssessmentSchema = z
  .object({
    assessmentId: z.string().min(1),
    agentId: z.string().min(1),
    tier: PermissionTierSchema,
    eligibleForPromotion: z.boolean(),
    reasons: z.array(z.string()).default([]),
    metrics: z
      .object({
        evaluationPassRate: z.number().min(0).max(1),
        failureDebt: z.number().min(0),
        uncertaintyVariance: z.number().min(0),
        rollbackRate: z.number().min(0).max(1),
      })
      .strict(),
    assessedAt: ISODateSchema,
  })
  .strict();
export type TrustAssessment = z.infer<typeof TrustAssessmentSchema>;

export const GoalOwnerSchema = z
  .object({
    type: z.enum(["human", "agent"]),
    id: z.string().min(1),
  })
  .strict();
export type GoalOwner = z.infer<typeof GoalOwnerSchema>;

export const GoalMetricSchema = z
  .object({
    metric: z.string().min(1),
    target: z.string().min(1),
    direction: z.enum(["increase", "decrease", "maintain"]),
  })
  .strict();
export type GoalMetric = z.infer<typeof GoalMetricSchema>;

export const GoalStatusSchema = z.enum(["active", "expired", "suspended"]);
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

export const GoalSchema = z
  .object({
    goalId: z.string().min(1),
    version: z.string().min(1),
    owner: GoalOwnerSchema,
    description: z.string().min(1),
    successMetrics: z.array(GoalMetricSchema).min(1),
    createdAt: ISODateSchema,
    expiresAt: ISODateSchema,
    reviewCadence: z.string().min(1),
    status: GoalStatusSchema,
    tags: z.array(z.string()).default([]),
  })
  .strict();
export type Goal = z.infer<typeof GoalSchema>;

export const GoalConflictStatusSchema = z.enum(["open", "resolved", "escalated"]);
export type GoalConflictStatus = z.infer<typeof GoalConflictStatusSchema>;

export const GoalConflictSchema = z
  .object({
    conflictId: z.string().min(1),
    goalIds: z.array(z.string().min(1)).min(2),
    reason: z.string().min(1),
    status: GoalConflictStatusSchema,
    createdAt: ISODateSchema,
    resolvedAt: ISODateSchema.optional(),
    arbitrationProtocolId: z.string().min(1).optional(),
    resolutionSummary: z.string().min(1).optional(),
  })
  .strict();
export type GoalConflict = z.infer<typeof GoalConflictSchema>;

export const ValueObjectiveSchema = z
  .object({
    objectiveId: z.string().min(1),
    rank: z.number().int().nonnegative(),
    description: z.string().min(1),
  })
  .strict();
export type ValueObjective = z.infer<typeof ValueObjectiveSchema>;

export const DoNotOptimizeConstraintSchema = z
  .object({
    constraintId: z.string().min(1),
    description: z.string().min(1),
    rationale: z.string().min(1),
  })
  .strict();
export type DoNotOptimizeConstraint = z.infer<typeof DoNotOptimizeConstraintSchema>;

export const ValueAnchorThresholdsSchema = z
  .object({
    decisionDistribution: z.number().min(0).max(1),
    routingDistribution: z.number().min(0).max(1),
    outcomeFailureDelta: z.number().min(0).max(1),
    rollbackRateDelta: z.number().min(0).max(1),
    constraintViolationRate: z.number().min(0).max(1),
    nearMissRate: z.number().min(0).max(1),
  })
  .strict();
export type ValueAnchorThresholds = z.infer<typeof ValueAnchorThresholdsSchema>;

export const ValueAnchorSchema = z
  .object({
    anchorId: z.string().min(1),
    version: z.string().min(1),
    createdAt: ISODateSchema,
    coreObjectives: z.array(ValueObjectiveSchema).min(1),
    doNotOptimize: z.array(DoNotOptimizeConstraintSchema).min(1),
    escalationThresholds: ValueAnchorThresholdsSchema,
    reviewCadence: z.string().min(1),
  })
  .strict();
export type ValueAnchor = z.infer<typeof ValueAnchorSchema>;

export const DriftSeveritySchema = z.enum(["none", "low", "medium", "high"]);
export type DriftSeverity = z.infer<typeof DriftSeveritySchema>;

export const DriftDistributionSchema = z.record(z.string(), z.number().min(0).max(1));
export type DriftDistribution = z.infer<typeof DriftDistributionSchema>;

export const DriftDistributionMetricSchema = z
  .object({
    baseline: DriftDistributionSchema,
    recent: DriftDistributionSchema,
    jsDivergence: z.number().min(0).max(1),
    sampleCount: z.number().int().nonnegative(),
  })
  .strict();
export type DriftDistributionMetric = z.infer<typeof DriftDistributionMetricSchema>;

export const DriftOutcomeMetricSchema = z
  .object({
    baselineFailureRate: z.number().min(0).max(1),
    recentFailureRate: z.number().min(0).max(1),
    deltaFailureRate: z.number(),
    baselineRollbackRate: z.number().min(0).max(1),
    recentRollbackRate: z.number().min(0).max(1),
    deltaRollbackRate: z.number(),
    sampleCount: z.number().int().nonnegative(),
  })
  .strict();
export type DriftOutcomeMetric = z.infer<typeof DriftOutcomeMetricSchema>;

export const DriftConstraintMetricSchema = z
  .object({
    baselineViolations: z.number().int().nonnegative(),
    recentViolations: z.number().int().nonnegative(),
    violationRateDelta: z.number(),
    baselineNearMisses: z.number().int().nonnegative(),
    recentNearMisses: z.number().int().nonnegative(),
    nearMissRateDelta: z.number(),
    sampleCount: z.number().int().nonnegative(),
  })
  .strict();
export type DriftConstraintMetric = z.infer<typeof DriftConstraintMetricSchema>;

export const DriftWeightMetricSchema = z
  .object({
    available: z.boolean(),
    delta: z.number().optional(),
    reason: z.string().min(1).optional(),
  })
  .strict();
export type DriftWeightMetric = z.infer<typeof DriftWeightMetricSchema>;

export const DriftMetricsSchema = z
  .object({
    decisionDistribution: DriftDistributionMetricSchema,
    routingDistribution: DriftDistributionMetricSchema,
    outcomeRates: DriftOutcomeMetricSchema,
    constraintTrend: DriftConstraintMetricSchema,
    weightDrift: DriftWeightMetricSchema,
  })
  .strict();
export type DriftMetrics = z.infer<typeof DriftMetricsSchema>;

export const DriftWindowSchema = z
  .object({
    baselineStart: ISODateSchema,
    baselineEnd: ISODateSchema,
    recentStart: ISODateSchema,
    recentEnd: ISODateSchema,
  })
  .strict();
export type DriftWindow = z.infer<typeof DriftWindowSchema>;

export const DriftReportSchema = z
  .object({
    reportId: z.string().min(1),
    identityKey: z.string().min(1),
    anchorId: z.string().min(1),
    anchorVersion: z.string().min(1),
    severity: DriftSeveritySchema,
    reasons: z.array(z.string()).default([]),
    metrics: DriftMetricsSchema,
    window: DriftWindowSchema,
    createdAt: ISODateSchema,
  })
  .strict();
export type DriftReport = z.infer<typeof DriftReportSchema>;

export const ConfidenceLevelSchema = z.enum(["low", "medium", "high"]);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export const EpistemicAssessmentSchema = z
  .object({
    noveltyScore: z.number().min(0).max(1),
    confidenceScore: z.number().min(0).max(1),
    confidenceLevel: ConfidenceLevelSchema,
    evidenceCount: z.number().int().nonnegative(),
    evidenceSufficient: z.boolean(),
    mode: z.enum(["normal", "exploration"]),
    reasons: z.array(z.string()).default([]),
  })
  .strict();
export type EpistemicAssessment = z.infer<typeof EpistemicAssessmentSchema>;

export const SecondOrderEffectsSchema = z
  .object({
    effects: z.array(z.string().min(1)).min(1),
    incentiveRisks: z.array(z.string().min(1)).default([]),
    uncertaintyScore: z.number().min(0).max(1),
    mitigations: z.array(z.string()).default([]),
    checkedAt: ISODateSchema,
  })
  .strict();
export type SecondOrderEffects = z.infer<typeof SecondOrderEffectsSchema>;

export const NormSeveritySchema = z.enum(["hard", "soft"]);
export type NormSeverity = z.infer<typeof NormSeveritySchema>;

export const NormViolationSchema = z
  .object({
    normId: z.string().min(1),
    severity: NormSeveritySchema,
    reason: z.string().min(1),
    requiresJustification: z.boolean(),
  })
  .strict();
export type NormViolation = z.infer<typeof NormViolationSchema>;

export const NormAssessmentSchema = z
  .object({
    violations: z.array(NormViolationSchema).default([]),
    justification: z.string().min(1).optional(),
    checkedAt: ISODateSchema,
  })
  .strict();
export type NormAssessment = z.infer<typeof NormAssessmentSchema>;

export const LongHorizonCommitmentSchema = z
  .object({
    commitmentSummary: z.string().min(1),
    durationDays: z.number().int().nonnegative(),
    justification: z.string().min(1).optional(),
    reversibleAlternative: z.string().min(1).optional(),
    technicalDebtDelta: z.number().int().optional(),
  })
  .strict();
export type LongHorizonCommitment = z.infer<typeof LongHorizonCommitmentSchema>;

export const DebtTypeSchema = z.enum(["decision", "technical"]);
export type DebtType = z.infer<typeof DebtTypeSchema>;

export const DebtRecordSchema = z
  .object({
    debtId: z.string().min(1),
    type: DebtTypeSchema,
    delta: z.number().int(),
    reason: z.string().min(1),
    agentId: z.string().min(1),
    goalId: z.string().min(1).optional(),
    createdAt: ISODateSchema,
  })
  .strict();
export type DebtRecord = z.infer<typeof DebtRecordSchema>;

export const TaskHistoryRecordSchema = z
  .object({
    taskId: z.string().min(1),
    goalId: z.string().min(1).optional(),
    description: z.string().min(1),
    createdAt: ISODateSchema,
  })
  .strict();
export type TaskHistoryRecord = z.infer<typeof TaskHistoryRecordSchema>;

export const ModelTierSchema = z.enum(["economy", "standard", "advanced", "frontier"]);
export type ModelTier = z.infer<typeof ModelTierSchema>;

export const TaskOutcomeRecordSchema = z
  .object({
    outcomeId: z.string().min(1),
    taskId: z.string().min(1),
    taskType: z.string().min(1),
    inputHash: z.string().min(1).optional(),
    output: z.record(z.unknown()).optional(),
    taskClass: TaskClassSchema,
    goalId: z.string().min(1),
    agentId: z.string().min(1),
    modelTier: ModelTierSchema,
    modelId: z.string().min(1),
    cacheHit: z.boolean().default(false),
    ruleUsed: z.boolean().default(false),
    evaluationPassed: z.boolean().default(true),
    qualityScore: z.number().min(0).max(1),
    costCents: z.number().int().nonnegative(),
    modelCostCents: z.number().int().nonnegative().default(0),
    toolCostCents: z.number().int().nonnegative().default(0),
    durationMs: z.number().int().nonnegative().default(0),
    outcomeType: z.enum(["executed", "failed", "deferred"]).optional(),
    retryCount: z.number().int().nonnegative().default(0),
    humanOverride: z.boolean().default(false),
    createdAt: ISODateSchema,
  })
  .strict();
export type TaskOutcomeRecord = z.infer<typeof TaskOutcomeRecordSchema>;

export const LineageMetadataSchema = z
  .object({
    sourceOutcomeIds: z.array(z.string().min(1)).default([]),
    timeWindowStart: ISODateSchema.optional(),
    timeWindowEnd: ISODateSchema.optional(),
    confidenceDecay: z.number().min(0).max(1).optional(),
    reviewBy: ISODateSchema.optional(),
  })
  .strict();
export type LineageMetadata = z.infer<typeof LineageMetadataSchema>;

export const QualityMetricRecordSchema = z
  .object({
    metricId: z.string().min(1),
    taskType: z.string().min(1),
    taskClass: TaskClassSchema,
    modelTier: ModelTierSchema,
    sampleCount: z.number().int().nonnegative(),
    passRate: z.number().min(0).max(1),
    avgQuality: z.number().min(0).max(1),
    avgCostCents: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
    decayedConfidence: z.number().min(0).max(1),
    windowStart: ISODateSchema.optional(),
    windowEnd: ISODateSchema.optional(),
    updatedAt: ISODateSchema,
  })
  .strict();
export type QualityMetricRecord = z.infer<typeof QualityMetricRecordSchema>;

export const QualityRegressionRecordSchema = z
  .object({
    regressionId: z.string().min(1),
    taskType: z.string().min(1),
    modelTier: ModelTierSchema,
    baselineQuality: z.number().min(0).max(1),
    recentQuality: z.number().min(0).max(1),
    delta: z.number(),
    severity: z.enum(["low", "medium", "high"]),
    detectedAt: ISODateSchema,
  })
  .strict();
export type QualityRegressionRecord = z.infer<typeof QualityRegressionRecordSchema>;

export const CostBudgetScopeSchema = z
  .object({
    goalId: z.string().min(1).optional(),
    agentId: z.string().min(1).optional(),
    taskType: z.string().min(1).optional(),
  })
  .strict();
export type CostBudgetScope = z.infer<typeof CostBudgetScopeSchema>;

export const CostBudgetSchema = z
  .object({
    budgetId: z.string().min(1),
    scope: CostBudgetScopeSchema,
    period: z.enum(["daily", "weekly", "monthly", "total"]),
    limitCents: z.number().int().nonnegative(),
    softLimitCents: z.number().int().nonnegative(),
    status: z.enum(["active", "paused"]).default("active"),
    createdAt: ISODateSchema,
  })
  .strict();
export type CostBudget = z.infer<typeof CostBudgetSchema>;

export const CostEventTypeSchema = z.enum([
  "budget_seeded",
  "soft_limit_exceeded",
  "hard_limit_exceeded",
  "routing_cap_applied",
  "scheduled_due_to_cost",
]);
export type CostEventType = z.infer<typeof CostEventTypeSchema>;

export const CostEventRecordSchema = z
  .object({
    eventId: z.string().min(1),
    type: CostEventTypeSchema,
    identityKey: z.string().min(1),
    budgetId: z.string().min(1).optional(),
    goalId: z.string().min(1).optional(),
    agentId: z.string().min(1).optional(),
    taskType: z.string().min(1).optional(),
    taskClass: TaskClassSchema.optional(),
    reason: z.string().min(1),
    justification: z.string().min(1).optional(),
    createdAt: ISODateSchema,
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();
export type CostEventRecord = z.infer<typeof CostEventRecordSchema>;

export const CostRoutingCapSchema = z
  .object({
    capId: z.string().min(1),
    identityKey: z.string().min(1),
    tier: ModelTierSchema,
    reason: z.string().min(1),
    budgetId: z.string().min(1).optional(),
    scope: CostBudgetScopeSchema.optional(),
    createdAt: ISODateSchema,
    expiresAt: ISODateSchema.optional(),
  })
  .strict();
export type CostRoutingCap = z.infer<typeof CostRoutingCapSchema>;

export const EconomicBudgetStateSchema = z
  .object({
    budgetId: z.string().min(1),
    identityKey: z.string().min(1),
    totalBudget: z.number().int().nonnegative(),
    remainingBudget: z.number().int().nonnegative(),
    sessionId: z.string().min(1),
    sessionTotal: z.number().int().nonnegative(),
    sessionRemaining: z.number().int().nonnegative(),
    windowStart: ISODateSchema,
    windowDurationMs: z.number().int().nonnegative(),
    updatedAt: ISODateSchema,
  })
  .strict();
export type EconomicBudgetState = z.infer<typeof EconomicBudgetStateSchema>;

export const EconomicAuditRecordSchema = z
  .object({
    auditId: z.string().min(1),
    identityKey: z.string().min(1),
    roleId: z.string().min(1).optional(),
    actionId: z.string().min(1).optional(),
    taskId: z.string().min(1).optional(),
    taskType: z.string().min(1).optional(),
    tool: z.string().min(1).optional(),
    costUnits: z.number().int().nonnegative(),
    costCategory: CostCategorySchema,
    costSource: EconomicCostSourceSchema,
    chargeId: z.string().min(1).optional(),
    decision: z.enum(["allowed", "blocked"]),
    reason: z.string().min(1),
    remainingBudget: z.number().int().nonnegative(),
    sessionRemaining: z.number().int().nonnegative(),
    createdAt: ISODateSchema,
  })
  .strict();
export type EconomicAuditRecord = z.infer<typeof EconomicAuditRecordSchema>;

export const CachePolicySchema = z
  .object({
    ttlMs: z.number().int().positive(),
    maxNoveltyScore: z.number().min(0).max(1).default(0.5),
    allowIrreversible: z.boolean().default(false),
    allowExploration: z.boolean().default(false),
  })
  .strict();
export type CachePolicy = z.infer<typeof CachePolicySchema>;

export const CacheEntrySchema = z
  .object({
    cacheKey: z.string().min(1),
    kind: z.enum(["tool", "artifact", "conclusion"]),
    taskType: z.string().min(1),
    goalId: z.string().min(1),
    goalVersion: z.string().min(1),
    inputHash: z.string().min(1),
    policy: CachePolicySchema,
    payload: z.record(z.unknown()),
    createdAt: ISODateSchema,
    expiresAt: ISODateSchema,
    hitCount: z.number().int().nonnegative().default(0),
  })
  .strict();
export type CacheEntry = z.infer<typeof CacheEntrySchema>;

export const SchedulingPolicySchema = z
  .object({
    policyId: z.string().min(1),
    mode: z.enum(["immediate", "deferred", "off-peak"]),
    urgency: z.enum(["low", "medium", "high"]).default("low"),
    batchWindowMinutes: z.number().int().nonnegative().default(0),
    deadlineAt: ISODateSchema.optional(),
    createdAt: ISODateSchema,
  })
  .strict();
export type SchedulingPolicy = z.infer<typeof SchedulingPolicySchema>;

const ScheduledTaskActionSchema = z
  .object({
    action_id: z.string().min(1),
    action_type: z.enum(["message", "email", "sms", "voice", "note", "task", "webhook", "wait", "update_state"]),
    description: z.string().min(1),
    intent_id: z.string().min(1),
    expected_metric: z.string().min(1).optional(),
    risk_level: z.enum(["low", "medium", "high"]),
    irreversible: z.boolean(),
    payload: z.record(z.unknown()),
    costUnits: z.number().int().nonnegative(),
    costCategory: CostCategorySchema,
  })
  .strict();

export const ScheduledTaskSchema = z
  .object({
    scheduleId: z.string().min(1),
    taskId: z.string().min(1),
    goalId: z.string().min(1),
    agentId: z.string().min(1),
    taskType: z.string().min(1),
    policy: SchedulingPolicySchema,
    scheduledAt: ISODateSchema,
    status: z.enum(["scheduled", "deferred", "executed", "cancelled", "failed"]),
    batchKey: z.string().min(1).optional(),
    createdAt: ISODateSchema,
    updatedAt: ISODateSchema.optional(),
    initiator: z.enum(["agent", "human", "system"]).optional(),
    reason: z.string().min(1).optional(),
    action: ScheduledTaskActionSchema.optional(),
    agentContext: z.record(z.unknown()).optional(),
    attempts: z.number().int().nonnegative().default(0),
    lastAttemptAt: ISODateSchema.optional(),
    completedAt: ISODateSchema.optional(),
    failureReason: z.string().min(1).optional(),
  })
  .strict();
export type ScheduledTask = z.infer<typeof ScheduledTaskSchema>;

export const DistilledRuleSchema = z
  .object({
    ruleId: z.string().min(1),
    version: z.string().min(1),
    taskType: z.string().min(1),
    inputHash: z.string().min(1),
    goalId: z.string().min(1),
    output: z.record(z.unknown()),
    successCount: z.number().int().nonnegative(),
    failureCount: z.number().int().nonnegative(),
    errorRate: z.number().min(0).max(1).default(0),
    status: z.enum(["active", "demoted"]),
    provenance: LineageMetadataSchema.extend({
      sourceModelTier: ModelTierSchema.optional(),
      sourceModelId: z.string().min(1).optional(),
      createdBy: z.enum(["improvement_loop", "human", "system"]).default("improvement_loop"),
    })
      .strict()
      .default({ sourceOutcomeIds: [], createdBy: "improvement_loop" }),
    confidenceLowerBound: z.number().min(0).max(1).default(0),
    confidenceUpperBound: z.number().min(0).max(1).default(1),
    ruleCostCents: z.number().int().nonnegative().default(0),
    sourceCostCents: z.number().int().nonnegative().default(0),
    createdAt: ISODateSchema,
    updatedAt: ISODateSchema,
    lastValidatedAt: ISODateSchema.optional(),
    lastUsedAt: ISODateSchema.optional(),
    expiresAt: ISODateSchema.optional(),
  })
  .strict();
export type DistilledRule = z.infer<typeof DistilledRuleSchema>;

export const RuleUsageRecordSchema = z
  .object({
    usageId: z.string().min(1),
    ruleId: z.string().min(1),
    taskId: z.string().min(1),
    success: z.boolean(),
    reason: z.string().min(1).optional(),
    createdAt: ISODateSchema,
  })
  .strict();
export type RuleUsageRecord = z.infer<typeof RuleUsageRecordSchema>;

export const ModelRiskSchema = z.enum(["low", "medium", "high", "critical"]);
export type ModelRisk = z.infer<typeof ModelRiskSchema>;

export const ReasoningDepthSchema = z.enum(["shallow", "medium", "deep"]);
export type ReasoningDepth = z.infer<typeof ReasoningDepthSchema>;

export const ModelRoutingRequestSchema = z
  .object({
    requestId: z.string().min(1),
    task: z.string().min(1),
    taskClass: TaskClassSchema,
    riskLevel: ModelRiskSchema,
    irreversible: z.boolean().default(false),
    complianceSensitive: z.boolean().default(false),
    noveltyScore: z.number().min(0).max(1),
    ambiguityScore: z.number().min(0).max(1).default(0),
    reasoningDepth: ReasoningDepthSchema,
    expectedTokens: z.number().int().nonnegative(),
    budgetCents: z.number().int().nonnegative(),
    requiresArbitration: z.boolean().default(false),
  })
  .strict();
export type ModelRoutingRequest = z.infer<typeof ModelRoutingRequestSchema>;

export const ModelRoutingDecisionSchema = z
  .object({
    decisionId: z.string().min(1),
    requestId: z.string().min(1),
    selectedModel: z.string().min(1),
    tier: ModelTierSchema,
    justification: z.array(z.string()).min(1),
    estimatedCostCents: z.number().int().nonnegative(),
    withinBudget: z.boolean(),
    createdAt: ISODateSchema,
  })
  .strict();
export type ModelRoutingDecision = z.infer<typeof ModelRoutingDecisionSchema>;

export const ToolSkillProfileSchema = z
  .object({
    tool: z.string().min(1),
    totalCalls: z.number().int().nonnegative(),
    successRate: z.number().min(0).max(1),
    failureRate: z.number().min(0).max(1),
    avgLatencyMs: z.number().int().nonnegative(),
    avgCostCents: z.number().int().nonnegative(),
    reliabilityScore: z.number().min(0).max(1),
    failureTypeCounts: z.record(z.string(), z.number().int().nonnegative()),
    recommendedRetries: z.number().int().nonnegative(),
    backoffMs: z.number().int().nonnegative(),
    priorityScore: z.number().min(0).max(1),
    fallbackOrder: z.array(z.string()).default([]),
    updatedAt: ISODateSchema,
  })
  .strict();
export type ToolSkillProfile = z.infer<typeof ToolSkillProfileSchema>;

export const CooperationProtocolTypeSchema = z.enum([
  "request-evidence",
  "request-clarification",
  "propose-merge",
  "escalate-to-referee",
  "escalate-to-human",
]);
export type CooperationProtocolType = z.infer<typeof CooperationProtocolTypeSchema>;

const ProtocolEnvelopeBase = z.object({
  protocolId: z.string().min(1),
  fromAgentId: z.string().min(1),
  toAgentId: z.string().min(1).optional(),
  createdAt: ISODateSchema,
  expiresAt: ISODateSchema.optional(),
  status: z.enum(["open", "resolved", "escalated", "expired"]).default("open"),
});

export const CooperationProtocolSchema = z.discriminatedUnion("type", [
  ProtocolEnvelopeBase.extend({
    type: z.literal("request-evidence"),
    payload: z.object({
      topic: z.string().min(1),
      evidenceNeeded: z.array(z.string().min(1)).min(1),
      dueAt: ISODateSchema.optional(),
    }),
  }),
  ProtocolEnvelopeBase.extend({
    type: z.literal("request-clarification"),
    payload: z.object({
      question: z.string().min(1),
      context: z.string().min(1).optional(),
    }),
  }),
  ProtocolEnvelopeBase.extend({
    type: z.literal("propose-merge"),
    payload: z.object({
      proposalIds: z.array(z.string().min(1)).min(2),
      mergedSummary: z.string().min(1),
    }),
  }),
  ProtocolEnvelopeBase.extend({
    type: z.literal("escalate-to-referee"),
    payload: z.object({
      disagreementId: z.string().min(1),
      topic: z.string().min(1),
      proposalIds: z.array(z.string().min(1)).min(2),
    }),
  }),
  ProtocolEnvelopeBase.extend({
    type: z.literal("escalate-to-human"),
    payload: z.object({
      reason: z.string().min(1),
      disagreementId: z.string().min(1).optional(),
      requiredBy: ISODateSchema.optional(),
    }),
  }),
]);
export type CooperationProtocol = z.infer<typeof CooperationProtocolSchema>;

export const EvaluationDomainSchema = z.enum([
  "safety",
  "memory",
  "tooling",
  "coordination",
  "trust",
  "contract",
  "system",
]);
export type EvaluationDomain = z.infer<typeof EvaluationDomainSchema>;

export const FailureClassSchema = z.enum([
  "schema",
  "policy",
  "budget",
  "scope",
  "regression",
  "stability",
  "unknown",
]);
export type FailureClass = z.infer<typeof FailureClassSchema>;

export const EvaluationPrioritySchema = z.enum(["critical", "high", "medium", "low"]);
export type EvaluationPriority = z.infer<typeof EvaluationPrioritySchema>;

export const EvaluationTaskStatusSchema = z.enum(["active", "deprecated"]);
export type EvaluationTaskStatus = z.infer<typeof EvaluationTaskStatusSchema>;

export const EvaluationTaskSchema = z
  .object({
    taskId: z.string().min(1),
    version: z.string().min(1),
    status: EvaluationTaskStatusSchema.default("active"),
    replacedBy: z.string().min(1).optional(),
    domain: EvaluationDomainSchema,
    failureClass: FailureClassSchema,
    priority: EvaluationPrioritySchema.default("medium"),
    type: z.enum([
      "safety_gate",
      "memory_scope",
      "tool_validation",
      "tool_adaptation",
      "contract_validation",
    ]),
    description: z.string().min(1),
    input: z.record(z.unknown()),
    expected: z.record(z.unknown()),
    tags: z.array(z.string()).default([]),
  })
  .strict();
export type EvaluationTask = z.infer<typeof EvaluationTaskSchema>;

export const EvaluationResultSchema = z
  .object({
    taskId: z.string().min(1),
    passed: z.boolean(),
    details: z.string().min(1),
    artifacts: z.record(z.unknown()).optional(),
  })
  .strict();
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

export const ImprovementCandidateTypeSchema = z.enum([
  "routing_downgrade",
  "routing_upgrade",
  "cache_policy",
  "distill_rule",
  "schedule_policy",
  "freeze_behavior",
  "escalation_adjustment",
]);
export type ImprovementCandidateType = z.infer<typeof ImprovementCandidateTypeSchema>;

export const CausalActionTypeSchema = z.enum([
  "routing_downgrade",
  "routing_upgrade",
  "cache_policy",
  "distill_rule",
  "schedule_policy",
  "freeze_behavior",
  "escalation_adjustment",
  "emergency_mode",
]);
export type CausalActionType = z.infer<typeof CausalActionTypeSchema>;

export const ImprovementCandidateStatusSchema = z.enum(["proposed", "applied", "rejected", "rolled_back", "skipped"]);
export type ImprovementCandidateStatus = z.infer<typeof ImprovementCandidateStatusSchema>;

export const ImprovementCandidateTargetSchema = z
  .object({
    taskType: z.string().min(1).optional(),
    goalId: z.string().min(1).optional(),
    inputHash: z.string().min(1).optional(),
    modelTier: ModelTierSchema.optional(),
    ruleId: z.string().min(1).optional(),
    policyId: z.string().min(1).optional(),
  })
  .strict();
export type ImprovementCandidateTarget = z.infer<typeof ImprovementCandidateTargetSchema>;

export const ImprovementCandidateSchema = z
  .object({
    candidateId: z.string().min(1),
    identityKey: z.string().min(1),
    type: ImprovementCandidateTypeSchema,
    status: ImprovementCandidateStatusSchema,
    reason: z.string().min(1),
    evidenceRefs: z.array(z.string()).default([]),
    target: ImprovementCandidateTargetSchema,
    createdAt: ISODateSchema,
    appliedAt: ISODateSchema.optional(),
    rollbackAt: ISODateSchema.optional(),
    rollbackReason: z.string().min(1).optional(),
    cooldownUntil: ISODateSchema.optional(),
  })
  .strict();
export type ImprovementCandidate = z.infer<typeof ImprovementCandidateSchema>;

export const ImprovementRunRecordSchema = z
  .object({
    runId: z.string().min(1),
    identityKey: z.string().min(1),
    createdAt: ISODateSchema,
    completedAt: ISODateSchema,
    candidates: z.array(ImprovementCandidateSchema),
    appliedCount: z.number().int().nonnegative(),
    rolledBackCount: z.number().int().nonnegative(),
    skippedCount: z.number().int().nonnegative(),
  })
  .strict();
export type ImprovementRunRecord = z.infer<typeof ImprovementRunRecordSchema>;

export const HumanDecisionTargetSchema = z.enum([
  "improvement_candidate",
  "distilled_rule",
  "control_profile",
  "emergency_mode",
  "value_anchor_reaffirmation",
]);
export type HumanDecisionTarget = z.infer<typeof HumanDecisionTargetSchema>;

export const HumanDecisionTypeSchema = z.enum([
  "approve",
  "reject",
  "request_more_evidence",
  "escalate",
]);
export type HumanDecisionType = z.infer<typeof HumanDecisionTypeSchema>;

export const HumanDecisionRecordSchema = z
  .object({
    decisionId: z.string().min(1),
    identityKey: z.string().min(1),
    targetType: HumanDecisionTargetSchema,
    targetId: z.string().min(1),
    decision: HumanDecisionTypeSchema,
    notes: z.string().min(1).optional(),
    decidedBy: z.string().min(1).optional(),
    createdAt: ISODateSchema,
  })
  .strict();
export type HumanDecisionRecord = z.infer<typeof HumanDecisionRecordSchema>;

export const ValueReaffirmationRecordSchema = z
  .object({
    reaffirmationId: z.string().min(1),
    identityKey: z.string().min(1),
    anchorId: z.string().min(1),
    anchorVersion: z.string().min(1),
    decisionId: z.string().min(1).optional(),
    decidedBy: z.string().min(1),
    notes: z.string().min(1).optional(),
    createdAt: ISODateSchema,
  })
  .strict();
export type ValueReaffirmationRecord = z.infer<typeof ValueReaffirmationRecordSchema>;

export const FailureMemoryRecordSchema = z
  .object({
    memoryId: z.string().min(1),
    identityKey: z.string().min(1),
    candidateType: ImprovementCandidateTypeSchema,
    key: z.string().min(1),
    failureCount: z.number().int().nonnegative(),
    reason: z.string().min(1),
    lastFailedAt: ISODateSchema,
    expiresAt: ISODateSchema.optional(),
  })
  .strict();
export type FailureMemoryRecord = z.infer<typeof FailureMemoryRecordSchema>;

export const RoutingPreferenceSchema = z
  .object({
    preferenceId: z.string().min(1),
    identityKey: z.string().min(1),
    taskType: z.string().min(1),
    goalId: z.string().min(1).optional(),
    minTier: ModelTierSchema.optional(),
    maxTier: ModelTierSchema.optional(),
    reason: z.string().min(1),
    status: z.enum(["active", "disabled"]).default("active"),
    lineage: LineageMetadataSchema.optional(),
    createdAt: ISODateSchema,
    updatedAt: ISODateSchema,
    expiresAt: ISODateSchema.optional(),
  })
  .strict();
export type RoutingPreference = z.infer<typeof RoutingPreferenceSchema>;

export const CachePreferenceSchema = z
  .object({
    preferenceId: z.string().min(1),
    identityKey: z.string().min(1),
    taskType: z.string().min(1),
    goalId: z.string().min(1).optional(),
    policy: CachePolicySchema,
    reason: z.string().min(1),
    status: z.enum(["active", "disabled"]).default("active"),
    createdAt: ISODateSchema,
    updatedAt: ISODateSchema,
    expiresAt: ISODateSchema.optional(),
  })
  .strict();
export type CachePreference = z.infer<typeof CachePreferenceSchema>;

export const SchedulingPreferenceSchema = z
  .object({
    preferenceId: z.string().min(1),
    identityKey: z.string().min(1),
    taskType: z.string().min(1),
    policy: SchedulingPolicySchema,
    reason: z.string().min(1),
    status: z.enum(["active", "disabled"]).default("active"),
    lineage: LineageMetadataSchema.optional(),
    createdAt: ISODateSchema,
    updatedAt: ISODateSchema,
    expiresAt: ISODateSchema.optional(),
  })
  .strict();
export type SchedulingPreference = z.infer<typeof SchedulingPreferenceSchema>;

export const BehaviorFreezeSchema = z
  .object({
    freezeId: z.string().min(1),
    identityKey: z.string().min(1),
    taskType: z.string().min(1),
    goalId: z.string().min(1).optional(),
    reason: z.string().min(1),
    status: z.enum(["active", "expired"]).default("active"),
    createdAt: ISODateSchema,
    expiresAt: ISODateSchema.optional(),
  })
  .strict();
export type BehaviorFreeze = z.infer<typeof BehaviorFreezeSchema>;

export const EscalationOverrideSchema = z
  .object({
    overrideId: z.string().min(1),
    identityKey: z.string().min(1),
    taskType: z.string().min(1),
    minConfidence: z.number().min(0).max(1),
    noveltyThreshold: z.number().min(0).max(1),
    reason: z.string().min(1),
    status: z.enum(["active", "disabled"]).default("active"),
    lineage: LineageMetadataSchema.optional(),
    createdAt: ISODateSchema,
    updatedAt: ISODateSchema,
    expiresAt: ISODateSchema.optional(),
  })
  .strict();
export type EscalationOverride = z.infer<typeof EscalationOverrideSchema>;

export const CausalTriggerTypeSchema = z.enum([
  "quality_metric",
  "quality_regression",
  "cost_event",
  "cooperation_metric",
  "failure_memory",
  "human_control",
  "emergency_mode",
  "outcome_sample",
]);
export type CausalTriggerType = z.infer<typeof CausalTriggerTypeSchema>;

export const CausalTriggerSchema = z
  .object({
    triggerId: z.string().min(1),
    type: CausalTriggerTypeSchema,
    refId: z.string().min(1).optional(),
    summary: z.string().min(1),
    recordedAt: ISODateSchema,
  })
  .strict();
export type CausalTrigger = z.infer<typeof CausalTriggerSchema>;

export const CausalAlternativeSchema = z
  .object({
    action: z.string().min(1),
    reason: z.string().min(1),
    expectedDownside: z.string().min(1),
  })
  .strict();
export type CausalAlternative = z.infer<typeof CausalAlternativeSchema>;

export const CounterfactualRecordSchema = z
  .object({
    alternative: z.string().min(1),
    expectedDownside: z.string().min(1),
    uncertainty: z.string().min(1),
    confidenceLowerBound: z.number().min(0).max(1).optional(),
    confidenceUpperBound: z.number().min(0).max(1).optional(),
  })
  .strict();
export type CounterfactualRecord = z.infer<typeof CounterfactualRecordSchema>;

export const HumanExplanationSchema = z
  .object({
    summary: z.string().min(1),
    whatChanged: z.string().min(1),
    whyNow: z.string().min(1),
    riskAccepted: z.string().min(1),
    riskAvoided: z.string().min(1),
    reevaluateBy: ISODateSchema,
  })
  .strict();
export type HumanExplanation = z.infer<typeof HumanExplanationSchema>;

export const CausalChainRecordSchema = z
  .object({
    chainId: z.string().min(1),
    candidateId: z.string().min(1),
    identityKey: z.string().min(1),
    actionType: CausalActionTypeSchema,
    status: z.enum(["complete", "explanation_failed"]),
    triggers: z.array(CausalTriggerSchema).min(1),
    alternatives: z.array(CausalAlternativeSchema).min(1),
    counterfactuals: z.array(CounterfactualRecordSchema).min(1),
    explanation: HumanExplanationSchema,
    explanationQuality: z.enum(["clear", "insufficient"]),
    requiresHumanReview: z.boolean(),
    failureReason: z.string().min(1).optional(),
    createdAt: ISODateSchema,
    appliedAt: ISODateSchema.optional(),
  })
  .strict();
export type CausalChainRecord = z.infer<typeof CausalChainRecordSchema>;

export const EmergencyModeStateSchema = z
  .object({
    mode: z.enum(["normal", "constrained", "emergency"]),
    reason: z.string().min(1),
    triggeredBy: z.enum(["system", "human", "simulation"]),
    maxModelTier: ModelTierSchema.optional(),
    scheduleNonCritical: z.boolean().default(false),
    blockHighRisk: z.boolean().default(false),
    createdAt: ISODateSchema,
    expiresAt: ISODateSchema.optional(),
  })
  .strict();
export type EmergencyModeState = z.infer<typeof EmergencyModeStateSchema>;

export const CostShockEventSchema = z
  .object({
    shockId: z.string().min(1),
    identityKey: z.string().min(1),
    type: z.enum(["budget_shock", "traffic_spike", "provider_outage", "price_change"]),
    severity: z.enum(["low", "medium", "high"]),
    description: z.string().min(1),
    simulated: z.boolean().default(false),
    createdAt: ISODateSchema,
    expiresAt: ISODateSchema.optional(),
  })
  .strict();
export type CostShockEvent = z.infer<typeof CostShockEventSchema>;

export const CooperationMetricSchema = z
  .object({
    metricId: z.string().min(1),
    identityKey: z.string().min(1),
    agentA: z.string().min(1),
    agentB: z.string().min(1),
    disagreementCount: z.number().int().nonnegative(),
    escalationCount: z.number().int().nonnegative(),
    forcedCount: z.number().int().nonnegative(),
    resolvedCount: z.number().int().nonnegative(),
    trustScore: z.number().min(0).max(1),
    deadlockScore: z.number().min(0).max(1),
    lastOutcome: z.enum(["selected", "merged", "forced_smallest_step", "escalated"]),
    updatedAt: ISODateSchema,
  })
  .strict();
export type CooperationMetric = z.infer<typeof CooperationMetricSchema>;

export const HumanControlProfileSchema = z
  .object({
    profileId: z.string().min(1),
    identityKey: z.string().min(1),
    ownerId: z.string().min(1),
    autonomyCeiling: PermissionTierSchema,
    maxModelTier: ModelTierSchema,
    minConfidence: z.number().min(0).max(1),
    noveltyThreshold: z.number().min(0).max(1),
    requireHumanReviewForIrreversible: z.boolean().default(true),
    emergencyStop: z.boolean().default(false),
    createdAt: ISODateSchema,
    updatedAt: ISODateSchema,
  })
  .strict();
export type HumanControlProfile = z.infer<typeof HumanControlProfileSchema>;

export const CONTRACTS = {
  plan: ExecutionPlanSchema,
  toolCall: ToolCallSchema,
  toolResult: ToolResultSchema,
  executionReport: ExecutionReportSchema,
  verificationReport: VerificationReportSchema,
  loopResult: LoopResultSchema,
  memoryRecord: MemoryRecordSchema,
  toolUsageEvent: ToolUsageEventSchema,
  agentProfile: AgentProfileSchema,
  rolePolicy: RolePolicySchema,
  roleConstitutionDecision: RoleConstitutionDecisionSchema,
  roleConstitutionAuditRecord: RoleConstitutionAuditRecordSchema,
  disagreementRecord: DisagreementRecordSchema,
  refereeDecision: RefereeDecisionSchema,
  handoffContract: HandoffContractSchema,
  confidenceDisclosure: ConfidenceDisclosureSchema,
  explainabilitySnapshot: ExplainabilitySnapshotSchema,
  recommendation: RecommendationSchema,
  trustAssessment: TrustAssessmentSchema,
  goal: GoalSchema,
  goalConflict: GoalConflictSchema,
  valueAnchor: ValueAnchorSchema,
  driftReport: DriftReportSchema,
  epistemicAssessment: EpistemicAssessmentSchema,
  secondOrderEffects: SecondOrderEffectsSchema,
  normViolation: NormViolationSchema,
  normAssessment: NormAssessmentSchema,
  longHorizonCommitment: LongHorizonCommitmentSchema,
  debtRecord: DebtRecordSchema,
  taskHistoryRecord: TaskHistoryRecordSchema,
  taskOutcomeRecord: TaskOutcomeRecordSchema,
  qualityMetricRecord: QualityMetricRecordSchema,
  qualityRegressionRecord: QualityRegressionRecordSchema,
  costBudget: CostBudgetSchema,
  costEventRecord: CostEventRecordSchema,
  costRoutingCap: CostRoutingCapSchema,
  economicBudgetState: EconomicBudgetStateSchema,
  economicAuditRecord: EconomicAuditRecordSchema,
  cachePolicy: CachePolicySchema,
  cacheEntry: CacheEntrySchema,
  schedulingPolicy: SchedulingPolicySchema,
  scheduledTask: ScheduledTaskSchema,
  distilledRule: DistilledRuleSchema,
  lineageMetadata: LineageMetadataSchema,
  ruleUsageRecord: RuleUsageRecordSchema,
  improvementCandidate: ImprovementCandidateSchema,
  improvementRunRecord: ImprovementRunRecordSchema,
  humanDecisionRecord: HumanDecisionRecordSchema,
  valueReaffirmationRecord: ValueReaffirmationRecordSchema,
  failureMemoryRecord: FailureMemoryRecordSchema,
  routingPreference: RoutingPreferenceSchema,
  cachePreference: CachePreferenceSchema,
  schedulingPreference: SchedulingPreferenceSchema,
  behaviorFreeze: BehaviorFreezeSchema,
  escalationOverride: EscalationOverrideSchema,
  causalTrigger: CausalTriggerSchema,
  causalAlternative: CausalAlternativeSchema,
  counterfactualRecord: CounterfactualRecordSchema,
  humanExplanation: HumanExplanationSchema,
  causalChainRecord: CausalChainRecordSchema,
  emergencyModeState: EmergencyModeStateSchema,
  costShockEvent: CostShockEventSchema,
  cooperationMetric: CooperationMetricSchema,
  humanControlProfile: HumanControlProfileSchema,
  modelRoutingRequest: ModelRoutingRequestSchema,
  modelRoutingDecision: ModelRoutingDecisionSchema,
  toolSkillProfile: ToolSkillProfileSchema,
  cooperationProtocol: CooperationProtocolSchema,
  evaluationTask: EvaluationTaskSchema,
  evaluationResult: EvaluationResultSchema,
} as const;

export type ContractName = keyof typeof CONTRACTS;

export class ContractError extends Error {
  readonly contract: ContractName;
  readonly details: string;

  constructor(contract: ContractName, details: string) {
    super(`Contract validation failed for ${contract}: ${details}`);
    this.contract = contract;
    this.details = details;
  }
}

export const validateContract = <T>(contract: ContractName, payload: unknown) =>
  CONTRACTS[contract].safeParse(payload) as z.SafeParseReturnType<unknown, T>;

export const assertContract = <T>(contract: ContractName, payload: unknown): T => {
  const parsed = validateContract<T>(contract, payload);
  if (!parsed.success) {
    const details = parsed.error.errors.map((err) => err.message).join("; ");
    throw new ContractError(contract, details || "unknown validation error");
  }
  return parsed.data as T;
};
