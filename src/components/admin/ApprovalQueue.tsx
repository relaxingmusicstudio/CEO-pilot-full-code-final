import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Bot, 
  Target, 
  AlertTriangle,
  RefreshCw,
  Eye,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
  FileText
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { HumanScoreButtons } from "@/components/HumanScoreButtons";
import { EmptyState } from "@/components/EmptyState";

interface ActionItem {
  id: string;
  agent_type: string;
  action_type: string;
  target_type: string;
  target_id: string;
  action_payload: Record<string, unknown> | null;
  status: string;
  priority: number;
  created_at: string;
  scheduled_at: string | null;
  executed_at: string | null;
  result: Record<string, unknown> | null;
}

export default function ApprovalQueue() {
  const [pendingActions, setPendingActions] = useState<ActionItem[]>([]);
  const [approvedActions, setApprovedActions] = useState<ActionItem[]>([]);
  const [rejectedActions, setRejectedActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const fetchActions = async () => {
    setLoading(true);
    try {
      // GOVERNANCE: Use standardized statuses
      // Official: pending_approval, approved, rejected, modified, conflicted
      const { data: pending, error: pendingError } = await supabase
        .from("action_queue")
        .select("*")
        .in("status", ["pending_approval"])
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);

      if (pendingError) throw pendingError;

      const { data: approved, error: approvedError } = await supabase
        .from("action_queue")
        .select("*")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(20);

      if (approvedError) throw approvedError;

      const { data: rejected, error: rejectedError } = await supabase
        .from("action_queue")
        .select("*")
        .in("status", ["rejected", "modified", "conflicted"])
        .order("created_at", { ascending: false })
        .limit(20);

      if (rejectedError) throw rejectedError;

      setPendingActions((pending || []) as ActionItem[]);
      setApprovedActions((approved || []) as ActionItem[]);
      setRejectedActions((rejected || []) as ActionItem[]);
    } catch (error) {
      console.error("Error fetching actions:", error);
      toast.error("Failed to load approval queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActions();

    const channel = supabase
      .channel("action_queue_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "action_queue",
        },
        () => {
          fetchActions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleApprove = async (actionId: string) => {
    setProcessingId(actionId);
    try {
      const { error } = await supabase
        .from("action_queue")
        .update({ 
          status: "approved",
          executed_at: new Date().toISOString()
        })
        .eq("id", actionId);

      if (error) throw error;
      toast.success("Action approved");
      fetchActions();
    } catch (error) {
      console.error("Error approving action:", error);
      toast.error("Failed to approve action");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (actionId: string) => {
    setProcessingId(actionId);
    try {
      const { error } = await supabase
        .from("action_queue")
        .update({ 
          status: "rejected",
          executed_at: new Date().toISOString()
        })
        .eq("id", actionId);

      if (error) throw error;
      toast.success("Action rejected");
      fetchActions();
    } catch (error) {
      console.error("Error rejecting action:", error);
      toast.error("Failed to reject action");
    } finally {
      setProcessingId(null);
    }
  };

  const viewDetails = (action: ActionItem) => {
    setSelectedAction(action);
    setDetailsOpen(true);
  };

  const toggleExpanded = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getPriorityConfig = (priority: number) => {
    if (priority >= 8) return { 
      badge: <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Critical</Badge>,
      indicator: "border-l-red-500",
      icon: <AlertTriangle className="h-4 w-4 text-red-500" />
    };
    if (priority >= 5) return { 
      badge: <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20">High</Badge>,
      indicator: "border-l-orange-500",
      icon: <Zap className="h-4 w-4 text-orange-500" />
    };
    if (priority >= 3) return { 
      badge: <Badge variant="secondary">Medium</Badge>,
      indicator: "border-l-blue-500",
      icon: <Sparkles className="h-4 w-4 text-blue-500" />
    };
    return { 
      badge: <Badge variant="outline">Low</Badge>,
      indicator: "border-l-muted",
      icon: <FileText className="h-4 w-4 text-muted-foreground" />
    };
  };

  const getAgentColor = (agentType: string) => {
    const colors: Record<string, string> = {
      content_agent: "bg-purple-500/10 text-purple-600",
      lead_agent: "bg-blue-500/10 text-blue-600",
      billing_agent: "bg-green-500/10 text-green-600",
      outreach_agent: "bg-amber-500/10 text-amber-600",
    };
    return colors[agentType] || "bg-primary/10 text-primary";
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return "Just now";
  };

  const getPreviewContent = (payload: Record<string, unknown> | null) => {
    if (!payload) return null;
    
    const content = payload.content || payload.message || payload.subject || payload.description;
    if (typeof content === 'string') {
      return content.length > 150 ? content.slice(0, 150) + '...' : content;
    }
    return null;
  };

  const ActionCard = ({ action, showActions = false }: { action: ActionItem; showActions?: boolean }) => {
    const priorityConfig = getPriorityConfig(action.priority || 5);
    const isExpanded = expandedCards.has(action.id);
    const preview = getPreviewContent(action.action_payload);
    
    return (
      <Card className={`mb-3 border-l-4 ${priorityConfig.indicator} overflow-hidden transition-all hover:shadow-md`}>
        <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(action.id)}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <div className={`p-1.5 rounded-md ${getAgentColor(action.agent_type)}`}>
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-medium text-sm capitalize">
                    {action.agent_type.replace(/_/g, " ")}
                  </span>
                  {priorityConfig.badge}
                  {priorityConfig.icon}
                </div>
                
                <h4 className="font-semibold text-foreground mb-1.5 capitalize flex items-center gap-2">
                  {action.action_type.replace(/_/g, " ")}
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                </h4>
                
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Target className="h-3 w-3" />
                  <span className="capitalize">{action.target_type.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground/50">•</span>
                  <Clock className="h-3 w-3" />
                  <span>{formatTimeAgo(action.created_at)}</span>
                </div>

                {/* Preview Content */}
                {preview && !isExpanded && (
                  <div className="mt-2 text-sm text-muted-foreground line-clamp-2 bg-muted/30 p-2 rounded">
                    "{preview}"
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => viewDetails(action)}
                    className="h-8 w-8 p-0"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
                
                {showActions && (
                  <div className="flex gap-1">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleApprove(action.id)}
                      disabled={processingId === action.id}
                      className="h-8 bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleReject(action.id)}
                      disabled={processingId === action.id}
                      className="h-8"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                <HumanScoreButtons 
                  entityType="action" 
                  entityId={action.id}
                  size="sm"
                />
              </div>
            </div>

            <CollapsibleContent>
              {action.action_payload && Object.keys(action.action_payload).length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Full Payload</p>
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto max-h-48">
                    {JSON.stringify(action.action_payload, null, 2)}
                  </pre>
                </div>
              )}
            </CollapsibleContent>
          </CardContent>
        </Collapsible>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Approval Queue</h2>
          <p className="text-muted-foreground">
            Review and approve AI agent actions before execution
          </p>
        </div>
        <Button variant="outline" onClick={fetchActions} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending" className="relative">
            Pending
            {pendingActions.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 min-w-5 p-0 flex items-center justify-center text-xs">
                {pendingActions.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved
            {approvedActions.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 min-w-5 p-0 flex items-center justify-center text-xs">
                {approvedActions.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected
            {rejectedActions.length > 0 && (
              <Badge variant="outline" className="ml-2 h-5 min-w-5 p-0 flex items-center justify-center text-xs">
                {rejectedActions.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <ScrollArea className="h-[600px]">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : pendingActions.length === 0 ? (
              <EmptyState
                variant="success"
                title="All caught up!"
                description="No pending actions to review. Your AI agents are running smoothly."
              />
            ) : (
              pendingActions.map((action) => (
                <ActionCard key={action.id} action={action} showActions />
              ))
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="approved" className="mt-4">
          <ScrollArea className="h-[600px]">
            {approvedActions.length === 0 ? (
              <EmptyState
                variant="default"
                title="No approved actions yet"
                description="Actions you approve will appear here for reference."
              />
            ) : (
              approvedActions.map((action) => (
                <ActionCard key={action.id} action={action} />
              ))
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="rejected" className="mt-4">
          <ScrollArea className="h-[600px]">
            {rejectedActions.length === 0 ? (
              <EmptyState
                variant="default"
                title="No rejected actions"
                description="Actions you reject will appear here."
              />
            ) : (
              rejectedActions.map((action) => (
                <ActionCard key={action.id} action={action} />
              ))
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${selectedAction ? getAgentColor(selectedAction.agent_type) : ''}`}>
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="capitalize text-lg">
                  {selectedAction?.action_type.replace(/_/g, " ")}
                </DialogTitle>
                <DialogDescription className="capitalize">
                  {selectedAction?.agent_type.replace(/_/g, " ")} • {selectedAction?.target_type.replace(/_/g, " ")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          {selectedAction && (
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Status</p>
                  <Badge variant={
                    selectedAction.status === "approved" || selectedAction.status === "executed" 
                      ? "default" 
                      : selectedAction.status === "rejected" 
                        ? "destructive" 
                        : "secondary"
                  }>
                    {selectedAction.status}
                  </Badge>
                </Card>
                <Card className="p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Priority</p>
                  {getPriorityConfig(selectedAction.priority || 5).badge}
                </Card>
                <Card className="p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Target ID</p>
                  <p className="font-mono text-xs truncate">{selectedAction.target_id}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Created</p>
                  <p className="text-sm">{new Date(selectedAction.created_at).toLocaleString()}</p>
                </Card>
              </div>

              {/* Human Score */}
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Rate this action</p>
                    <p className="text-xs text-muted-foreground">Help improve AI decisions</p>
                  </div>
                  <HumanScoreButtons 
                    entityType="action" 
                    entityId={selectedAction.id}
                    size="default"
                  />
                </div>
              </Card>

              {selectedAction.action_payload && Object.keys(selectedAction.action_payload).length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Action Payload</p>
                  <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto max-h-64">
                    {JSON.stringify(selectedAction.action_payload, null, 2)}
                  </pre>
                </div>
              )}

              {selectedAction.result && Object.keys(selectedAction.result).length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Result</p>
                  <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto max-h-64">
                    {JSON.stringify(selectedAction.result, null, 2)}
                  </pre>
                </div>
              )}

              {selectedAction.status === "pending_approval" && (
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      handleApprove(selectedAction.id);
                      setDetailsOpen(false);
                    }}
                    disabled={processingId === selectedAction.id}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve Action
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => {
                      handleReject(selectedAction.id);
                      setDetailsOpen(false);
                    }}
                    disabled={processingId === selectedAction.id}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject Action
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
