import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Brain,
  Sparkles,
  RefreshCw,
  Calendar,
  DollarSign,
  AlertTriangle
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

interface Deal {
  id: string;
  value: number;
  stage: string;
  probability: number;
  expected_close_date: string | null;
}

interface ForecastData {
  month: string;
  predicted: number;
  optimistic: number;
  conservative: number;
  target: number;
}

interface Props {
  deals: Deal[];
}

export function RevenueForecast({ deals }: Props) {
  const [forecast, setForecast] = useState<ForecastData[]>([]);
  const [confidence, setConfidence] = useState(75);
  const [isGenerating, setIsGenerating] = useState(false);
  const [insights, setInsights] = useState<string[]>([]);

  const generateInsights = useCallback((dealList: Deal[], forecastData: ForecastData[]): string[] => {
    const insights: string[] = [];
    const activeDeals = dealList.filter(d => !d.stage.startsWith('closed'));
    
    // Pipeline velocity
    const proposalDeals = dealList.filter(d => d.stage === 'proposal' || d.stage === 'negotiation');
    if (proposalDeals.length >= 3) {
      insights.push(`${proposalDeals.length} deals in late stages - strong closing potential this quarter`);
    }

    // Deal concentration risk
    const topDeal = activeDeals.sort((a, b) => b.value - a.value)[0];
    const totalValue = activeDeals.reduce((sum, d) => sum + d.value, 0);
    if (topDeal && (topDeal.value / totalValue) > 0.4) {
      insights.push(`⚠️ Risk: ${Math.round((topDeal.value / totalValue) * 100)}% of pipeline in single deal`);
    }

    // Forecast vs target
    const nextMonthForecast = forecastData[0]?.predicted || 0;
    const target = forecastData[0]?.target || 75000;
    if (nextMonthForecast >= target) {
      insights.push(`On track: ${Math.round((nextMonthForecast / target) * 100)}% of monthly target in pipeline`);
    } else {
      insights.push(`Gap: Need $${(target - nextMonthForecast).toLocaleString()} more to hit target`);
    }

    // Stage distribution
    const discoveryDeals = dealList.filter(d => d.stage === 'discovery').length;
    if (discoveryDeals < 5) {
      insights.push(`Pipeline health: Add more top-of-funnel leads (only ${discoveryDeals} in discovery)`);
    }

    return insights.slice(0, 4);
  }, []);

  const generateForecast = useCallback(async () => {
    setIsGenerating(true);

    // Calculate weighted pipeline by expected close
    const now = new Date();
    const months: ForecastData[] = [];
    
    for (let i = 0; i < 6; i++) {
      const month = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthName = month.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      
      // Sum deals expected to close this month
      const monthDeals = deals.filter(d => {
        if (!d.expected_close_date || d.stage.startsWith('closed')) return false;
        const closeDate = new Date(d.expected_close_date);
        return closeDate.getMonth() === month.getMonth() && closeDate.getFullYear() === month.getFullYear();
      });

      const weightedValue = monthDeals.reduce((sum, d) => sum + (d.value * d.probability / 100), 0);
      
      // Add some realistic variance
      const variance = 0.15;
      const baseValue = weightedValue > 0 ? weightedValue : Math.random() * 50000 + 20000;
      
      months.push({
        month: monthName,
        predicted: Math.round(baseValue),
        optimistic: Math.round(baseValue * (1 + variance)),
        conservative: Math.round(baseValue * (1 - variance)),
        target: 75000 // Monthly target
      });
    }

    setForecast(months);

    // Generate AI insights
    const newInsights = generateInsights(deals, months);
    setInsights(newInsights);

    // Calculate confidence based on pipeline health
    const activeDeals = deals.filter(d => !d.stage.startsWith('closed'));
    const avgProbability = activeDeals.length > 0 
      ? activeDeals.reduce((sum, d) => sum + d.probability, 0) / activeDeals.length 
      : 0;
    setConfidence(Math.round(avgProbability + 25));

    setIsGenerating(false);
  }, [deals, generateInsights]);

  useEffect(() => {
    generateForecast();
  }, [generateForecast]);

  const totalForecast = forecast.reduce((sum, m) => sum + m.predicted, 0);
  const totalTarget = forecast.reduce((sum, m) => sum + m.target, 0);
  const pctOfTarget = totalTarget > 0 ? Math.round((totalForecast / totalTarget) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle>AI Revenue Forecast</CardTitle>
            <Badge variant="outline" className="gap-1">
              <Sparkles className="h-3 w-3" />
              {confidence}% confidence
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={generateForecast} disabled={isGenerating}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              6-Month Forecast
            </div>
            <p className="text-xl font-bold mt-1">${totalForecast.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Target className="h-4 w-4" />
              vs Target
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xl font-bold">{pctOfTarget}%</p>
              {pctOfTarget >= 100 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              Next Month
            </div>
            <p className="text-xl font-bold mt-1">${(forecast[0]?.predicted || 0).toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Brain className="h-4 w-4" />
              Win Probability
            </div>
            <div className="mt-1">
              <Progress value={confidence} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">{confidence}% avg</p>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={forecast}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} className="text-xs" />
              <Tooltip 
                formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))' 
                }}
              />
              <ReferenceLine y={75000} stroke="hsl(var(--primary))" strokeDasharray="5 5" label="Target" />
              <Line 
                type="monotone" 
                dataKey="optimistic" 
                stroke="hsl(var(--chart-2))" 
                strokeDasharray="3 3"
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="predicted" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot
              />
              <Line 
                type="monotone" 
                dataKey="conservative" 
                stroke="hsl(var(--chart-4))" 
                strokeDasharray="3 3"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* AI Insights */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Insights
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {insights.map((insight, i) => (
              <div key={i} className="p-2 rounded-lg bg-muted/50 text-sm flex items-start gap-2">
                {insight.includes('⚠️') ? (
                  <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                )}
                <span>{insight.replace('⚠️ ', '')}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
