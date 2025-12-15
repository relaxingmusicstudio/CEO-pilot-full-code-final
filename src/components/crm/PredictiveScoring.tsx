import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Brain, Zap, Clock, DollarSign, Target } from "lucide-react";

interface ScoringFactor {
  name: string;
  weight: number;
  score: number;
  trend: "up" | "down" | "stable";
}

interface LeadPrediction {
  id: string;
  name: string;
  company: string;
  currentScore: number;
  predictedScore: number;
  conversionProbability: number;
  expectedValue: number;
  timeToClose: number;
  factors: ScoringFactor[];
}

const mockPredictions: LeadPrediction[] = [
  {
    id: "1",
    name: "John Smith",
    company: "Enterprise Co",
    currentScore: 72,
    predictedScore: 85,
    conversionProbability: 78,
    expectedValue: 15000,
    timeToClose: 7,
    factors: [
      { name: "Engagement", weight: 25, score: 90, trend: "up" },
      { name: "Company Size", weight: 20, score: 85, trend: "stable" },
      { name: "Budget Fit", weight: 20, score: 75, trend: "up" },
      { name: "Timeline", weight: 15, score: 60, trend: "down" },
      { name: "Decision Maker", weight: 20, score: 95, trend: "stable" },
    ],
  },
  {
    id: "2",
    name: "Sarah Jones",
    company: "Tech Startup",
    currentScore: 58,
    predictedScore: 70,
    conversionProbability: 45,
    expectedValue: 8000,
    timeToClose: 14,
    factors: [
      { name: "Engagement", weight: 25, score: 65, trend: "up" },
      { name: "Company Size", weight: 20, score: 50, trend: "stable" },
      { name: "Budget Fit", weight: 20, score: 55, trend: "stable" },
      { name: "Timeline", weight: 15, score: 70, trend: "up" },
      { name: "Decision Maker", weight: 20, score: 60, trend: "down" },
    ],
  },
];

export const PredictiveScoring = () => {
  const getTrendIcon = (trend: "up" | "down" | "stable") => {
    switch (trend) {
      case "up": return <TrendingUp className="h-3 w-3 text-green-500" />;
      case "down": return <TrendingDown className="h-3 w-3 text-red-500" />;
      default: return null;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-5 w-5 text-primary" />
          AI Predictive Scoring
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {mockPredictions.map((lead) => (
          <Card key={lead.id} className="bg-muted/30">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{lead.name}</h4>
                  <p className="text-sm text-muted-foreground">{lead.company}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Current</div>
                    <div className={`text-lg font-bold ${getScoreColor(lead.currentScore)}`}>
                      {lead.currentScore}
                    </div>
                  </div>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Predicted</div>
                    <div className={`text-lg font-bold ${getScoreColor(lead.predictedScore)}`}>
                      {lead.predictedScore}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
                    <Target className="h-3 w-3" /> Conversion
                  </div>
                  <div className="font-semibold text-primary">{lead.conversionProbability}%</div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
                    <DollarSign className="h-3 w-3" /> Expected
                  </div>
                  <div className="font-semibold text-green-500">${lead.expectedValue.toLocaleString()}</div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
                    <Clock className="h-3 w-3" /> Close In
                  </div>
                  <div className="font-semibold">{lead.timeToClose} days</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs text-muted-foreground font-medium">Scoring Factors</div>
                {lead.factors.map((factor) => (
                  <div key={factor.name} className="flex items-center gap-2">
                    <span className="text-xs w-24 truncate">{factor.name}</span>
                    <Progress value={factor.score} className="flex-1 h-2" />
                    <span className="text-xs w-8 text-right">{factor.score}</span>
                    {getTrendIcon(factor.trend)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
};
