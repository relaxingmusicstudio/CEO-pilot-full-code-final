import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  RefreshCw,
  BarChart3,
  Target,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Activity
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import CEOChatPanel from "@/components/CEOChatPanel";
import ChannelPerformanceTable from "@/components/ChannelPerformanceTable";
import ABTestsWidget from "@/components/ABTestsWidget";

interface Metrics {
  totalRevenue: number;
  revenueToday: number;
  totalLeads: number;
  leadsToday: number;
  totalVisitors: number;
  visitorsToday: number;
  conversions: number;
  conversionRate: number;
  visitorToLeadRate: number;
  leadToCustomerRate: number;
  hotLeads: number;
  avgLeadScore: number;
}

interface ChannelData {
  source: string;
  visitors: number;
  leads: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
}

interface ABTest {
  id: string;
  name: string;
  elementType: string;
  status: string;
  variants: {
    id: string;
    name: string;
    value: string;
    views: number;
    conversions: number;
    conversionRate: number;
  }[];
}

const CEOConsole = () => {
  const [metrics, setMetrics] = useState<Metrics>({
    totalRevenue: 0,
    revenueToday: 0,
    totalLeads: 0,
    leadsToday: 0,
    totalVisitors: 0,
    visitorsToday: 0,
    conversions: 0,
    conversionRate: 0,
    visitorToLeadRate: 0,
    leadToCustomerRate: 0,
    hotLeads: 0,
    avgLeadScore: 0,
  });
  const [channelData, setChannelData] = useState<ChannelData[]>([]);
  const [abTests, setABTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      // Fetch all data in parallel
      const [visitorsRes, leadsRes, experimentsRes, variantsRes] = await Promise.all([
        supabase.from("visitors").select("*"),
        supabase.from("leads").select("*"),
        supabase.from("ab_test_experiments").select("*").in("status", ["active", "completed"]),
        supabase.from("ab_test_variants").select("*"),
      ]);

      const visitors = visitorsRes.data || [];
      const leads = leadsRes.data || [];
      const experiments = experimentsRes.data || [];
      const variants = variantsRes.data || [];

      // Calculate metrics
      const todayLeads = leads.filter(l => new Date(l.created_at || "") >= today);
      const todayVisitors = visitors.filter(v => new Date(v.created_at || "") >= today);
      const conversions = leads.filter(l => l.status === "converted" || l.status === "won");
      const hotLeads = leads.filter(l => l.lead_temperature === "hot" || (l.lead_score && l.lead_score >= 70));
      const totalRevenue = leads.reduce((sum, l) => sum + (l.revenue_value || 0), 0);
      const todayRevenue = todayLeads.reduce((sum, l) => sum + (l.revenue_value || 0), 0);
      const avgScore = leads.length > 0 
        ? Math.round(leads.reduce((sum, l) => sum + (l.lead_score || 0), 0) / leads.length)
        : 0;

      const visitorToLeadRate = visitors.length > 0 ? (leads.length / visitors.length) * 100 : 0;
      const leadToCustomerRate = leads.length > 0 ? (conversions.length / leads.length) * 100 : 0;
      const overallConversionRate = visitors.length > 0 ? (conversions.length / visitors.length) * 100 : 0;

      setMetrics({
        totalRevenue,
        revenueToday: todayRevenue,
        totalLeads: leads.length,
        leadsToday: todayLeads.length,
        totalVisitors: visitors.length,
        visitorsToday: todayVisitors.length,
        conversions: conversions.length,
        conversionRate: overallConversionRate,
        visitorToLeadRate,
        leadToCustomerRate,
        hotLeads: hotLeads.length,
        avgLeadScore: avgScore,
      });

      // Calculate channel performance
      const sourceMap: Record<string, { visitors: number; leads: number; conversions: number; revenue: number }> = {};
      
      visitors.forEach((v: any) => {
        const source = v.utm_source || "Direct";
        if (!sourceMap[source]) {
          sourceMap[source] = { visitors: 0, leads: 0, conversions: 0, revenue: 0 };
        }
        sourceMap[source].visitors++;
      });

      leads.forEach((l: any) => {
        // Find matching visitor to get source
        const visitor = visitors.find((v: any) => v.visitor_id === l.visitor_id);
        const source = visitor?.utm_source || "Direct";
        if (!sourceMap[source]) {
          sourceMap[source] = { visitors: 0, leads: 0, conversions: 0, revenue: 0 };
        }
        sourceMap[source].leads++;
        if (l.status === "converted" || l.status === "won") {
          sourceMap[source].conversions++;
          sourceMap[source].revenue += l.revenue_value || 0;
        }
      });

      const channels: ChannelData[] = Object.entries(sourceMap)
        .map(([source, data]) => ({
          source,
          ...data,
          conversionRate: data.leads > 0 ? (data.conversions / data.leads) * 100 : 0,
        }))
        .sort((a, b) => b.visitors - a.visitors);

      setChannelData(channels);

      // Process A/B tests
      const tests: ABTest[] = experiments.map((exp: any) => {
        const expVariants = variants
          .filter((v: any) => v.experiment_id === exp.id)
          .map((v: any) => ({
            id: v.id,
            name: v.name,
            value: v.value,
            views: v.views || 0,
            conversions: v.conversions || 0,
            conversionRate: v.views > 0 ? ((v.conversions || 0) / v.views) * 100 : 0,
          }));

        return {
          id: exp.id,
          name: exp.name,
          elementType: exp.element_type,
          status: exp.status,
          variants: expVariants,
        };
      });

      setABTests(tests);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching CEO data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const MetricCard = ({ 
    title, 
    value, 
    subValue, 
    subLabel, 
    icon: Icon, 
    trend,
    accent = false,
    large = false
  }: { 
    title: string; 
    value: string | number; 
    subValue?: string | number;
    subLabel?: string;
    icon: any; 
    trend?: "up" | "down";
    accent?: boolean;
    large?: boolean;
  }) => (
    <Card className={`relative overflow-hidden transition-all duration-300 hover:shadow-lg ${accent ? 'border-accent/50 bg-gradient-to-br from-accent/5 to-accent/10' : ''}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${accent ? 'bg-accent/20 text-accent' : 'bg-secondary text-primary'}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className={`font-bold text-foreground ${large ? 'text-4xl' : 'text-2xl'}`}>{value}</div>
        {subValue !== undefined && (
          <div className="flex items-center gap-1 mt-1">
            {trend === "up" && <ArrowUpRight className="h-3 w-3 text-green-500" />}
            {trend === "down" && <ArrowDownRight className="h-3 w-3 text-red-500" />}
            <span className={`text-sm ${trend === "up" ? "text-green-500" : trend === "down" ? "text-red-500" : "text-muted-foreground"}`}>
              {subValue} {subLabel}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CEO Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Last updated {lastUpdated.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            size="sm"
            onClick={() => navigate("/admin/analytics")}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Deep Dive
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 lg:gap-6">
        {/* Left Column - Main Metrics & Table */}
        <div className="col-span-12 lg:col-span-8 space-y-4 lg:space-y-6">
          {/* Top Row: Money Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <MetricCard 
              title="Total Revenue" 
              value={`$${metrics.totalRevenue.toLocaleString()}`}
              subValue={`+$${metrics.revenueToday.toLocaleString()}`}
              subLabel="today"
              icon={DollarSign}
              trend={metrics.revenueToday > 0 ? "up" : undefined}
              accent
              large
            />
            <MetricCard 
              title="Conversion Rate" 
              value={`${metrics.conversionRate.toFixed(1)}%`}
              subValue={`${metrics.conversions} sales`}
              icon={Target}
              trend={metrics.conversionRate > 5 ? "up" : "down"}
            />
            <MetricCard 
              title="Hot Leads" 
              value={metrics.hotLeads}
              subValue="Ready to close"
              icon={Zap}
              accent
            />
            <MetricCard 
              title="Avg Lead Score" 
              value={metrics.avgLeadScore}
              subValue="/ 100"
              icon={TrendingUp}
              trend={metrics.avgLeadScore > 50 ? "up" : "down"}
            />
          </div>

          {/* Conversion Funnel */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Conversion Funnel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 text-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold">{metrics.totalVisitors.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Visitors</p>
                </div>
                <div className="flex flex-col items-center">
                  <ArrowUpRight className="h-5 w-5 text-muted-foreground rotate-45" />
                  <Badge variant="outline" className="text-xs mt-1">
                    {metrics.visitorToLeadRate.toFixed(1)}%
                  </Badge>
                </div>
                <div className="flex-1 text-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold">{metrics.totalLeads}</p>
                  <p className="text-xs text-muted-foreground">Leads</p>
                </div>
                <div className="flex flex-col items-center">
                  <ArrowUpRight className="h-5 w-5 text-muted-foreground rotate-45" />
                  <Badge variant="outline" className="text-xs mt-1">
                    {metrics.leadToCustomerRate.toFixed(1)}%
                  </Badge>
                </div>
                <div className="flex-1 text-center p-3 bg-accent/10 rounded-lg border border-accent/20">
                  <p className="text-2xl font-bold text-accent">{metrics.conversions}</p>
                  <p className="text-xs text-muted-foreground">Customers</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Channel Performance */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Channel Performance
                <Badge variant="secondary" className="text-xs ml-auto">
                  {channelData.length} sources
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ChannelPerformanceTable data={channelData} isLoading={loading} />
            </CardContent>
          </Card>
        </div>

        {/* Right Column - AI Chat & A/B Tests */}
        <div className="col-span-12 lg:col-span-4 space-y-4 lg:space-y-6">
          <CEOChatPanel 
            className="h-[400px]" 
            onInsightGenerated={(metrics) => {
              // Could update UI with real-time metrics from AI
              console.log("AI metrics:", metrics);
            }}
          />
          
          <ABTestsWidget 
            tests={abTests} 
            onRefresh={fetchData}
            isLoading={loading}
          />

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <Button 
                variant="outline" 
                size="sm"
                className="justify-start"
                onClick={() => navigate("/admin/agent/funnels")}
              >
                <Target className="h-4 w-4 mr-2" />
                Funnels
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="justify-start"
                onClick={() => navigate("/admin/contacts")}
              >
                <Users className="h-4 w-4 mr-2" />
                Leads
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="justify-start"
                onClick={() => navigate("/admin/agent/content")}
              >
                <Zap className="h-4 w-4 mr-2" />
                Content
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="justify-start"
                onClick={() => navigate("/admin/agent/ads")}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Ads
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CEOConsole;
