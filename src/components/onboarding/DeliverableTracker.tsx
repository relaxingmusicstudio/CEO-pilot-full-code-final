import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Package, CheckCircle2, Clock, Bot, Globe, MessageSquare, Phone } from "lucide-react";

interface ClientOption {
  id: string;
  name: string;
}

interface DeliverableClientInfo {
  name: string;
  plan: string;
}

interface Deliverable {
  id: string;
  name: string;
  deliverable_type: string;
  status: string;
  description?: string | null;
  provisioned_at?: string | null;
  clients?: DeliverableClientInfo | null;
}

const DeliverableTracker = () => {
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const queryClient = useQueryClient();

  const { data: clients } = useQuery({
    queryKey: ['clients-list'],
    queryFn: async (): Promise<ClientOption[]> => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return (data || []) as ClientOption[];
    }
  });

  const { data: deliverables, isLoading } = useQuery({
    queryKey: ['client-deliverables', selectedClient],
    queryFn: async (): Promise<Deliverable[]> => {
      let query = supabase
        .from('client_deliverables')
        .select(`
          *,
          clients (id, name, plan)
        `)
        .order('created_at', { ascending: false });

      if (selectedClient !== 'all') {
        query = query.eq('client_id', selectedClient);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Deliverable[];
    }
  });

  const provisionMutation = useMutation({
    mutationFn: async (deliverableId: string) => {
      const response = await supabase.functions.invoke('onboarding-tracker', {
        body: { 
          action: 'provision_deliverable', 
          data: { deliverable_id: deliverableId }
        }
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      toast.success("Deliverable provisioned!");
      queryClient.invalidateQueries({ queryKey: ['client-deliverables'] });
    },
    onError: () => {
      toast.error("Failed to provision deliverable");
    }
  });

  const getDeliverableIcon = (type: string) => {
    switch (type) {
      case 'ai_voice_agent': return <Phone className="h-5 w-5" />;
      case 'chatbot': return <MessageSquare className="h-5 w-5" />;
      case 'website': return <Globe className="h-5 w-5" />;
      case 'automation': return <Bot className="h-5 w-5" />;
      default: return <Package className="h-5 w-5" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'provisioned':
        return <Badge className="bg-green-500/10 text-green-500">Provisioned</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/10 text-yellow-500">Pending</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-500/10 text-blue-500">In Progress</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return <div className="animate-pulse h-64 bg-muted rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Select value={selectedClient} onValueChange={setSelectedClient}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Filter by client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients?.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {deliverables?.map((deliverable) => (
          <Card key={deliverable.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    {getDeliverableIcon(deliverable.deliverable_type)}
                  </div>
                  <div>
                    <CardTitle className="text-base">{deliverable.name}</CardTitle>
                    <p className="text-xs text-muted-foreground capitalize">
                      {deliverable.deliverable_type.replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>
                {getStatusBadge(deliverable.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {deliverable.description && (
                <p className="text-sm text-muted-foreground">{deliverable.description}</p>
              )}
              
              {selectedClient === 'all' && deliverable.clients && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{deliverable.clients.name}</Badge>
                  <Badge variant="secondary">{deliverable.clients.plan}</Badge>
                </div>
              )}

              {deliverable.status === 'pending' && (
                <Button 
                  className="w-full"
                  onClick={() => provisionMutation.mutate(deliverable.id)}
                  disabled={provisionMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Mark as Provisioned
                </Button>
              )}

              {deliverable.provisioned_at && (
                <p className="text-xs text-muted-foreground">
                  Provisioned: {new Date(deliverable.provisioned_at).toLocaleDateString()}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {deliverables?.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No deliverables found
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DeliverableTracker;
