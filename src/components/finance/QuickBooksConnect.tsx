import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  FileSpreadsheet, 
  RefreshCw, 
  CheckCircle, 
  XCircle,
  Loader2,
  ExternalLink,
  Unlink
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface QuickBooksStatus {
  connected: boolean;
  company_id: string | null;
  last_sync: string | null;
  recent_syncs: Array<{
    entity_type: string;
    sync_status: string;
    created_at: string;
  }>;
}

export default function QuickBooksConnect() {
  const [isConnecting, setIsConnecting] = useState(false);
  const queryClient = useQueryClient();

  // Fetch connection status
  const { data: status, isLoading } = useQuery({
    queryKey: ['quickbooks-status'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('quickbooks-integration', {
        body: { action: 'get_connection_status' }
      });
      if (error) throw error;
      return data as QuickBooksStatus;
    }
  });

  // Refresh tokens mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('quickbooks-integration', {
        body: { action: 'refresh_tokens' }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('QuickBooks connection refreshed');
      queryClient.invalidateQueries({ queryKey: ['quickbooks-status'] });
    },
    onError: (error: Error) => {
      toast.error(`Refresh failed: ${error.message}`);
    }
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('quickbooks-integration', {
        body: { action: 'disconnect' }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('QuickBooks disconnected');
      queryClient.invalidateQueries({ queryKey: ['quickbooks-status'] });
    }
  });

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks-integration', {
        body: { 
          action: 'get_auth_url',
          redirect_uri: `${window.location.origin}/admin/billing?qb_callback=true`
        }
      });

      if (error) throw error;

      if (data.auth_url) {
        // In production, redirect to QuickBooks OAuth
        toast.info('QuickBooks OAuth URL generated', {
          description: 'Configure OAuth credentials to complete connection.'
        });
        // window.location.href = data.auth_url;
      }
    } catch (error: any) {
      toast.error(`Connection failed: ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const formatLastSync = (date: string | null) => {
    if (!date) return 'Never';
    const d = new Date(date);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          QuickBooks Online
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {status?.connected ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium">Connected</p>
                  <p className="text-xs text-muted-foreground">
                    Company ID: {status.company_id}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-green-600">
                Active
              </Badge>
            </div>

            <div className="text-xs text-muted-foreground">
              Last sync: {formatLastSync(status.last_sync)}
            </div>

            {status.recent_syncs && status.recent_syncs.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Recent Activity:</p>
                {status.recent_syncs.slice(0, 3).map((sync, i) => (
                  <div key={i} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
                    <span className="capitalize">{sync.entity_type}</span>
                    <Badge 
                      variant={sync.sync_status === 'success' ? 'outline' : 'destructive'}
                      className="text-xs"
                    >
                      {sync.sync_status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
              >
                {refreshMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Refresh
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                <Unlink className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <XCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">Not connected</p>
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full"
            >
              {isConnecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4 mr-2" />
              )}
              Connect QuickBooks
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Sync customers, payments, and invoices automatically.
        </p>
      </CardContent>
    </Card>
  );
}
