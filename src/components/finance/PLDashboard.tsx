import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  Loader2,
  RefreshCw,
} from "lucide-react";

interface PnLSummary {
  revenue: number;
  mrr: number;
  ai_costs: number;
  operating_expenses: number;
  gross_profit: number;
  gross_margin: number;
  net_profit: number;
  net_margin: number;
}

interface PnLData {
  period: string;
  summary: PnLSummary;
  expenses_breakdown: Record<string, number>;
  trend_data: Array<{ date: string; revenue: number; costs: number; profit: number }>;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--muted))', '#10b981', '#f59e0b', '#ef4444'];

export default function PLDashboard() {
  const [period, setPeriod] = useState<'mtd' | 'qtd' | 'ytd'>('mtd');

  const { data: pnlData, isLoading, refetch } = useQuery({
    queryKey: ['pnl-data', period],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('pnl-generator', {
        body: { action: 'generate_pnl', period }
      });
      if (error) throw error;
      return data as PnLData;
    }
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const expenseChartData = pnlData?.expenses_breakdown
    ? Object.entries(pnlData.expenses_breakdown).map(([name, value]) => ({
        name,
        value,
      }))
    : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const summary = pnlData?.summary;

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
          <TabsList>
            <TabsTrigger value="mtd">Month to Date</TabsTrigger>
            <TabsTrigger value="qtd">Quarter to Date</TabsTrigger>
            <TabsTrigger value="ytd">Year to Date</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(summary?.revenue || 0)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">MRR</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(summary?.mrr || 0)}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Gross Margin</p>
                <p className="text-2xl font-bold">
                  {formatPercent(summary?.gross_margin || 0)}
                </p>
              </div>
              <Percent className="h-8 w-8 text-accent" />
            </div>
          </CardContent>
        </Card>

        <Card className={summary?.net_profit && summary.net_profit < 0 ? "border-destructive" : ""}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Net Profit</p>
                <p className={`text-2xl font-bold ${summary?.net_profit && summary.net_profit < 0 ? 'text-destructive' : 'text-green-600'}`}>
                  {formatCurrency(summary?.net_profit || 0)}
                </p>
              </div>
              {summary?.net_profit && summary.net_profit >= 0 ? (
                <TrendingUp className="h-8 w-8 text-green-600" />
              ) : (
                <TrendingDown className="h-8 w-8 text-destructive" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Revenue & Profit Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {pnlData?.trend_data && pnlData.trend_data.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={pnlData.trend_data.slice(-30)}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    className="text-xs fill-muted-foreground"
                  />
                  <YAxis 
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    className="text-xs fill-muted-foreground"
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={false}
                    name="Revenue"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="profit" 
                    stroke="hsl(var(--accent))" 
                    strokeWidth={2}
                    dot={false}
                    name="Profit"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No trend data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expense Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {expenseChartData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={expenseChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {expenseChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1">
                  {expenseChartData.slice(0, 5).map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="truncate max-w-[100px]">{item.name}</span>
                      </div>
                      <span className="font-medium">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                No expense data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cost Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Cost Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">AI Services</p>
              <p className="text-lg font-bold">{formatCurrency(summary?.ai_costs || 0)}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Operating Expenses</p>
              <p className="text-lg font-bold">{formatCurrency(summary?.operating_expenses || 0)}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Gross Profit</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(summary?.gross_profit || 0)}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Net Margin</p>
              <p className="text-lg font-bold">{formatPercent(summary?.net_margin || 0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
