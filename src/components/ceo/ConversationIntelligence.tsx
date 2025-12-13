import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, AlertCircle, ThumbsUp, ThumbsDown, TrendingUp } from "lucide-react";

interface Conversation {
  id: string;
  messages: { role: string; content: string }[];
  outcome?: string;
  conversationPhase?: string;
}

interface ConversationIntelligenceProps {
  conversations: Conversation[];
  className?: string;
}

const ConversationIntelligence = ({ conversations, className = "" }: ConversationIntelligenceProps) => {
  const insights = useMemo(() => {
    // Common objection patterns to detect
    const objectionPatterns = [
      { pattern: /too expensive|cost too much|price|budget|afford/i, label: "Price Objection" },
      { pattern: /not ready|need time|think about|later|not now/i, label: "Timing Objection" },
      { pattern: /already have|using another|competitor|alternative/i, label: "Competition Objection" },
      { pattern: /not sure|don't understand|confused|how does/i, label: "Understanding Gap" },
      { pattern: /need approval|check with|decision maker|my boss/i, label: "Authority Objection" },
      { pattern: /not interested|don't need|no thanks/i, label: "Interest Objection" },
    ];

    // Positive signals to detect
    const buyingSignals = [
      { pattern: /how do i start|sign up|get started|next steps/i, label: "Ready to Start" },
      { pattern: /pricing|plans|packages|options/i, label: "Pricing Interest" },
      { pattern: /demo|trial|test|try/i, label: "Demo Request" },
      { pattern: /when can|how soon|timeline/i, label: "Timeline Interest" },
      { pattern: /sounds great|perfect|exactly what/i, label: "Positive Sentiment" },
    ];

    const objectionCounts: Record<string, number> = {};
    const buyingSignalCounts: Record<string, number> = {};
    const phaseDropoffs: Record<string, number> = {};
    let totalMessages = 0;
    let avgMessageCount = 0;

    conversations.forEach(conv => {
      const allText = conv.messages.map(m => m.content).join(" ");
      totalMessages += conv.messages.length;

      // Count objections
      objectionPatterns.forEach(({ pattern, label }) => {
        if (pattern.test(allText)) {
          objectionCounts[label] = (objectionCounts[label] || 0) + 1;
        }
      });

      // Count buying signals
      buyingSignals.forEach(({ pattern, label }) => {
        if (pattern.test(allText)) {
          buyingSignalCounts[label] = (buyingSignalCounts[label] || 0) + 1;
        }
      });

      // Track phase dropoffs
      if (conv.conversationPhase && conv.outcome !== "converted") {
        phaseDropoffs[conv.conversationPhase] = (phaseDropoffs[conv.conversationPhase] || 0) + 1;
      }
    });

    avgMessageCount = conversations.length > 0 ? Math.round(totalMessages / conversations.length) : 0;

    // Sort objections by frequency
    const topObjections = Object.entries(objectionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const topBuyingSignals = Object.entries(buyingSignalCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const dropoffPhases = Object.entries(phaseDropoffs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return {
      totalConversations: conversations.length,
      avgMessageCount,
      topObjections,
      topBuyingSignals,
      dropoffPhases,
      conversionRate: conversations.length > 0 
        ? ((conversations.filter(c => c.outcome === "converted").length / conversations.length) * 100).toFixed(1)
        : "0",
    };
  }, [conversations]);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Conversation Intelligence
          </div>
          <Badge variant="outline" className="text-xs">
            {insights.totalConversations} analyzed
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-lg font-bold">{insights.avgMessageCount}</p>
            <p className="text-xs text-muted-foreground">Avg Messages</p>
          </div>
          <div className="p-2 bg-green-500/10 rounded-lg">
            <p className="text-lg font-bold text-green-600">{insights.conversionRate}%</p>
            <p className="text-xs text-muted-foreground">Converted</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-lg font-bold">{insights.topObjections.length}</p>
            <p className="text-xs text-muted-foreground">Objection Types</p>
          </div>
        </div>

        {/* Top Objections */}
        {insights.topObjections.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-sm font-medium text-red-500">
              <ThumbsDown className="h-3 w-3" />
              Top Objections
            </div>
            <div className="space-y-1">
              {insights.topObjections.map(([label, count]) => (
                <div key={label} className="flex items-center justify-between p-2 bg-red-500/5 rounded-lg">
                  <span className="text-sm">{label}</span>
                  <Badge variant="outline" className="text-xs">{count}x</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buying Signals */}
        {insights.topBuyingSignals.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-sm font-medium text-green-500">
              <ThumbsUp className="h-3 w-3" />
              Buying Signals Detected
            </div>
            <div className="space-y-1">
              {insights.topBuyingSignals.map(([label, count]) => (
                <div key={label} className="flex items-center justify-between p-2 bg-green-500/5 rounded-lg">
                  <span className="text-sm">{label}</span>
                  <Badge variant="outline" className="text-xs">{count}x</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dropoff Phases */}
        {insights.dropoffPhases.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-sm font-medium text-yellow-600">
              <AlertCircle className="h-3 w-3" />
              High Dropoff Phases
            </div>
            <div className="flex flex-wrap gap-1">
              {insights.dropoffPhases.map(([phase, count]) => (
                <Badge key={phase} variant="secondary" className="text-xs">
                  {phase}: {count} dropoffs
                </Badge>
              ))}
            </div>
          </div>
        )}

        {conversations.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No conversations to analyze</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ConversationIntelligence;
