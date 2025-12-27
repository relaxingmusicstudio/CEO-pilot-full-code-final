import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Database, 
  Zap, 
  Clock, 
  Users, 
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Building2,
  Wrench,
  ShoppingCart,
  Activity,
  Archive,
  Trash2,
  type LucideIcon
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SimulationRun {
  id: string;
  scenario_key: string;
  scenario_name: string;
  status: string;
  current_day: number;
  total_days_simulated: number;
  agent_responses_count: number;
  started_at: string;
  completed_at: string | null;
}

interface TimelineEvent {
  id: string;
  event_day: number;
  event_type: string;
  event_description: string;
  status: string;
  agent_response: Record<string, unknown> | null;
  executed_at: string | null;
}

interface ActivityLog {
  id: string;
  service_key: string;
  action_type: string;
  event_day: number;
  mock_response: Record<string, unknown> | null;
  created_at: string;
}

const scenarioIcons = {
  saas: Building2,
  local_service: Wrench,
  ecommerce: ShoppingCart,
};

const scenarioDescriptions = {
  saas: "B2B SaaS - QuickScale Tech: Product-led growth, 28-day sales cycle",
  local_service: "Local Service - Heritage HVAC: Emergency services, 3-day sales cycle",
  ecommerce: "E-commerce DTC - UrbanFit Goods: Subscription model, high engagement",
};

export default function AdminMockMode() {
  const [activeSimulation, setActiveSimulation] = useState<SimulationRun | null>(null);
  const [simulations, setSimulations] = useState<SimulationRun[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>("local_service");
  const [isLoading, setIsLoading] = useState(false);
  const [environment, setEnvironment] = useState<string>("live");
  const [tenantId, setTenantId] = useState<string | null>(null);

  const loadSimulationDetails = useCallback(async (simulationId: string) => {
    // Load timeline events
    const { data: events } = await supabase
      .from("simulation_timeline")
      .select("*")
      .eq("simulation_id", simulationId)
      .order("event_day", { ascending: true })
      .limit(100);
    
    if (events) {
      setTimelineEvents(events);
    }

    // Load activity logs
    const { data: logs } = await supabase
      .from("mock_activity_log")
      .select("*")
      .eq("simulation_id", simulationId)
      .order("created_at", { ascending: false })
      .limit(50);
    
    if (logs) {
      setActivityLogs(logs);
    }
  }, []);

  const loadData = useCallback(async () => {
    // Get current tenant
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .single();
    
    if (profile?.tenant_id) {
      setTenantId(profile.tenant_id);
      
      // Get tenant environment
      const { data: tenant } = await supabase
        .from("tenants")
        .select("environment")
        .eq("id", profile.tenant_id)
        .single();
      
      if (tenant) {
        setEnvironment(tenant.environment || "live");
      }

      // Load simulations
      const { data: sims } = await supabase
        .from("simulation_runs")
        .select("*")
        .eq("tenant_id", profile.tenant_id)
        .order("created_at", { ascending: false });
      
      if (sims) {
        setSimulations(sims);
        const active = sims.find(s => s.status === "running" || s.status === "paused");
        if (active) {
          setActiveSimulation(active);
          loadSimulationDetails(active.id);
        }
      }
    }
  }, [loadSimulationDetails]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const startNewSimulation = async () => {
    if (!tenantId) {
      toast.error("No tenant ID found");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("seed-mock-tenant", {
        body: {
          tenant_id: tenantId,
          scenario_key: selectedScenario,
          lead_count: 50,
        },
      });

      if (error) throw error;

      toast.success(`Simulation created: ${data.business_name}`);
      setEnvironment("mock");
      await loadData();
      
      if (data.simulation_id) {
        setActiveSimulation(simulations.find(s => s.id === data.simulation_id) || null);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to start simulation.";
      toast.error(`Failed to start simulation: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const runSimulation = async (action: "run" | "pause" | "resume") => {
    if (!activeSimulation) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("simulation-runner", {
        body: {
          simulation_id: activeSimulation.id,
          action,
          days_to_process: 30, // Process 30 days at a time
        },
      });

      if (error) throw error;

      toast.success(`Simulation ${action}: ${data.events_processed} events processed`);
      await loadData();
      
      if (activeSimulation) {
        loadSimulationDetails(activeSimulation.id);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : `Failed to ${action} simulation.`;
      toast.error(`Failed to ${action} simulation: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const archiveAndReset = async () => {
    if (!tenantId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("archive-reset-tenant", {
        body: {
          tenant_id: tenantId,
          action: "archive_and_reset",
        },
      });

      if (error) throw error;

      toast.success("Simulation data archived and tenant reset");
      setActiveSimulation(null);
      setTimelineEvents([]);
      setActivityLogs([]);
      setEnvironment("live");
      await loadData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to archive.";
      toast.error(`Failed to archive: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: LucideIcon }> = {
      pending: { variant: "outline", icon: Clock },
      running: { variant: "default", icon: Activity },
      paused: { variant: "secondary", icon: Pause },
      completed: { variant: "default", icon: CheckCircle },
      failed: { variant: "destructive", icon: XCircle },
      archived: { variant: "outline", icon: Archive },
    };
    const config = variants[status] || variants.pending;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const getEventIcon = (eventType: string) => {
    const icons: Record<string, LucideIcon> = {
      lead_created: Users,
      email_opened: TrendingUp,
      deal_created: Zap,
      deal_won: CheckCircle,
      support_ticket: AlertTriangle,
      health_score_drop: AlertTriangle,
      churn_risk_detected: XCircle,
    };
    return icons[eventType] || Activity;
  };

  return (
    <AdminLayout title="Mock Test Mode">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Mock Test Mode</h1>
            <p className="text-muted-foreground">
              Run 6-month lifecycle simulations with sandbox credentials
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label>Environment:</Label>
              <Badge variant={environment === "mock" ? "default" : "outline"} className="text-sm">
                {environment.toUpperCase()}
              </Badge>
            </div>
          </div>
        </div>

        <Tabs defaultValue="simulation" className="space-y-4">
          <TabsList>
            <TabsTrigger value="simulation">Simulation Control</TabsTrigger>
            <TabsTrigger value="timeline">Timeline Events</TabsTrigger>
            <TabsTrigger value="activity">Activity Log</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* Simulation Control Tab */}
          <TabsContent value="simulation" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* New Simulation Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Start New Simulation
                  </CardTitle>
                  <CardDescription>
                    Select a business scenario and seed test data
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Business Scenario</Label>
                    <Select value={selectedScenario} onValueChange={setSelectedScenario}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(scenarioDescriptions).map(([key, desc]) => {
                          const Icon = scenarioIcons[key as keyof typeof scenarioIcons];
                          return (
                            <SelectItem key={key} value={key}>
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4" />
                                <span>{desc}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="pt-2">
                    <Button 
                      onClick={startNewSimulation} 
                      disabled={isLoading || environment === "mock"}
                      className="w-full"
                    >
                      <Zap className="h-4 w-4 mr-2" />
                      Initialize Simulation
                    </Button>
                    {environment === "mock" && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Reset current simulation before starting new one
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Active Simulation Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Active Simulation
                  </CardTitle>
                  <CardDescription>
                    {activeSimulation ? activeSimulation.scenario_name : "No active simulation"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {activeSimulation ? (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Progress</span>
                          <span className="text-sm font-medium">
                            Day {activeSimulation.current_day} / {activeSimulation.total_days_simulated}
                          </span>
                        </div>
                        <Progress 
                          value={(activeSimulation.current_day / activeSimulation.total_days_simulated) * 100} 
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Status</span>
                        {getStatusBadge(activeSimulation.status)}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Agent Responses</span>
                        <span className="font-medium">{activeSimulation.agent_responses_count}</span>
                      </div>

                      <div className="flex gap-2 pt-2">
                        {activeSimulation.status === "paused" || activeSimulation.status === "pending" ? (
                          <Button 
                            onClick={() => runSimulation("run")} 
                            disabled={isLoading}
                            className="flex-1"
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Run
                          </Button>
                        ) : activeSimulation.status === "running" ? (
                          <Button 
                            onClick={() => runSimulation("pause")} 
                            disabled={isLoading}
                            variant="secondary"
                            className="flex-1"
                          >
                            <Pause className="h-4 w-4 mr-2" />
                            Pause
                          </Button>
                        ) : null}

                        <Button 
                          onClick={archiveAndReset} 
                          disabled={isLoading}
                          variant="outline"
                        >
                          <Archive className="h-4 w-4 mr-2" />
                          Archive & Reset
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No active simulation</p>
                      <p className="text-sm">Start a new simulation to begin testing</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Stats Cards */}
            {activeSimulation && (
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">{timelineEvents.filter(e => e.status === "completed").length}</div>
                    <p className="text-xs text-muted-foreground">Events Processed</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">{timelineEvents.filter(e => e.status === "pending").length}</div>
                    <p className="text-xs text-muted-foreground">Events Pending</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">{activityLogs.length}</div>
                    <p className="text-xs text-muted-foreground">Mock API Calls</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">
                      {Math.round((activeSimulation.current_day / activeSimulation.total_days_simulated) * 100)}%
                    </div>
                    <p className="text-xs text-muted-foreground">Simulation Complete</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Timeline Events Tab */}
          <TabsContent value="timeline">
            <Card>
              <CardHeader>
                <CardTitle>Timeline Events</CardTitle>
                <CardDescription>180-day simulated lifecycle events</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {timelineEvents.length > 0 ? (
                      timelineEvents.map((event) => {
                        const Icon = getEventIcon(event.event_type);
                        return (
                          <div 
                            key={event.id} 
                            className="flex items-start gap-4 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                              <Icon className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">Day {event.event_day}</span>
                                <Badge variant="outline" className="text-xs">
                                  {event.event_type.replace(/_/g, " ")}
                                </Badge>
                                {getStatusBadge(event.status)}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {event.event_description}
                              </p>
                              {event.agent_response && (
                                <div className="mt-2 p-2 bg-muted rounded text-xs">
                                  <span className="font-medium">{event.agent_response.agent}:</span>{" "}
                                  {event.agent_response.outcome}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No timeline events yet</p>
                        <p className="text-sm">Start a simulation to generate events</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Log Tab */}
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>Mock Activity Log</CardTitle>
                <CardDescription>Simulated API calls and service interactions</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {activityLogs.length > 0 ? (
                      activityLogs.map((log) => (
                        <div 
                          key={log.id} 
                          className="flex items-start gap-4 p-3 rounded-lg border bg-card"
                        >
                          <Badge variant="outline">{log.service_key}</Badge>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{log.action_type}</span>
                              {log.event_day && (
                                <span className="text-xs text-muted-foreground">Day {log.event_day}</span>
                              )}
                            </div>
                            {log.mock_response && (
                              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-24">
                                {JSON.stringify(log.mock_response, null, 2)}
                              </pre>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No activity logs yet</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Simulation History</CardTitle>
                <CardDescription>Past simulation runs and results</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {simulations.length > 0 ? (
                    simulations.map((sim) => (
                      <div 
                        key={sim.id} 
                        className="flex items-center justify-between p-4 rounded-lg border"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{sim.scenario_name}</span>
                            {getStatusBadge(sim.status)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Day {sim.current_day}/{sim.total_days_simulated} • {sim.agent_responses_count} agent responses
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Started: {new Date(sim.started_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setActiveSimulation(sim);
                            loadSimulationDetails(sim.id);
                          }}
                        >
                          View
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Archive className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No simulation history</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
