import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  RefreshCw, 
  AlertTriangle, 
  TrendingUp, 
  Users, 
  Phone, 
  DollarSign,
  Brain,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronLeft
} from "lucide-react";

interface BriefData {
  generated_at: string;
  bullets: string[];
  risk_alert: string | null;
  opportunity: string | null;
  data_snapshot: {
    leads_24h: number;
    lead_temperature: Record<string, number>;
    missed_calls_24h: number;
    active_clients: number;
    mrr_cents: number;
    revenue_invoiced_this_month_cents: number;
    ai_cost_24h_cents: number;
    ai_cost_30d_avg_cents: number;
    pending_actions: number;
  };
}

interface Decision {
  id: string;
  decision: string;
  reasoning: string;
  confidence: number;
  status: string;
  purpose: string;
  created_at: string;
  context_snapshot?: {
    tags?: string[];
  };
}

interface CostBreakdown {
  by_agent: Record<string, { cost_cents: number; api_calls: number; tokens: number }>;
  by_purpose: Record<string, { cost_cents: number; count: number }>;
  by_provider: Record<string, { cost_cents: number; count: number }>;
}

export default function CeoDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Brief state
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [briefAge, setBriefAge] = useState<number>(0);
  const [briefStale, setBriefStale] = useState(false);
  
  // Metrics state
  const [metrics, setMetrics] = useState<any>(null);
  
  // Decisions state
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [decisionsAnalytics, setDecisionsAnalytics] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Cost state
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown | null>(null);
  const [costPeriod, setCostPeriod] = useState<string>("30d");

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadBrief(),
        loadMetrics(),
        loadDecisions(),
        loadCostBreakdown(),
      ]);
    } catch (error) {
      console.error('Failed to load CEO dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const loadBrief = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('ceo-dashboard', {
        body: { endpoint: 'brief' },
      });
      
      if (error) throw error;
      
      if (data?.brief) {
        setBrief(data.brief);
        setBriefAge(data.age_hours || 0);
        setBriefStale(data.stale || false);
      }
    } catch (error) {
      console.error('Failed to load brief:', error);
    }
  };

  const loadMetrics = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('ceo-dashboard', {
        body: { endpoint: 'metrics' },
      });
      
      if (error) throw error;
      setMetrics(data?.metrics || null);
    } catch (error) {
      console.error('Failed to load metrics:', error);
    }
  };

  const loadDecisions = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('ceo-dashboard', {
        body: { endpoint: 'decisions', limit: 50 },
      });
      
      if (error) throw error;
      setDecisions(data?.decisions || []);
      setDecisionsAnalytics(data?.analytics || null);
    } catch (error) {
      console.error('Failed to load decisions:', error);
    }
  };

  const loadCostBreakdown = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('ceo-dashboard', {
        body: { endpoint: 'cost-breakdown' },
      });
      
      if (error) throw error;
      setCostBreakdown({
        by_agent: data?.by_agent || {},
        by_purpose: data?.by_purpose || {},
        by_provider: data?.by_provider || {},
      });
    } catch (error) {
      console.error('Failed to load cost breakdown:', error);
    }
  };

  const refreshBrief = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ceo-daily-brief', {
        body: { force_refresh: true },
      });
      
      if (error) throw error;
      
      if (data) {
        setBrief(data);
        setBriefAge(0);
        setBriefStale(false);
        toast.success('Daily brief refreshed');
      }
    } catch (error: any) {
      console.error('Failed to refresh brief:', error);
      if (error.message?.includes('rate limit')) {
        toast.error('Rate limit exceeded. Max 5 refreshes per hour.');
      } else {
        toast.error('Failed to refresh brief');
      }
    } finally {
      setRefreshing(false);
    }
  };

  const filteredDecisions = statusFilter === 'all' 
    ? decisions 
    : decisions.filter(d => d.status === statusFilter);

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/app')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">CEO Executive Dashboard</h1>
            <p className="text-muted-foreground">AI-powered business intelligence</p>
          </div>
        </div>
        <Button variant="outline" onClick={loadAllData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh All
        </Button>
      </div>

      <Tabs defaultValue="brief" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="brief">Daily Brief</TabsTrigger>
          <TabsTrigger value="metrics">Live Metrics</TabsTrigger>
          <TabsTrigger value="decisions">Decisions</TabsTrigger>
          <TabsTrigger value="costs">AI Costs</TabsTrigger>
        </TabsList>

        {/* DAILY BRIEF TAB */}
        <TabsContent value="brief" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  Executive Daily Brief
                </CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <Clock className="h-4 w-4" />
                  {brief?.generated_at 
                    ? `Generated ${new Date(brief.generated_at).toLocaleString()}`
                    : 'No brief available'}
                  {briefAge > 0 && (
                    <Badge variant={briefStale ? "destructive" : "secondary"}>
                      {briefAge}h old {briefStale && '(stale)'}
                    </Badge>
                  )}
                </CardDescription>
              </div>
              <Button 
                onClick={refreshBrief} 
                disabled={refreshing}
                variant={briefStale ? "default" : "outline"}
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {briefStale ? 'Refresh Now' : 'Refresh'}
              </Button>
            </CardHeader>
            <CardContent>
              {!brief ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No daily brief available</p>
                  <Button className="mt-4" onClick={refreshBrief} disabled={refreshing}>
                    Generate Brief
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Bullets */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Key Insights</h3>
                    <ul className="space-y-2">
                      {brief.bullets?.map((bullet, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Risk Alert */}
                    {brief.risk_alert && brief.risk_alert !== 'None' && (
                      <Card className="border-destructive/50 bg-destructive/5">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-5 w-5" />
                            Risk Alert
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm">{brief.risk_alert}</p>
                        </CardContent>
                      </Card>
                    )}

                    {/* Opportunity */}
                    {brief.opportunity && (
                      <Card className="border-green-500/50 bg-green-500/5">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2 text-green-600">
                            <TrendingUp className="h-5 w-5" />
                            Opportunity
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm">{brief.opportunity}</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Data Snapshot */}
                  {brief.data_snapshot && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatCard 
                        label="New Leads (24h)" 
                        value={brief.data_snapshot.leads_24h} 
                        icon={<Users className="h-4 w-4" />}
                      />
                      <StatCard 
                        label="Missed Calls" 
                        value={brief.data_snapshot.missed_calls_24h} 
                        icon={<Phone className="h-4 w-4" />}
                        variant={brief.data_snapshot.missed_calls_24h > 5 ? 'warning' : 'default'}
                      />
                      <StatCard 
                        label="Active Clients" 
                        value={brief.data_snapshot.active_clients} 
                        icon={<Users className="h-4 w-4" />}
                      />
                      <StatCard 
                        label="MRR" 
                        value={formatCents(brief.data_snapshot.mrr_cents)} 
                        icon={<DollarSign className="h-4 w-4" />}
                      />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* METRICS TAB */}
        <TabsContent value="metrics" className="space-y-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCard 
              title="Leads Today" 
              value={metrics?.leads?.today || 0}
              subtitle={`${metrics?.leads?.week || 0} this week`}
              icon={<Users className="h-5 w-5" />}
            />
            <MetricCard 
              title="Active Clients" 
              value={metrics?.clients?.active || 0}
              icon={<Users className="h-5 w-5" />}
            />
            <MetricCard 
              title="Missed Calls (Today)" 
              value={metrics?.calls?.missed_today || 0}
              icon={<Phone className="h-5 w-5" />}
              variant={metrics?.calls?.missed_today > 5 ? 'warning' : 'default'}
            />
            <MetricCard 
              title="Pending Actions" 
              value={metrics?.actions?.pending || 0}
              icon={<Clock className="h-5 w-5" />}
            />
            <MetricCard 
              title="AI Cost (7d)" 
              value={metrics?.costs?.ai_week_dollars ? `$${metrics.costs.ai_week_dollars}` : '$0.00'}
              icon={<Brain className="h-5 w-5" />}
            />
            <MetricCard 
              title="Decisions (7d)" 
              value={metrics?.decisions?.week || 0}
              icon={<CheckCircle2 className="h-5 w-5" />}
            />
          </div>
        </TabsContent>

        {/* DECISIONS TAB */}
        <TabsContent value="decisions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>CEO Decisions</CardTitle>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="executed">Executed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {decisionsAnalytics && (
                <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                  <span>Total: {decisionsAnalytics.total}</span>
                  <span>Executed: {decisionsAnalytics.executed}</span>
                  <span>Avg Confidence: {(decisionsAnalytics.avg_confidence * 100).toFixed(0)}%</span>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {filteredDecisions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No decisions found
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Decision</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDecisions.map((decision) => (
                      <TableRow key={decision.id}>
                        <TableCell className="max-w-[300px]">
                          <p className="font-medium truncate">{decision.decision}</p>
                          <p className="text-xs text-muted-foreground truncate">{decision.reasoning}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={decision.confidence >= 0.8 ? "default" : "secondary"}>
                            {(decision.confidence * 100).toFixed(0)}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            decision.status === 'executed' ? 'default' :
                            decision.status === 'pending' ? 'secondary' :
                            'outline'
                          }>
                            {decision.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {decision.context_snapshot?.tags?.slice(0, 3).map((tag, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(decision.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* COSTS TAB */}
        <TabsContent value="costs" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            {/* By Agent */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cost by Agent</CardTitle>
              </CardHeader>
              <CardContent>
                {!costBreakdown?.by_agent || Object.keys(costBreakdown.by_agent).length === 0 ? (
                  <p className="text-muted-foreground text-sm">No cost data</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(costBreakdown.by_agent)
                      .sort(([, a], [, b]) => b.cost_cents - a.cost_cents)
                      .slice(0, 8)
                      .map(([agent, data]) => (
                        <div key={agent} className="flex justify-between items-center">
                          <span className="text-sm truncate">{agent}</span>
                          <span className="text-sm font-mono">{formatCents(data.cost_cents)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* By Purpose */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cost by Purpose</CardTitle>
              </CardHeader>
              <CardContent>
                {!costBreakdown?.by_purpose || Object.keys(costBreakdown.by_purpose).length === 0 ? (
                  <p className="text-muted-foreground text-sm">No cost data</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(costBreakdown.by_purpose)
                      .sort(([, a], [, b]) => b.cost_cents - a.cost_cents)
                      .slice(0, 8)
                      .map(([purpose, data]) => (
                        <div key={purpose} className="flex justify-between items-center">
                          <span className="text-sm truncate">{purpose}</span>
                          <span className="text-sm font-mono">{formatCents(data.cost_cents)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* By Provider */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cost by Provider</CardTitle>
              </CardHeader>
              <CardContent>
                {!costBreakdown?.by_provider || Object.keys(costBreakdown.by_provider).length === 0 ? (
                  <p className="text-muted-foreground text-sm">No cost data</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(costBreakdown.by_provider)
                      .sort(([, a], [, b]) => b.cost_cents - a.cost_cents)
                      .map(([provider, data]) => (
                        <div key={provider} className="flex justify-between items-center">
                          <span className="text-sm capitalize">{provider}</span>
                          <div className="text-right">
                            <span className="text-sm font-mono">{formatCents(data.cost_cents)}</span>
                            <span className="text-xs text-muted-foreground ml-2">({data.count} calls)</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Helper components
function StatCard({ 
  label, 
  value, 
  icon, 
  variant = 'default' 
}: { 
  label: string; 
  value: string | number; 
  icon?: React.ReactNode;
  variant?: 'default' | 'warning';
}) {
  return (
    <div className={`p-4 rounded-lg border ${variant === 'warning' ? 'bg-yellow-50 border-yellow-200' : 'bg-card'}`}>
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${variant === 'warning' ? 'text-yellow-700' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function MetricCard({ 
  title, 
  value, 
  subtitle, 
  icon,
  variant = 'default'
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'warning';
}) {
  return (
    <Card className={variant === 'warning' ? 'border-yellow-300 bg-yellow-50/50' : ''}>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          {icon}
          {title}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-bold ${variant === 'warning' ? 'text-yellow-700' : ''}`}>
          {value}
        </p>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
