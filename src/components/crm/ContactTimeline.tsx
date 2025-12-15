import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone, Mail, MessageSquare, FileText, Calendar, DollarSign, User, CheckCircle } from "lucide-react";

interface TimelineEvent {
  id: string;
  type: "call" | "email" | "sms" | "note" | "meeting" | "deal" | "status_change";
  title: string;
  description: string;
  timestamp: string;
  outcome?: string;
  duration?: number;
}

const mockTimeline: TimelineEvent[] = [
  { id: "1", type: "call", title: "Outbound Call", description: "Discussed pricing options and timeline", timestamp: "2024-01-15T14:30:00", outcome: "Interested", duration: 12 },
  { id: "2", type: "email", title: "Proposal Sent", description: "Sent detailed proposal with 3 package options", timestamp: "2024-01-15T15:00:00" },
  { id: "3", type: "status_change", title: "Status Changed", description: "Lead moved to Qualified", timestamp: "2024-01-14T10:00:00" },
  { id: "4", type: "sms", title: "SMS Follow-up", description: "Quick check-in about proposal review", timestamp: "2024-01-16T09:00:00" },
  { id: "5", type: "meeting", title: "Demo Scheduled", description: "Product demo with decision maker", timestamp: "2024-01-17T14:00:00" },
  { id: "6", type: "note", title: "Internal Note", description: "CEO approved budget, ready to close", timestamp: "2024-01-18T11:00:00" },
  { id: "7", type: "deal", title: "Deal Created", description: "Enterprise Package - $12,000", timestamp: "2024-01-18T14:00:00" },
];

export const ContactTimeline = ({ leadId }: { leadId?: string }) => {
  const getEventIcon = (type: string) => {
    switch (type) {
      case "call": return <Phone className="h-4 w-4" />;
      case "email": return <Mail className="h-4 w-4" />;
      case "sms": return <MessageSquare className="h-4 w-4" />;
      case "note": return <FileText className="h-4 w-4" />;
      case "meeting": return <Calendar className="h-4 w-4" />;
      case "deal": return <DollarSign className="h-4 w-4" />;
      case "status_change": return <CheckCircle className="h-4 w-4" />;
      default: return <User className="h-4 w-4" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case "call": return "bg-blue-500";
      case "email": return "bg-purple-500";
      case "sms": return "bg-green-500";
      case "meeting": return "bg-orange-500";
      case "deal": return "bg-emerald-500";
      case "status_change": return "bg-yellow-500";
      default: return "bg-muted";
    }
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Activity Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-4">
              {mockTimeline.map((event) => (
                <div key={event.id} className="relative flex gap-4 pl-10">
                  <div className={`absolute left-2 w-5 h-5 rounded-full ${getEventColor(event.type)} flex items-center justify-center text-white`}>
                    {getEventIcon(event.type)}
                  </div>
                  <div className="flex-1 bg-muted/30 rounded-lg p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{event.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(event.timestamp)} at {formatTime(event.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{event.description}</p>
                    <div className="flex items-center gap-2">
                      {event.outcome && (
                        <Badge variant="outline" className="text-xs">{event.outcome}</Badge>
                      )}
                      {event.duration && (
                        <Badge variant="secondary" className="text-xs">{event.duration} min</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
