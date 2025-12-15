import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Mic, 
  Bell, 
  TrendingDown, 
  Zap,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  Users,
  Phone
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeAlerts } from '@/hooks/useRealtimeAlerts';
import CEOVoiceAssistant from '@/components/CEOVoiceAssistant';
import { toast } from 'sonner';

interface ChurnPrediction {
  clientId: string;
  clientName: string;
  mrr: number;
  churnProbability: number;
  riskFactors: string[];
  recommendedActions: string[];
}

const CEOCommandCenter = () => {
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [predictions, setPredictions] = useState<ChurnPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    hotLeads: 0,
    atRiskClients: 0,
    pendingActions: 0,
    todayRevenue: 0,
  });

  const { alerts, isConnected, unreadCount, markAllRead } = useRealtimeAlerts();

  // Load initial data
  useEffect(() => {
    loadDashboardData();
    loadChurnPredictions();
  }, []);

  const loadDashboardData = async () => {
    // Hot leads count
    const { count: hotLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('lead_temperature', 'hot');

    // At-risk clients
    const { count: atRisk } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .lt('health_score', 50);

    // Pending actions
    const { count: pending } = await supabase
      .from('work_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Today's revenue estimate (active client MRR / 30)
    const { data: clients } = await supabase
      .from('clients')
      .select('mrr')
      .eq('status', 'active');
    
    const monthlyMRR = clients?.reduce((sum, c) => sum + (c.mrr || 0), 0) || 0;
    const todayRevenue = Math.round(monthlyMRR / 30);

    setStats({
      hotLeads: hotLeads || 0,
      atRiskClients: atRisk || 0,
      pendingActions: pending || 0,
      todayRevenue,
    });
  };

  const loadChurnPredictions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('predictive-churn');
      if (data?.predictions) {
        setPredictions(data.predictions.slice(0, 5));
      }
    } catch (e) {
      console.log('Could not load churn predictions');
    }
    setLoading(false);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      default: return 'bg-blue-500';
    }
  };

  const getRiskColor = (probability: number) => {
    if (probability >= 70) return 'text-red-500';
    if (probability >= 50) return 'text-orange-500';
    return 'text-yellow-500';
  };

  return (
    <div className="space-y-6">
      {/* Status Bar */}
      <div className="flex items-center justify-between bg-card rounded-lg p-4 border">
        <div className="flex items-center gap-4">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-muted'}`} />
          <span className="text-sm text-muted-foreground">
            {isConnected ? 'Real-time monitoring active' : 'Connecting...'}
          </span>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              {unreadCount} new
            </Badge>
          )}
        </div>
        <Button 
          onClick={() => setVoiceOpen(true)}
          className="gap-2"
          variant="outline"
        >
          <Mic className="w-4 h-4" />
          Voice Assistant
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Hot Leads</p>
                <p className="text-2xl font-bold text-orange-500">{stats.hotLeads}</p>
              </div>
              <Zap className="w-8 h-8 text-orange-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">At-Risk Clients</p>
                <p className="text-2xl font-bold text-red-500">{stats.atRiskClients}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Actions</p>
                <p className="text-2xl font-bold text-blue-500">{stats.pendingActions}</p>
              </div>
              <Clock className="w-8 h-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Today's Revenue</p>
                <p className="text-2xl font-bold text-green-500">${stats.todayRevenue}</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Real-time Alerts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Live Alerts
            </CardTitle>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead}>
                Mark all read
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {alerts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>All caught up!</p>
                  <p className="text-sm">No new alerts</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.slice(0, 10).map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className={`w-2 h-2 rounded-full mt-2 ${getPriorityColor(alert.priority)}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{alert.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{alert.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(alert.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Churn Predictions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5" />
              Churn Predictions
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={loadChurnPredictions} disabled={loading}>
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {predictions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No at-risk clients</p>
                  <p className="text-sm">All clients are healthy</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {predictions.map((pred) => (
                    <div
                      key={pred.clientId}
                      className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{pred.clientName}</span>
                        <span className={`font-bold ${getRiskColor(pred.churnProbability)}`}>
                          {pred.churnProbability}% risk
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <DollarSign className="w-3 h-3" />
                        <span>${pred.mrr}/mo at risk</span>
                      </div>
                      {pred.riskFactors[0] && (
                        <p className="text-xs text-muted-foreground mt-1">
                          ⚠️ {pred.riskFactors[0]}
                        </p>
                      )}
                      {pred.recommendedActions[0] && (
                        <p className="text-xs text-primary mt-1">
                          → {pred.recommendedActions[0]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Voice Assistant Modal */}
      <CEOVoiceAssistant
        isOpen={voiceOpen}
        onClose={() => setVoiceOpen(false)}
      />
    </div>
  );
};

export default CEOCommandCenter;
