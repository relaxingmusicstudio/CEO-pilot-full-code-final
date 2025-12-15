import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
} from "lucide-react";

interface ContextSummarizerProps {
  leadId?: string;
  contactId?: string;
  compact?: boolean;
}

interface ContextAnalysis {
  summary: string;
  nextBestAction: string;
  urgency: "low" | "medium" | "high";
  sentiment: "positive" | "neutral" | "negative";
  keyInsights: string[];
  lastActivity: string | null;
}

export function ContextSummarizer({ leadId, contactId, compact = false }: ContextSummarizerProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: analysis, isLoading, refetch } = useQuery({
    queryKey: ["context-summary", leadId, contactId],
    queryFn: async (): Promise<ContextAnalysis> => {
      // First, get the timeline
      const { data: timeline, error: tlError } = await supabase.functions.invoke(
        "get-customer-timeline",
        { body: { lead_id: leadId, contact_id: contactId, limit: 10 } }
      );

      if (tlError) throw tlError;

      const events = timeline?.timeline || [];
      if (events.length === 0) {
        return {
          summary: "No recent activity",
          nextBestAction: "Reach out to initiate contact",
          urgency: "low",
          sentiment: "neutral",
          keyInsights: [],
          lastActivity: null,
        };
      }

      // Build context string
      const contextStr = events
        .slice(0, 5)
        .map((e: Record<string, unknown>) => `${e.title}: ${e.description}`)
        .join("; ");

      // Call CEO agent for analysis
      const { data: ceoResponse, error: ceoError } = await supabase.functions.invoke(
        "ceo-agent",
        {
          body: {
            query: `Analyze this customer's recent interactions and provide:
1. A one-sentence summary of their current status
2. The single most important next action to take
3. Urgency level (low/medium/high)
4. Overall sentiment (positive/neutral/negative)
5. 2-3 key insights as bullet points

Recent activity: "${contextStr}"

Respond in JSON format: { "summary": "", "nextBestAction": "", "urgency": "", "sentiment": "", "keyInsights": [] }`,
            timeRange: "7d",
          },
        }
      );

      if (ceoError) throw ceoError;

      // Parse the response
      try {
        const responseText = ceoResponse?.response || "";
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            ...parsed,
            lastActivity: events[0]?.timestamp || null,
          };
        }
      } catch {
        // Fallback parsing
      }

      return {
        summary: ceoResponse?.response?.substring(0, 100) || "Analysis complete",
        nextBestAction: "Review timeline for next steps",
        urgency: "medium",
        sentiment: "neutral",
        keyInsights: [],
        lastActivity: events[0]?.timestamp || null,
      };
    },
    enabled: !!leadId || !!contactId,
    staleTime: 1000 * 60 * 5, // 5 minute cache
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "high":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "medium":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      default:
        return "bg-green-500/10 text-green-500 border-green-500/20";
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case "positive":
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "negative":
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <CheckCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (compact) {
    return (
      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-primary mt-0.5" />
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <Skeleton className="h-4 w-full" />
            ) : (
              <>
                <p className="text-sm font-medium">{analysis?.nextBestAction}</p>
                {analysis?.urgency === "high" && (
                  <Badge variant="outline" className="mt-1 text-xs bg-red-500/10 text-red-500">
                    Urgent
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Context Summary
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={isRefreshing || isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : analysis ? (
          <div className="space-y-4">
            {/* Summary */}
            <div>
              <p className="text-sm text-muted-foreground">{analysis.summary}</p>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={getUrgencyColor(analysis.urgency)}>
                {analysis.urgency} urgency
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                {getSentimentIcon(analysis.sentiment)}
                {analysis.sentiment}
              </Badge>
              {analysis.lastActivity && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(analysis.lastActivity).toLocaleDateString()}
                </Badge>
              )}
            </div>

            {/* Next Best Action */}
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-xs font-medium text-primary mb-1">Next Best Action</p>
              <div className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">{analysis.nextBestAction}</p>
              </div>
            </div>

            {/* Key Insights */}
            {analysis.keyInsights?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Key Insights</p>
                <ul className="space-y-1">
                  {analysis.keyInsights.map((insight, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-primary">•</span>
                      {insight}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Unable to analyze context</p>
        )}
      </CardContent>
    </Card>
  );
}
