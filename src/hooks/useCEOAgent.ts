import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getOnboardingData } from "@/lib/onboarding";
import { useAuth } from "./useAuth";

interface ObjectionItem {
  objection: string;
  frequency: number;
  current_response: string;
  success_rate: number;
  suggested_response: string;
}

interface PromptImprovement {
  area: string;
  current_approach: string;
  suggested_approach: string;
  rationale: string;
  expected_impact: string;
}

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
  objectionAnalysis?: {
    objections: ObjectionItem[];
    total_conversations_analyzed: number;
  };
  promptImprovements?: {
    improvements: PromptImprovement[];
  };
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

interface ChatMessage {
  role: "user" | "ceo";
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ceo-agent`;

export const useCEOAgent = () => {
  const { userId, email } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<CEOAgentResponse | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);

  // Non-streaming request
  const askCEO = useCallback(async (
    query: string, 
    timeRange: string = "7d",
    conversationHistory: ChatMessage[] = [],
    visitorId?: string,
    intent?: string,
    extraContext?: Record<string, unknown>
  ): Promise<CEOAgentResponse | null> => {
    setIsLoading(true);
    setError(null);
    const onboardingContext = getOnboardingData(userId, email);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("ceo-agent", {
        body: { query, timeRange, conversationHistory, visitorId, intent, onboardingContext, extraContext },
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
  }, [email, userId]);

  // Streaming request
  const askCEOStream = useCallback(async (
    query: string,
    timeRange: string = "7d",
    conversationHistory: ChatMessage[] = [],
    onDelta: (chunk: string) => void,
    onDone: () => void,
    visitorId?: string
  ): Promise<void> => {
    setIsStreaming(true);
    setError(null);
    setStreamingContent("");

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ 
          query, 
          timeRange, 
          conversationHistory,
          visitorId,
          stream: true 
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!resp.ok) {
        if (resp.status === 429) {
          throw new Error("Rate limited. Please try again in a moment.");
        }
        if (resp.status === 402) {
          throw new Error("Usage limit reached. Please add credits.");
        }
        throw new Error(`Request failed: ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let fullContent = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            
            // Handle our custom metrics message
            if (parsed.type === "metrics") {
              setLastResponse(prev => ({
                ...prev,
                response: prev?.response || "",
                insights: prev?.insights || [],
                metrics: parsed.metrics
              } as CEOAgentResponse));
              continue;
            }
            
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              fullContent += content;
              setStreamingContent(fullContent);
              onDelta(content);
            }
          } catch {
            // Incomplete JSON, put it back
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              fullContent += content;
              setStreamingContent(fullContent);
              onDelta(content);
            }
          } catch { /* ignore */ }
        }
      }

      // Update last response with final content
      setLastResponse(prev => ({
        ...prev,
        response: fullContent,
        insights: prev?.insights || [],
        metrics: prev?.metrics || {
          totalVisitors: 0,
          totalConversations: 0,
          totalLeads: 0,
          conversionRate: 0,
          avgEngagement: 0,
          hotLeads: 0,
          warmLeads: 0,
          coldLeads: 0,
          trafficSources: {},
          outcomeBreakdown: {}
        }
      } as CEOAgentResponse));

      onDone();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return; // Cancelled, not an error
      }
      const errorMessage = err instanceof Error ? err.message : "Failed to get insights";
      setError(errorMessage);
      console.error("CEO Agent streaming error:", err);
      onDone();
    } finally {
      setIsStreaming(false);
    }
  }, []);

  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  }, []);

  // Preset queries
  const getTrafficAnalysis = useCallback((history: ChatMessage[] = []) => 
    askCEO("Analyze our traffic sources. Which sources bring the highest quality leads? What optimization opportunities do you see?", "7d", history),
  [askCEO]);

  const getConversionInsights = useCallback((history: ChatMessage[] = []) => 
    askCEO("What's our conversion funnel performance? Where are we losing leads and how can we improve?", "7d", history),
  [askCEO]);

  const getLeadQualityReport = useCallback((history: ChatMessage[] = []) => 
    askCEO("Give me a lead quality breakdown. What patterns do you see in our hot leads vs cold leads?", "7d", history),
  [askCEO]);

  const getSalesScriptRecommendations = useCallback((history: ChatMessage[] = []) => 
    askCEO("Based on conversation data, what's working in our sales script and what objections are causing us to lose deals?", "7d", history),
  [askCEO]);

  const getWeeklySummary = useCallback((history: ChatMessage[] = []) => 
    askCEO("Generate an executive summary of this week's performance. Include key wins, concerns, and recommended actions.", "7d", history),
  [askCEO]);

  // New transcript analysis presets
  const analyzeObjections = useCallback((history: ChatMessage[] = []) => 
    askCEO("Analyze our conversation transcripts. What are the most common objections? How are we currently handling them, and what could we do better?", "7d", history),
  [askCEO]);

  const findDropoffPatterns = useCallback((history: ChatMessage[] = []) => 
    askCEO("Look at our conversation transcripts and identify where leads are dropping off. At which phase do we lose the most leads, and why?", "7d", history),
  [askCEO]);

  const suggestPromptImprovements = useCallback((history: ChatMessage[] = []) => 
    askCEO("Based on transcript analysis, what specific improvements should we make to our chatbot prompts/scripts? Give me before and after examples.", "7d", history),
  [askCEO]);

  const analyzeSuccessfulCloses = useCallback((history: ChatMessage[] = []) => 
    askCEO("Look at conversations that converted. What patterns do you see? What language and approaches lead to successful closes?", "7d", history),
  [askCEO]);

  const getDailyBrief = useCallback(
    (context: {
      onboarding: Record<string, unknown>;
      planSummary: string;
      checklistProgress: { completed: number; total: number };
      lastDoNext?: { taskId?: string; text?: string; summary?: string } | null;
    }) => {
      const contextBlock = JSON.stringify(context, null, 2);
      const query = [
        "You are PipelinePRO's CEO execution coach.",
        "Create a concise Daily CEO Brief focused on revenue impact.",
        "Return JSON in a ```json block with fields: primaryFocus, whyItMatters, nextActions (1-3 steps, imperative).",
        "Stay deterministic; avoid fluff.",
        "Context:",
        contextBlock,
      ].join("\n");
      return askCEO(query, "1d", [], undefined, "ceo_daily_brief", context);
    },
    [askCEO]
  );

  return {
    askCEO,
    askCEOStream,
    cancelStream,
    isLoading,
    isStreaming,
    error,
    lastResponse,
    streamingContent,
    // Preset queries
    getTrafficAnalysis,
    getConversionInsights,
    getLeadQualityReport,
    getSalesScriptRecommendations,
    getWeeklySummary,
    // New transcript analysis presets
    analyzeObjections,
    findDropoffPatterns,
    suggestPromptImprovements,
    analyzeSuccessfulCloses,
    getDailyBrief,
  };
};
