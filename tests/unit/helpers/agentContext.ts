import type { AgentRuntimeContext } from "../../../src/lib/ceoPilot/runtimeGovernance";
import { DEFAULT_AGENT_IDS } from "../../../src/lib/ceoPilot/agents";
import { DEFAULT_GOAL_IDS } from "../../../src/lib/ceoPilot/goals";

export const buildTestAgentContext = (
  actionType: string,
  overrides: Partial<AgentRuntimeContext> = {}
): AgentRuntimeContext => ({
  agentId: DEFAULT_AGENT_IDS.revenue,
  actionDomain: "revenue",
  decisionType: actionType,
  tool: actionType,
  goalId: DEFAULT_GOAL_IDS.systemIntegrity,
  taskId: `task-${actionType}`,
  taskDescription: `Test task: ${actionType}`,
  taskType: `action:${actionType}`,
  taskClass: "routine",
  estimatedCostCents: 2,
  explorationMode: true,
  actionTags: [],
  permissionTier: "suggest",
  impact: "reversible",
  confidence: {
    confidenceScore: 0.72,
    uncertaintyExplanation: "test coverage limited",
    knownBlindSpots: ["test data only"],
    evidenceRefs: ["test:evidence"],
  },
  metrics: {
    uncertaintyVariance: 0.01,
    rollbackRate: 0.01,
    stableRuns: 6,
  },
  ...overrides,
});
