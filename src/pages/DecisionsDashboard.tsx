/**
 * Decisions Dashboard
 * 
 * DEFAULT ENTRY POINT for /app
 * Shows only decision cards for human approval/rejection/modification
 * No execution controls visible
 */

import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GovernanceNavigation } from "@/components/GovernanceNavigation";
import { DecisionCardRenderer } from "@/components/ceo/DecisionCardRenderer";
import {
  CheckCircle2,
  XCircle,
  MessageSquare,
  Clock,
  Bot,
  ChevronRight,
  Loader2,
  Brain,
} from "lucide-react";

interface DecisionItem {
  id: string;
  agent_type: string;
  action_type: string;
  target_type: string;
  action_payload: Record<string, unknown> | null;
  status: string;
  priority: number;
  created_at: string;
  claude_reasoning?: string;
}

export default function DecisionsDashboard() {
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [modifyingId, setModifyingId] = useState<string | null>(null);
  const [modificationText, setModificationText] = useState("");
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });

  useEffect(() => {
    fetchDecisions();

    const channel = supabase
      .channel("decisions-realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "action_queue",
      }, () => fetchDecisions())
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "ceo_action_queue",
      }, () => fetchDecisions())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchDecisions = async () => {
    setLoading(true);
    try {
      // GOVERNANCE: Only fetch pending_approval status
      // Official statuses: pending_approval, approved, rejected, modified, conflicted
      const [actionRes, ceoRes] = await Promise.all([
        supabase
          .from("action_queue")
          .select("*")
          .in("status", ["pending_approval"])
          .order("priority", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("ceo_action_queue")
          .select("*")
          .in("status", ["pending_approval", "pending", "pending_review"])
          .order("priority", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const actionItems = (actionRes.data || []).map(item => ({
        ...item,
        source: 'action_queue'
      }));
      
      // Map ceo_action_queue.payload -> action_payload for UI compatibility
      const ceoItems = (ceoRes.data || []).map(item => ({
        ...item,
        agent_type: 'ceo-agent',
        action_payload: item.payload, // Map column name for UI
        source: 'ceo_action_queue'
      }));

      const combined = [...ceoItems, ...actionItems].sort((a, b) => {
        const priorityA = typeof a.priority === 'number' ? a.priority : 5;
        const priorityB = typeof b.priority === 'number' ? b.priority : 5;
        return priorityB - priorityA;
      });

      setDecisions(combined as DecisionItem[]);

      // Update stats
      const pending = combined.length;
      const approvedRes = await supabase
        .from("action_queue")
        .select("id", { count: "exact" })
        .in("status", ["approved", "executed"]);
      const rejectedRes = await supabase
        .from("action_queue")
        .select("id", { count: "exact" })
        .eq("status", "rejected");

      setStats({
        pending,
        approved: approvedRes.count || 0,
        rejected: rejectedRes.count || 0,
      });
    } catch (error) {
      console.error("Error fetching decisions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (decision: DecisionItem) => {
    setProcessingId(decision.id);
    try {
      const table = (decision as any).source === 'ceo_action_queue' ? 'ceo_action_queue' : 'action_queue';
      const { error } = await supabase
        .from(table)
        .update({ 
          status: "approved",
          reviewed_at: new Date().toISOString()
        })
        .eq("id", decision.id);

      if (error) throw error;
      toast.success("Decision approved");
      fetchDecisions();
    } catch (error) {
      toast.error("Failed to approve");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (decision: DecisionItem) => {
    setProcessingId(decision.id);
    try {
      const table = (decision as any).source === 'ceo_action_queue' ? 'ceo_action_queue' : 'action_queue';
      const { error } = await supabase
        .from(table)
        .update({ 
          status: "rejected",
          reviewed_at: new Date().toISOString()
        })
        .eq("id", decision.id);

      if (error) throw error;
      toast.success("Decision rejected");
      fetchDecisions();
    } catch (error) {
      toast.error("Failed to reject");
    } finally {
      setProcessingId(null);
    }
  };

  const handleModify = async (decision: DecisionItem) => {
    if (!modificationText.trim()) {
      toast.error("Please enter modification instructions");
      return;
    }

    setProcessingId(decision.id);
    try {
      const table = (decision as any).source === 'ceo_action_queue' ? 'ceo_action_queue' : 'action_queue';
      const existingPayload = decision.action_payload || {};
      
      // GOVERNANCE: Preserve decision_card format on modify
      // Use wrapWithModification to properly update decision_card.human_modification
      const { wrapWithModification } = await import('@/lib/decisionSchema');
      const updatedPayload = wrapWithModification(existingPayload, modificationText);
      
      const { error } = await supabase
        .from(table)
        .update({ 
          status: "modified",
          reviewed_at: new Date().toISOString(),
          action_payload: updatedPayload
        })
        .eq("id", decision.id);

      if (error) throw error;
      toast.success("Modification submitted - AI must re-propose with valid decision card");
      setModifyingId(null);
      setModificationText("");
      fetchDecisions();
    } catch (error) {
      toast.error("Failed to modify");
    } finally {
      setProcessingId(null);
    }
  };

  const getPriorityBadge = (priority: number) => {
    if (priority >= 8) return <Badge variant="destructive">Critical</Badge>;
    if (priority >= 5) return <Badge className="bg-orange-500">High</Badge>;
    return <Badge variant="secondary">Normal</Badge>;
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  return (
    <>
      <Helmet>
        <title>Decisions | Human Control</title>
        <meta name="description" content="Review and approve AI recommendations" />
      </Helmet>
      
      <div className="h-screen flex bg-background">
        {/* Sidebar Navigation */}
        <aside className="w-64 border-r bg-card p-4 hidden md:block">
          <div className="flex items-center gap-2 mb-6">
            <Brain className="h-6 w-6 text-primary" />
            <span className="font-semibold">Governance</span>
          </div>
          <GovernanceNavigation />
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          <div className="container py-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold">Decisions</h1>
                <p className="text-sm text-muted-foreground">
                  Review AI recommendations. Approve, reject, or modify.
                </p>
              </div>
              <div className="flex gap-4 text-sm">
                <div className="text-center">
                  <p className="text-2xl font-bold text-orange-500">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-500">{stats.approved}</p>
                  <p className="text-xs text-muted-foreground">Approved</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-500">{stats.rejected}</p>
                  <p className="text-xs text-muted-foreground">Rejected</p>
                </div>
              </div>
            </div>

            {/* Decision Cards */}
            <ScrollArea className="flex-1">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : decisions.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center">
                    <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                    <h3 className="font-semibold mb-2">All caught up!</h3>
                    <p className="text-sm text-muted-foreground">
                      No pending decisions. The AI CEO is operating within guidelines.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {decisions.map((decision) => (
                    <Card 
                      key={decision.id} 
                      className={`border-l-4 ${
                        decision.priority >= 8 ? 'border-l-red-500' : 
                        decision.priority >= 5 ? 'border-l-orange-500' : 'border-l-blue-500'
                      }`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Bot className="h-4 w-4 text-primary" />
                            <CardTitle className="text-sm capitalize">
                              {decision.action_type.replace(/_/g, " ")}
                            </CardTitle>
                            {getPriorityBadge(decision.priority || 5)}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatTimeAgo(decision.created_at)}
                          </div>
                        </div>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <span className="capitalize">{decision.agent_type.replace(/_/g, " ")}</span>
                          <ChevronRight className="h-3 w-3" />
                          <span className="capitalize">{decision.target_type.replace(/_/g, " ")}</span>
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Decision Card Renderer - structured format */}
                        <DecisionCardRenderer 
                          actionPayload={decision.action_payload}
                          claudeReasoning={decision.claude_reasoning}
                        />

                        {/* Modification Input */}
                        {modifyingId === decision.id && (
                          <div className="space-y-2">
                            <Textarea
                              placeholder="Enter modification instructions in natural language..."
                              value={modificationText}
                              onChange={(e) => setModificationText(e.target.value)}
                              className="min-h-24"
                            />
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                onClick={() => handleModify(decision)}
                                disabled={processingId === decision.id}
                              >
                                Submit Modification
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => {
                                  setModifyingId(null);
                                  setModificationText("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        {modifyingId !== decision.id && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleApprove(decision)}
                              disabled={processingId === decision.id}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleReject(decision)}
                              disabled={processingId === decision.id}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setModifyingId(decision.id)}
                              disabled={processingId === decision.id}
                            >
                              <MessageSquare className="h-4 w-4 mr-1" />
                              Modify
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </main>
      </div>
    </>
  );
}
