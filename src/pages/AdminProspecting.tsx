import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Search, 
  MapPin, 
  Phone, 
  Globe, 
  Star, 
  MessageSquare,
  UserPlus,
  Loader2,
  RefreshCw,
  Filter,
  CheckCircle2,
  XCircle,
  Building2
} from "lucide-react";
import { PageChatHeader } from "@/components/PageChatHeader";
import { StatCardWithTooltip } from "@/components/StatCardWithTooltip";
import { type Decision } from "@/contracts/decision";

interface Prospect {
  id: string;
  business_name: string;
  phone: string | null;
  phone_type: string | null;
  sms_capable: boolean | null;
  website: string | null;
  address: string | null;
  rating: number | null;
  review_count: number | null;
  categories: string[] | null;
  status: string;
  converted_to_lead_id: string | null;
  source_query: string | null;
  source_location: string | null;
  scraped_at: string;
}

export default function AdminProspecting() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScraping, setIsScraping] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Search form
  const [searchQuery, setSearchQuery] = useState("HVAC contractors");
  const [searchLocation, setSearchLocation] = useState("Austin, TX");
  const [searchRadius, setSearchRadius] = useState("25");
  const [searchLimit, setSearchLimit] = useState("50");
  
  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSmsOnly, setFilterSmsOnly] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  const [isResolvingDecision, setIsResolvingDecision] = useState(false);
  const [isSendingDecisionFeedback, setIsSendingDecisionFeedback] = useState(false);

  useEffect(() => {
    fetchProspects();
  }, []);

  const fetchProspects = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-maps-scraper', {
        body: { action: 'get_prospects', limit: 200 }
      });

      if (error) throw error;
      setProspects(data?.prospects || []);
    } catch (error) {
      console.error('Error fetching prospects:', error);
      toast.error('Failed to load prospects');
    } finally {
      setIsLoading(false);
    }
  };

  const handleScrape = async () => {
    setIsScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-maps-scraper', {
        body: {
          action: 'scrape',
          query: searchQuery,
          location: searchLocation,
          radius_miles: parseInt(searchRadius),
          limit: parseInt(searchLimit)
        }
      });

      if (error) throw error;

      toast.success(`Scraped ${data?.scraped_count || 0} businesses, ${data?.inserted_count || 0} new prospects added`);
      await fetchProspects();
    } catch (error) {
      console.error('Error scraping:', error);
      toast.error('Failed to scrape Google Maps');
    } finally {
      setIsScraping(false);
    }
  };

  const handleResolveDecision = async () => {
    if (!searchQuery.trim()) {
      toast.error("Enter a business type before resolving a decision.");
      return;
    }

    setDecisionError(null);
    setDecisionNotice(null);
    setIsResolvingDecision(true);

    try {
      const response = await fetch("/api/resolve-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          context: `Location: ${searchLocation}; Radius: ${searchRadius} miles; Limit: ${searchLimit}`,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        const message = payload?.error ?? "Decision resolution failed.";
        setDecisionError(message);
        return;
      }

      setDecision(payload.decision as Decision);

      if (payload.analytics_ok === false) {
        setDecisionNotice(
          `Decision created, analytics unavailable (${payload.analytics_error ?? "unknown"}).`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Decision resolution failed.";
      setDecisionError(message);
    } finally {
      setIsResolvingDecision(false);
    }
  };

  const handleDecisionFeedback = async (outcome: "worked" | "didnt_work" | "unknown") => {
    if (!decision) return;

    setDecisionNotice(null);
    setIsSendingDecisionFeedback(true);

    try {
      const response = await fetch("/api/decision-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision_id: decision.decision_id,
          outcome,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        const message = payload?.error ?? "Decision feedback failed.";
        toast.error(message);
        return;
      }

      setDecision((prev) => (prev ? { ...prev, status: payload.updated_status } : prev));

        if (payload.analytics_ok === false) {
          setDecisionNotice(
            `Feedback saved, analytics unavailable (${payload.analytics_error ?? "unknown"}).`
          );
        } else {
          toast.success(
            outcome === "worked" ? "Marked as worked." : outcome === "didnt_work" ? "Marked as didn't work." : "Marked as unknown."
          );
        }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Decision feedback failed.";
      toast.error(message);
    } finally {
      setIsSendingDecisionFeedback(false);
    }
  };

  const handleConvertToLead = async (prospectIds: string[]) => {
    if (prospectIds.length === 0) {
      toast.error('Select at least one prospect to convert');
      return;
    }

    setIsConverting(true);
    try {
      const { data, error } = await supabase.functions.invoke('convert-prospect-to-lead', {
        body: { prospect_ids: prospectIds }
      });

      if (error) throw error;

      toast.success(`Converted ${data?.converted_count || 0} prospects to leads`);
      setSelectedIds([]);
      await fetchProspects();
    } catch (error) {
      console.error('Error converting:', error);
      toast.error('Failed to convert prospects');
    } finally {
      setIsConverting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    const filteredIds = filteredProspects.filter(p => !p.converted_to_lead_id).map(p => p.id);
    setSelectedIds(prev => prev.length === filteredIds.length ? [] : filteredIds);
  };

  // Filter prospects
  const filteredProspects = prospects.filter(p => {
    if (filterStatus === "new" && p.status !== "new") return false;
    if (filterStatus === "converted" && !p.converted_to_lead_id) return false;
    if (filterStatus === "unconverted" && p.converted_to_lead_id) return false;
    if (filterSmsOnly && !p.sms_capable) return false;
    return true;
  });

  // Stats
  const totalProspects = prospects.length;
  const smsCapable = prospects.filter(p => p.sms_capable).length;
  const converted = prospects.filter(p => p.converted_to_lead_id).length;
  const avgRating = prospects.length > 0 
    ? (prospects.reduce((sum, p) => sum + (p.rating || 0), 0) / prospects.length).toFixed(1)
    : "0";

  return (
    <AdminLayout title="Prospecting" subtitle="Find and convert local business prospects">
      <div className="space-y-6">
        <PageChatHeader
          pageContext="Prospecting page - scraping Google Maps for local businesses and converting them to leads"
          placeholder="Ask about prospecting strategies or help with searches..."
          quickActions={[
            { label: "Best prospects", prompt: "Which prospects should I contact first?" },
            { label: "Search tips", prompt: "What search terms work best for HVAC?" },
            { label: "Conversion rate", prompt: "What's my prospect to lead conversion rate?" },
          ]}
        />

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCardWithTooltip
            title="Total Prospects"
            value={totalProspects}
            icon={<Building2 className="h-5 w-5" />}
            tooltip="Total businesses scraped from Google Maps"
            variant="primary"
          />
          <StatCardWithTooltip
            title="SMS Capable"
            value={smsCapable}
            icon={<MessageSquare className="h-5 w-5" />}
            tooltip="Businesses with mobile numbers that can receive SMS"
            variant="success"
          />
          <StatCardWithTooltip
            title="Converted to Leads"
            value={converted}
            icon={<UserPlus className="h-5 w-5" />}
            tooltip="Prospects that have been converted to leads"
            variant="primary"
          />
          <StatCardWithTooltip
            title="Avg Rating"
            value={avgRating}
            icon={<Star className="h-5 w-5" />}
            tooltip="Average Google rating of scraped businesses"
            variant="primary"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Search Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Scrape Google Maps
              </CardTitle>
              <CardDescription>Find local businesses to prospect</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Business Type</Label>
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g., HVAC contractors, plumbers"
                />
              </div>
              <div>
                <Label>Location</Label>
                <Input
                  value={searchLocation}
                  onChange={(e) => setSearchLocation(e.target.value)}
                  placeholder="e.g., Austin, TX"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Radius (miles)</Label>
                  <Input
                    type="number"
                    value={searchRadius}
                    onChange={(e) => setSearchRadius(e.target.value)}
                    placeholder="25"
                  />
                </div>
                <div>
                  <Label>Limit</Label>
                  <Input
                    type="number"
                    value={searchLimit}
                    onChange={(e) => setSearchLimit(e.target.value)}
                    placeholder="50"
                  />
                </div>
              </div>
              <Button 
                onClick={handleScrape} 
                className="w-full" 
                disabled={isScraping}
              >
                {isScraping ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Scraping...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Start Scraping
                  </>
                )}
              </Button>

              <div className="pt-4 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Decision</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleResolveDecision}
                    disabled={isResolvingDecision || !searchQuery.trim()}
                  >
                    {isResolvingDecision ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                        Resolving...
                      </>
                    ) : (
                      "Resolve decision"
                    )}
                  </Button>
                </div>

                {decisionError && (
                  <p className="text-sm text-destructive">{decisionError}</p>
                )}
                {decisionNotice && (
                  <p className="text-sm text-muted-foreground">{decisionNotice}</p>
                )}

                {decision && (
                  <div className="rounded-md border p-3 space-y-2 text-sm">
                    <div>
                      <span className="font-medium">Recommendation: </span>
                      {decision.recommendation}
                    </div>
                    <div>
                      <span className="font-medium">Confidence: </span>
                      {decision.confidence}%
                    </div>
                    <div>
                      <span className="font-medium">Why: </span>
                      {decision.reasoning}
                    </div>
                    <div>
                      <span className="font-medium">Assumptions: </span>
                      {decision.assumptions.join("; ")}
                    </div>
                    {decision.uncertainty_notes.length > 0 && (
                      <div>
                        <span className="font-medium">Uncertainty: </span>
                        {decision.uncertainty_notes.join("; ")}
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Next action: </span>
                      {decision.next_action}
                    </div>
                    <div>
                      <span className="font-medium">Status: </span>
                      {decision.status}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => handleDecisionFeedback("worked")}
                        disabled={isSendingDecisionFeedback}
                      >
                        Worked
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDecisionFeedback("didnt_work")}
                        disabled={isSendingDecisionFeedback}
                      >
                        Didn't work
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t">
                <Label className="text-sm font-medium mb-2 block">Filters</Label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      variant={filterStatus === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilterStatus("all")}
                    >
                      All
                    </Button>
                    <Button
                      variant={filterStatus === "new" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilterStatus("new")}
                    >
                      New
                    </Button>
                    <Button
                      variant={filterStatus === "unconverted" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilterStatus("unconverted")}
                    >
                      Not Converted
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="smsOnly"
                      checked={filterSmsOnly}
                      onCheckedChange={(checked) => setFilterSmsOnly(!!checked)}
                    />
                    <Label htmlFor="smsOnly" className="text-sm cursor-pointer">
                      SMS capable only
                    </Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Prospects List */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Prospects ({filteredProspects.length})</CardTitle>
                  <CardDescription>
                    {selectedIds.length > 0 && `${selectedIds.length} selected`}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll}>
                    {selectedIds.length === filteredProspects.filter(p => !p.converted_to_lead_id).length 
                      ? "Deselect All" 
                      : "Select All"}
                  </Button>
                  <Button
                    size="sm"
                    disabled={selectedIds.length === 0 || isConverting}
                    onClick={() => handleConvertToLead(selectedIds)}
                  >
                    {isConverting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Convert ({selectedIds.length})
                      </>
                    )}
                  </Button>
                  <Button variant="outline" size="icon" onClick={fetchProspects}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredProspects.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No prospects found. Start scraping to find businesses.</p>
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <div className="space-y-3">
                    {filteredProspects.map((prospect) => (
                      <div
                        key={prospect.id}
                        className={`p-4 rounded-lg border transition-all ${
                          prospect.converted_to_lead_id 
                            ? 'bg-muted/50 opacity-60' 
                            : selectedIds.includes(prospect.id)
                              ? 'border-primary bg-primary/5'
                              : 'hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {!prospect.converted_to_lead_id && (
                            <Checkbox
                              checked={selectedIds.includes(prospect.id)}
                              onCheckedChange={() => toggleSelect(prospect.id)}
                              className="mt-1"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="font-medium truncate">{prospect.business_name}</h4>
                                {prospect.address && (
                                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                                    <MapPin className="h-3 w-3" />
                                    {prospect.address}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {prospect.rating && prospect.rating >= 4.5 && (
                                  <Badge variant="default">
                                    Top Rated
                                  </Badge>
                                )}
                                {prospect.converted_to_lead_id && (
                                  <Badge variant="outline" className="text-green-500 border-green-500">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Converted
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 mt-2">
                              {prospect.phone && (
                                <Badge variant="outline" className="text-xs">
                                  <Phone className="h-3 w-3 mr-1" />
                                  {prospect.phone}
                                  {prospect.sms_capable && (
                                    <MessageSquare className="h-3 w-3 ml-1 text-green-500" />
                                  )}
                                </Badge>
                              )}
                              {prospect.website && (
                                <Badge variant="outline" className="text-xs">
                                  <Globe className="h-3 w-3 mr-1" />
                                  Has Website
                                </Badge>
                              )}
                              {prospect.rating && (
                                <Badge variant="outline" className="text-xs">
                                  <Star className="h-3 w-3 mr-1 text-yellow-500" />
                                  {prospect.rating} ({prospect.review_count} reviews)
                                </Badge>
                              )}
                              {prospect.phone_type && prospect.phone_type !== "unknown" && (
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs ${
                                    prospect.sms_capable ? 'text-green-500 border-green-500' : 'text-muted-foreground'
                                  }`}
                                >
                                  {prospect.phone_type}
                                </Badge>
                              )}
                            </div>

                            {prospect.categories && prospect.categories.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {prospect.categories.slice(0, 3).map((cat, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    {cat}
                                  </Badge>
                                ))}
                              </div>
                            )}

                            {!prospect.converted_to_lead_id && (
                              <div className="flex gap-2 mt-3">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleConvertToLead([prospect.id])}
                                  disabled={isConverting}
                                >
                                  <UserPlus className="h-3 w-3 mr-1" />
                                  Convert to Lead
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
