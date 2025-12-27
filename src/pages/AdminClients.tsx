import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  Building2,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  FileText,
  TrendingUp,
  RefreshCw,
  Loader2,
  Ticket,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { AssistantStrip } from "@/components/AssistantStrip";
import { StatCardWithTooltip } from "@/components/StatCardWithTooltip";

interface Client {
  id: string;
  name: string;
  business_name: string | null;
  email: string;
  phone: string | null;
  status: string;
  plan: string;
  mrr: number;
  start_date: string;
  last_contact: string | null;
  health_score: number | null;
  notes: string | null;
}

interface SupportTicket {
  id: string;
  client_id: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  created_at: string;
  resolved_at: string | null;
}

interface UsageData {
  date: string;
  api_calls: number;
  conversations_handled: number;
  appointments_booked: number;
  leads_captured: number;
  login_count: number;
}

const AdminClients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [usageData, setUsageData] = useState<UsageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingHealth, setRefreshingHealth] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("details");
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [newTicket, setNewTicket] = useState({
    subject: "",
    description: "",
    priority: "medium",
  });

  const fetchClients = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error("Error fetching clients:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTickets = async (clientId: string) => {
    const { data, error } = await supabase
      .from("client_tickets")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setTickets(data);
    }
  };

  const fetchUsage = async (clientId: string) => {
    const { data, error } = await supabase
      .from("client_usage")
      .select("*")
      .eq("client_id", clientId)
      .order("date", { ascending: false })
      .limit(30);

    if (!error && data) {
      setUsageData(data);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      fetchTickets(selectedClient.id);
      fetchUsage(selectedClient.id);
    }
  }, [selectedClient]);

  const refreshHealthScores = async () => {
    setRefreshingHealth(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "client-health-score",
        { body: { calculate_all: true } }
      );

      if (error) throw error;

      toast.success(
        `Updated health scores for ${data.results?.length || 0} clients`
      );
      fetchClients();
    } catch (error: unknown) {
      console.error("Error refreshing health scores:", error);
      toast.error("Failed to refresh health scores");
    } finally {
      setRefreshingHealth(false);
    }
  };

  const createTicket = async () => {
    if (!selectedClient || !newTicket.subject) return;

    try {
      const { error } = await supabase.from("client_tickets").insert({
        client_id: selectedClient.id,
        subject: newTicket.subject,
        description: newTicket.description,
        priority: newTicket.priority,
        status: "open",
      });

      if (error) throw error;

      toast.success("Ticket created successfully");
      setIsTicketOpen(false);
      setNewTicket({ subject: "", description: "", priority: "medium" });
      fetchTickets(selectedClient.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create ticket.";
      toast.error("Failed to create ticket: " + message);
    }
  };

  const updateTicketStatus = async (ticketId: string, status: string) => {
    try {
      const updates: { status: string; resolved_at?: string } = { status };
      if (status === "resolved" || status === "closed") {
        updates.resolved_at = new Date().toISOString();
      }

      await supabase
        .from("client_tickets")
        .update(updates)
        .eq("id", ticketId);

      toast.success(`Ticket ${status}`);
      if (selectedClient) fetchTickets(selectedClient.id);
    } catch (error) {
      toast.error("Failed to update ticket");
    }
  };

  const filteredClients = clients.filter((client) => {
    const matchesSearch =
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.business_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || client.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeClients = clients.filter((c) => c.status === "active");
  const totalMRR = activeClients.reduce((sum, c) => sum + c.mrr, 0);
  const avgHealthScore =
    activeClients.length > 0
      ? Math.round(
          activeClients.reduce((sum, c) => sum + (c.health_score || 0), 0) /
            activeClients.length
        )
      : 0;

  const openTickets = tickets.filter((t) => t.status === "open" || t.status === "in_progress");

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "paused":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "churned":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getHealthColor = (score: number | null) => {
    if (!score) return "text-muted-foreground";
    if (score >= 80) return "text-green-500";
    if (score >= 50) return "text-yellow-500";
    return "text-red-500";
  };

  const getTicketStatusIcon = (status: string) => {
    switch (status) {
      case "open":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "in_progress":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "resolved":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "closed":
        return <XCircle className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "high":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "medium":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "low":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const totalUsage = usageData.reduce(
    (acc, day) => ({
      api_calls: acc.api_calls + day.api_calls,
      conversations: acc.conversations + day.conversations_handled,
      appointments: acc.appointments + day.appointments_booked,
      leads: acc.leads + day.leads_captured,
      logins: acc.logins + day.login_count,
    }),
    { api_calls: 0, conversations: 0, appointments: 0, leads: 0, logins: 0 }
  );

  const CLIENTS_PROMPTS = [
    { label: "At-risk clients", prompt: "Which clients are at risk of leaving?" },
    { label: "Upsell opportunities", prompt: "Which clients are good for upselling?" },
    { label: "Retention tips", prompt: "How can I improve client retention?" },
  ];

  const assistantStrip = (
    <AssistantStrip
      pageContext="Client management - viewing and managing paying customers"
      quickPrompts={CLIENTS_PROMPTS}
      placeholder="Ask about your clients or get retention tips..."
    />
  );

  return (
    <PageShell
      title="Clients"
      subtitle="Manage your current customers"
      assistantStrip={assistantStrip}
    >

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCardWithTooltip
          title="Active Clients"
          simpleTitle="Paying Customers"
          value={activeClients.length}
          icon={<CheckCircle className="h-8 w-8" />}
          tooltip="Customers who are currently paying for your service"
          action="View all clients"
          onClick={() => setStatusFilter("active")}
          variant="success"
        />
        <StatCardWithTooltip
          title="Monthly Revenue"
          simpleTitle="Monthly Income"
          value={`$${totalMRR.toLocaleString()}`}
          icon={<DollarSign className="h-8 w-8" />}
          tooltip="Total money you make each month from all active clients"
          action="View revenue breakdown"
          onClick={() => {}}
          variant="primary"
        />
        <StatCardWithTooltip
          title="Avg Health Score"
          simpleTitle="Average Happiness"
          value={`${avgHealthScore}%`}
          icon={<TrendingUp className="h-8 w-8" />}
          tooltip="How well your clients are doing on average - based on usage, tickets, and engagement"
          action="See health factors"
          onClick={() => {}}
          variant="primary"
        />
        <StatCardWithTooltip
          title="At Risk"
          simpleTitle="Needs Attention"
          value={clients.filter((c) => (c.health_score || 0) < 50 && c.status === "active").length}
          icon={<AlertCircle className="h-8 w-8" />}
          tooltip="Clients who might leave if we don't help them soon - reach out to these!"
          action="View at-risk clients"
          onClick={() => {
            setStatusFilter("active");
            setSearchQuery("");
          }}
          variant="warning"
        />
      </div>

      {/* Actions Bar */}
      <div className="flex justify-end mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={refreshHealthScores}
          disabled={refreshingHealth}
        >
          {refreshingHealth ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh Health Scores
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Client List</CardTitle>
              <Badge variant="secondary">{clients.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="paused">Paused</TabsTrigger>
                <TabsTrigger value="churned">Churned</TabsTrigger>
              </TabsList>
            </Tabs>

            <ScrollArea className="h-[500px]">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No clients found</p>
                  <p className="text-xs">Convert leads to see them here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredClients.map((client) => (
                    <div
                      key={client.id}
                      onClick={() => {
                        setSelectedClient(client);
                        setActiveTab("details");
                      }}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedClient?.id === client.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <div>
                          <p className="font-medium text-sm">{client.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {client.business_name || client.email}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={getStatusColor(client.status)}
                        >
                          {client.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{client.plan} Plan</span>
                        <span className={getHealthColor(client.health_score)}>
                          {client.health_score || 0}% health
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Client Details */}
        <Card className="lg:col-span-2">
          {selectedClient ? (
            <>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">
                      {selectedClient.business_name || selectedClient.name}
                    </CardTitle>
                    <p className="text-muted-foreground">
                      {selectedClient.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={getStatusColor(selectedClient.status)}
                    >
                      {selectedClient.status}
                    </Badge>
                    <Badge variant="secondary">{selectedClient.plan}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="tickets">
                      Tickets {openTickets.length > 0 && `(${openTickets.length})`}
                    </TabsTrigger>
                    <TabsTrigger value="usage">Usage</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="space-y-6">
                    {/* Contact Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Email</p>
                          <p className="text-sm font-medium">
                            {selectedClient.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <Phone className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Phone</p>
                          <p className="text-sm font-medium">
                            {selectedClient.phone || "N/A"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <DollarSign className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">MRR</p>
                          <p className="text-sm font-medium">
                            ${selectedClient.mrr}/mo
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Customer Since
                          </p>
                          <p className="text-sm font-medium">
                            {new Date(selectedClient.start_date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Health Score */}
                    <div className="p-4 rounded-lg border">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">Health Score</p>
                        <span
                          className={`text-2xl font-bold ${getHealthColor(
                            selectedClient.health_score
                          )}`}
                        >
                          {selectedClient.health_score || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            (selectedClient.health_score || 0) >= 80
                              ? "bg-green-500"
                              : (selectedClient.health_score || 0) >= 50
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${selectedClient.health_score || 0}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Based on engagement, usage, and support metrics
                      </p>
                    </div>

                    {/* Notes */}
                    {selectedClient.notes && (
                      <div>
                        <p className="text-sm font-medium mb-2">Notes</p>
                        <p className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/50">
                          {selectedClient.notes}
                        </p>
                      </div>
                    )}

                    {/* Quick Actions */}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Send Message
                      </Button>
                      <Button variant="outline" size="sm">
                        <FileText className="h-4 w-4 mr-2" />
                        View Invoices
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveTab("usage")}
                      >
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Usage Stats
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="tickets" className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        {tickets.length} total tickets
                      </p>
                      <Button size="sm" onClick={() => setIsTicketOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        New Ticket
                      </Button>
                    </div>

                    <ScrollArea className="h-[400px]">
                      {tickets.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Ticket className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No support tickets</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {tickets.map((ticket) => (
                            <div
                              key={ticket.id}
                              className="p-4 rounded-lg border space-y-3"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3">
                                  {getTicketStatusIcon(ticket.status)}
                                  <div>
                                    <p className="font-medium text-sm">
                                      {ticket.subject}
                                    </p>
                                    {ticket.description && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {ticket.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={getPriorityColor(ticket.priority)}
                                >
                                  {ticket.priority}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">
                                  Created{" "}
                                  {new Date(ticket.created_at).toLocaleDateString()}
                                </p>
                                {ticket.status !== "closed" && (
                                  <div className="flex gap-2">
                                    {ticket.status === "open" && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          updateTicketStatus(
                                            ticket.id,
                                            "in_progress"
                                          )
                                        }
                                      >
                                        Start
                                      </Button>
                                    )}
                                    {ticket.status !== "resolved" && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          updateTicketStatus(ticket.id, "resolved")
                                        }
                                      >
                                        Resolve
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        updateTicketStatus(ticket.id, "closed")
                                      }
                                    >
                                      Close
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="usage" className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="p-3 rounded-lg bg-muted/50 text-center">
                        <p className="text-2xl font-bold">{totalUsage.api_calls}</p>
                        <p className="text-xs text-muted-foreground">API Calls</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 text-center">
                        <p className="text-2xl font-bold">
                          {totalUsage.conversations}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Conversations
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 text-center">
                        <p className="text-2xl font-bold">
                          {totalUsage.appointments}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Appointments
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 text-center">
                        <p className="text-2xl font-bold">{totalUsage.leads}</p>
                        <p className="text-xs text-muted-foreground">
                          Leads Captured
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 text-center">
                        <p className="text-2xl font-bold">{totalUsage.logins}</p>
                        <p className="text-xs text-muted-foreground">Logins</p>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      Last 30 days of usage data
                    </p>

                    <ScrollArea className="h-[300px]">
                      {usageData.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No usage data yet</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {usageData.map((day) => (
                            <div
                              key={day.date}
                              className="flex items-center justify-between p-2 rounded border text-sm"
                            >
                              <span className="text-muted-foreground">
                                {new Date(day.date).toLocaleDateString()}
                              </span>
                              <div className="flex gap-4 text-xs">
                                <span>{day.api_calls} calls</span>
                                <span>{day.conversations_handled} convos</span>
                                <span>{day.appointments_booked} appts</span>
                                <span>{day.login_count} logins</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </>
          ) : (
            <CardContent className="flex items-center justify-center h-[500px]">
              <div className="text-center text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a client to view details</p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {/* Create Ticket Dialog */}
      <Dialog open={isTicketOpen} onOpenChange={setIsTicketOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Support Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Subject</Label>
              <Input
                value={newTicket.subject}
                onChange={(e) =>
                  setNewTicket({ ...newTicket, subject: e.target.value })
                }
                placeholder="Brief description of the issue"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={newTicket.description}
                onChange={(e) =>
                  setNewTicket({ ...newTicket, description: e.target.value })
                }
                placeholder="Detailed information about the issue"
                rows={4}
              />
            </div>
            <div>
              <Label>Priority</Label>
              <Select
                value={newTicket.priority}
                onValueChange={(v) =>
                  setNewTicket({ ...newTicket, priority: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTicketOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createTicket} disabled={!newTicket.subject}>
              Create Ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
};

export default AdminClients;
