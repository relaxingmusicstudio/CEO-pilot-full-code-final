import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Label } from "@/components/ui/label";
import {
  Search,
  User,
  Phone,
  Mail,
  Building2,
  Calendar,
  TrendingUp,
  Flame,
  Snowflake,
  ThermometerSun,
  UserCheck,
  DollarSign,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Lead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  business_name: string | null;
  trade: string | null;
  lead_score: number | null;
  lead_temperature: string | null;
  status: string | null;
  timeline: string | null;
  notes: string | null;
  created_at: string;
}

const AdminLeads = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [temperatureFilter, setTemperatureFilter] = useState<string>("all");
  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [convertForm, setConvertForm] = useState({
    plan: "starter",
    mrr: 499,
  });

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (error) {
      console.error("Error fetching leads:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.business_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTemp =
      temperatureFilter === "all" ||
      lead.lead_temperature === temperatureFilter;
    return matchesSearch && matchesTemp;
  });

  const getTemperatureIcon = (temp: string | null) => {
    switch (temp) {
      case "hot":
        return <Flame className="h-4 w-4 text-red-500" />;
      case "warm":
        return <ThermometerSun className="h-4 w-4 text-orange-500" />;
      case "cold":
        return <Snowflake className="h-4 w-4 text-blue-500" />;
      default:
        return <ThermometerSun className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTemperatureColor = (temp: string | null) => {
    switch (temp) {
      case "hot":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "warm":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "cold":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const handleConvertToClient = async () => {
    if (!selectedLead) return;

    try {
      // Create client from lead
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .insert({
          lead_id: selectedLead.id,
          name: selectedLead.name || "Unknown",
          business_name: selectedLead.business_name,
          email: selectedLead.email || "",
          phone: selectedLead.phone,
          plan: convertForm.plan,
          mrr: convertForm.mrr,
          status: "active",
          health_score: 100,
          notes: selectedLead.notes,
        })
        .select()
        .single();

      if (clientError) throw clientError;

      // Update lead status
      await supabase
        .from("leads")
        .update({ status: "converted", converted_at: new Date().toISOString() })
        .eq("id", selectedLead.id);

      toast.success(`${selectedLead.name || "Lead"} converted to client!`);
      setIsConvertOpen(false);
      setSelectedLead(null);
      fetchLeads();
    } catch (error: any) {
      console.error("Error converting lead:", error);
      toast.error("Failed to convert lead: " + error.message);
    }
  };

  const hotLeads = leads.filter((l) => l.lead_temperature === "hot").length;
  const warmLeads = leads.filter((l) => l.lead_temperature === "warm").length;
  const avgScore =
    leads.length > 0
      ? Math.round(
          leads.reduce((sum, l) => sum + (l.lead_score || 0), 0) / leads.length
        )
      : 0;

  return (
    <AdminLayout title="Leads" subtitle="Manage and convert your leads">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Leads</p>
                <p className="text-2xl font-bold">{leads.length}</p>
              </div>
              <User className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Hot Leads</p>
                <p className="text-2xl font-bold">{hotLeads}</p>
              </div>
              <Flame className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Warm Leads</p>
                <p className="text-2xl font-bold">{warmLeads}</p>
              </div>
              <ThermometerSun className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Score</p>
                <p className="text-2xl font-bold">{avgScore}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Lead List</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <Tabs value={temperatureFilter} onValueChange={setTemperatureFilter}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="hot">Hot</TabsTrigger>
                <TabsTrigger value="warm">Warm</TabsTrigger>
                <TabsTrigger value="cold">Cold</TabsTrigger>
              </TabsList>
            </Tabs>

            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {filteredLeads.map((lead) => (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedLead?.id === lead.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <p className="font-medium text-sm">
                          {lead.name || "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {lead.business_name || lead.email || "No info"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={getTemperatureColor(lead.lead_temperature)}
                      >
                        {lead.lead_temperature || "unknown"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Score: {lead.lead_score || 0}</span>
                      <span>{lead.status || "new"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Lead Details */}
        <Card className="lg:col-span-2">
          {selectedLead ? (
            <>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">
                      {selectedLead.name || "Unknown Lead"}
                    </CardTitle>
                    <p className="text-muted-foreground">
                      {selectedLead.business_name || "No business name"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getTemperatureIcon(selectedLead.lead_temperature)}
                    <Badge
                      variant="outline"
                      className={getTemperatureColor(selectedLead.lead_temperature)}
                    >
                      {selectedLead.lead_temperature || "unknown"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Contact Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="text-sm font-medium">
                        {selectedLead.email || "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="text-sm font-medium">
                        {selectedLead.phone || "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <TrendingUp className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Lead Score</p>
                      <p className="text-sm font-medium">
                        {selectedLead.lead_score || 0} / 100
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p className="text-sm font-medium">
                        {new Date(selectedLead.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Lead Score Bar */}
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">Lead Score</p>
                    <span className="text-2xl font-bold">
                      {selectedLead.lead_score || 0}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        (selectedLead.lead_score || 0) >= 70
                          ? "bg-green-500"
                          : (selectedLead.lead_score || 0) >= 40
                          ? "bg-yellow-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${selectedLead.lead_score || 0}%` }}
                    />
                  </div>
                </div>

                {/* Notes */}
                {selectedLead.notes && (
                  <div>
                    <p className="text-sm font-medium mb-2">Notes</p>
                    <p className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/50">
                      {selectedLead.notes}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {selectedLead.status !== "converted" && (
                    <Button onClick={() => setIsConvertOpen(true)}>
                      <UserCheck className="h-4 w-4 mr-2" />
                      Convert to Client
                    </Button>
                  )}
                  {selectedLead.status === "converted" && (
                    <Badge className="bg-green-500">Already Converted</Badge>
                  )}
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="flex items-center justify-center h-[500px]">
              <div className="text-center text-muted-foreground">
                <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a lead to view details</p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {/* Convert to Client Dialog */}
      <Dialog open={isConvertOpen} onOpenChange={setIsConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert Lead to Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Converting: <strong>{selectedLead?.name}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                {selectedLead?.business_name}
              </p>
            </div>
            <div>
              <Label>Select Plan</Label>
              <Select
                value={convertForm.plan}
                onValueChange={(v) => {
                  const mrr = v === "starter" ? 499 : v === "growth" ? 999 : 1999;
                  setConvertForm({ plan: v, mrr });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter - $499/mo</SelectItem>
                  <SelectItem value="growth">Growth - $999/mo</SelectItem>
                  <SelectItem value="scale">Scale - $1999/mo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Monthly Revenue (MRR)</Label>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  value={convertForm.mrr}
                  onChange={(e) =>
                    setConvertForm({ ...convertForm, mrr: Number(e.target.value) })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConvertOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConvertToClient}>
              <UserCheck className="h-4 w-4 mr-2" />
              Convert to Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminLeads;
