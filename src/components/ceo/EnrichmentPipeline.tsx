import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import {
  Workflow,
  Users,
  Target,
  Zap,
  Phone,
  Mail,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ChevronRight,
  TrendingUp,
  Shield,
} from "lucide-react";

interface EnrichmentProfile {
  id: string;
  lead_id: string;
  fit_score: number;
  interest_score: number;
  engagement_score: number;
  segment: string;
  routing_agent: string;
  intent_tags: string[];
  contact_risk: string[];
  created_at: string;
}

interface QueueItem {
  id: string;
  lead_id: string;
  status: string;
  stage: string;
  priority: number;
  created_at: string;
}

interface SegmentStats {
  segment: string;
  count: number;
  avgScore: number;
}

const EnrichmentPipeline = () => {
  const [profiles, setProfiles] = useState<EnrichmentProfile[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [segmentStats, setSegmentStats] = useState<SegmentStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnriching, setIsEnriching] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [profilesRes, queueRes] = await Promise.all([
        supabase
          .from("lead_enrichment_profiles")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("enrichment_queue")
          .select("*")
          .order("priority", { ascending: false })
          .limit(20),
      ]);

      const profilesData = profilesRes.data || [];
      setProfiles(profilesData);
      setQueue(queueRes.data || []);

      // Calculate segment stats
      const statsMap = new Map<string, { count: number; totalScore: number }>();
      profilesData.forEach((p) => {
        const segment = p.segment || "unknown";
        const current = statsMap.get(segment) || { count: 0, totalScore: 0 };
        const avgScore = (p.fit_score + p.interest_score + p.engagement_score) / 3;
        statsMap.set(segment, {
          count: current.count + 1,
          totalScore: current.totalScore + avgScore,
        });
      });

      const stats: SegmentStats[] = Array.from(statsMap.entries()).map(
        ([segment, data]) => ({
          segment,
          count: data.count,
          avgScore: Math.round(data.totalScore / data.count),
        })
      );
      setSegmentStats(stats);
    } catch (error) {
      console.error("Error fetching enrichment data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const enrichPendingLeads = async () => {
    setIsEnriching(true);
    try {
      // Get unprocessed leads
      const { data: leads } = await supabase
        .from("leads")
        .select("id")
        .is("lead_score", null)
        .limit(10);

      if (!leads || leads.length === 0) {
        return;
      }

      // Process each lead
      for (const lead of leads) {
        await supabase.functions.invoke("lead-enrichment", {
          body: { lead_id: lead.id },
        });
      }

      await fetchData();
    } catch (error) {
      console.error("Error enriching leads:", error);
    } finally {
      setIsEnriching(false);
    }
  };

  const getSegmentIcon = (segment: string) => {
    switch (segment) {
      case "hot_lead":
        return <Zap className="h-4 w-4 text-orange-500" />;
      case "marketing_nurture":
        return <Mail className="h-4 w-4 text-blue-500" />;
      case "cold_outreach":
        return <Target className="h-4 w-4 text-purple-500" />;
      case "compliance_hold":
        return <Shield className="h-4 w-4 text-red-500" />;
      default:
        return <Users className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getSegmentColor = (segment: string) => {
    switch (segment) {
      case "hot_lead":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "marketing_nurture":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "cold_outreach":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "compliance_hold":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getRoutingAgentIcon = (agent: string) => {
    switch (agent) {
      case "power_dialer":
        return <Phone className="h-3 w-3" />;
      case "sequences":
        return <Mail className="h-3 w-3" />;
      case "outreach":
        return <MessageSquare className="h-3 w-3" />;
      case "human_bypass":
        return <AlertTriangle className="h-3 w-3" />;
      default:
        return <Target className="h-3 w-3" />;
    }
  };

  const getStageProgress = (stage: string) => {
    switch (stage) {
      case "ingestion":
        return 25;
      case "augmentation":
        return 50;
      case "scoring":
        return 75;
      case "segmentation":
        return 100;
      default:
        return 0;
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
      {/* Segment Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { segment: "hot_lead", label: "Hot Leads", icon: Zap, color: "text-orange-500" },
          { segment: "marketing_nurture", label: "Nurturing", icon: Mail, color: "text-blue-500" },
          { segment: "cold_outreach", label: "Cold Outreach", icon: Target, color: "text-purple-500" },
          { segment: "compliance_hold", label: "On Hold", icon: Shield, color: "text-red-500" },
        ].map(({ segment, label, icon: Icon, color }) => {
          const stat = segmentStats.find((s) => s.segment === segment);
          return (
            <Card key={segment}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-muted`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stat?.count || 0}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pipeline Flow Visualization */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Workflow className="h-4 w-4" />
              Enrichment Pipeline
            </CardTitle>
            <Button
              size="sm"
              onClick={enrichPendingLeads}
              disabled={isEnriching}
            >
              {isEnriching ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Enrich Pending Leads
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Pipeline Stages */}
          <div className="flex items-center justify-between mb-6 px-4">
            {["Ingestion", "Augmentation", "Scoring", "Segmentation"].map(
              (stage, i) => (
                <div key={stage} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        i === 3
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {i + 1}
                    </div>
                    <span className="text-xs mt-1 text-muted-foreground">
                      {stage}
                    </span>
                  </div>
                  {i < 3 && (
                    <ChevronRight className="h-5 w-5 text-muted-foreground mx-2" />
                  )}
                </div>
              )
            )}
          </div>

          {/* Queue Status */}
          {queue.length > 0 && (
            <div className="space-y-2 mb-4">
              <h4 className="text-sm font-medium text-muted-foreground">
                Processing Queue ({queue.length})
              </h4>
              <div className="space-y-2">
                {queue.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                  >
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <Progress
                        value={getStageProgress(item.stage)}
                        className="h-2"
                      />
                    </div>
                    <Badge variant="outline" className="text-xs capitalize">
                      {item.stage}
                    </Badge>
                    <Badge
                      variant={
                        item.status === "completed"
                          ? "default"
                          : item.status === "failed"
                          ? "destructive"
                          : "secondary"
                      }
                      className="text-xs"
                    >
                      {item.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Enriched Profiles */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Recently Enriched Leads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            {profiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No enriched leads yet</p>
                <p className="text-xs">
                  Click "Enrich Pending Leads" to process new leads
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {profiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="p-4 rounded-lg border bg-card/50 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getSegmentIcon(profile.segment)}
                        <Badge
                          variant="outline"
                          className={getSegmentColor(profile.segment)}
                        >
                          {profile.segment?.replace("_", " ") || "Unknown"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {getRoutingAgentIcon(profile.routing_agent)}
                        <span className="capitalize">
                          {profile.routing_agent?.replace("_", " ")}
                        </span>
                      </div>
                    </div>

                    {/* Score Bars */}
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Fit</span>
                          <span className="font-medium">{profile.fit_score}</span>
                        </div>
                        <Progress value={profile.fit_score} className="h-1.5" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Interest</span>
                          <span className="font-medium">
                            {profile.interest_score}
                          </span>
                        </div>
                        <Progress
                          value={profile.interest_score}
                          className="h-1.5"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Engagement</span>
                          <span className="font-medium">
                            {profile.engagement_score}
                          </span>
                        </div>
                        <Progress
                          value={profile.engagement_score}
                          className="h-1.5"
                        />
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1">
                      {profile.intent_tags?.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag.replace("_", " ")}
                        </Badge>
                      ))}
                      {profile.contact_risk?.map((risk) => (
                        <Badge
                          key={risk}
                          variant="destructive"
                          className="text-xs"
                        >
                          {risk.replace("_", " ")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default EnrichmentPipeline;
