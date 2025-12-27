import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, Clock, User } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OnboardingPipelineProps {
  onboardingData: OnboardingClient[];
}

interface OnboardingClient {
  id: string;
  status: string;
  client_id: string;
  progress_percentage?: number | null;
  clients?: {
    name?: string | null;
    plan?: string | null;
    mrr?: number | null;
  } | null;
}

const OnboardingPipeline = ({ onboardingData }: OnboardingPipelineProps) => {
  const queryClient = useQueryClient();

  const goLiveMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const response = await supabase.functions.invoke('onboarding-tracker', {
        body: { action: 'go_live_check', client_id: clientId }
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      if (data.ready) {
        toast.success("Client is now LIVE!");
        queryClient.invalidateQueries({ queryKey: ['client-onboarding'] });
      } else {
        toast.error("Client not ready", {
          description: `Blockers: ${data.blockers?.incomplete_tasks?.length || 0} tasks, ${data.blockers?.unprovisioned_deliverables?.length || 0} deliverables`
        });
      }
    }
  });

  const stages = [
    { key: 'pending', label: 'Pending', color: 'bg-yellow-500' },
    { key: 'in_progress', label: 'In Progress', color: 'bg-blue-500' },
    { key: 'completed', label: 'Setup Complete', color: 'bg-green-500' },
    { key: 'live', label: 'Live', color: 'bg-primary' },
  ];

  const getClientsByStage = (status: string) => {
    return onboardingData.filter(o => o.status === status);
  };

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {stages.map((stage) => (
        <Card key={stage.key} className="min-h-[400px]">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${stage.color}`} />
              <CardTitle className="text-sm font-medium">{stage.label}</CardTitle>
              <Badge variant="secondary" className="ml-auto">
                {getClientsByStage(stage.key).length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {getClientsByStage(stage.key).map((item) => (
              <Card key={item.id} className="p-3 bg-muted/50">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">
                      {item.clients?.name || 'Unknown Client'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">
                      {item.clients?.plan || 'starter'}
                    </Badge>
                    <span>${item.clients?.mrr || 0}/mo</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Progress</span>
                      <span>{item.progress_percentage || 0}%</span>
                    </div>
                    <Progress value={item.progress_percentage || 0} className="h-1.5" />
                  </div>
                  {stage.key === 'completed' && (
                    <Button 
                      size="sm" 
                      className="w-full mt-2"
                      onClick={() => goLiveMutation.mutate(item.client_id)}
                      disabled={goLiveMutation.isPending}
                    >
                      <ArrowRight className="h-4 w-4 mr-1" />
                      Go Live
                    </Button>
                  )}
                </div>
              </Card>
            ))}
            {getClientsByStage(stage.key).length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No clients in this stage
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default OnboardingPipeline;
