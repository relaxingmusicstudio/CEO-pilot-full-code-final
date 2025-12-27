import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Power, 
  Calendar, 
  Bell, 
  Shield, 
  Zap, 
  History,
  Plane,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Bot
} from "lucide-react";

interface AutopilotConfig {
  id: string;
  is_active: boolean;
  absence_start: string | null;
  absence_end: string | null;
  escalation_phone: string | null;
  escalation_email: string | null;
  auto_respond_clients: boolean;
  auto_execute_followups: boolean;
  auto_manage_campaigns: boolean;
  notify_on_execution: boolean;
}

interface StandingOrder {
  id: string;
  rule_name: string;
  rule_type: string;
  action_type: string;
  is_active: boolean;
  executions_count: number | null;
  last_executed_at: string | null;
  description: string | null;
  priority?: number;
}

interface AutoExecution {
  id: string;
  action_type: string;
  success: boolean;
  executed_at: string;
  result: Record<string, unknown>;
  ceo_standing_orders?: { rule_name: string };
}

const CEOAutopilotController = () => {
  const [config, setConfig] = useState<AutopilotConfig | null>(null);
  const [orders, setOrders] = useState<StandingOrder[]>([]);
  const [executions, setExecutions] = useState<AutoExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [configRes, ordersRes, execRes] = await Promise.all([
        supabase.from("ceo_autopilot_config").select("*").limit(1).single(),
        supabase.from("ceo_standing_orders").select("*").order("priority", { ascending: false }),
        supabase.from("ceo_auto_executions")
          .select("*, ceo_standing_orders(rule_name)")
          .order("executed_at", { ascending: false })
          .limit(20)
      ]);

      if (configRes.data) setConfig(configRes.data as AutopilotConfig);
      if (ordersRes.data) setOrders(ordersRes.data as StandingOrder[]);
      if (execRes.data) setExecutions(execRes.data as AutoExecution[]);
    } catch (err) {
      console.error("Failed to fetch autopilot data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Subscribe to real-time execution updates
    const channel = supabase
      .channel("autopilot-executions")
      .on("postgres_changes", { 
        event: "INSERT", 
        schema: "public", 
        table: "ceo_auto_executions" 
      }, (payload) => {
        setExecutions(prev => [payload.new as AutoExecution, ...prev.slice(0, 19)]);
        toast.success("Autopilot executed action", {
          description: (payload.new as AutoExecution).action_type
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const updateConfig = async (updates: Partial<AutopilotConfig>) => {
    if (!config) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("ceo_autopilot_config")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", config.id);

      if (error) throw error;
      setConfig(prev => prev ? { ...prev, ...updates } : null);
      toast.success("Settings updated");
    } catch (err) {
      toast.error("Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  const toggleOrder = async (orderId: string, isActive: boolean) => {
    try {
      await supabase
        .from("ceo_standing_orders")
        .update({ is_active: isActive })
        .eq("id", orderId);

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, is_active: isActive } : o));
      toast.success(isActive ? "Rule activated" : "Rule paused");
    } catch (err) {
      toast.error("Failed to update rule");
    }
  };

  const runManualCheck = async () => {
    try {
      const { error } = await supabase.functions.invoke("ceo-autopilot", {
        body: { action: "run_scheduled_checks" }
      });
      if (error) throw error;
      toast.success("Manual check completed");
      fetchData();
    } catch (err) {
      toast.error("Check failed");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Loading autopilot configuration...
        </CardContent>
      </Card>
    );
  }

  const isInAbsence = config?.absence_start && config?.absence_end
    ? new Date() >= new Date(config.absence_start) && new Date() <= new Date(config.absence_end)
    : false;

  return (
    <div className="space-y-6">
      {/* Master Control */}
      <Card className={config?.is_active ? "border-green-500/50 bg-green-500/5" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              CEO Autopilot
            </div>
            <Badge variant={config?.is_active ? "default" : "secondary"} className="text-sm">
              {config?.is_active ? "ACTIVE" : isInAbsence ? "IN ABSENCE MODE" : "STANDBY"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Enable Full Autopilot</p>
              <p className="text-sm text-muted-foreground">AI will execute all standing orders autonomously</p>
            </div>
            <Switch 
              checked={config?.is_active || false} 
              onCheckedChange={(checked) => updateConfig({ is_active: checked })}
              disabled={saving}
            />
          </div>

          <Separator />

          {/* Absence Mode */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Plane className="h-4 w-4" />
              Vacation / Absence Mode
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start Date</Label>
                <Input 
                  type="datetime-local"
                  value={config?.absence_start?.slice(0, 16) || ""}
                  onChange={(e) => updateConfig({ absence_start: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">End Date</Label>
                <Input 
                  type="datetime-local"
                  value={config?.absence_end?.slice(0, 16) || ""}
                  onChange={(e) => updateConfig({ absence_end: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  className="text-sm"
                />
              </div>
            </div>
            {isInAbsence && (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-500">
                <Calendar className="h-3 w-3 mr-1" />
                Currently in absence period - Autopilot active
              </Badge>
            )}
          </div>

          <Separator />

          {/* Quick Toggles */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
              <span className="text-sm">Auto Follow-ups</span>
              <Switch 
                checked={config?.auto_execute_followups || false}
                onCheckedChange={(checked) => updateConfig({ auto_execute_followups: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
              <span className="text-sm">Auto Campaigns</span>
              <Switch 
                checked={config?.auto_manage_campaigns || false}
                onCheckedChange={(checked) => updateConfig({ auto_manage_campaigns: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
              <span className="text-sm">Client Responses</span>
              <Switch 
                checked={config?.auto_respond_clients || false}
                onCheckedChange={(checked) => updateConfig({ auto_respond_clients: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
              <span className="text-sm">Notify on Action</span>
              <Switch 
                checked={config?.notify_on_execution || false}
                onCheckedChange={(checked) => updateConfig({ notify_on_execution: checked })}
              />
            </div>
          </div>

          <Button onClick={runManualCheck} variant="outline" className="w-full">
            <Zap className="h-4 w-4 mr-2" />
            Run Manual Check Now
          </Button>
        </CardContent>
      </Card>

      {/* Standing Orders */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-primary" />
            Standing Orders ({orders.filter(o => o.is_active).length} Active)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {orders.map((order) => (
                <div 
                  key={order.id}
                  className={`p-3 rounded-lg border ${order.is_active ? "bg-green-500/5 border-green-500/20" : "bg-muted/30"}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{order.rule_name}</span>
                        <Badge variant="outline" className="text-xs">{order.rule_type}</Badge>
                        <Badge variant="secondary" className="text-xs">P{order.priority}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{order.description}</p>
                      {order.last_executed_at && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last run: {new Date(order.last_executed_at).toLocaleString()}
                          <span className="ml-2">({order.executions_count} total)</span>
                        </p>
                      )}
                    </div>
                    <Switch 
                      checked={order.is_active}
                      onCheckedChange={(checked) => toggleOrder(order.id, checked)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Execution Log */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            Recent Auto-Executions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {executions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No autonomous actions taken yet
            </p>
          ) : (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {executions.map((exec) => (
                  <div 
                    key={exec.id}
                    className="flex items-center justify-between p-2 bg-muted/30 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      {exec.success ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium">
                          {exec.ceo_standing_orders?.rule_name || exec.action_type}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(exec.executed_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant={exec.success ? "outline" : "destructive"} className="text-xs">
                      {exec.action_type}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CEOAutopilotController;
