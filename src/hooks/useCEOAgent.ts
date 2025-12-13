import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CEOAgentResponse {
  response: string;
  insights: Array<{
    insight_type: string;
    title: string;
    summary: string;
    data_points?: string[];
    recommendations: string[];
    priority: "high" | "medium" | "low";
  }>;
  metrics: {
    totalVisitors: number;
    totalConversations: number;
    totalLeads: number;
    conversionRate: number;
    avgEngagement: number;
    hotLeads: number;
    warmLeads: number;
    coldLeads: number;
    trafficSources: Record<string, number>;
    outcomeBreakdown: Record<string, number>;
  };
}

export const useCEOAgent = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<CEOAgentResponse | null>(null);

  const askCEO = useCallback(async (query: string, timeRange: string = "7d"): Promise<CEOAgentResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("ceo-agent", {
        body: { query, timeRange },
      });

      if (invokeError) throw invokeError;

      setLastResponse(data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to get insights";
      setError(errorMessage);
      console.error("CEO Agent error:", err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Preset queries for common analytics needs
  const getTrafficAnalysis = useCallback(() => 
    askCEO("Analyze our traffic sources. Which sources bring the highest quality leads? What optimization opportunities do you see?"),
  [askCEO]);

  const getConversionInsights = useCallback(() => 
    askCEO("What's our conversion funnel performance? Where are we losing leads and how can we improve?"),
  [askCEO]);

  const getLeadQualityReport = useCallback(() => 
    askCEO("Give me a lead quality breakdown. What patterns do you see in our hot leads vs cold leads?"),
  [askCEO]);

  const getSalesScriptRecommendations = useCallback(() => 
    askCEO("Based on conversation data, what's working in our sales script and what objections are causing us to lose deals?"),
  [askCEO]);

  const getWeeklySummary = useCallback(() => 
    askCEO("Generate an executive summary of this week's performance. Include key wins, concerns, and recommended actions."),
  [askCEO]);

  return {
    askCEO,
    isLoading,
    error,
    lastResponse,
    // Preset queries
    getTrafficAnalysis,
    getConversionInsights,
    getLeadQualityReport,
    getSalesScriptRecommendations,
    getWeeklySummary,
  };
};
