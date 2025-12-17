import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Bell, CheckCircle, DollarSign, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";

interface Alert {
  id: string;
  alert_type: string;
  title: string;
  message: string | null;
  priority: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  acknowledged_at: string | null;
}

interface CEOAlertsPanelProps {
  tenantId: string | null;
}

export function CEOAlertsPanel({ tenantId }: CEOAlertsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    if (tenantId) {
      loadAlerts();
    }
  }, [tenantId]);

  const loadAlerts = async () => {
    if (!tenantId) return;

    setLoading(true);
    try {
      // Get alerts from ceo_alerts table
      const { data, error } = await supabase
        .from("ceo_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Failed to fetch alerts:", error);
      } else {
        setAlerts((data || []) as Alert[]);
      }
    } catch (error) {
      console.error("Failed to load alerts:", error);
    } finally {
      setLoading(false);
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from("ceo_alerts")
        .update({ acknowledged_at: new Date().toISOString() })
        .eq("id", alertId);

      if (error) throw error;

      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId ? { ...a, acknowledged_at: new Date().toISOString() } : a
        )
      );
      toast.success("Alert acknowledged");
    } catch (error) {
      console.error("Failed to acknowledge alert:", error);
      toast.error("Failed to acknowledge alert");
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "cost_spike":
      case "cost_guardrail":
        return <DollarSign className="h-4 w-4" />;
      case "performance":
        return <TrendingUp className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case "high":
      case "critical":
        return "text-destructive bg-destructive/10 border-destructive/30";
      case "medium":
        return "text-yellow-600 bg-yellow-500/10 border-yellow-500/30";
      default:
        return "text-muted-foreground bg-muted/50 border-border";
    }
  };

  const unacknowledgedAlerts = alerts.filter((a) => !a.acknowledged_at);
  const acknowledgedAlerts = alerts.filter((a) => a.acknowledged_at);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Alerts & Notifications
            </CardTitle>
            <CardDescription>
              Cost guardrails and system alerts
            </CardDescription>
          </div>
          {unacknowledgedAlerts.length > 0 && (
            <Badge variant="destructive">{unacknowledgedAlerts.length} new</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p>No alerts - everything looks good!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {unacknowledgedAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-3 rounded-lg border ${getPriorityColor(alert.priority)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{getAlertIcon(alert.alert_type)}</div>
                    <div>
                      <p className="font-medium text-sm">{alert.title}</p>
                      {alert.message && (
                        <p className="text-xs mt-1 opacity-80">{alert.message}</p>
                      )}
                      <p className="text-xs mt-1 opacity-60">
                        {new Date(alert.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => acknowledgeAlert(alert.id)}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}

            {acknowledgedAlerts.length > 0 && (
              <details className="mt-4">
                <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                  View {acknowledgedAlerts.length} acknowledged alerts
                </summary>
                <div className="mt-2 space-y-2">
                  {acknowledgedAlerts.slice(0, 5).map((alert) => (
                    <div
                      key={alert.id}
                      className="p-2 rounded-lg border border-border/50 bg-muted/20 opacity-60"
                    >
                      <div className="flex items-center gap-2">
                        {getAlertIcon(alert.alert_type)}
                        <p className="text-sm">{alert.title}</p>
                        <Badge variant="outline" className="text-xs ml-auto">
                          Acknowledged
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
