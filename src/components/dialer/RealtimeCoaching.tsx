import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Brain, Mic, TrendingUp, TrendingDown, AlertTriangle, 
  Lightbulb, Volume2, Clock, MessageSquare, ThumbsUp 
} from "lucide-react";

interface CoachingTip {
  id: string;
  type: "suggestion" | "warning" | "positive";
  message: string;
  timestamp: string;
}

interface SentimentData {
  overall: number;
  trend: "improving" | "declining" | "stable";
  keywords: string[];
}

export const RealtimeCoaching = ({ isActive = false }: { isActive?: boolean }) => {
  const [sentiment, setSentiment] = useState<SentimentData>({
    overall: 72,
    trend: "improving",
    keywords: ["interested", "pricing", "timeline"],
  });

  const [coachingTips, setCoachingTips] = useState<CoachingTip[]>([
    { id: "1", type: "positive", message: "Great opening! Customer seems engaged.", timestamp: "0:15" },
    { id: "2", type: "suggestion", message: "Try asking about their current solution pain points.", timestamp: "1:30" },
    { id: "3", type: "warning", message: "Speaking pace is too fast. Slow down slightly.", timestamp: "2:45" },
    { id: "4", type: "positive", message: "Good use of the customer's name.", timestamp: "3:20" },
    { id: "5", type: "suggestion", message: "Now's a good time to mention the ROI calculator.", timestamp: "4:10" },
  ]);

  const [talkRatio, setTalkRatio] = useState({ agent: 45, customer: 55 });
  const [callDuration, setCallDuration] = useState(0);
  const [speakingPace, setSpeakingPace] = useState(145); // words per minute

  // Simulate call timer
  useEffect(() => {
    if (isActive) {
      const timer = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isActive]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getSentimentColor = (value: number) => {
    if (value >= 70) return "text-green-500";
    if (value >= 40) return "text-yellow-500";
    return "text-red-500";
  };

  const getTipIcon = (type: string) => {
    switch (type) {
      case "positive": return <ThumbsUp className="h-3 w-3 text-green-500" />;
      case "warning": return <AlertTriangle className="h-3 w-3 text-yellow-500" />;
      default: return <Lightbulb className="h-3 w-3 text-blue-500" />;
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-primary" />
            Real-Time AI Coaching
          </CardTitle>
          {isActive && (
            <Badge variant="destructive" className="animate-pulse gap-1">
              <Mic className="h-3 w-3" />
              Live
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Call Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <div className="text-lg font-bold">{formatDuration(callDuration)}</div>
            <div className="text-xs text-muted-foreground">Duration</div>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <Volume2 className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <div className={`text-lg font-bold ${speakingPace > 160 ? "text-yellow-500" : "text-green-500"}`}>
              {speakingPace}
            </div>
            <div className="text-xs text-muted-foreground">WPM</div>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <MessageSquare className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <div className={`text-lg font-bold ${getSentimentColor(sentiment.overall)}`}>
              {sentiment.overall}%
            </div>
            <div className="text-xs text-muted-foreground">Sentiment</div>
          </div>
        </div>

        {/* Talk Ratio */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span>Agent ({talkRatio.agent}%)</span>
            <span>Talk Ratio</span>
            <span>Customer ({talkRatio.customer}%)</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden">
            <div className="bg-primary" style={{ width: `${talkRatio.agent}%` }} />
            <div className="bg-muted-foreground/30" style={{ width: `${talkRatio.customer}%` }} />
          </div>
          <p className="text-xs text-center text-muted-foreground">
            {talkRatio.agent < 40 ? "Great listening ratio!" : talkRatio.agent > 60 ? "Let the customer speak more" : "Good balance"}
          </p>
        </div>

        {/* Sentiment Trend */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Sentiment</span>
            <div className="flex items-center gap-1">
              {sentiment.trend === "improving" ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : sentiment.trend === "declining" ? (
                <TrendingDown className="h-4 w-4 text-red-500" />
              ) : null}
              <span className={`text-xs capitalize ${
                sentiment.trend === "improving" ? "text-green-500" : 
                sentiment.trend === "declining" ? "text-red-500" : "text-muted-foreground"
              }`}>
                {sentiment.trend}
              </span>
            </div>
          </div>
          <Progress value={sentiment.overall} className="h-2" />
          <div className="flex flex-wrap gap-1">
            {sentiment.keywords.map(kw => (
              <Badge key={kw} variant="secondary" className="text-xs">{kw}</Badge>
            ))}
          </div>
        </div>

        {/* Live Coaching Tips */}
        <div className="space-y-2">
          <span className="text-sm font-medium">Live Coaching</span>
          <ScrollArea className="h-[180px]">
            <div className="space-y-2">
              {coachingTips.map(tip => (
                <div key={tip.id} className={`flex items-start gap-2 p-2 rounded-lg text-sm ${
                  tip.type === "positive" ? "bg-green-500/10" :
                  tip.type === "warning" ? "bg-yellow-500/10" : "bg-blue-500/10"
                }`}>
                  <div className="mt-0.5">{getTipIcon(tip.type)}</div>
                  <div className="flex-1">
                    <p className="text-sm">{tip.message}</p>
                    <span className="text-xs text-muted-foreground">{tip.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
};
