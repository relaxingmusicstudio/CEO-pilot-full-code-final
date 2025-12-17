/**
 * CEO Home - Unified Command Center
 * 
 * THE single landing page after login.
 * Layout: Status Bar (48px) + Intelligence Grid (scrollable) + Chat (fixed bottom)
 */

import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { CEOStatusBar } from "@/components/ceo/CEOStatusBar";
import { CEOChatFixed } from "@/components/ceo/CEOChatFixed";
import { IntelligenceCard, CardState } from "@/components/ceo/IntelligenceCard";
import { 
  Target, 
  MessageSquare, 
  TrendingUp, 
  DollarSign, 
  FileText, 
  CheckCircle2 
} from "lucide-react";

interface GridMetrics {
  pipeline: { leads: number; stalled: number; state: CardState };
  communications: { missed: number; unread: number; state: CardState };
  growth: { visitors: number; delta: string; state: CardState };
  finance: { overdue: number; mrr: number; state: CardState };
  content: { pending: number; published: number; state: CardState };
  decisions: { pending: number; urgent: number; state: CardState };
}

export default function CEOHome() {
  const [metrics, setMetrics] = useState<GridMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingDecisions, setPendingDecisions] = useState(0);

  useEffect(() => {
    fetchMetrics();
    
    // Set up realtime subscriptions for key tables
    const channel = supabase
      .channel("ceo-home-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, fetchMetrics)
      .on("postgres_changes", { event: "*", schema: "public", table: "content" }, fetchMetrics)
      .on("postgres_changes", { event: "*", schema: "public", table: "action_queue" }, fetchMetrics)
      .on("postgres_changes", { event: "*", schema: "public", table: "ceo_action_queue" }, fetchMetrics)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchMetrics = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      // Fetch all data in parallel - NO AI CALLS
      const [
        leadsRes,
        contentRes,
        decisionsRes,
        ceoDecisionsRes,
        callsRes
      ] = await Promise.all([
        supabase.from("leads").select("id, lead_score, lead_temperature, status, created_at").gte("created_at", yesterday.toISOString()),
        supabase.from("content").select("id, status"),
        supabase.from("action_queue").select("id, priority, status").eq("status", "pending_approval"),
        supabase.from("ceo_action_queue").select("id, priority, status").eq("status", "pending_approval"),
        supabase.from("call_logs").select("id, status").gte("created_at", yesterday.toISOString())
      ]);

      const leads = leadsRes.data || [];
      const content = contentRes.data || [];
      const decisions = decisionsRes.data || [];
      const ceoDecisions = ceoDecisionsRes.data || [];
      const calls = callsRes.data || [];

      // Calculate pipeline metrics
      const hotLeads = leads.filter(l => l.lead_score >= 70 || l.lead_temperature === "hot").length;
      const stalledLeads = leads.filter(l => l.status === "stalled" || l.status === "cold").length;
      const pipelineState: CardState = stalledLeads > 3 ? "urgent" : hotLeads > 0 ? "attention" : "healthy";

      // Calculate communications metrics
      const missedCalls = calls.filter(c => c.status === "missed" || c.status === "no-answer").length;
      const commsState: CardState = missedCalls > 5 ? "urgent" : missedCalls > 0 ? "attention" : "healthy";

      // Calculate growth metrics (placeholder - would need analytics data)
      const growthState: CardState = "healthy";

      // Calculate finance metrics (placeholder - would need billing data)
      const financeState: CardState = "healthy";

      // Calculate content metrics
      const pendingContent = content.filter(c => c.status === "pending").length;
      const publishedContent = content.filter(c => c.status === "published").length;
      const contentState: CardState = pendingContent > 5 ? "attention" : "healthy";

      // Calculate decisions metrics
      const allDecisions = [...decisions, ...ceoDecisions];
      const pendingCount = allDecisions.length;
      const urgentCount = allDecisions.filter(d => typeof d.priority === 'number' && d.priority >= 8).length;
      const decisionsState: CardState = urgentCount > 0 ? "urgent" : pendingCount > 0 ? "attention" : "healthy";

      setPendingDecisions(pendingCount);

      setMetrics({
        pipeline: {
          leads: hotLeads,
          stalled: stalledLeads,
          state: pipelineState
        },
        communications: {
          missed: missedCalls,
          unread: 0,
          state: commsState
        },
        growth: {
          visitors: 0,
          delta: "—",
          state: growthState
        },
        finance: {
          overdue: 0,
          mrr: 0,
          state: financeState
        },
        content: {
          pending: pendingContent,
          published: publishedContent,
          state: contentState
        },
        decisions: {
          pending: pendingCount,
          urgent: urgentCount,
          state: decisionsState
        }
      });
    } catch (error) {
      console.error("Error fetching metrics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>CEO Command Center</title>
        <meta name="description" content="Your AI-powered business command center" />
      </Helmet>

      <div className="h-screen flex flex-col bg-background overflow-hidden">
        {/* Status Bar - Fixed Top 48px */}
        <CEOStatusBar pendingDecisions={pendingDecisions} />

        {/* Intelligence Grid - Scrollable Middle */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-5xl mx-auto">
            <div className="mb-4">
              <h1 className="text-lg font-semibold text-foreground">Good {getTimeOfDay()}</h1>
              <p className="text-sm text-muted-foreground">Here's what needs your attention</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Pipeline Card */}
              <IntelligenceCard
                title="Pipeline"
                icon={Target}
                primaryMetric={metrics?.pipeline.leads ?? 0}
                primaryLabel="hot leads"
                secondaryMetric={metrics?.pipeline.stalled ? `${metrics.pipeline.stalled} stalled` : undefined}
                cta="Review pipeline"
                state={metrics?.pipeline.state ?? "inactive"}
                navigateTo="/app/pipeline"
                isLoading={isLoading}
              />

              {/* Communications Card */}
              <IntelligenceCard
                title="Communications"
                icon={MessageSquare}
                primaryMetric={metrics?.communications.missed ?? 0}
                primaryLabel="missed calls today"
                secondaryMetric={metrics?.communications.unread ? `${metrics.communications.unread} unread` : undefined}
                cta="Check inbox"
                state={metrics?.communications.state ?? "inactive"}
                navigateTo="/app/inbox"
                isLoading={isLoading}
              />

              {/* Growth Card */}
              <IntelligenceCard
                title="Growth"
                icon={TrendingUp}
                primaryMetric={metrics?.growth.visitors ?? 0}
                primaryLabel="new visitors"
                secondaryMetric={metrics?.growth.delta !== "—" ? `Funnel ${metrics?.growth.delta}` : undefined}
                cta="See insights"
                state={metrics?.growth.state ?? "inactive"}
                navigateTo="/app/analytics"
                isLoading={isLoading}
              />

              {/* Finance Card */}
              <IntelligenceCard
                title="Finance"
                icon={DollarSign}
                primaryMetric={metrics?.finance.overdue ?? 0}
                primaryLabel="overdue invoices"
                secondaryMetric={metrics?.finance.mrr ? `MRR: $${metrics.finance.mrr.toLocaleString()}` : undefined}
                cta="View finances"
                state={metrics?.finance.state ?? "inactive"}
                navigateTo="/app/billing"
                isLoading={isLoading}
              />

              {/* Content Card */}
              <IntelligenceCard
                title="Content"
                icon={FileText}
                primaryMetric={metrics?.content.pending ?? 0}
                primaryLabel="pending review"
                secondaryMetric={metrics?.content.published ? `${metrics.content.published} published` : undefined}
                cta="Review queue"
                state={metrics?.content.state ?? "inactive"}
                navigateTo="/app/content"
                isLoading={isLoading}
              />

              {/* Decisions Card */}
              <IntelligenceCard
                title="Decisions"
                icon={CheckCircle2}
                primaryMetric={metrics?.decisions.pending ?? 0}
                primaryLabel="pending approval"
                secondaryMetric={metrics?.decisions.urgent ? `${metrics.decisions.urgent} urgent` : undefined}
                cta="Review all"
                state={metrics?.decisions.state ?? "inactive"}
                navigateTo="/app/decisions"
                isLoading={isLoading}
              />
            </div>
          </div>
        </div>

        {/* CEO Chat - Fixed Bottom */}
        <CEOChatFixed />
      </div>
    </>
  );
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
