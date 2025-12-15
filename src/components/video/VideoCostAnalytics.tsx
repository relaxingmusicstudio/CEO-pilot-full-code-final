import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  PieChart,
  BarChart3,
  RefreshCw,
  Video,
  Clock,
  Sparkles,
} from "lucide-react";
import {
  PieChart as RechartsPie,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

interface CostAnalytics {
  total_cost_cents: number;
  total_videos: number;
  avg_cost_per_video: number;
  by_provider: {
    provider: string;
    count: number;
    cost: number;
    cost_dollars: string;
    avg_cost: string;
  }[];
  by_day: {
    date: string;
    cost: number;
    count: number;
    cost_dollars: string;
  }[];
  ai_decisions: Record<string, number>;
}

interface SavingsReport {
  actual_cost_cents: number;
  actual_cost_dollars: string;
  total_duration_seconds: number;
  total_savings_cents: number;
  total_savings_dollars: string;
  savings_percentage: string;
  alternatives: {
    provider: string;
    would_have_cost: number;
    would_have_cost_dollars: string;
    savings: number;
    savings_dollars: string;
  }[];
}

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function VideoCostAnalytics() {
  const [analytics, setAnalytics] = useState<CostAnalytics | null>(null);
  const [savings, setSavings] = useState<SavingsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"7" | "30" | "90">("30");

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const [analyticsRes, savingsRes] = await Promise.all([
        supabase.functions.invoke("video-cost-agent", {
          body: { action: "analyze_spend", days: parseInt(period) },
        }),
        supabase.functions.invoke("video-cost-agent", {
          body: { action: "get_savings_report", days: parseInt(period) },
        }),
      ]);

      if (analyticsRes.data) {
        setAnalytics({
          total_cost_cents: analyticsRes.data.totals?.cost_cents || 0,
          total_videos: analyticsRes.data.totals?.videos || 0,
          avg_cost_per_video: parseFloat(analyticsRes.data.totals?.avg_cost_per_video || "0"),
          by_provider: analyticsRes.data.by_provider || [],
          by_day: analyticsRes.data.by_day || [],
          ai_decisions: analyticsRes.data.ai_decisions || {},
        });
      }

      if (savingsRes.data) {
        setSavings(savingsRes.data);
      }
    } catch (error) {
      console.error("Error fetching analytics:", error);
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const providerPieData = analytics?.by_provider.map((p, i) => ({
    name: p.provider.replace("_", "/"),
    value: p.cost,
    color: COLORS[i % COLORS.length],
  })) || [];

  const decisionData = Object.entries(analytics?.ai_decisions || {}).map(([key, value]) => ({
    name: key.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase()),
    count: value,
  }));

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Video Cost Analytics
        </h2>
        <div className="flex gap-2">
          {["7", "30", "90"].map((p) => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(p as "7" | "30" | "90")}
            >
              {p}d
            </Button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <DollarSign className="h-4 w-4" />
              Total Spend
            </div>
            <p className="text-2xl font-bold">{formatCurrency(analytics?.total_cost_cents || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Video className="h-4 w-4" />
              Videos Generated
            </div>
            <p className="text-2xl font-bold">{analytics?.total_videos || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <BarChart3 className="h-4 w-4" />
              Avg Cost/Video
            </div>
            <p className="text-2xl font-bold">{formatCurrency(analytics?.avg_cost_per_video || 0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-green-600 text-sm mb-1">
              <TrendingDown className="h-4 w-4" />
              Total Savings
            </div>
            <p className="text-2xl font-bold text-green-600">
              {savings?.total_savings_dollars || "$0.00"}
            </p>
            <p className="text-xs text-green-600/70">
              {savings?.savings_percentage || "0"}% vs. highest-cost option
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="breakdown" className="w-full">
        <TabsList>
          <TabsTrigger value="breakdown">Spend by Provider</TabsTrigger>
          <TabsTrigger value="trend">Cost Trend</TabsTrigger>
          <TabsTrigger value="decisions">AI Decisions</TabsTrigger>
          <TabsTrigger value="savings">Savings Report</TabsTrigger>
        </TabsList>

        <TabsContent value="breakdown">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <PieChart className="h-4 w-4" />
                Spend by Provider
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={providerPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {providerPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => formatCurrency(value)}
                      />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {analytics?.by_provider.map((provider, i) => (
                    <div key={provider.provider} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        <span className="capitalize">{provider.provider.replace("_", "/")}</span>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{provider.cost_dollars}</p>
                        <p className="text-xs text-muted-foreground">
                          {provider.count} videos • avg {provider.avg_cost}¢
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trend">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Cost Trend ({period} days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics?.by_day || []}>
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis 
                      tickFormatter={(value) => `$${(value / 100).toFixed(0)}`}
                    />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      labelFormatter={(label) => new Date(label).toLocaleDateString()}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="cost" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="decisions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                AI Routing Decisions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={decisionData} layout="vertical">
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={120} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                <p>The AI router optimizes provider selection based on:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li><strong>Cost Priority:</strong> Minimize spend while meeting quality requirements</li>
                  <li><strong>Quality Priority:</strong> Best output quality regardless of cost</li>
                  <li><strong>Balanced:</strong> Equal weight to cost and quality</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="savings">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-green-500" />
                Savings Report
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4">
                <p className="text-sm text-green-600 mb-1">Through AI-powered provider routing</p>
                <p className="text-3xl font-bold text-green-600">
                  {savings?.total_savings_dollars || "$0.00"} saved
                </p>
                <p className="text-sm text-green-600/70">
                  {savings?.savings_percentage || "0"}% savings vs. using only the most expensive provider
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Cost Comparison</h4>
                <div className="space-y-2">
                  {savings?.alternatives.map((alt) => (
                    <div 
                      key={alt.provider}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <span className="capitalize">{alt.provider.replace("_", "/")}</span>
                        {alt.savings > 0 && (
                          <Badge variant="secondary" className="text-green-600">
                            Save {alt.savings_dollars}
                          </Badge>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{alt.would_have_cost_dollars}</p>
                        <p className="text-xs text-muted-foreground">
                          if used exclusively
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Actual Spend (AI-optimized)</span>
                    <span className="text-xl font-bold">{savings?.actual_cost_dollars || "$0.00"}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {savings?.total_duration_seconds || 0} seconds of video generated
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}