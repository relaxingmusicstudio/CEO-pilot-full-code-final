import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Calendar, Video, Clock, Plus, CheckCircle2, ExternalLink } from "lucide-react";
import { format } from "date-fns";

interface ClientOption {
  id: string;
  name: string;
}

interface TrainingSession {
  id: string;
  client_id: string;
  session_type: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  recording_url?: string | null;
  clients?: ClientOption | null;
}

interface NewSession {
  client_id: string;
  session_type: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
}

const TrainingScheduler = () => {
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newSession, setNewSession] = useState<NewSession>({
    client_id: '',
    session_type: 'onboarding',
    title: '',
    scheduled_at: '',
    duration_minutes: 30
  });
  const queryClient = useQueryClient();

  const { data: clients } = useQuery({
    queryKey: ['clients-for-training'],
    queryFn: async (): Promise<ClientOption[]> => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return (data || []) as ClientOption[];
    }
  });

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['training-sessions', selectedClient],
    queryFn: async (): Promise<TrainingSession[]> => {
      let query = supabase
        .from('client_training_sessions')
        .select(`
          *,
          clients (id, name)
        `)
        .order('scheduled_at', { ascending: true });

      if (selectedClient !== 'all') {
        query = query.eq('client_id', selectedClient);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as TrainingSession[];
    }
  });

  const scheduleMutation = useMutation({
    mutationFn: async (sessionData: NewSession) => {
      const response = await supabase.functions.invoke('onboarding-tracker', {
        body: { 
          action: 'schedule_training',
          client_id: sessionData.client_id,
          data: {
            session_type: sessionData.session_type,
            title: sessionData.title,
            scheduled_at: sessionData.scheduled_at,
            duration_minutes: sessionData.duration_minutes
          }
        }
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      toast.success("Training session scheduled!");
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
      setIsDialogOpen(false);
      setNewSession({
        client_id: '',
        session_type: 'onboarding',
        title: '',
        scheduled_at: '',
        duration_minutes: 30
      });
    },
    onError: () => {
      toast.error("Failed to schedule session");
    }
  });

  const completeMutation = useMutation({
    mutationFn: async ({ sessionId, recordingUrl }: { sessionId: string; recordingUrl?: string }) => {
      const response = await supabase.functions.invoke('onboarding-tracker', {
        body: { 
          action: 'complete_training',
          data: {
            session_id: sessionId,
            recording_url: recordingUrl || null
          }
        }
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      toast.success("Session marked as completed!");
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
    }
  });

  const getSessionTypeColor = (type: string) => {
    switch (type) {
      case 'onboarding': return 'bg-blue-500/10 text-blue-500';
      case 'feature_walkthrough': return 'bg-purple-500/10 text-purple-500';
      case 'qbr': return 'bg-green-500/10 text-green-500';
      case 'support': return 'bg-yellow-500/10 text-yellow-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const upcomingSessions = sessions?.filter(s => 
    s.status === 'scheduled' && new Date(s.scheduled_at) >= new Date()
  ) || [];

  const completedSessions = sessions?.filter(s => s.status === 'completed') || [];

  if (isLoading) {
    return <div className="animate-pulse h-64 bg-muted rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Schedule Session
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Training Session</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Client</Label>
                <Select 
                  value={newSession.client_id} 
                  onValueChange={(v) => setNewSession({...newSession, client_id: v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Session Type</Label>
                <Select 
                  value={newSession.session_type} 
                  onValueChange={(v) => setNewSession({...newSession, session_type: v})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="onboarding">Onboarding</SelectItem>
                    <SelectItem value="feature_walkthrough">Feature Walkthrough</SelectItem>
                    <SelectItem value="qbr">QBR</SelectItem>
                    <SelectItem value="support">Support Call</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Title</Label>
                <Input 
                  value={newSession.title}
                  onChange={(e) => setNewSession({...newSession, title: e.target.value})}
                  placeholder="e.g., Initial Setup Call"
                />
              </div>

              <div className="space-y-2">
                <Label>Date & Time</Label>
                <Input 
                  type="datetime-local"
                  value={newSession.scheduled_at}
                  onChange={(e) => setNewSession({...newSession, scheduled_at: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Select 
                  value={newSession.duration_minutes.toString()} 
                  onValueChange={(v) => setNewSession({...newSession, duration_minutes: parseInt(v)})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="45">45 minutes</SelectItem>
                    <SelectItem value="60">60 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button 
                className="w-full"
                onClick={() => scheduleMutation.mutate(newSession)}
                disabled={!newSession.client_id || !newSession.title || !newSession.scheduled_at || scheduleMutation.isPending}
              >
                Schedule Session
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Upcoming Sessions
              <Badge variant="secondary">{upcomingSessions.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingSessions.map((session) => (
              <Card key={session.id} className="p-4">
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium">{session.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        {session.clients?.name}
                      </p>
                    </div>
                    <Badge className={getSessionTypeColor(session.session_type)}>
                      {session.session_type.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {format(new Date(session.scheduled_at), 'MMM d, yyyy')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {format(new Date(session.scheduled_at), 'h:mm a')}
                    </span>
                    <span>{session.duration_minutes} min</span>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => completeMutation.mutate({ sessionId: session.id })}
                    disabled={completeMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Mark Complete
                  </Button>
                </div>
              </Card>
            ))}
            {upcomingSessions.length === 0 && (
              <p className="text-center py-8 text-muted-foreground">
                No upcoming sessions
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Completed Sessions
              <Badge variant="secondary">{completedSessions.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {completedSessions.slice(0, 5).map((session) => (
              <Card key={session.id} className="p-4 bg-muted/50">
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium">{session.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        {session.clients?.name}
                      </p>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(session.scheduled_at), 'MMM d, yyyy')}
                  </p>
                  {session.recording_url && (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={session.recording_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View Recording
                      </a>
                    </Button>
                  )}
                </div>
              </Card>
            ))}
            {completedSessions.length === 0 && (
              <p className="text-center py-8 text-muted-foreground">
                No completed sessions
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TrainingScheduler;
