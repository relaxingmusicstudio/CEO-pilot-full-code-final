import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Bot,
  User,
  Phone,
  MessageSquare,
  Mail,
  GitBranch,
  Activity,
  ChevronDown,
  Send,
  PhoneCall,
  Sparkles,
  Clock,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface TimelineEvent {
  id: string;
  type: string;
  channel: string;
  timestamp: string;
  title: string;
  description: string;
  agent_type: string | null;
  is_ai: boolean;
  metadata: Record<string, unknown>;
  content_snapshot?: string;
}

interface TimelinePanelProps {
  isOpen: boolean;
  onClose: () => void;
  leadId?: string;
  contactId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

export function CustomerTimelinePanel({
  isOpen,
  onClose,
  leadId,
  contactId,
  customerName,
  customerEmail,
  customerPhone,
}: TimelinePanelProps) {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [nextAction, setNextAction] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Fetch timeline data
  const { data: timelineData, isLoading, refetch } = useQuery({
    queryKey: ["customer-timeline", leadId, contactId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-customer-timeline", {
        body: { lead_id: leadId, contact_id: contactId, limit: 100 },
      });
      if (error) throw error;
      return data;
    },
    enabled: isOpen && (!!leadId || !!contactId),
  });

  // Analyze timeline for next best action
  useEffect(() => {
    if (timelineData?.timeline?.length > 0 && !nextAction && !isAnalyzing) {
      analyzeForNextAction();
    }
  }, [timelineData]);

  const analyzeForNextAction = async () => {
    if (!timelineData?.timeline || timelineData.timeline.length === 0) return;
    
    setIsAnalyzing(true);
    try {
      const recentEvents = timelineData.timeline.slice(0, 5);
      const summary = recentEvents.map((e: TimelineEvent) => 
        `${e.title}: ${e.description}`
      ).join("; ");

      const { data, error } = await supabase.functions.invoke("ceo-agent", {
        body: {
          query: `Based on these recent customer interactions: "${summary}", suggest ONE specific next action to move this deal forward. Be concise (under 20 words).`,
          timeRange: "7d",
        },
      });

      if (!error && data?.response) {
        setNextAction(data.response);
      }
    } catch (err) {
      console.error("Analysis error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleEvent = (eventId: string) => {
    const newExpanded = new Set(expandedEvents);
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId);
    } else {
      newExpanded.add(eventId);
    }
    setExpandedEvents(newExpanded);
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "phone":
        return Phone;
      case "chat":
        return MessageSquare;
      case "email":
        return Mail;
      case "automation":
        return GitBranch;
      default:
        return Activity;
    }
  };

  const getChannelColor = (channel: string) => {
    switch (channel) {
      case "phone":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "chat":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "email":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "automation":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const handleQuickReply = () => {
    toast.success("Opening compose...");
    // Would open email/message compose
  };

  const handleQuickCall = () => {
    if (customerPhone) {
      toast.success(`Initiating call to ${customerPhone}`);
      // Would trigger dialer
    } else {
      toast.error("No phone number available");
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-xl">{customerName || "Customer"}</SheetTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {/* Customer Quick Info */}
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            {customerEmail && <span>{customerEmail}</span>}
            {customerPhone && <span>• {customerPhone}</span>}
          </div>
        </SheetHeader>

        {/* Next Best Action Card */}
        {(nextAction || isAnalyzing) && (
          <div className="flex-shrink-0 mt-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-primary mb-1">Next Best Action</p>
                {isAnalyzing ? (
                  <Skeleton className="h-4 w-full" />
                ) : (
                  <p className="text-sm text-foreground">{nextAction}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex-shrink-0 flex gap-2 mt-4">
          <Button size="sm" onClick={handleQuickReply} className="flex-1">
            <Send className="h-4 w-4 mr-2" />
            Reply
          </Button>
          <Button size="sm" variant="outline" onClick={handleQuickCall} className="flex-1">
            <PhoneCall className="h-4 w-4 mr-2" />
            Call
          </Button>
        </div>

        {/* Stats Summary */}
        {timelineData?.stats && (
          <div className="flex-shrink-0 grid grid-cols-3 gap-2 mt-4 p-3 rounded-lg bg-muted/50">
            <div className="text-center">
              <p className="text-lg font-bold">{timelineData.stats.total_events}</p>
              <p className="text-xs text-muted-foreground">Total Events</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-blue-500">{timelineData.stats.ai_events}</p>
              <p className="text-xs text-muted-foreground">AI Actions</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-green-500">{timelineData.stats.human_events}</p>
              <p className="text-xs text-muted-foreground">Human Actions</p>
            </div>
          </div>
        )}

        {/* Timeline */}
        <ScrollArea className="flex-1 mt-4 -mx-6 px-6">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : !timelineData?.timeline?.length ? (
            <EmptyState
              icon={Activity}
              title="No activity yet"
              description="Interactions will appear here as they happen"
              size="sm"
            />
          ) : (
            <div className="space-y-1 pb-4">
              {timelineData.timeline.map((event: TimelineEvent, index: number) => {
                const ChannelIcon = getChannelIcon(event.channel);
                const isExpanded = expandedEvents.has(event.id);
                const showConnector = index < timelineData.timeline.length - 1;

                return (
                  <div key={event.id} className="relative">
                    {/* Connector line */}
                    {showConnector && (
                      <div className="absolute left-5 top-12 w-0.5 h-full -translate-x-1/2 bg-border" />
                    )}

                    <Collapsible open={isExpanded} onOpenChange={() => toggleEvent(event.id)}>
                      <CollapsibleTrigger asChild>
                        <div className="flex gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                          {/* Avatar */}
                          <div
                            className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
                              event.is_ai
                                ? "bg-blue-500/10 text-blue-500"
                                : "bg-green-500/10 text-green-500"
                            }`}
                          >
                            {event.is_ai ? (
                              <Bot className="h-5 w-5" />
                            ) : (
                              <User className="h-5 w-5" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{event.title}</span>
                              <Badge
                                variant="outline"
                                className={`text-xs ${getChannelColor(event.channel)}`}
                              >
                                <ChannelIcon className="h-3 w-3 mr-1" />
                                {event.channel}
                              </Badge>
                              {event.is_ai && event.agent_type && (
                                <Badge variant="secondary" className="text-xs">
                                  {event.agent_type}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate mt-0.5">
                              {event.description}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(event.timestamp), "MMM d, yyyy h:mm a")}
                              </span>
                              {event.content_snapshot && (
                                <ChevronDown
                                  className={`h-3 w-3 text-muted-foreground transition-transform ${
                                    isExpanded ? "rotate-180" : ""
                                  }`}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </CollapsibleTrigger>

                      {event.content_snapshot && (
                        <CollapsibleContent>
                          <div className="ml-13 pl-6 pb-3">
                            <div className="p-3 rounded-lg bg-muted/50 text-sm">
                              <p className="whitespace-pre-wrap">{event.content_snapshot}</p>
                            </div>
                            {event.type === "message" && (
                              <div className="mt-2 flex gap-2">
                                <Button size="sm" variant="outline" onClick={handleQuickReply}>
                                  <Send className="h-3 w-3 mr-1" />
                                  Reply
                                </Button>
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      )}
                    </Collapsible>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
