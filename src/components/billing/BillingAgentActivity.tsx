import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Bot,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  DollarSign,
  Zap,
  Moon,
} from "lucide-react";
import { format } from "date-fns";

interface BillingAction {
  id: string;
  action_type: string;
  target_type: string;
  target_id: string;
  client_id: string;
  reason: string;
  amount: number | null;
  ai_confidence: number | null;
  requires_human_review: boolean;
  human_approved: boolean | null;
  approved_by: string | null;
  executed_at: string | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  clients?: { name: string };
}

interface PendingWorkItem {
  type: string;
  count: number;
}

interface AgentStatus {
  status?: string;
  message?: string;
  pending_work?: PendingWorkItem[];
}

export default function BillingAgentActivity() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'pending'>('all');

  const { data: agentStatus, refetch: refetchStatus } = useQuery<AgentStatus | null>({
    queryKey: ['billing-agent-status'],
    queryFn: async (): Promise<AgentStatus | null> => {
      const { data, error } = await supabase.functions.invoke('billing-agent', {
        body: { action: 'check_pending_work' }
      });
      if (error) throw error;
      return data as AgentStatus;
    },
    refetchInterval: 30000 // Check every 30 seconds
  });

  const { data: actions, isLoading } = useQuery({
    queryKey: ['billing-agent-activity', filter],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('billing-agent', {
        body: {
          action: 'get_agent_activity',
          limit: 50,
          requires_review: filter === 'pending' ? true : undefined
        }
      });
      if (error) throw error;
      return data.actions as BillingAction[];
    }
  });

  const approveAction = useMutation({
    mutationFn: async (actionId: string) => {
      const { data, error } = await supabase.functions.invoke('billing-agent', {
        body: { action: 'approve_action', action_id: actionId, approved_by: 'admin' }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-agent-activity'] });
      queryClient.invalidateQueries({ queryKey: ['billing-agent-status'] });
      toast.success('Action approved and executed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to approve: ${error.message}`);
    }
  });

  const rejectAction = useMutation({
    mutationFn: async (actionId: string) => {
      const { data, error } = await supabase.functions.invoke('billing-agent', {
        body: { action: 'reject_action', action_id: actionId, rejected_by: 'admin' }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-agent-activity'] });
      toast.success('Action rejected');
    }
  });

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'refund': return DollarSign;
      case 'dunning': return AlertTriangle;
      case 'usage_sync': return RefreshCw;
      case 'create_price':
      case 'update_price': return Zap;
      default: return Bot;
    }
  };

  const getActionBadge = (action: BillingAction) => {
    if (action.requires_human_review && action.human_approved === null) {
      return <Badge variant="destructive">Pending Review</Badge>;
    }
    if (action.human_approved === true) {
      return <Badge variant="default">Approved</Badge>;
    }
    if (action.human_approved === false) {
      return <Badge variant="secondary">Rejected</Badge>;
    }
    if (action.executed_at) {
      return <Badge variant="outline">Executed</Badge>;
    }
    return <Badge variant="secondary">Queued</Badge>;
  };

  const pendingCount = actions?.filter(a => a.requires_human_review && a.human_approved === null).length || 0;

  return (
    <div className="space-y-6">
      {/* Agent Status */}
      <Card className={agentStatus?.status === 'sleeping' ? 'border-muted' : 'border-primary'}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {agentStatus?.status === 'sleeping' ? (
                <Moon className="h-6 w-6 text-muted-foreground" />
              ) : (
                <Bot className="h-6 w-6 text-primary animate-pulse" />
              )}
              <div>
                <p className="font-medium">
                  Billing Agent: {agentStatus?.status === 'sleeping' ? 'Sleeping' : 'Active'}
                </p>
                <p className="text-sm text-muted-foreground">{agentStatus?.message}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchStatus()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Check Status
            </Button>
          </div>
          {agentStatus?.pending_work?.length > 0 && (
            <div className="mt-3 flex gap-2 flex-wrap">
              {agentStatus.pending_work.map((work, i) => (
                <Badge key={i} variant="outline">
                  {work.type}: {work.count}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Log */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Agent Activity
            {pendingCount > 0 && (
              <Badge variant="destructive">{pendingCount} pending</Badge>
            )}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              All
            </Button>
            <Button
              variant={filter === 'pending' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('pending')}
            >
              Pending Review
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : actions?.length === 0 ? (
              <p className="text-muted-foreground text-sm">No agent activity yet</p>
            ) : (
              actions?.map((action) => {
                const Icon = getActionIcon(action.action_type);
                const isPending = action.requires_human_review && action.human_approved === null;

                return (
                  <div
                    key={action.id}
                    className={`p-3 rounded-lg border ${isPending ? 'bg-destructive/5 border-destructive/20' : 'bg-muted/30'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <Icon className={`h-5 w-5 mt-0.5 ${isPending ? 'text-destructive' : 'text-muted-foreground'}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm capitalize">
                              {action.action_type.replace('_', ' ')}
                            </p>
                            {getActionBadge(action)}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{action.reason}</p>
                          {action.clients?.name && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Client: {action.clients.name}
                            </p>
                          )}
                          {action.amount && (
                            <p className="text-xs font-medium mt-1">
                              Amount: ${Number(action.amount).toFixed(2)}
                            </p>
                          )}
                          {action.ai_confidence !== null && (
                            <p className="text-xs text-muted-foreground">
                              AI Confidence: {(action.ai_confidence * 100).toFixed(0)}%
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {format(new Date(action.created_at), 'MMM d, h:mm a')}
                          </p>
                        </div>
                      </div>

                      {isPending && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => approveAction.mutate(action.id)}
                            disabled={approveAction.isPending}
                          >
                            <CheckCircle className="h-4 w-4 mr-1 text-green-600" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => rejectAction.mutate(action.id)}
                            disabled={rejectAction.isPending}
                          >
                            <XCircle className="h-4 w-4 mr-1 text-destructive" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
