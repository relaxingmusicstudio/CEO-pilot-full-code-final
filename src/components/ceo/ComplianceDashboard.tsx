import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  RefreshCw,
  FileText,
  Activity,
} from "lucide-react";

interface ComplianceRule {
  id: string;
  rule_key: string;
  rule_value: string;
  rule_type: string;
  category: string;
  description: string;
  is_active: boolean;
  enforcement_level: string;
}

interface AuditLogEntry {
  id: string;
  agent_name: string;
  action_type: string;
  compliance_status: string | null;
  risk_score: number | null;
  rule_checked: string | null;
  created_at: string;
  metadata: unknown;
}

interface ComplianceHealth {
  health_score: number;
  total_checks: number;
  passed_checks: number;
  blocked_actions: number;
  flagged_actions: number;
  risk_alerts: number;
}

const ComplianceDashboard = () => {
  const [health, setHealth] = useState<ComplianceHealth | null>(null);
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [healthRes, rulesRes, auditRes] = await Promise.all([
        supabase
          .from("compliance_health")
          .select("*")
          .order("date", { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from("compliance_rules")
          .select("*")
          .order("category"),
        supabase
          .from("compliance_audit_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (healthRes.data) {
        setHealth(healthRes.data);
      } else {
        // Default health if no data
        setHealth({
          health_score: 100,
          total_checks: 0,
          passed_checks: 0,
          blocked_actions: 0,
          flagged_actions: 0,
          risk_alerts: 0,
        });
      }

      setRules(rulesRes.data || []);
      setAuditLog(auditRes.data || []);
    } catch (error) {
      console.error("Error fetching compliance data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 90) return "text-green-500";
    if (score >= 70) return "text-yellow-500";
    return "text-red-500";
  };

  const getHealthIcon = (score: number) => {
    if (score >= 90) return <ShieldCheck className="h-8 w-8 text-green-500" />;
    if (score >= 70) return <ShieldAlert className="h-8 w-8 text-yellow-500" />;
    return <ShieldX className="h-8 w-8 text-red-500" />;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "blocked":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "flagged":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const categories = ["all", ...new Set(rules.map((r) => r.category))];

  const filteredRules =
    selectedCategory === "all"
      ? rules
      : rules.filter((r) => r.category === selectedCategory);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "scraping":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "outreach":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "privacy":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "spend":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Health Score Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="col-span-1 md:col-span-2">
          <CardContent className="pt-6">
            <div className="flex items-center gap-6">
              {health && getHealthIcon(health.health_score)}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">
                    Compliance Health Score
                  </span>
                  <span
                    className={`text-2xl font-bold ${getHealthColor(
                      health?.health_score || 0
                    )}`}
                  >
                    {health?.health_score || 100}%
                  </span>
                </div>
                <Progress value={health?.health_score || 100} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{health?.passed_checks || 0}</p>
                <p className="text-xs text-muted-foreground">Checks Passed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{health?.blocked_actions || 0}</p>
                <p className="text-xs text-muted-foreground">Actions Blocked</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rules & Audit Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Rules */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Rules of Engagement
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={fetchData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap mt-2">
              {categories.map((cat) => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? "default" : "outline"}
                  size="sm"
                  className="text-xs capitalize"
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {filteredRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-3 rounded-lg border bg-card/50 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={getCategoryColor(rule.category)}
                        >
                          {rule.category}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">
                          {rule.rule_key}
                        </span>
                      </div>
                      <Badge
                        variant={
                          rule.enforcement_level === "block"
                            ? "destructive"
                            : rule.enforcement_level === "warn"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {rule.enforcement_level}
                      </Badge>
                    </div>
                    <p className="text-sm">{rule.description}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Value: {rule.rule_value}</span>
                      <span className={rule.is_active ? "text-green-500" : "text-red-500"}>
                        {rule.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Audit Log */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Compliance Audit Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {auditLog.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No audit logs yet</p>
                    <p className="text-xs">Compliance checks will appear here</p>
                  </div>
                ) : (
                  auditLog.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg border bg-card/50 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(log.compliance_status)}
                          <span className="font-medium text-sm">
                            {log.agent_name}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="capitalize">{log.action_type}</span>
                        {log.rule_checked && (
                          <>
                            <span>•</span>
                            <span className="font-mono">{log.rule_checked}</span>
                          </>
                        )}
                      </div>
                      {log.risk_score > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Risk:</span>
                          <Badge
                            variant={
                              log.risk_score > 30
                                ? "destructive"
                                : log.risk_score > 15
                                ? "secondary"
                                : "outline"
                            }
                            className="text-xs"
                          >
                            {log.risk_score}
                          </Badge>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ComplianceDashboard;
