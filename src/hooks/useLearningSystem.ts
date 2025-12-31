import { useState, useCallback } from "react";
import { canAgentWriteMemory, canAgentWriteSummary, getAgentTier } from '@/lib/agentHierarchy';
import { Kernel } from "@/kernel/run";

interface AgentMemory {
  id: string;
  agent_type: string;
  query: string;
  response: string;
  success_score: number;
  usage_count: number;
  similarity?: number;
}

interface LearningStats {
  memory_count: number;
  avg_success_score: number;
  total_queries: number;
  cache_hit_rate: number;
  performance_history: Array<Record<string, unknown>>;
}

interface MemoryAuthResult {
  allowed: boolean;
  tier: string | null;
  reason?: string;
}

export const useLearningSystem = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Check if agent is authorized to write memory
   * GOVERNANCE: Enforces memory authority hierarchy
   */
  const checkMemoryAuthority = useCallback((agentType: string, isSummary: boolean = false): MemoryAuthResult => {
    const tier = getAgentTier(agentType);
    
    if (isSummary) {
      const allowed = canAgentWriteSummary(agentType);
      return {
        allowed,
        tier,
        reason: allowed ? undefined : `Agent ${agentType} (tier: ${tier}) cannot write summaries. Only CEO and Strategy agents allowed.`
      };
    }
    
    const allowed = canAgentWriteMemory(agentType);
    return {
      allowed,
      tier,
      reason: allowed ? undefined : `Agent ${agentType} (tier: ${tier}) cannot write long-term memories. Only AI CEO allowed.`
    };
  }, []);

  // Search for similar memories before generating a response
  const findSimilarMemories = useCallback(async (
    query: string,
    agentType: string,
    threshold = 0.75,
    limit = 3
  ): Promise<AgentMemory[]> => {
    const result = await Kernel.run("memory.search", {
      query,
      agentType,
      threshold,
      limit,
    }, {
      consent: { memory: true },
      budgetCents: 1,
      maxBudgetCents: 5,
    });

    if (!result.ok) {
      return [];
    }

    const data = result.result as { memories?: AgentMemory[] } | null;
    return data?.memories || [];
  }, []);

  // Save a successful interaction - ENFORCES MEMORY AUTHORITY
  const saveSuccessfulInteraction = useCallback(async (
    agentType: string,
    query: string,
    response: string,
    metadata: Record<string, unknown> = {},
    isSummary: boolean = false
  ): Promise<AgentMemory | null> => {
    // GOVERNANCE: Pre-check memory authority before making request
    const authCheck = checkMemoryAuthority(agentType, isSummary);
    if (!authCheck.allowed) {
      console.warn(`[GOVERNANCE] Memory write blocked: ${authCheck.reason}`);
      setError(authCheck.reason || 'Memory write not authorized');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await Kernel.run("memory.save", {
        agentType,
        query,
        response,
        metadata,
        isSummary,
      }, {
        consent: { memory: true },
        budgetCents: 2,
        maxBudgetCents: 10,
      });

      if (!result.ok) {
        const message = result.error?.message || "Failed to save memory";
        setError(message);
        return null;
      }

      const data = result.result as { memory?: AgentMemory } | null;
      return data?.memory ?? null;
    } finally {
      setIsLoading(false);
    }
  }, [checkMemoryAuthority]);

  // Submit feedback for a memory
  const submitFeedback = useCallback(async (
    memoryId: string | null,
    agentType: string,
    query: string,
    response: string,
    feedbackType: 'positive' | 'negative',
    feedbackValue: number = feedbackType === 'positive' ? 5 : 1
  ): Promise<boolean> => {
    const result = await Kernel.run("memory.feedback", {
      memoryId,
      agentType,
      query,
      response,
      feedbackType,
      feedbackValue,
      feedbackSource: "user",
    }, {
      consent: { memory: true },
      budgetCents: 1,
      maxBudgetCents: 5,
    });

    return result.ok;
  }, []);

  // Increment usage count when a cached response is used
  const incrementUsage = useCallback(async (memoryId: string): Promise<boolean> => {
    const result = await Kernel.run("memory.increment_usage", { memoryId }, {
      consent: { memory: true },
      budgetCents: 1,
      maxBudgetCents: 5,
    });
    return result.ok;
  }, []);

  // Get learning stats for an agent or all agents
  const getStats = useCallback(async (agentType?: string): Promise<LearningStats | null> => {
    const result = await Kernel.run("memory.stats", { agentType }, {
      consent: { memory: true },
      budgetCents: 1,
      maxBudgetCents: 5,
    });
    if (!result.ok) return null;
    const data = result.result as { stats?: LearningStats } | null;
    return data?.stats ?? null;
  }, []);

  // Delete a memory
  const deleteMemory = useCallback(async (memoryId: string): Promise<boolean> => {
    const result = await Kernel.run("memory.delete", { memoryId }, {
      consent: { memory: true },
      budgetCents: 1,
      maxBudgetCents: 5,
    });
    return result.ok;
  }, []);

  return {
    isLoading,
    error,
    findSimilarMemories,
    saveSuccessfulInteraction,
    submitFeedback,
    incrementUsage,
    getStats,
    deleteMemory,
  };
};

export default useLearningSystem;
