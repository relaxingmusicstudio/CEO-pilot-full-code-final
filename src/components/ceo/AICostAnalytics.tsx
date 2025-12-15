import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { 
  DollarSign, 
  Zap, 
  Database, 
  TrendingUp, 
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  BarChart3,
  Cpu,
  ArrowDown,
  ArrowUp
} from "lucide-react";
import { toast } from "sonner";

interface CostMetrics {
  todayCost: number;
  weekCost: number;
  monthCost: number;
  todayRequests: number;
  weekRequests: number;
  monthRequests: number;
  cacheHitRate: number;
  cacheSavings: number;
  topAgents: Array<{ agent_name: string; cost: number; requests: number }>;
  rateLimitedCount: number;
  avgLatency: number;
  modelBreakdown: Array<{ model: string; cost: number; requests: number; percentage: number }>;
  costTrend: number; // Percentage change from previous period
}

interface RateLimitStatus {
  agent_name: string;
  current: number;
  limit: number;
  percentage: number;
}

const AICostAnalytics = () => {
  const [metrics, setMetrics] = useState<CostMetrics | null>(null);
  const [rateLimits, setRateLimits] = useState<RateLimitStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [dailyBudget] = useState(50);
  const [weeklyBudget] = useState(300);
  const [monthlyBudget] = useState(1000);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const previousWeek = new Date(weekAgo.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Fetch all cost logs for the month
      const { data: costLogs, error: costError } = await supabase
        .from('ai_cost_log')
        .select('*')
        .gte('created_at', monthAgo.toISOString());

      if (costError) throw costError;

      // Fetch cache stats
      const { data: cacheData } = await supabase
        .from('ai_response_cache')
        .select('hit_count, cost_estimate');

      // Fetch rate limit usage for current hour
      const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
      const { data: usageData } = await supabase
        .from('ai_rate_limit_usage')
        .select('*')
        .eq('window_type', 'hour')
        .eq('window_start', hourStart.toISOString());

      const { data: limitsData } = await supabase
        .from('ai_rate_limits')
        .select('*')
        .eq('is_active', true);

      const logs = costLogs || [];
      
      // Filter by time periods
      const todayLogs = logs.filter(l => new Date(l.created_at) >= today);
      const weekLogs = logs.filter(l => new Date(l.created_at) >= weekAgo);
      const previousWeekLogs = logs.filter(l => {
        const d = new Date(l.created_at);
        return d >= previousWeek && d < weekAgo;
      });

      // Calculate costs
      const todayCost = todayLogs.reduce((sum, log) => sum + (log.cost_usd || 0), 0);
      const weekCost = weekLogs.reduce((sum, log) => sum + (log.cost_usd || 0), 0);
      const monthCost = logs.reduce((sum, log) => sum + (log.cost_usd || 0), 0);
      const previousWeekCost = previousWeekLogs.reduce((sum, log) => sum + (log.cost_usd || 0), 0);
      
      // Cost trend (week over week)
      const costTrend = previousWeekCost > 0 
        ? ((weekCost - previousWeekCost) / previousWeekCost) * 100 
        : 0;

      // Request counts
      const todayRequests = todayLogs.length;
      const weekRequests = weekLogs.length;
      const monthRequests = logs.length;

      // Cache metrics
      const cachedRequests = todayLogs.filter(l => l.cached).length;
      const cacheHitRate = todayRequests > 0 ? (cachedRequests / todayRequests) * 100 : 0;
      const cacheSavings = todayLogs.filter(l => l.cached).reduce((sum, l) => sum + (l.cost_usd || 0), 0);

      // Other metrics
      const rateLimitedCount = todayLogs.filter(l => !l.success && l.error_message?.includes('Rate')).length;
      const successfulLogs = todayLogs.filter(l => l.success && l.latency_ms);
      const avgLatency = successfulLogs.length > 0 
        ? successfulLogs.reduce((sum, l) => sum + l.latency_ms, 0) / successfulLogs.length 
        : 0;

      // Aggregate by agent
      const agentCosts: Record<string, { cost: number; requests: number }> = {};
      weekLogs.forEach(log => {
        const agent = log.agent_name || 'unknown';
        if (!agentCosts[agent]) agentCosts[agent] = { cost: 0, requests: 0 };
        agentCosts[agent].cost += log.cost_usd || 0;
        agentCosts[agent].requests += 1;
      });

      const topAgents = Object.entries(agentCosts)
        .map(([agent_name, data]) => ({ agent_name, ...data }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 5);

      // Model breakdown
      const modelCosts: Record<string, { cost: number; requests: number }> = {};
      weekLogs.forEach(log => {
        const model = log.model || 'unknown';
        if (!modelCosts[model]) modelCosts[model] = { cost: 0, requests: 0 };
        modelCosts[model].cost += log.cost_usd || 0;
        modelCosts[model].requests += 1;
      });

      const totalModelCost = Object.values(modelCosts).reduce((sum, m) => sum + m.cost, 0);
      const modelBreakdown = Object.entries(modelCosts)
        .map(([model, data]) => ({ 
          model: model.split('/').pop() || model, 
          ...data,
          percentage: totalModelCost > 0 ? (data.cost / totalModelCost) * 100 : 0
        }))
        .sort((a, b) => b.cost - a.cost);

      setMetrics({
        todayCost,
        weekCost,
        monthCost,
        todayRequests,
        weekRequests,
        monthRequests,
        cacheHitRate,
        cacheSavings,
        topAgents,
        rateLimitedCount,
        avgLatency,
        modelBreakdown,
        costTrend
      });

      // Build rate limit status
      const limitStatuses: RateLimitStatus[] = (limitsData || []).map(limit => {
        const usage = (usageData || []).find(u => u.agent_name === limit.agent_name);
        const current = usage?.request_count || 0;
        const limitVal = limit.requests_per_hour;
        return {
          agent_name: limit.agent_name,
          current,
          limit: limitVal,
          percentage: (current / limitVal) * 100
        };
      }).filter(s => s.percentage > 50).sort((a, b) => b.percentage - a.percentage);

      setRateLimits(limitStatuses);

    } catch (error) {
      console.error('Error fetching AI metrics:', error);
      toast.error('Failed to load AI cost metrics');
    } finally {
      setLoading(false);
    }
  };

  const clearCache = async () => {
    try {
      const expired = new Date().toISOString();
      await supabase
        .from('ai_response_cache')
        .delete()
        .lt('expires_at', expired);
      toast.success('Expired cache entries cleared');
      fetchMetrics();
    } catch (error) {
      toast.error('Failed to clear cache');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const budgetUsage = metrics ? (metrics.todayCost / dailyBudget) * 100 : 0;
  const weekBudgetUsage = metrics ? (metrics.weekCost / weeklyBudget) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-accent" />
            AI Cost Analytics
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={clearCache}>
              <Database className="h-3 w-3 mr-1" />
              Clear Cache
            </Button>
            <Button variant="ghost" size="sm" onClick={fetchMetrics}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="today" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
          
          <TabsContent value="today" className="space-y-4">
            {/* Today's Budget Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Daily Budget</span>
                <span className="font-medium">
                  ${metrics?.todayCost.toFixed(2)} / ${dailyBudget}
                </span>
              </div>
              <Progress 
                value={Math.min(budgetUsage, 100)} 
                className={budgetUsage > 80 ? 'bg-destructive/20' : ''}
              />
              {budgetUsage > 80 && (
                <div className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  Approaching daily budget limit
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Database className="h-3 w-3" />
                  Cache Hit Rate
                </div>
                <div className="text-lg font-bold flex items-center gap-2">
                  {metrics?.cacheHitRate.toFixed(1)}%
                  {(metrics?.cacheHitRate || 0) > 30 && (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Saved ~${metrics?.cacheSavings.toFixed(3)}
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Clock className="h-3 w-3" />
                  Avg Latency
                </div>
                <div className="text-lg font-bold">
                  {metrics?.avgLatency.toFixed(0)}ms
                </div>
                <div className="text-xs text-muted-foreground">
                  {metrics?.todayRequests} requests today
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="week" className="space-y-4">
            {/* Weekly Budget Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Weekly Budget</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    ${metrics?.weekCost.toFixed(2)} / ${weeklyBudget}
                  </span>
                  {metrics?.costTrend !== 0 && (
                    <Badge variant={metrics?.costTrend! > 0 ? "destructive" : "default"} className="text-xs">
                      {metrics?.costTrend! > 0 ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
                      {Math.abs(metrics?.costTrend || 0).toFixed(1)}%
                    </Badge>
                  )}
                </div>
              </div>
              <Progress value={Math.min(weekBudgetUsage, 100)} />
            </div>

            {/* Model Breakdown */}
            {metrics?.modelBreakdown && metrics.modelBreakdown.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Cpu className="h-3 w-3" />
                  Model Usage Breakdown
                </h4>
                <div className="space-y-2">
                  {metrics.modelBreakdown.slice(0, 4).map(model => (
                    <div key={model.model} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate max-w-[120px]">{model.model}</span>
                        <span className="text-muted-foreground">
                          ${model.cost.toFixed(4)} ({model.percentage.toFixed(0)}%)
                        </span>
                      </div>
                      <Progress value={model.percentage} className="h-1" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="month" className="space-y-4">
            {/* Monthly Overview */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <DollarSign className="h-3 w-3" />
                  Monthly Spend
                </div>
                <div className="text-lg font-bold">
                  ${metrics?.monthCost.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Budget: ${monthlyBudget}
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <BarChart3 className="h-3 w-3" />
                  Total Requests
                </div>
                <div className="text-lg font-bold">
                  {metrics?.monthRequests.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">
                  ~${metrics?.monthRequests ? (metrics.monthCost / metrics.monthRequests * 1000).toFixed(2) : '0'}/1k
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Top Agents by Cost */}
        {metrics?.topAgents && metrics.topAgents.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Top Agents by Cost (7d)</h4>
            <div className="space-y-2">
              {metrics.topAgents.slice(0, 3).map(agent => (
                <div key={agent.agent_name} className="flex items-center justify-between text-sm">
                  <span className="truncate max-w-[150px]">{agent.agent_name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {agent.requests} calls
                    </Badge>
                    <span className="font-medium text-accent">
                      ${agent.cost.toFixed(4)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rate Limit Warnings */}
        {rateLimits.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-yellow-500" />
              Rate Limit Warnings
            </h4>
            <div className="space-y-2">
              {rateLimits.slice(0, 3).map(rl => (
                <div key={rl.agent_name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[120px]">{rl.agent_name}</span>
                    <span className={rl.percentage > 80 ? 'text-destructive' : 'text-yellow-500'}>
                      {rl.current}/{rl.limit}
                    </span>
                  </div>
                  <Progress 
                    value={rl.percentage} 
                    className={`h-1 ${rl.percentage > 80 ? 'bg-destructive/20' : 'bg-yellow-500/20'}`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Efficiency Tips */}
        <div className="border-t pt-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            {(metrics?.cacheHitRate || 0) < 20 
              ? "Tip: Low cache hit rate. Consider increasing cache TTL for repeated queries."
              : metrics?.rateLimitedCount && metrics.rateLimitedCount > 5
              ? "Tip: Multiple rate-limited requests. Review agent priority levels."
              : (metrics?.costTrend || 0) > 20
              ? "Tip: Costs trending up. Review high-usage agents and enable model tiering."
              : "AI costs are optimized. Great job!"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AICostAnalytics;
