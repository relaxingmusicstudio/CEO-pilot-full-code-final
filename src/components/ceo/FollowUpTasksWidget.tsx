import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Phone, 
  Mail, 
  MessageSquare, 
  Sparkles, 
  Send, 
  Clock, 
  User,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface FollowUpTask {
  id: string;
  topic: string;
  contact_preference: string;
  timeline_expectation: string | null;
  caller_phone: string | null;
  caller_email: string | null;
  status: string;
  priority: string;
  created_at: string;
  ai_draft_email: { subject?: string; body?: string } | null;
  ai_draft_script: string | null;
  ai_draft_sms: string | null;
  call_logs: { transcription: string | null; duration_seconds: number | null } | null;
  leads: { name: string | null; email: string | null; phone: string | null; business_name: string | null } | null;
}

type DraftEdit =
  | { type: "email"; subject?: string; body?: string }
  | { type: "script"; content?: string }
  | { type: "sms"; content?: string };

type EditedContentMap = Record<string, DraftEdit>;
type ReplyContent = string | { subject?: string; body?: string };

export function FollowUpTasksWidget() {
  const queryClient = useQueryClient();
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<EditedContentMap>({});
  const [generatingDraft, setGeneratingDraft] = useState<string | null>(null);

  const { data: tasks, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['follow-up-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('voice-agent-handler', {
        body: { action: 'get_pending_tasks', limit: 20 },
      });
      if (error) throw error;
      return (data?.tasks || []) as FollowUpTask[];
    },
    refetchInterval: 30000,
  });

  const generateDraftMutation = useMutation({
    mutationFn: async ({ taskId, draftType }: { taskId: string; draftType: string }) => {
      setGeneratingDraft(taskId);
      const { data, error } = await supabase.functions.invoke('voice-agent-handler', {
        body: { action: 'generate_draft', task_id: taskId, draft_type: draftType },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['follow-up-tasks'] });
      toast.success('AI draft generated');
      setGeneratingDraft(null);
      
      // Set the generated content in edit state
      if (data.content) {
        if (data.draft_type === 'email' && data.content.ai_draft_email) {
          setEditedContent(prev => ({
            ...prev,
            [variables.taskId]: {
              type: 'email',
              subject: data.content.ai_draft_email.subject,
              body: data.content.ai_draft_email.body,
            },
          }));
        } else if (data.draft_type === 'script') {
          setEditedContent(prev => ({
            ...prev,
            [variables.taskId]: { type: 'script', content: data.content.ai_draft_script },
          }));
        } else if (data.draft_type === 'sms') {
          setEditedContent(prev => ({
            ...prev,
            [variables.taskId]: { type: 'sms', content: data.content.ai_draft_sms },
          }));
        }
      }
    },
    onError: (error) => {
      toast.error('Failed to generate draft');
      setGeneratingDraft(null);
      console.error(error);
    },
  });

  const sendReplyMutation = useMutation({
    mutationFn: async ({ taskId, method, content, recipient }: { 
      taskId: string; 
      method: string; 
      content: ReplyContent;
      recipient?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('voice-agent-handler', {
        body: { 
          action: 'send_reply', 
          task_id: taskId, 
          reply_method: method,
          reply_content: content,
          recipient,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow-up-tasks'] });
      toast.success('Reply sent and logged to CRM');
      setExpandedTask(null);
      setEditedContent({});
    },
    onError: (error) => {
      toast.error('Failed to send reply');
      console.error(error);
    },
  });

  const getContactIcon = (pref: string) => {
    switch (pref) {
      case 'email': return <Mail className="h-4 w-4" />;
      case 'sms': return <MessageSquare className="h-4 w-4" />;
      default: return <Phone className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'destructive';
      case 'high': return 'default';
      case 'medium': return 'secondary';
      default: return 'outline';
    }
  };

  const handleGenerateDraft = (taskId: string, preference: string) => {
    const draftType = preference === 'call' ? 'script' : preference;
    generateDraftMutation.mutate({ taskId, draftType });
  };

  const handleSendReply = (task: FollowUpTask) => {
    const content = editedContent[task.id];
    if (!content) {
      toast.error('Please generate or enter content first');
      return;
    }

    const method = content.type === 'script' ? 'call' : content.type;
    const replyContent = content.type === 'email' 
      ? { subject: content.subject, body: content.body }
      : content.content;
    
    const recipient = content.type === 'email' 
      ? (task.caller_email || task.leads?.email)
      : (task.caller_phone || task.leads?.phone);

    sendReplyMutation.mutate({ 
      taskId: task.id, 
      method, 
      content: replyContent,
      recipient,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Follow-up Tasks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    const message = error instanceof Error
      ? error.message
      : "Voice follow-up service is temporarily unavailable.";
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Follow-up Tasks
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Retry"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium">Couldn't load follow-up tasks</p>
            <p className="text-xs text-muted-foreground mt-1">{message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Follow-up Tasks
          </div>
          {tasks && tasks.length > 0 && (
            <Badge variant="secondary">{tasks.length} pending</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!tasks || tasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No pending follow-ups</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {tasks.map((task) => (
                <div 
                  key={task.id}
                  className="border rounded-lg p-3 space-y-2"
                >
                  {/* Header */}
                  <div 
                    className="flex items-start justify-between cursor-pointer"
                    onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {task.leads?.name || task.caller_phone || 'Unknown'}
                        </span>
                        <Badge variant={getPriorityColor(task.priority)} className="text-xs">
                          {task.priority}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {task.topic}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {getContactIcon(task.contact_preference)}
                        <span>{task.contact_preference}</span>
                      </div>
                      {expandedTask === task.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {expandedTask === task.id && (
                    <div className="pt-3 border-t space-y-3">
                      {/* Task Details */}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Business:</span>{' '}
                          {task.leads?.business_name || 'N/A'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Timeline:</span>{' '}
                          {task.timeline_expectation || 'ASAP'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Phone:</span>{' '}
                          {task.caller_phone || task.leads?.phone || 'N/A'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Email:</span>{' '}
                          {task.caller_email || task.leads?.email || 'N/A'}
                        </div>
                      </div>

                      {/* Call Summary */}
                      {task.call_logs?.transcription && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Call Summary:</span>
                          <p className="mt-1 p-2 bg-muted/50 rounded text-xs line-clamp-3">
                            {task.call_logs.transcription}
                          </p>
                        </div>
                      )}

                      {/* AI Reply Assistant Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => handleGenerateDraft(task.id, task.contact_preference)}
                        disabled={generatingDraft === task.id}
                      >
                        {generatingDraft === task.id ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            AI Reply Assistant
                          </>
                        )}
                      </Button>

                      {/* Edit Area */}
                      {editedContent[task.id] && (
                        <div className="space-y-2">
                          {editedContent[task.id].type === 'email' && (
                            <>
                              <Input
                                placeholder="Subject"
                                value={editedContent[task.id].subject || ''}
                                onChange={(e) => setEditedContent(prev => ({
                                  ...prev,
                                  [task.id]: { ...prev[task.id], subject: e.target.value },
                                }))}
                              />
                              <Textarea
                                placeholder="Email body..."
                                value={editedContent[task.id].body || ''}
                                onChange={(e) => setEditedContent(prev => ({
                                  ...prev,
                                  [task.id]: { ...prev[task.id], body: e.target.value },
                                }))}
                                rows={4}
                              />
                            </>
                          )}
                          {(editedContent[task.id].type === 'script' || editedContent[task.id].type === 'sms') && (
                            <Textarea
                              placeholder={editedContent[task.id].type === 'sms' ? 'SMS message...' : 'Call script...'}
                              value={editedContent[task.id].content || ''}
                              onChange={(e) => setEditedContent(prev => ({
                                ...prev,
                                [task.id]: { ...prev[task.id], content: e.target.value },
                              }))}
                              rows={4}
                            />
                          )}
                          
                          <Button
                            size="sm"
                            className="w-full"
                            onClick={() => handleSendReply(task)}
                            disabled={sendReplyMutation.isPending}
                          >
                            {sendReplyMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4 mr-2" />
                            )}
                            {editedContent[task.id].type === 'script' 
                              ? 'Mark Ready & Log to CRM' 
                              : 'Send & Log to CRM'}
                          </Button>
                        </div>
                      )}

                      {/* Timestamp */}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(task.created_at), 'MMM d, h:mm a')}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
