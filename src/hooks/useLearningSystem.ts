import { useState, useCallback } from 'react';
import { canAgentWriteMemory, canAgentWriteSummary, getAgentTier } from '@/lib/agentHierarchy';

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

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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
    try {
      const response = await fetch(`${baseUrl}/functions/v1/agent-memory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          action: 'search',
          query,
          agent_type: agentType,
          threshold,
          limit,
        }),
      });

      if (!response.ok) return [];

      const data = await response.json();
      return data.memories || [];
    } catch (err) {
      console.error('Error searching memories:', err);
      return [];
    }
  }, [baseUrl, apiKey]);

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
      const res = await fetch(`${baseUrl}/functions/v1/agent-memory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          action: 'save',
          agent_type: agentType,
          query,
          response,
          metadata,
          is_summary: isSummary,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        if (errorData.error === 'GOVERNANCE_VIOLATION') {
          console.warn(`[GOVERNANCE] Server rejected memory write: ${errorData.message}`);
          throw new Error(errorData.message);
        }
        throw new Error('Failed to save memory');
      }

      const data = await res.json();
      return data.memory;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, apiKey, checkMemoryAuthority]);

  // Submit feedback for a memory
  const submitFeedback = useCallback(async (
    memoryId: string | null,
    agentType: string,
    query: string,
    response: string,
    feedbackType: 'positive' | 'negative',
    feedbackValue: number = feedbackType === 'positive' ? 5 : 1
  ): Promise<boolean> => {
    try {
      const res = await fetch(`${baseUrl}/functions/v1/learn-from-success`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          memory_id: memoryId,
          agent_type: agentType,
          query,
          response,
          feedback_type: feedbackType,
          feedback_value: feedbackValue,
          feedback_source: 'user',
        }),
      });

      return res.ok;
    } catch (err) {
      console.error('Error submitting feedback:', err);
      return false;
    }
  }, [baseUrl, apiKey]);

  // Increment usage count when a cached response is used
  const incrementUsage = useCallback(async (memoryId: string): Promise<boolean> => {
    try {
      const res = await fetch(`${baseUrl}/functions/v1/agent-memory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          action: 'increment_usage',
          memory_id: memoryId,
        }),
      });

      return res.ok;
    } catch (err) {
      console.error('Error incrementing usage:', err);
      return false;
    }
  }, [baseUrl, apiKey]);

  // Get learning stats for an agent or all agents
  const getStats = useCallback(async (agentType?: string): Promise<LearningStats | null> => {
    try {
      const res = await fetch(`${baseUrl}/functions/v1/agent-memory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          action: 'stats',
          agent_type: agentType,
        }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      return data.stats;
    } catch (err) {
      console.error('Error getting stats:', err);
      return null;
    }
  }, [baseUrl, apiKey]);

  // Delete a memory
  const deleteMemory = useCallback(async (memoryId: string): Promise<boolean> => {
    try {
      const res = await fetch(`${baseUrl}/functions/v1/agent-memory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          action: 'delete',
          memory_id: memoryId,
        }),
      });

      return res.ok;
    } catch (err) {
      console.error('Error deleting memory:', err);
      return false;
    }
  }, [baseUrl, apiKey]);

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
