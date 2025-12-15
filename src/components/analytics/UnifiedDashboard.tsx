import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, TrendingDown, Users, DollarSign, Phone, 
  Mail, MessageSquare, Target, BarChart3, Activity,
  ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const trafficData = [
  { date: "Mon", visitors: 120, leads: 12, conversions: 3 },
  { date: "Tue", visitors: 180, leads: 18, conversions: 5 },
  { date: "Wed", visitors: 150, leads: 15, conversions: 4 },
  { date: "Thu", visitors: 220, leads: 25, conversions: 8 },
  { date: "Fri", visitors: 280, leads: 32, conversions: 10 },
  { date: "Sat", visitors: 90, leads: 8, conversions: 2 },
  { date: "Sun", visitors: 60, leads: 5, conversions: 1 },
];

const channelData = [
  { channel: "Website", leads: 45, conversion: 12, revenue: 25000 },
  { channel: "Phone", leads: 28, conversion: 22, revenue: 42000 },
  { channel: "Email", leads: 35, conversion: 8, revenue: 15000 },
  { channel: "SMS", leads: 22, conversion: 15, revenue: 18000 },
  { channel: "Chat", leads: 52, conversion: 10, revenue: 28000 },
];

const metrics = [
  { label: "Total Visitors", value: "1,247", change: 12.5, icon: Users },
  { label: "Leads Generated", value: "156", change: 8.3, icon: Target },
  { label: "Conversion Rate", value: "12.5%", change: -2.1, icon: TrendingUp },
  { label: "Revenue", value: "$128,000", change: 15.2, icon: DollarSign },
  { label: "Calls Made", value: "342", change: 5.8, icon: Phone },
  { label: "Emails Sent", value: "1,856", change: 22.1, icon: Mail },
  { label: "SMS Sent", value: "892", change: 18.5, icon: MessageSquare },
  { label: "Avg Response", value: "2.3 min", change: -12.3, icon: Activity },
];

export const UnifiedDashboard = () => {
  return (
    <div className="space-y-6">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{metric.label}</p>
                  <p className="text-2xl font-bold">{metric.value}</p>
                  <div className={`flex items-center text-xs ${metric.change >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {metric.change >= 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {Math.abs(metric.change)}%
                  </div>
                </div>
                <metric.icon className="h-8 w-8 text-primary/20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Traffic & Conversions</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={trafficData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--card))", 
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }} 
                />
                <Area type="monotone" dataKey="visitors" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.2)" />
                <Area type="monotone" dataKey="leads" stroke="hsl(var(--accent))" fill="hsl(var(--accent)/0.2)" />
                <Area type="monotone" dataKey="conversions" stroke="hsl(142 76% 36%)" fill="hsl(142 76% 36% / 0.2)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Channel Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={channelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" />
                <YAxis dataKey="channel" type="category" className="text-xs" width={60} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--card))", 
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }} 
                />
                <Bar dataKey="leads" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Channel Breakdown Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Channel Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Channel</th>
                  <th className="text-right py-3 px-4 font-medium">Leads</th>
                  <th className="text-right py-3 px-4 font-medium">Conv. Rate</th>
                  <th className="text-right py-3 px-4 font-medium">Revenue</th>
                  <th className="text-left py-3 px-4 font-medium w-[200px]">Performance</th>
                </tr>
              </thead>
              <tbody>
                {channelData.map(row => (
                  <tr key={row.channel} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-4 font-medium">{row.channel}</td>
                    <td className="py-3 px-4 text-right">{row.leads}</td>
                    <td className="py-3 px-4 text-right">
                      <Badge variant={row.conversion >= 15 ? "default" : row.conversion >= 10 ? "secondary" : "outline"}>
                        {row.conversion}%
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right text-green-500 font-medium">
                      ${row.revenue.toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <Progress value={row.conversion * 4} className="h-2" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
