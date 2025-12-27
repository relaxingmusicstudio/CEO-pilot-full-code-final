import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Brain, 
  MessageSquare, 
  AlertTriangle, 
  Users, 
  TrendingUp,
  Zap,
  Target,
  Shield,
  DollarSign
} from "lucide-react";

interface Deal {
  id: string;
  name: string;
  company: string | null;
  value: number;
  stage: string;
  probability: number;
  buying_signals: BuyingSignal[];
  competitor_mentions: CompetitorMention[];
  sentiment_score: number;
}

interface BuyingSignal {
  type?: string;
  text?: string;
  strength?: number;
}

interface CompetitorMention {
  name?: string;
  mentions?: number;
  avgDealValue?: number;
  threatLevel?: string;
}

interface Props {
  deals: Deal[];
}

export function RevenueIntelligence({ deals }: Props) {
  const [selectedTab, setSelectedTab] = useState("signals");

  // Analyze buying signals across all deals
  const allSignals = deals.flatMap(d => {
    const signals = Array.isArray(d.buying_signals) ? d.buying_signals : [];
    return signals.map(s => ({ ...s, dealName: d.name, dealId: d.id }));
  });

  // Analyze competitor mentions
  const allCompetitors = deals.flatMap(d => {
    const mentions = Array.isArray(d.competitor_mentions) ? d.competitor_mentions : [];
    return mentions.map(m => ({ ...m, dealName: d.name, dealId: d.id }));
  });

  // Calculate sentiment distribution
  const sentimentData = deals.reduce((acc, d) => {
    if (d.sentiment_score >= 0.7) acc.positive++;
    else if (d.sentiment_score >= 0.4) acc.neutral++;
    else acc.negative++;
    return acc;
  }, { positive: 0, neutral: 0, negative: 0 });

  // Identify at-risk deals
  const atRiskDeals = deals.filter(d => 
    d.sentiment_score < 0.4 || 
    d.probability < 30 ||
    (d.stage === 'proposal' && d.probability < 50)
  );

  // Mock buying signals for demo
  const mockSignals = [
    { type: 'urgency', text: 'Asked about timeline for installation', dealName: 'Smith HVAC Replacement', strength: 0.9 },
    { type: 'budget', text: 'Confirmed budget of $15,000', dealName: 'Johnson AC System', strength: 0.85 },
    { type: 'decision', text: 'Scheduled follow-up with decision maker', dealName: 'Anderson Heating', strength: 0.8 },
    { type: 'competitor', text: 'Mentioned competitor pricing', dealName: 'Wilson Ductwork', strength: 0.6 },
    { type: 'technical', text: 'Asked detailed technical questions', dealName: 'Davis Commercial HVAC', strength: 0.75 },
  ];

  const displaySignals = allSignals.length > 0 ? allSignals : mockSignals;

  // Mock competitor analysis
  const competitorAnalysis = [
    { name: 'ABC HVAC', mentions: 4, avgDealValue: 12000, threatLevel: 'medium' },
    { name: 'CoolAir Solutions', mentions: 2, avgDealValue: 18000, threatLevel: 'high' },
    { name: 'HeatingPros', mentions: 3, avgDealValue: 8000, threatLevel: 'low' },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <CardTitle>Revenue Intelligence</CardTitle>
          <Badge variant="outline" className="gap-1 ml-auto">
            <Zap className="h-3 w-3" />
            AI Powered
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="signals" className="gap-1">
              <TrendingUp className="h-3 w-3" />
              Signals
            </TabsTrigger>
            <TabsTrigger value="competitors" className="gap-1">
              <Shield className="h-3 w-3" />
              Competitors
            </TabsTrigger>
            <TabsTrigger value="sentiment" className="gap-1">
              <MessageSquare className="h-3 w-3" />
              Sentiment
            </TabsTrigger>
            <TabsTrigger value="risks" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              At Risk
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signals" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Buying signals extracted from conversations and interactions
            </p>
            {displaySignals.slice(0, 5).map((signal, i) => {
              const signalType = signal.type ?? "signal";
              const signalText = signal.text ?? "Signal detected";
              const signalStrength = typeof signal.strength === "number" ? signal.strength : 0;

              return (
                <div key={i} className="p-3 rounded-lg border bg-card">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          signalType === 'urgency' ? 'default' :
                          signalType === 'budget' ? 'secondary' :
                          signalType === 'decision' ? 'outline' : 'outline'
                        }>
                          {signalType}
                        </Badge>
                        <span className="text-sm text-muted-foreground">{signal.dealName}</span>
                      </div>
                      <p className="text-sm mt-1">{signalText}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Strength</p>
                      <Progress value={signalStrength * 100} className="w-16 h-2 mt-1" />
                    </div>
                  </div>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="competitors" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Competitor mentions and threat analysis
            </p>
            {competitorAnalysis.map((comp, i) => (
              <div key={i} className="p-3 rounded-lg border bg-card">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span className="font-medium">{comp.name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {comp.mentions} mentions • Avg deal: ${comp.avgDealValue.toLocaleString()}
                    </p>
                  </div>
                  <Badge variant={
                    comp.threatLevel === 'high' ? 'destructive' :
                    comp.threatLevel === 'medium' ? 'default' : 'secondary'
                  }>
                    {comp.threatLevel} threat
                  </Badge>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="sentiment" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Overall sentiment analysis across deal conversations
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-green-500/10 text-center">
                <TrendingUp className="h-8 w-8 text-green-500 mx-auto" />
                <p className="text-2xl font-bold mt-2">{sentimentData.positive}</p>
                <p className="text-sm text-muted-foreground">Positive</p>
              </div>
              <div className="p-4 rounded-lg bg-yellow-500/10 text-center">
                <Target className="h-8 w-8 text-yellow-500 mx-auto" />
                <p className="text-2xl font-bold mt-2">{sentimentData.neutral}</p>
                <p className="text-sm text-muted-foreground">Neutral</p>
              </div>
              <div className="p-4 rounded-lg bg-red-500/10 text-center">
                <AlertTriangle className="h-8 w-8 text-red-500 mx-auto" />
                <p className="text-2xl font-bold mt-2">{sentimentData.negative}</p>
                <p className="text-sm text-muted-foreground">Negative</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm">
                <strong>AI Recommendation:</strong> Focus on deals with neutral sentiment - 
                they have the highest potential for positive conversion with the right engagement.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="risks" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Deals requiring immediate attention
            </p>
            {atRiskDeals.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-2 text-green-500" />
                <p>No at-risk deals detected</p>
              </div>
            ) : (
              atRiskDeals.map((deal, i) => (
                <div key={i} className="p-3 rounded-lg border border-red-500/30 bg-red-500/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{deal.name}</p>
                      <p className="text-sm text-muted-foreground">{deal.company}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-red-500">${deal.value.toLocaleString()}</p>
                      <Badge variant="destructive">{deal.probability}% probability</Badge>
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    Sentiment score: {(deal.sentiment_score * 100).toFixed(0)}%
                  </div>
                </div>
              ))
            )}
            {atRiskDeals.length > 0 && (
              <Button variant="outline" className="w-full">
                <Zap className="h-4 w-4 mr-2" />
                Generate AI Recovery Plan
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
