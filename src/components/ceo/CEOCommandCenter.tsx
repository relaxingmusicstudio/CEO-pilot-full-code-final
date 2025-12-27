import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Mic, Bell, TrendingDown, Zap, AlertTriangle, CheckCircle,
  Clock, DollarSign, Users, Bot, Shield
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeAlerts } from '@/hooks/useRealtimeAlerts';
import CEOVoiceAssistant from '@/components/CEOVoiceAssistant';
import CEOAutopilotController from '@/components/ceo/CEOAutopilotController';

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
  const [activeTab, setActiveTab] = useState('dashboard');
  const [predictions, setPredictions] = useState<ChurnPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ hotLeads: 0, atRiskClients: 0, pendingActions: 0, todayRevenue: 0 });
  const [autopilotActive, setAutopilotActive] = useState(false);
  const { alerts, isConnected, unreadCount, markAllRead } = useRealtimeAlerts();

  useEffect(() => {
    loadDashboardData();
    loadChurnPredictions();
    checkAutopilotStatus();
  }, []);

  const loadDashboardData = async () => {
    const [hotRes, riskRes, pendingRes, clientsRes] = await Promise.all([
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('lead_temperature', 'hot'),
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'active').lt('health_score', 50),
      supabase.from('work_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('clients').select('mrr').eq('status', 'active')
    ]);
    const monthlyMRR = clientsRes.data?.reduce((sum, c) => sum + (c.mrr || 0), 0) || 0;
    setStats({ hotLeads: hotRes.count || 0, atRiskClients: riskRes.count || 0, pendingActions: pendingRes.count || 0, todayRevenue: Math.round(monthlyMRR / 30) });
  };

  const loadChurnPredictions = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('predictive-churn');
      if (data?.predictions) setPredictions(data.predictions.slice(0, 5));
    } catch (e) {
      console.log('Could not load churn predictions');
    }
    setLoading(false);
  };

  const checkAutopilotStatus = async () => {
    try {
      const { data } = await supabase.from('ceo_autopilot_config').select('is_active').limit(1).single();
      setAutopilotActive(data?.is_active || false);
    } catch (e) {
      // Best-effort: leave autopilotActive as-is if fetch fails.
    }
  };

  const getPriorityColor = (p: string) => p === 'urgent' ? 'bg-red-500' : p === 'high' ? 'bg-orange-500' : 'bg-blue-500';
  const getRiskColor = (p: number) => p >= 70 ? 'text-red-500' : p >= 50 ? 'text-orange-500' : 'text-yellow-500';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-card rounded-lg p-4 border">
        <div className="flex items-center gap-4">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-muted'}`} />
          <span className="text-sm text-muted-foreground">{isConnected ? 'Real-time active' : 'Connecting...'}</span>
          {autopilotActive && <Badge className="bg-green-500 animate-pulse"><Bot className="w-3 h-3 mr-1" />Autopilot</Badge>}
          {unreadCount > 0 && <Badge variant="destructive" className="animate-pulse">{unreadCount} new</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setActiveTab(activeTab === 'autopilot' ? 'dashboard' : 'autopilot')} variant={activeTab === 'autopilot' ? 'default' : 'outline'} size="sm">
            <Shield className="w-4 h-4 mr-2" />{activeTab === 'autopilot' ? 'Back' : 'Autopilot'}
          </Button>
          <Button onClick={() => setVoiceOpen(true)} variant="outline"><Mic className="w-4 h-4 mr-2" />Voice</Button>
        </div>
      </div>

      {activeTab === 'autopilot' ? <CEOAutopilotController /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20"><CardContent className="pt-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Hot Leads</p><p className="text-2xl font-bold text-orange-500">{stats.hotLeads}</p></div><Zap className="w-8 h-8 text-orange-500/50" /></div></CardContent></Card>
            <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20"><CardContent className="pt-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">At-Risk</p><p className="text-2xl font-bold text-red-500">{stats.atRiskClients}</p></div><AlertTriangle className="w-8 h-8 text-red-500/50" /></div></CardContent></Card>
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20"><CardContent className="pt-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Pending</p><p className="text-2xl font-bold text-blue-500">{stats.pendingActions}</p></div><Clock className="w-8 h-8 text-blue-500/50" /></div></CardContent></Card>
            <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20"><CardContent className="pt-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Today Revenue</p><p className="text-2xl font-bold text-green-500">${stats.todayRevenue}</p></div><DollarSign className="w-8 h-8 text-green-500/50" /></div></CardContent></Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><Bell className="w-5 h-5" />Live Alerts</CardTitle>{unreadCount > 0 && <Button variant="ghost" size="sm" onClick={markAllRead}>Mark read</Button>}</CardHeader><CardContent><ScrollArea className="h-[300px]">{alerts.length === 0 ? <div className="text-center py-8 text-muted-foreground"><CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>All caught up!</p></div> : <div className="space-y-3">{alerts.slice(0, 10).map((a) => <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"><div className={`w-2 h-2 rounded-full mt-2 ${getPriorityColor(a.priority)}`} /><div className="flex-1 min-w-0"><p className="font-medium text-sm truncate">{a.title}</p><p className="text-xs text-muted-foreground">{a.message}</p></div></div>)}</div>}</ScrollArea></CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><TrendingDown className="w-5 h-5" />Churn Risk</CardTitle><Button variant="ghost" size="sm" onClick={loadChurnPredictions} disabled={loading}>Refresh</Button></CardHeader><CardContent><ScrollArea className="h-[300px]">{predictions.length === 0 ? <div className="text-center py-8 text-muted-foreground"><Users className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>All clients healthy</p></div> : <div className="space-y-3">{predictions.map((p) => <div key={p.clientId} className="p-3 rounded-lg bg-muted/50"><div className="flex items-center justify-between mb-2"><span className="font-medium text-sm">{p.clientName}</span><span className={`font-bold ${getRiskColor(p.churnProbability)}`}>{p.churnProbability}%</span></div><p className="text-xs text-muted-foreground">${p.mrr}/mo at risk</p></div>)}</div>}</ScrollArea></CardContent></Card>
          </div>
        </>
      )}
      <CEOVoiceAssistant isOpen={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </div>
  );
};

export default CEOCommandCenter;
