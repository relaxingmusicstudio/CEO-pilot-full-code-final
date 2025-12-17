import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  AlertTriangle, 
  TrendingDown, 
  TrendingUp,
  Heart,
  Shield,
  Phone,
  Mail,
  Calendar,
  Brain,
  Sparkles,
  Users,
  DollarSign,
  Activity,
  MessageSquare,
  CheckCircle2,
  Clock,
  Target
} from "lucide-react";
import { PageChatHeader } from "@/components/PageChatHeader";
import { StatCardWithTooltip } from "@/components/StatCardWithTooltip";
import ChurnPredictionWidget from "@/components/ceo/ChurnPredictionWidget";
import ClientHealthWidget from "@/components/ceo/ClientHealthWidget";
import InterventionQueue from "@/components/ceo/InterventionQueue";
import LTVCACCalculator from "@/components/ceo/LTVCACCalculator";

interface AtRiskClient {
  id: string;
  name: string;
  company: string | null;
  health_score: number;
  churn_risk: number;
  mrr: number;
  last_contact: string | null;
  days_since_contact: number;
  intervention_status: string;
  risk_factors: string[];
}

interface RetentionMetrics {
  total_clients: number;
  at_risk_clients: number;
  healthy_clients: number;
  total_mrr: number;
  at_risk_mrr: number;
  avg_health_score: number;
  interventions_pending: number;
  interventions_completed: number;
}

export default function AdminRetention() {
  const [atRiskClients, setAtRiskClients] = useState<AtRiskClient[]>([]);
  const [metrics, setMetrics] = useState<RetentionMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<AtRiskClient | null>(null);

  useEffect(() => {
    fetchRetentionData();
  }, []);

  const fetchRetentionData = async () => {
    try {
      // Fetch clients with health scores
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .order('health_score', { ascending: true });

      if (clientsError) throw clientsError;

      // Calculate metrics
      const allClients = clients || [];
      const atRisk = allClients.filter(c => (c.health_score || 50) < 60);
      const healthy = allClients.filter(c => (c.health_score || 50) >= 60);

      const metricsData: RetentionMetrics = {
        total_clients: allClients.length,
        at_risk_clients: atRisk.length,
        healthy_clients: healthy.length,
        total_mrr: allClients.reduce((sum, c) => sum + (c.mrr || 0), 0),
        at_risk_mrr: atRisk.reduce((sum, c) => sum + (c.mrr || 0), 0),
        avg_health_score: allClients.length > 0 
          ? Math.round(allClients.reduce((sum, c) => sum + (c.health_score || 50), 0) / allClients.length)
          : 0,
        interventions_pending: 0,
        interventions_completed: 0
      };

      // Transform to at-risk format
      const atRiskFormatted: AtRiskClient[] = atRisk.map(c => ({
        id: c.id,
        name: c.name || c.business_name || 'Unknown',
        company: c.business_name || null,
        health_score: c.health_score || 50,
        churn_risk: 100 - (c.health_score || 50),
        mrr: c.mrr || 0,
        last_contact: c.last_contact,
        days_since_contact: c.last_contact 
          ? Math.floor((Date.now() - new Date(c.last_contact).getTime()) / (1000 * 60 * 60 * 24))
          : 999,
        intervention_status: 'none',
        risk_factors: getRiskFactors(c)
      }));

      setMetrics(metricsData);
      setAtRiskClients(atRiskFormatted);
    } catch (error) {
      console.error('Error fetching retention data:', error);
      toast.error('Failed to load retention data');
    } finally {
      setIsLoading(false);
    }
  };

  const getRiskFactors = (client: any): string[] => {
    const factors: string[] = [];
    if ((client.health_score || 50) < 40) factors.push('Critical health score');
    if (client.last_contact) {
      const days = Math.floor((Date.now() - new Date(client.last_contact).getTime()) / (1000 * 60 * 60 * 24));
      if (days > 30) factors.push('No contact in 30+ days');
    } else {
      factors.push('Never contacted');
    }
    if (!client.mrr || client.mrr < 500) factors.push('Low MRR');
    return factors;
  };

  const handleScheduleIntervention = async (clientId: string) => {
    try {
      // Create a CEO action queue item for intervention
      const { error } = await supabase
        .from('ceo_action_queue')
        .insert({
          action_type: 'churn_intervention',
          target_type: 'client',
          target_id: clientId,
          payload: { intervention_type: 'outreach', actions: ['Schedule call', 'Send check-in email'] },
          priority: 'high',
          status: 'pending_approval'
        });

      if (error) throw error;
      toast.success('Intervention scheduled');
      fetchRetentionData();
    } catch (error) {
      console.error('Error scheduling intervention:', error);
      toast.error('Failed to schedule intervention');
    }
  };

  // Transform atRiskClients to the format expected by widgets
  const widgetClients = atRiskClients.map(c => ({
    id: c.id,
    name: c.name,
    healthScore: c.health_score,
    mrr: c.mrr,
    status: 'active',
    lastContact: c.last_contact || undefined,
    startDate: new Date().toISOString(),
    trend: c.health_score < 40 ? 'down' as const : 'stable' as const
  }));

  return (
    <AdminLayout title="Retention Center" subtitle="Monitor client health and prevent churn">
      <div className="space-y-6">
        <PageChatHeader
          pageContext="Retention Center - monitoring at-risk clients and preventing churn"
          placeholder="Ask about client health or retention strategies..."
          quickActions={[
            { label: "At-risk clients", prompt: "Which clients are at highest risk of churning?" },
            { label: "Retention tips", prompt: "What are the best ways to improve client retention?" },
            { label: "Health trends", prompt: "How has client health changed over time?" },
          ]}
        />

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCardWithTooltip
            title="At-Risk Clients"
            value={metrics?.at_risk_clients || 0}
            icon={<AlertTriangle className="h-5 w-5" />}
            tooltip="Clients with health score below 60%"
            variant={metrics?.at_risk_clients && metrics.at_risk_clients > 0 ? "danger" : "success"}
          />
          <StatCardWithTooltip
            title="At-Risk MRR"
            value={`$${(metrics?.at_risk_mrr || 0).toLocaleString()}`}
            icon={<DollarSign className="h-5 w-5" />}
            tooltip="Monthly recurring revenue at risk of churn"
            variant="danger"
          />
          <StatCardWithTooltip
            title="Avg Health Score"
            value={`${metrics?.avg_health_score || 0}%`}
            icon={<Heart className="h-5 w-5" />}
            tooltip="Average health score across all clients"
            variant={metrics?.avg_health_score && metrics.avg_health_score >= 70 ? "success" : "primary"}
          />
          <StatCardWithTooltip
            title="Pending Interventions"
            value={metrics?.interventions_pending || 0}
            icon={<Clock className="h-5 w-5" />}
            tooltip="Scheduled interventions awaiting action"
            variant="primary"
          />
        </div>

        <Tabs defaultValue="at-risk" className="space-y-6">
          <TabsList>
            <TabsTrigger value="at-risk">At-Risk Clients</TabsTrigger>
            <TabsTrigger value="interventions">Intervention Queue</TabsTrigger>
            <TabsTrigger value="health">Health Overview</TabsTrigger>
            <TabsTrigger value="metrics">LTV/CAC Metrics</TabsTrigger>
          </TabsList>

          <TabsContent value="at-risk" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* At-Risk Client List */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    At-Risk Clients
                  </CardTitle>
                  <CardDescription>
                    Clients with health scores below 60% need immediate attention
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Loading...</div>
                  ) : atRiskClients.length === 0 ? (
                    <div className="text-center py-8">
                      <Shield className="h-12 w-12 mx-auto text-green-500 mb-4" />
                      <p className="text-muted-foreground">No at-risk clients! All clients are healthy.</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-4">
                        {atRiskClients.map((client) => (
                          <div
                            key={client.id}
                            className={`p-4 rounded-lg border transition-all cursor-pointer ${
                              selectedClient?.id === client.id 
                                ? 'border-primary bg-primary/5' 
                                : 'hover:border-primary/50'
                            }`}
                            onClick={() => setSelectedClient(client)}
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-medium">{client.name}</h4>
                                {client.company && (
                                  <p className="text-sm text-muted-foreground">{client.company}</p>
                                )}
                              </div>
                              <Badge 
                                variant={client.health_score < 40 ? "destructive" : "secondary"}
                              >
                                {client.health_score}% Health
                              </Badge>
                            </div>

                            <div className="mt-3">
                              <div className="flex items-center justify-between text-sm mb-1">
                                <span className="text-muted-foreground">Health Score</span>
                                <span>{client.health_score}%</span>
                              </div>
                              <Progress 
                                value={client.health_score} 
                                className={`h-2 ${
                                  client.health_score < 40 ? '[&>div]:bg-destructive' : '[&>div]:bg-yellow-500'
                                }`}
                              />
                            </div>

                            <div className="flex flex-wrap gap-2 mt-3">
                              <Badge variant="outline" className="text-xs">
                                <DollarSign className="h-3 w-3 mr-1" />
                                ${client.mrr}/mo
                              </Badge>
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${
                                  client.days_since_contact > 30 ? 'text-destructive border-destructive' : ''
                                }`}
                              >
                                <Clock className="h-3 w-3 mr-1" />
                                {client.days_since_contact} days since contact
                              </Badge>
                            </div>

                            {client.risk_factors.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-3">
                                {client.risk_factors.map((factor, i) => (
                                  <Badge key={i} variant="destructive" className="text-xs">
                                    {factor}
                                  </Badge>
                                ))}
                              </div>
                            )}

                            <div className="flex gap-2 mt-4">
                              <Button size="sm" onClick={(e) => {
                                e.stopPropagation();
                                handleScheduleIntervention(client.id);
                              }}>
                                <Calendar className="h-3 w-3 mr-1" />
                                Schedule Intervention
                              </Button>
                              <Button size="sm" variant="outline">
                                <Phone className="h-3 w-3 mr-1" />
                                Call Now
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              {/* Churn Prediction */}
              <ChurnPredictionWidget clients={widgetClients} />
            </div>
          </TabsContent>

          <TabsContent value="interventions">
            <InterventionQueue />
          </TabsContent>

          <TabsContent value="health">
            <ClientHealthWidget clients={widgetClients} />
          </TabsContent>

          <TabsContent value="metrics">
            <LTVCACCalculator clients={widgetClients} leads={[]} visitors={[]} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
