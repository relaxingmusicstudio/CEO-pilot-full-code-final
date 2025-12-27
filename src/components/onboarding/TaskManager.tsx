import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, Circle, Clock, AlertCircle } from "lucide-react";

interface ClientOption {
  id: string;
  name: string;
}

interface TaskClient {
  id: string;
  name: string;
}

interface OnboardingTask {
  id: string;
  client_id: string;
  task_name: string;
  status: string;
  category?: string | null;
  description?: string | null;
  clients?: TaskClient | null;
}

const TaskManager = () => {
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const queryClient = useQueryClient();

  const { data: clients } = useQuery({
    queryKey: ['clients-with-onboarding'],
    queryFn: async (): Promise<ClientOption[]> => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return (data || []) as ClientOption[];
    }
  });

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['onboarding-tasks', selectedClient],
    queryFn: async (): Promise<OnboardingTask[]> => {
      let query = supabase
        .from('onboarding_tasks')
        .select(`
          *,
          clients (id, name)
        `)
        .order('priority', { ascending: true });

      if (selectedClient !== 'all') {
        query = query.eq('client_id', selectedClient);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as OnboardingTask[];
    }
  });

  const completeTaskMutation = useMutation({
    mutationFn: async ({ taskId, clientId }: { taskId: string; clientId: string }) => {
      const response = await supabase.functions.invoke('onboarding-tracker', {
        body: { 
          action: 'complete_task', 
          task_id: taskId,
          client_id: clientId 
        }
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Task completed! Progress: ${data.progress_percentage}%`);
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['client-onboarding'] });
    },
    onError: () => {
      toast.error("Failed to complete task");
    }
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'in_progress': return <Clock className="h-4 w-4 text-blue-500" />;
      case 'blocked': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'setup': return 'bg-blue-500/10 text-blue-500';
      case 'integration': return 'bg-purple-500/10 text-purple-500';
      case 'testing': return 'bg-yellow-500/10 text-yellow-500';
      case 'training': return 'bg-green-500/10 text-green-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const tasksByCategory = (tasks || []).reduce<Record<string, OnboardingTask[]>>((acc, task) => {
    const category = task.category || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(task);
    return acc;
  }, {});

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

      <div className="grid gap-6 md:grid-cols-2">
        {Object.entries(tasksByCategory).map(([category, categoryTasks]: [string, OnboardingTask[]]) => (
          <Card key={category}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="capitalize">{category}</CardTitle>
                <Badge className={getCategoryColor(category)}>
                  {categoryTasks.filter((t) => t.status === 'completed').length}/{categoryTasks.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {categoryTasks.map((task) => (
                <div 
                  key={task.id} 
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    task.status === 'completed' ? 'bg-muted/50' : 'bg-background'
                  }`}
                >
                  <Checkbox
                    checked={task.status === 'completed'}
                    onCheckedChange={() => {
                      if (task.status !== 'completed') {
                        completeTaskMutation.mutate({
                          taskId: task.id,
                          clientId: task.client_id
                        });
                      }
                    }}
                    disabled={task.status === 'completed' || completeTaskMutation.isPending}
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={task.status === 'completed' ? 'line-through text-muted-foreground' : ''}>
                        {task.task_name}
                      </span>
                      {getStatusIcon(task.status)}
                    </div>
                    {task.description && (
                      <p className="text-xs text-muted-foreground">{task.description}</p>
                    )}
                    {selectedClient === 'all' && task.clients && (
                      <Badge variant="outline" className="text-xs">
                        {task.clients.name}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {Object.keys(tasksByCategory).length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No onboarding tasks found
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TaskManager;
