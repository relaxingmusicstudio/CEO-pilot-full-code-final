import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { 
  MessageSquare, 
  Mic, 
  FileText, 
  CheckCircle2, 
  Clock,
  AlertTriangle,
  RefreshCw,
  X
} from "lucide-react";
import { toast } from "sonner";

interface UserDirective {
  id: string;
  source: string;
  input_type: string;
  content: string;
  intent: string | null;
  action_required: boolean;
  action_taken: boolean;
  handled_by: string | null;
  priority: string;
  created_at: string;
  processed_at: string | null;
}

const sourceIcons: Record<string, typeof MessageSquare> = {
  ceo_hub: MessageSquare,
  ceo_voice: Mic,
  chatbot: MessageSquare,
  contact_form: FileText,
  settings: FileText,
};

const intentColors: Record<string, string> = {
  approval: "bg-green-500/20 text-green-700 dark:text-green-400",
  pause: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  resume: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
  cancel: "bg-red-500/20 text-red-700 dark:text-red-400",
  priority_change: "bg-purple-500/20 text-purple-700 dark:text-purple-400",
  directive: "bg-primary/20 text-primary",
  question: "bg-muted text-muted-foreground",
  feedback: "bg-muted text-muted-foreground",
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const priorityColors: Record<string, BadgeVariant> = {
  urgent: "destructive",
  high: "default",
  normal: "secondary",
  low: "outline",
};

interface UserDirectivesWidgetProps {
  compact?: boolean;
  showAll?: boolean;
}

const UserDirectivesWidget = ({ compact = false, showAll = false }: UserDirectivesWidgetProps) => {
  const [directives, setDirectives] = useState<UserDirective[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDirectives = useCallback(async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('user_directives')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!showAll) {
        query = query.eq('action_required', true).eq('action_taken', false);
      }
      
      const { data, error } = await query.limit(showAll ? 50 : 10);
      
      if (error) throw error;
      setDirectives(data || []);
    } catch (error) {
      console.error('Error fetching directives:', error);
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    fetchDirectives();
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel('user_directives_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_directives' }, () => {
        fetchDirectives();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDirectives]);

  const markHandled = async (id: string) => {
    try {
      const { error } = await supabase
        .from('user_directives')
        .update({
          action_taken: true,
          handled_by: 'manual',
          processed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
      
      toast.success("Directive marked as handled");
      fetchDirectives();
    } catch (error) {
      toast.error("Failed to update directive");
    }
  };

  const dismissDirective = async (id: string) => {
    try {
      const { error } = await supabase
        .from('user_directives')
        .update({
          action_required: false,
          handled_by: 'dismissed',
          processed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
      
      toast.success("Directive dismissed");
      fetchDirectives();
    } catch (error) {
      toast.error("Failed to dismiss directive");
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const pendingCount = directives.filter(d => d.action_required && !d.action_taken).length;

  if (compact) {
    return (
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : directives.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-500" />
            No pending commands
          </p>
        ) : (
          directives.slice(0, 5).map((directive) => {
            const Icon = sourceIcons[directive.source] || MessageSquare;
            return (
              <div key={directive.id} className="flex items-start gap-2 p-2 bg-muted/50 rounded-lg">
                <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{directive.content}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {directive.intent && (
                      <Badge variant="outline" className={`text-[10px] px-1 py-0 ${intentColors[directive.intent] || ''}`}>
                        {directive.intent}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">{formatTime(directive.created_at)}</span>
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => markHandled(directive.id)}>
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          User Commands
          {pendingCount > 0 && (
            <Badge variant="default" className="ml-auto">{pendingCount}</Badge>
          )}
          <Button size="icon" variant="ghost" className="h-6 w-6 ml-1" onClick={fetchDirectives}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : directives.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
                <p className="text-sm text-muted-foreground">No pending commands</p>
                <p className="text-xs text-muted-foreground mt-1">Your voice and chat inputs will appear here</p>
              </div>
            ) : (
              directives.map((directive) => {
                const Icon = sourceIcons[directive.source] || MessageSquare;
                return (
                  <div 
                    key={directive.id} 
                    className={`p-3 rounded-lg border ${
                      directive.action_taken 
                        ? 'bg-muted/30 border-border/50 opacity-60' 
                        : 'bg-card border-border'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`p-1.5 rounded ${directive.input_type === 'voice' ? 'bg-accent/20' : 'bg-primary/20'}`}>
                        <Icon className={`h-3 w-3 ${directive.input_type === 'voice' ? 'text-accent' : 'text-primary'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-2">{directive.content}</p>
                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                          {directive.intent && (
                            <Badge variant="outline" className={`text-[10px] ${intentColors[directive.intent] || ''}`}>
                              {directive.intent}
                            </Badge>
                          )}
                          <Badge variant={priorityColors[directive.priority] || "secondary"} className="text-[10px]">
                            {directive.priority}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {directive.source.replace('_', ' ')} • {formatTime(directive.created_at)}
                          </span>
                        </div>
                        {directive.action_taken && directive.handled_by && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Handled by: {directive.handled_by}
                          </p>
                        )}
                      </div>
                      {!directive.action_taken && directive.action_required && (
                        <div className="flex flex-col gap-1">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => markHandled(directive.id)}>
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => dismissDirective(directive.id)}>
                            <X className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default UserDirectivesWidget;
