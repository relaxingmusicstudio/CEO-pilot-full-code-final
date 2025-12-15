import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  Zap,
  Clock,
  DollarSign,
  Play,
} from "lucide-react";

interface ProviderHealth {
  provider: string;
  status: "healthy" | "degraded" | "disabled" | "error";
  success_rate: number;
  consecutive_failures: number;
  is_auto_disabled: boolean;
  total_videos_generated: number;
  total_cost_cents: number;
  avg_latency_ms: number;
  last_success_at: string | null;
  last_failure_at: string | null;
}

interface ProviderConfig {
  provider: string;
  priority: number;
  is_enabled: boolean;
  cost_per_second_cents: number;
  quality_score: number;
  max_duration_seconds: number;
}

interface VideoProviderHealthMonitorProps {
  compact?: boolean;
}

export default function VideoProviderHealthMonitor({ compact = false }: VideoProviderHealthMonitorProps) {
  const [providers, setProviders] = useState<(ProviderHealth & ProviderConfig)[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overallStatus, setOverallStatus] = useState<"healthy" | "degraded" | "critical">("healthy");

  useEffect(() => {
    fetchProviderStatus();
  }, []);

  const fetchProviderStatus = async () => {
    try {
      const [healthRes, configRes] = await Promise.all([
        supabase.from("video_provider_health").select("*"),
        supabase.from("video_provider_config").select("*"),
      ]);

      const combined = (configRes.data || []).map(config => {
        const health = (healthRes.data || []).find(h => h.provider === config.provider);
        return { ...config, ...health };
      });

      setProviders(combined as any);

      // Calculate overall status
      const healthyCount = combined.filter(p => p.status === "healthy").length;
      const disabledCount = combined.filter(p => p.status === "disabled" || p.is_auto_disabled).length;
      
      if (disabledCount > 0) setOverallStatus("critical");
      else if (healthyCount < combined.length) setOverallStatus("degraded");
      else setOverallStatus("healthy");

    } catch (error) {
      console.error("Error fetching provider status:", error);
      toast.error("Failed to load provider status");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await supabase.functions.invoke("video-provider-monitor", {
        body: { action: "check_health" },
      });
      await fetchProviderStatus();
      toast.success("Provider status refreshed");
    } catch (error) {
      toast.error("Failed to refresh status");
    } finally {
      setRefreshing(false);
    }
  };

  const handleReEnable = async (provider: string) => {
    try {
      await supabase.functions.invoke("video-provider-monitor", {
        body: { action: "re_enable_provider", provider },
      });
      await fetchProviderStatus();
      toast.success(`${provider} re-enabled`);
    } catch (error) {
      toast.error("Failed to re-enable provider");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "degraded":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case "disabled":
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Activity className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      healthy: "default",
      degraded: "secondary",
      disabled: "destructive",
      error: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const formatCost = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const formatLatency = (ms: number) => ms ? `${ms}ms` : "N/A";

  if (loading) {
    return (
      <div className={compact ? "p-3" : ""}>
        {!compact && <Card>
          <CardContent className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>}
        {compact && (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    );
  }

  // Compact mode for CEO Hub widget
  if (compact) {
    return (
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <Badge 
            variant={overallStatus === "healthy" ? "default" : overallStatus === "degraded" ? "secondary" : "destructive"}
            className="text-xs"
          >
            {overallStatus === "healthy" && <CheckCircle2 className="h-3 w-3 mr-1" />}
            {overallStatus === "degraded" && <AlertTriangle className="h-3 w-3 mr-1" />}
            {overallStatus === "critical" && <XCircle className="h-3 w-3 mr-1" />}
            {overallStatus}
          </Badge>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 w-6 p-0"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
        {providers.slice(0, 3).map((provider) => (
          <div 
            key={provider.provider}
            className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs"
          >
            <div className="flex items-center gap-2">
              {getStatusIcon(provider.status)}
              <span className="font-medium capitalize">
                {provider.provider.replace("_", "/")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">
                {(provider.success_rate || 100).toFixed(0)}%
              </span>
              {getStatusBadge(provider.status)}
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground text-center pt-1">
          Total: {formatCost(providers.reduce((sum, p) => sum + (p.total_cost_cents || 0), 0))} spent
        </p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Video Provider Health
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge 
              variant={overallStatus === "healthy" ? "default" : overallStatus === "degraded" ? "secondary" : "destructive"}
            >
              {overallStatus === "healthy" && <CheckCircle2 className="h-3 w-3 mr-1" />}
              {overallStatus === "degraded" && <AlertTriangle className="h-3 w-3 mr-1" />}
              {overallStatus === "critical" && <XCircle className="h-3 w-3 mr-1" />}
              {overallStatus}
            </Badge>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {providers.map((provider) => (
          <div 
            key={provider.provider}
            className="border rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(provider.status)}
                <div>
                  <h4 className="font-medium capitalize">
                    {provider.provider.replace("_", " / ")}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Priority {provider.priority} • ${(provider.cost_per_second_cents / 100).toFixed(2)}/sec
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(provider.status)}
                {provider.is_auto_disabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReEnable(provider.provider)}
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Re-enable
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  Success Rate
                </p>
                <div className="flex items-center gap-2">
                  <Progress value={provider.success_rate || 100} className="h-2 flex-1" />
                  <span className="text-sm font-medium">{(provider.success_rate || 100).toFixed(0)}%</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Avg Latency
                </p>
                <p className="text-sm font-medium">{formatLatency(provider.avg_latency_ms)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  Videos
                </p>
                <p className="text-sm font-medium">{provider.total_videos_generated || 0}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Total Spend
                </p>
                <p className="text-sm font-medium">{formatCost(provider.total_cost_cents || 0)}</p>
              </div>
            </div>

            {provider.consecutive_failures > 0 && (
              <div className="flex items-center gap-2 text-sm text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 rounded px-3 py-2">
                <AlertTriangle className="h-4 w-4" />
                <span>{provider.consecutive_failures} consecutive failure(s)</span>
                {provider.last_failure_at && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    Last: {new Date(provider.last_failure_at).toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}