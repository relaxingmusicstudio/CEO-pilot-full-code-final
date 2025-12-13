import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Phone, PhoneCall, PhoneOff, Clock, User, Building2, MessageSquare, Plus, AlertTriangle } from "lucide-react";

const AdminDialer = () => {
  const queryClient = useQueryClient();
  const [selectedCall, setSelectedCall] = useState<any>(null);
  const [disposition, setDisposition] = useState("");
  const [notes, setNotes] = useState("");
  const [newQueuePhone, setNewQueuePhone] = useState("");

  // Check Twilio config
  const { data: configStatus } = useQuery({
    queryKey: ['twilio-config'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('sms-blast', {
        body: { action: 'check_config' }
      });
      return data;
    }
  });

  // Get dialer queue
  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ['dialer-queue'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('outbound-dialer', {
        body: { action: 'get_queue' }
      });
      return data;
    },
    refetchInterval: 10000,
  });

  // Get recent call logs
  const { data: callLogs } = useQuery({
    queryKey: ['call-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  // Initiate call mutation
  const initiateMutation = useMutation({
    mutationFn: async (queueItem: any) => {
      const { data, error } = await supabase.functions.invoke('outbound-dialer', {
        body: {
          action: 'initiate_call',
          queue_item_id: queueItem.id,
          phone_number: queueItem.phone_number,
          contact_id: queueItem.contact_id,
          lead_id: queueItem.lead_id,
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.mock) {
        toast.info("Call simulated (Twilio not configured)");
      } else {
        toast.success("Call initiated");
      }
      queryClient.invalidateQueries({ queryKey: ['dialer-queue'] });
      queryClient.invalidateQueries({ queryKey: ['call-logs'] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to initiate call");
    }
  });

  // Log disposition mutation
  const dispositionMutation = useMutation({
    mutationFn: async ({ callLogId, disposition, notes }: any) => {
      const { data, error } = await supabase.functions.invoke('outbound-dialer', {
        body: {
          action: 'log_disposition',
          queue_item_id: callLogId,
          disposition,
          notes,
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Disposition logged");
      setSelectedCall(null);
      setDisposition("");
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ['call-logs'] });
    }
  });

  // Add to queue mutation
  const addToQueueMutation = useMutation({
    mutationFn: async (phone: string) => {
      const { data, error } = await supabase.functions.invoke('outbound-dialer', {
        body: {
          action: 'add_to_queue',
          phone_number: phone,
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Added to queue");
      setNewQueuePhone("");
      queryClient.invalidateQueries({ queryKey: ['dialer-queue'] });
    }
  });

  const dispositionOptions = [
    { value: 'answered', label: 'Answered', color: 'bg-green-500' },
    { value: 'no_answer', label: 'No Answer', color: 'bg-yellow-500' },
    { value: 'voicemail', label: 'Voicemail', color: 'bg-blue-500' },
    { value: 'busy', label: 'Busy', color: 'bg-orange-500' },
    { value: 'wrong_number', label: 'Wrong Number', color: 'bg-red-500' },
    { value: 'scheduled', label: 'Callback Scheduled', color: 'bg-purple-500' },
    { value: 'converted', label: 'Converted', color: 'bg-emerald-500' },
    { value: 'not_interested', label: 'Not Interested', color: 'bg-gray-500' },
  ];

  return (
    <AdminLayout title="Power Dialer">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Power Dialer</h1>
            <p className="text-muted-foreground">Click-to-call with AI handoff and disposition tracking</p>
          </div>
          
          {!configStatus?.twilio_configured && (
            <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-yellow-500">Twilio not configured - calls will be simulated</span>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Queue Size</p>
                  <p className="text-2xl font-bold">{queueData?.queue?.length || 0}</p>
                </div>
                <Phone className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Calls Today</p>
                  <p className="text-2xl font-bold">
                    {callLogs?.filter((c: any) => 
                      new Date(c.created_at).toDateString() === new Date().toDateString()
                    ).length || 0}
                  </p>
                </div>
                <PhoneCall className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Answered</p>
                  <p className="text-2xl font-bold">
                    {callLogs?.filter((c: any) => c.disposition === 'answered').length || 0}
                  </p>
                </div>
                <User className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Converted</p>
                  <p className="text-2xl font-bold">
                    {callLogs?.filter((c: any) => c.disposition === 'converted').length || 0}
                  </p>
                </div>
                <Building2 className="h-8 w-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="queue" className="space-y-4">
          <TabsList>
            <TabsTrigger value="queue">Call Queue</TabsTrigger>
            <TabsTrigger value="logs">Call Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="space-y-4">
            <div className="flex gap-4">
              <Input
                placeholder="Add phone number to queue..."
                value={newQueuePhone}
                onChange={(e) => setNewQueuePhone(e.target.value)}
                className="max-w-xs"
              />
              <Button 
                onClick={() => addToQueueMutation.mutate(newQueuePhone)}
                disabled={!newQueuePhone}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add to Queue
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Pending Calls</CardTitle>
              </CardHeader>
              <CardContent>
                {queueLoading ? (
                  <p className="text-muted-foreground">Loading queue...</p>
                ) : queueData?.queue?.length === 0 ? (
                  <p className="text-muted-foreground">No calls in queue</p>
                ) : (
                  <div className="space-y-3">
                    {queueData?.queue?.map((item: any) => (
                      <div 
                        key={item.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {item.contact?.name || item.lead?.name || 'Unknown'}
                            </p>
                            <p className="text-sm text-muted-foreground">{item.phone_number}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant="outline">
                            Priority: {item.priority}
                          </Badge>
                          <Badge variant="secondary">
                            Attempts: {item.attempts}/{item.max_attempts}
                          </Badge>
                          <Button 
                            onClick={() => initiateMutation.mutate(item)}
                            disabled={initiateMutation.isPending}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <PhoneCall className="h-4 w-4 mr-2" />
                            Call Now
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle>Recent Calls</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {callLogs?.map((call: any) => (
                    <div 
                      key={call.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          call.direction === 'outbound' ? 'bg-blue-500/10' : 'bg-green-500/10'
                        }`}>
                          {call.direction === 'outbound' ? (
                            <PhoneCall className="h-5 w-5 text-blue-500" />
                          ) : (
                            <Phone className="h-5 w-5 text-green-500" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{call.to_number}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(call.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant={call.status === 'completed' ? 'default' : 'secondary'}>
                          {call.status}
                        </Badge>
                        {call.disposition && (
                          <Badge variant="outline">{call.disposition}</Badge>
                        )}
                        {call.duration_seconds && (
                          <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {Math.floor(call.duration_seconds / 60)}:{(call.duration_seconds % 60).toString().padStart(2, '0')}
                          </span>
                        )}
                        {!call.disposition && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => setSelectedCall(call)}>
                                Log Disposition
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Log Call Disposition</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-2">
                                  {dispositionOptions.map((opt) => (
                                    <Button
                                      key={opt.value}
                                      variant={disposition === opt.value ? 'default' : 'outline'}
                                      onClick={() => setDisposition(opt.value)}
                                      className="justify-start"
                                    >
                                      <div className={`w-3 h-3 rounded-full ${opt.color} mr-2`} />
                                      {opt.label}
                                    </Button>
                                  ))}
                                </div>
                                <Textarea
                                  placeholder="Notes..."
                                  value={notes}
                                  onChange={(e) => setNotes(e.target.value)}
                                />
                                <Button 
                                  className="w-full"
                                  onClick={() => dispositionMutation.mutate({
                                    callLogId: call.id,
                                    disposition,
                                    notes,
                                  })}
                                  disabled={!disposition}
                                >
                                  Save Disposition
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminDialer;
