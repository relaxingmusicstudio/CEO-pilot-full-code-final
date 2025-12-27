import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { AssistantStrip } from "@/components/AssistantStrip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { format } from "date-fns";
import { DealPipeline } from "@/components/crm/DealPipeline";
import { PredictiveScoring } from "@/components/crm/PredictiveScoring";
import { ContactTimeline } from "@/components/crm/ContactTimeline";
import { CustomerTimelinePanel } from "@/components/crm/CustomerTimelinePanel";
import {
  Search,
  Filter,
  Phone,
  Mail,
  MessageSquare,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Shield,
  ShieldOff,
  Clock,
  Globe,
  Building2,
  DollarSign,
  User,
  Calendar,
  FileText,
  Send,
  CheckCircle,
  XCircle,
  AlertTriangle,
  LayoutGrid,
  List,
  Users,
} from "lucide-react";

interface Lead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  business_name: string | null;
  lead_score: number | null;
  lead_temperature: string | null;
  status: string | null;
  created_at: string | null;
  consent_to_call: boolean | null;
  consent_to_sms: boolean | null;
  consent_to_email: boolean | null;
  consent_source: string | null;
  consent_date: string | null;
  do_not_call: boolean | null;
  form_submitted_at: string | null;
  company_website: string | null;
  service_type: string | null;
  annual_revenue: string | null;
  source: string | null;
  source_detail: string | null;
  last_call_date: string | null;
  last_call_outcome: string | null;
  total_call_attempts: number | null;
  best_time_to_call: string | null;
  timezone: string | null;
  decision_maker: boolean | null;
  decision_maker_name: string | null;
  budget_range: string | null;
  next_action: string | null;
  next_action_date: string | null;
  pain_points: string[] | null;
  notes: string | null;
  team_size: string | null;
  call_volume: string | null;
}

interface LeadActivity {
  id: string;
  lead_id: string;
  activity_type: string;
  description: string | null;
  outcome: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

type SortField = 'name' | 'created_at' | 'lead_score' | 'last_call_date';
type SortDirection = 'asc' | 'desc';

const AdminCRM = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [temperatureFilter, setTemperatureFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [consentFilter, setConsentFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isTimelinePanelOpen, setIsTimelinePanelOpen] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [newNote, setNewNote] = useState("");

  // Handle row click to open timeline panel
  const handleRowClick = (lead: Lead) => {
    setSelectedLead(lead);
    setIsTimelinePanelOpen(true);
  };

  // Fetch leads
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['crm-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  // Fetch activities for selected lead
  const { data: activities = [] } = useQuery({
    queryKey: ['lead-activities', selectedLead?.id],
    queryFn: async () => {
      if (!selectedLead?.id) return [];
      const { data, error } = await supabase
        .from('lead_activities')
        .select('*')
        .eq('lead_id', selectedLead.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as LeadActivity[];
    },
    enabled: !!selectedLead?.id,
  });

  // Add activity mutation
  const addActivityMutation = useMutation({
    mutationFn: async ({ leadId, type, description }: { leadId: string; type: string; description: string }) => {
      const { error } = await supabase
        .from('lead_activities')
        .insert({
          lead_id: leadId,
          activity_type: type,
          description,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-activities'] });
      setNewNote("");
      toast.success("Note added");
    },
  });

  // Update lead mutation
  const updateLeadMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Lead> }) => {
      const { error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-leads'] });
      toast.success("Lead updated");
    },
  });

  // Filter and sort leads
  const filteredLeads = useMemo(() => {
    const result = leads.filter(lead => {
      const matchesSearch = !searchQuery || 
        lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.phone?.includes(searchQuery) ||
        lead.business_name?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesTemperature = temperatureFilter === 'all' || lead.lead_temperature === temperatureFilter;
      const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
      const matchesSource = sourceFilter === 'all' || lead.source === sourceFilter;
      
      let matchesConsent = true;
      if (consentFilter === 'consented') matchesConsent = lead.consent_to_call === true;
      if (consentFilter === 'not-consented') matchesConsent = lead.consent_to_call !== true;
      if (consentFilter === 'dnc') matchesConsent = lead.do_not_call === true;
      
      return matchesSearch && matchesTemperature && matchesStatus && matchesConsent && matchesSource;
    });

    // Sort
    result.sort((a, b) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;
      
      switch (sortField) {
        case 'name':
          aVal = a.name || '';
          bVal = b.name || '';
          break;
        case 'created_at':
          aVal = a.created_at || '';
          bVal = b.created_at || '';
          break;
        case 'lead_score':
          aVal = a.lead_score || 0;
          bVal = b.lead_score || 0;
          break;
        case 'last_call_date':
          aVal = a.last_call_date || '';
          bVal = b.last_call_date || '';
          break;
      }
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [leads, searchQuery, temperatureFilter, statusFilter, consentFilter, sourceFilter, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredLeads.length / pageSize);
  const paginatedLeads = filteredLeads.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const toggleSelectAll = () => {
    if (selectedLeads.size === paginatedLeads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(paginatedLeads.map(l => l.id)));
    }
  };

  const toggleSelectLead = (id: string) => {
    const newSet = new Set(selectedLeads);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedLeads(newSet);
  };

  const getTemperatureBadge = (temp: string | null) => {
    switch (temp) {
      case 'hot':
        return <Badge className="bg-destructive text-destructive-foreground">Hot</Badge>;
      case 'warm':
        return <Badge className="bg-accent text-accent-foreground">Warm</Badge>;
      case 'cold':
        return <Badge variant="secondary">Cold</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getConsentBadge = (lead: Lead) => {
    if (lead.do_not_call) {
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> DNC</Badge>;
    }
    if (lead.consent_to_call) {
      return <Badge className="bg-green-600 text-white gap-1"><Shield className="h-3 w-3" /> Consented</Badge>;
    }
    return <Badge variant="outline" className="gap-1 text-muted-foreground"><ShieldOff className="h-3 w-3" /> No Consent</Badge>;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'call': return <Phone className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      case 'sms': return <MessageSquare className="h-4 w-4" />;
      case 'note': return <FileText className="h-4 w-4" />;
      case 'form_submit': return <Send className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  // Get unique sources for filter
  const uniqueSources = useMemo(() => {
    const sources = new Set(leads.map(l => l.source).filter(Boolean));
    return Array.from(sources) as string[];
  }, [leads]);

  const CRM_PROMPTS = [
    { label: "Hot leads", prompt: "Which leads should I call first today?" },
    { label: "Follow-up tips", prompt: "How can I improve my follow-up process?" },
    { label: "Conversion help", prompt: "How can I convert more leads?" },
  ];

  const assistantStrip = (
    <AssistantStrip
      pageContext="CRM - Lead management and sales tracking"
      quickPrompts={CRM_PROMPTS}
      placeholder="Ask about your leads or get sales tips..."
    />
  );

  return (
    <PageShell
      title="CRM"
      subtitle="Lead management with drill-down profiles"
      assistantStrip={assistantStrip}
    >
      {/* Enhanced CRM with Tabs */}
      <Tabs defaultValue="leads" className="space-y-6">
        <TabsList>
          <TabsTrigger value="leads" className="gap-2"><List className="h-4 w-4" /> Leads</TabsTrigger>
          <TabsTrigger value="pipeline" className="gap-2"><LayoutGrid className="h-4 w-4" /> Pipeline</TabsTrigger>
          <TabsTrigger value="scoring" className="gap-2"><DollarSign className="h-4 w-4" /> AI Scoring</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          <DealPipeline />
        </TabsContent>

        <TabsContent value="scoring">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PredictiveScoring />
            <ContactTimeline />
          </div>
        </TabsContent>

        <TabsContent value="leads">
      {/* Filters Bar */}
      <Card className="p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, phone, company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={temperatureFilter} onValueChange={setTemperatureFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Temperature" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Temps</SelectItem>
              <SelectItem value="hot">🔥 Hot</SelectItem>
              <SelectItem value="warm">🌡️ Warm</SelectItem>
              <SelectItem value="cold">❄️ Cold</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
              <SelectItem value="proposal">Proposal</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>

          <Select value={consentFilter} onValueChange={setConsentFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Consent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Consent</SelectItem>
              <SelectItem value="consented">✅ Consented</SelectItem>
              <SelectItem value="not-consented">⚠️ No Consent</SelectItem>
              <SelectItem value="dnc">🚫 Do Not Call</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {uniqueSources.map(source => (
                <SelectItem key={source} value={source}>{source}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            {filteredLeads.length} leads
          </div>
        </div>

        {selectedLeads.size > 0 && (
          <div className="flex items-center gap-4 mt-4 pt-4 border-t">
            <span className="text-sm font-medium">{selectedLeads.size} selected</span>
            <Button variant="outline" size="sm" onClick={() => setSelectedLeads(new Set())}>
              Clear
            </Button>
            <Button variant="outline" size="sm">
              Add Tag
            </Button>
            <Button variant="outline" size="sm">
              Export CSV
            </Button>
          </div>
        )}
      </Card>

      {/* Data Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={selectedLeads.size === paginatedLeads.length && paginatedLeads.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-2">
                    Contact <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Consent</TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('lead_score')}>
                  <div className="flex items-center gap-2">
                    Score <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead>Temperature</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Service Type</TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('last_call_date')}>
                  <div className="flex items-center gap-2">
                    Last Contact <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('created_at')}>
                  <div className="flex items-center gap-2">
                    Created <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    Loading leads...
                  </TableCell>
                </TableRow>
              ) : paginatedLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-8">
                    <EmptyState
                      icon={Users}
                      title="No leads found"
                      description="Connect a lead source or add leads manually to get started"
                      actionLabel="Add Lead"
                      onAction={() => toast.info("Add lead feature coming soon")}
                      size="sm"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLeads.map((lead) => (
                  <TableRow 
                    key={lead.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(lead)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedLeads.has(lead.id)}
                        onCheckedChange={() => toggleSelectLead(lead.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{lead.name || 'Unknown'}</div>
                        <div className="text-sm text-muted-foreground">{lead.email}</div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{lead.phone || '-'}</TableCell>
                    <TableCell>{lead.business_name || '-'}</TableCell>
                    <TableCell>{getConsentBadge(lead)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-accent" 
                            style={{ width: `${lead.lead_score || 0}%` }} 
                          />
                        </div>
                        <span className="text-sm">{lead.lead_score || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getTemperatureBadge(lead.lead_temperature)}</TableCell>
                    <TableCell>{lead.source || '-'}</TableCell>
                    <TableCell>{lead.service_type || '-'}</TableCell>
                    <TableCell>
                      {lead.last_call_date 
                        ? format(new Date(lead.last_call_date), 'MMM d, yyyy')
                        : '-'
                      }
                    </TableCell>
                    <TableCell>
                      {lead.created_at 
                        ? format(new Date(lead.created_at), 'MMM d, yyyy')
                        : '-'
                      }
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page:</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-[70px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Lead Detail Sheet */}
      <Sheet open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedLead && (
            <>
              <SheetHeader className="mb-6">
                <div className="flex items-start justify-between">
                  <div>
                    <SheetTitle className="text-2xl">{selectedLead.name || 'Unknown'}</SheetTitle>
                    <p className="text-muted-foreground">{selectedLead.business_name}</p>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    {getTemperatureBadge(selectedLead.lead_temperature)}
                    {getConsentBadge(selectedLead)}
                  </div>
                </div>
              </SheetHeader>

              {/* Quick Actions */}
              <div className="flex gap-2 mb-6">
                <Button 
                  size="sm" 
                  className="gap-2"
                  disabled={!selectedLead.consent_to_call || selectedLead.do_not_call === true}
                  onClick={() => {
                    if (!selectedLead.consent_to_call) {
                      toast.error("Cannot call - no consent on file");
                      return;
                    }
                    toast.info("Opening dialer...");
                  }}
                >
                  <Phone className="h-4 w-4" />
                  Call
                  {!selectedLead.consent_to_call && <AlertTriangle className="h-3 w-3" />}
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                  <MessageSquare className="h-4 w-4" />
                  SMS
                </Button>
              </div>

              <Tabs defaultValue="details" className="w-full">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-4 space-y-6">
                  {/* Contact Info */}
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <User className="h-4 w-4" /> Contact Information
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-muted-foreground">Email:</span> {selectedLead.email || '-'}</div>
                      <div><span className="text-muted-foreground">Phone:</span> {selectedLead.phone || '-'}</div>
                      <div><span className="text-muted-foreground">Timezone:</span> {selectedLead.timezone || '-'}</div>
                      <div><span className="text-muted-foreground">Best Time:</span> {selectedLead.best_time_to_call || '-'}</div>
                    </div>
                  </div>

                  {/* Business Info */}
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Building2 className="h-4 w-4" /> Business Information
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-muted-foreground">Company:</span> {selectedLead.business_name || '-'}</div>
                      <div><span className="text-muted-foreground">Website:</span> {selectedLead.company_website || '-'}</div>
                      <div><span className="text-muted-foreground">Service Type:</span> {selectedLead.service_type || '-'}</div>
                      <div><span className="text-muted-foreground">Team Size:</span> {selectedLead.team_size || '-'}</div>
                      <div><span className="text-muted-foreground">Call Volume:</span> {selectedLead.call_volume || '-'}</div>
                      <div><span className="text-muted-foreground">Revenue:</span> {selectedLead.annual_revenue || '-'}</div>
                    </div>
                  </div>

                  {/* Decision Making */}
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <DollarSign className="h-4 w-4" /> Decision Making
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-muted-foreground">Decision Maker:</span> {selectedLead.decision_maker ? 'Yes' : selectedLead.decision_maker_name || 'Unknown'}</div>
                      <div><span className="text-muted-foreground">Budget:</span> {selectedLead.budget_range || '-'}</div>
                    </div>
                  </div>

                  {/* Source & Consent */}
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Globe className="h-4 w-4" /> Source & Consent
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-muted-foreground">Source:</span> {selectedLead.source || '-'}</div>
                      <div><span className="text-muted-foreground">Detail:</span> {selectedLead.source_detail || '-'}</div>
                      <div><span className="text-muted-foreground">Consent Date:</span> {selectedLead.consent_date ? format(new Date(selectedLead.consent_date), 'MMM d, yyyy') : '-'}</div>
                      <div><span className="text-muted-foreground">Consent Source:</span> {selectedLead.consent_source || '-'}</div>
                    </div>
                  </div>

                  {/* Call Stats */}
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Phone className="h-4 w-4" /> Call History
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-muted-foreground">Total Attempts:</span> {selectedLead.total_call_attempts || 0}</div>
                      <div><span className="text-muted-foreground">Last Call:</span> {selectedLead.last_call_date ? format(new Date(selectedLead.last_call_date), 'MMM d, yyyy') : '-'}</div>
                      <div className="col-span-2"><span className="text-muted-foreground">Last Outcome:</span> {selectedLead.last_call_outcome || '-'}</div>
                    </div>
                  </div>

                  {/* Next Action */}
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> Next Action
                    </h3>
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="font-medium">{selectedLead.next_action || 'No action scheduled'}</div>
                      {selectedLead.next_action_date && (
                        <div className="text-sm text-muted-foreground mt-1">
                          Due: {format(new Date(selectedLead.next_action_date), 'MMM d, yyyy h:mm a')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pain Points */}
                  {selectedLead.pain_points && selectedLead.pain_points.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-3">Pain Points</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedLead.pain_points.map((point, i) => (
                          <Badge key={i} variant="secondary">{point}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="timeline" className="mt-4">
                  <div className="space-y-4">
                    {activities.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">No activity yet</p>
                    ) : (
                      activities.map((activity) => (
                        <div key={activity.id} className="flex gap-3 p-3 bg-muted/50 rounded-lg">
                          <div className="mt-1 text-muted-foreground">
                            {getActivityIcon(activity.activity_type)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium capitalize">{activity.activity_type}</span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(activity.created_at), 'MMM d, h:mm a')}
                              </span>
                            </div>
                            {activity.description && (
                              <p className="text-sm text-muted-foreground mt-1">{activity.description}</p>
                            )}
                            {activity.outcome && (
                              <Badge variant="outline" className="mt-2">{activity.outcome}</Badge>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="notes" className="mt-4">
                  <div className="space-y-4">
                    <div>
                      <Textarea
                        placeholder="Add a note..."
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        className="mb-2"
                      />
                      <Button 
                        size="sm"
                        disabled={!newNote.trim()}
                        onClick={() => {
                          if (selectedLead) {
                            addActivityMutation.mutate({
                              leadId: selectedLead.id,
                              type: 'note',
                              description: newNote.trim(),
                            });
                          }
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Note
                      </Button>
                    </div>

                    {selectedLead.notes && (
                      <div className="p-3 bg-muted rounded-lg">
                        <h4 className="font-medium mb-2">General Notes</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedLead.notes}</p>
                      </div>
                    )}

                    {activities
                      .filter(a => a.activity_type === 'note')
                      .map((activity) => (
                        <div key={activity.id} className="p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(activity.created_at), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                          <p className="text-sm">{activity.description}</p>
                        </div>
                      ))}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
      </TabsContent>
      </Tabs>

      {/* Customer Timeline Panel */}
      <CustomerTimelinePanel
        isOpen={isTimelinePanelOpen}
        onClose={() => setIsTimelinePanelOpen(false)}
        leadId={selectedLead?.id}
        customerName={selectedLead?.name || undefined}
        customerEmail={selectedLead?.email || undefined}
        customerPhone={selectedLead?.phone || undefined}
      />
    </PageShell>
  );
};

export default AdminCRM;
