import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/AdminLayout";
import { toast } from "sonner";
import { format, subDays } from "date-fns";
import {
  FileText,
  Download,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Activity,
  Bot,
  Database,
  Shield,
} from "lucide-react";

interface AuditLogEntry {
  id: string;
  timestamp: string;
  agent_name: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  description: string;
  success: boolean;
  user_id: string | null;
  request_snapshot: Record<string, unknown> | null;
  response_snapshot: Record<string, unknown> | null;
}

interface AuditStats {
  total_today: number;
  success_count: number;
  failure_count: number;
  top_agents: { agent_name: string; count: number }[];
}

const AGENT_OPTIONS = [
  "All Agents",
  "ceo-agent",
  "billing-agent",
  "llm-gateway",
  "finance-agent",
  "content-generator",
  "multi-agent-coordinator",
  "lead-enrichment",
];

const ACTION_TYPE_OPTIONS = [
  "All Actions",
  "query",
  "generate",
  "create",
  "update",
  "delete",
  "api_call",
  "webhook",
];

const AdminAudit = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [agentFilter, setAgentFilter] = useState("All Agents");
  const [actionFilter, setActionFilter] = useState("All Actions");
  const [dateRange, setDateRange] = useState("7");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const PAGE_SIZE = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = subDays(new Date(), parseInt(dateRange)).toISOString();
      
      let query = supabase
        .from("platform_audit_log")
        .select("*")
        .gte("timestamp", startDate)
        .order("timestamp", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (agentFilter !== "All Agents") {
        query = query.eq("agent_name", agentFilter);
      }

      if (actionFilter !== "All Actions") {
        query = query.eq("action_type", actionFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      const filteredData = searchTerm
        ? data?.filter(
            (log) =>
              log.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
              log.entity_id?.toLowerCase().includes(searchTerm.toLowerCase())
          )
        : data;

      setLogs(filteredData || []);
      setHasMore((data?.length || 0) === PAGE_SIZE);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      toast.error("Failed to fetch audit logs");
    } finally {
      setLoading(false);
    }
  }, [actionFilter, agentFilter, dateRange, page, searchTerm]);

  const fetchStats = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("platform_audit_log")
        .select("agent_name, success")
        .gte("timestamp", today.toISOString());

      if (error) throw error;

      const total = data?.length || 0;
      const successCount = data?.filter((l) => l.success).length || 0;
      const failureCount = total - successCount;

      // Count by agent
      const agentCounts: Record<string, number> = {};
      data?.forEach((log) => {
        agentCounts[log.agent_name] = (agentCounts[log.agent_name] || 0) + 1;
      });

      const topAgents = Object.entries(agentCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([agent_name, count]) => ({ agent_name, count }));

      setStats({
        total_today: total,
        success_count: successCount,
        failure_count: failureCount,
        top_agents: topAgents,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

  const handleExportCSV = () => {
    if (!logs.length) {
      toast.error("No data to export");
      return;
    }

    const headers = [
      "Timestamp",
      "Agent",
      "Action",
      "Entity Type",
      "Entity ID",
      "Description",
      "Success",
    ];

    const rows = logs.map((log) => [
      format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss"),
      log.agent_name,
      log.action_type,
      log.entity_type || "",
      log.entity_id || "",
      log.description || "",
      log.success ? "Yes" : "No",
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join(
      "\n"
    );

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success("Audit log exported");
  };

  const handleSearch = () => {
    setPage(0);
    fetchLogs();
  };

  const getAgentIcon = (agent: string) => {
    if (agent.includes("ceo")) return <Bot className="h-4 w-4 text-purple-500" />;
    if (agent.includes("billing")) return <Database className="h-4 w-4 text-green-500" />;
    if (agent.includes("llm")) return <Activity className="h-4 w-4 text-blue-500" />;
    return <Shield className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <AdminLayout title="Audit Trail" subtitle="Complete activity log for compliance and debugging">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Actions Today</p>
                <p className="text-2xl font-bold">{stats?.total_today || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Successful</p>
                <p className="text-2xl font-bold">{stats?.success_count || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold">{stats?.failure_count || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Bot className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Top Agent</p>
                <p className="text-lg font-bold truncate">
                  {stats?.top_agents[0]?.agent_name || "N/A"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search description or entity ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>

            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                {AGENT_OPTIONS.map((agent) => (
                  <SelectItem key={agent} value={agent}>
                    {agent}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPE_OPTIONS.map((action) => (
                  <SelectItem key={action} value={action}>
                    {action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24h</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={handleSearch} variant="secondary">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>

            <Button onClick={handleExportCSV} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Audit Log</CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Timestamp</TableHead>
                  <TableHead className="w-[140px]">Agent</TableHead>
                  <TableHead className="w-[100px]">Action</TableHead>
                  <TableHead className="w-[100px]">Entity</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[80px] text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Loading audit logs...
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No audit logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs">
                        {format(new Date(log.timestamp), "MMM dd HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getAgentIcon(log.agent_name)}
                          <span className="text-sm truncate max-w-[100px]">
                            {log.agent_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {log.action_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.entity_type || "-"}
                      </TableCell>
                      <TableCell className="text-sm max-w-[300px] truncate">
                        {log.description || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {log.success ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {logs.length} entries
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={!hasMore}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default AdminAudit;
