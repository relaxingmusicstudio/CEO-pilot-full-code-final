import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Building2, 
  RefreshCw, 
  CheckCircle, 
  XCircle,
  Loader2,
  Link,
  Unlink
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface PlaidConnection {
  id: string;
  institution_name: string;
  last_sync_at: string | null;
  is_active: boolean;
}

export default function PlaidLinkButton() {
  const [isLinking, setIsLinking] = useState(false);
  const queryClient = useQueryClient();

  // Fetch connections
  const { data: connections, isLoading } = useQuery({
    queryKey: ['plaid-connections'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('plaid-integration', {
        body: { action: 'get_connections' }
      });
      if (error) throw error;
      return data.connections as PlaidConnection[];
    }
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const { data, error } = await supabase.functions.invoke('plaid-integration', {
        body: { action: 'sync_transactions', connection_id: connectionId }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Synced ${data.added || 0} new transactions`);
      queryClient.invalidateQueries({ queryKey: ['plaid-connections'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
    },
    onError: (error: Error) => {
      toast.error(`Sync failed: ${error.message}`);
    }
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const { data, error } = await supabase.functions.invoke('plaid-integration', {
        body: { action: 'remove_connection', connection_id: connectionId }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Bank account disconnected');
      queryClient.invalidateQueries({ queryKey: ['plaid-connections'] });
    }
  });

  const handleConnect = async () => {
    setIsLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke('plaid-integration', {
        body: { action: 'create_link_token', user_id: 'default' }
      });

      if (error) throw error;

      if (data.link_token) {
        // In production, you would use the Plaid Link SDK here
        // For now, show a message about configuration
        toast.info('Plaid Link token created. Configure Plaid SDK to complete connection.', {
          description: `Token: ${data.link_token.substring(0, 20)}...`
        });
      } else if (data.error) {
        toast.error(`Plaid error: ${data.error.message || 'Configuration needed'}`);
      }
    } catch (error: any) {
      toast.error(`Connection failed: ${error.message}`);
    } finally {
      setIsLinking(false);
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
          <Building2 className="h-4 w-4" />
          Bank Accounts (Plaid)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {connections && connections.length > 0 ? (
          <div className="space-y-2">
            {connections.map((conn) => (
              <div key={conn.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="text-sm font-medium">{conn.institution_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Synced: {formatLastSync(conn.last_sync_at)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => syncMutation.mutate(conn.id)}
                    disabled={syncMutation.isPending}
                  >
                    {syncMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => disconnectMutation.mutate(conn.id)}
                    disabled={disconnectMutation.isPending}
                  >
                    <Unlink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4">
            <XCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">No bank accounts connected</p>
          </div>
        )}

        <Button
          onClick={handleConnect}
          disabled={isLinking}
          className="w-full"
          variant={connections?.length ? "outline" : "default"}
        >
          {isLinking ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Link className="h-4 w-4 mr-2" />
          )}
          {connections?.length ? 'Add Another Bank' : 'Connect Bank Account'}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Securely connect via Plaid. Your credentials are never stored.
        </p>
      </CardContent>
    </Card>
  );
}
