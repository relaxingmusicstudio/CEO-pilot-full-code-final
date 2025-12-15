import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { 
  Zap, Plus, Trash2, Eye, MousePointer, Clock, 
  MessageSquare, Mail, Phone, ArrowRight, Settings2 
} from "lucide-react";

interface Trigger {
  id: string;
  name: string;
  type: "page_view" | "time_on_page" | "scroll_depth" | "chat_open" | "exit_intent" | "return_visit";
  condition: string;
  action: "enroll_sequence" | "send_sms" | "send_email" | "add_tag" | "notify_sales";
  isActive: boolean;
}

const mockTriggers: Trigger[] = [
  { id: "1", name: "High-Intent Visitor", type: "page_view", condition: "Pricing page viewed 3+ times", action: "notify_sales", isActive: true },
  { id: "2", name: "Exit Intent Capture", type: "exit_intent", condition: "Mouse leaves viewport", action: "enroll_sequence", isActive: true },
  { id: "3", name: "Deep Engagement", type: "scroll_depth", condition: "90% scroll on case study", action: "send_email", isActive: false },
  { id: "4", name: "Return Visitor", type: "return_visit", condition: "Visited 3+ times this week", action: "add_tag", isActive: true },
  { id: "5", name: "Chat Abandonment", type: "chat_open", condition: "Opened chat but didn't engage", action: "send_sms", isActive: true },
];

const triggerTypeIcons: Record<string, React.ReactNode> = {
  page_view: <Eye className="h-4 w-4" />,
  time_on_page: <Clock className="h-4 w-4" />,
  scroll_depth: <MousePointer className="h-4 w-4" />,
  chat_open: <MessageSquare className="h-4 w-4" />,
  exit_intent: <ArrowRight className="h-4 w-4 rotate-45" />,
  return_visit: <Clock className="h-4 w-4" />,
};

const actionIcons: Record<string, React.ReactNode> = {
  enroll_sequence: <Settings2 className="h-4 w-4" />,
  send_sms: <MessageSquare className="h-4 w-4" />,
  send_email: <Mail className="h-4 w-4" />,
  add_tag: <Zap className="h-4 w-4" />,
  notify_sales: <Phone className="h-4 w-4" />,
};

export const BehavioralTriggers = () => {
  const [triggers, setTriggers] = useState<Trigger[]>(mockTriggers);
  const [showAddForm, setShowAddForm] = useState(false);

  const toggleTrigger = (id: string) => {
    setTriggers(prev => prev.map(t => 
      t.id === id ? { ...t, isActive: !t.isActive } : t
    ));
  };

  const deleteTrigger = (id: string) => {
    setTriggers(prev => prev.filter(t => t.id !== id));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-5 w-5 text-primary" />
            Behavioral Triggers
          </CardTitle>
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Trigger
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showAddForm && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Trigger Name</Label>
                  <Input placeholder="e.g., High-Intent Visitor" />
                </div>
                <div>
                  <Label className="text-xs">Trigger Type</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="page_view">Page View</SelectItem>
                      <SelectItem value="time_on_page">Time on Page</SelectItem>
                      <SelectItem value="scroll_depth">Scroll Depth</SelectItem>
                      <SelectItem value="chat_open">Chat Open</SelectItem>
                      <SelectItem value="exit_intent">Exit Intent</SelectItem>
                      <SelectItem value="return_visit">Return Visit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Action</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enroll_sequence">Enroll in Sequence</SelectItem>
                      <SelectItem value="send_sms">Send SMS</SelectItem>
                      <SelectItem value="send_email">Send Email</SelectItem>
                      <SelectItem value="add_tag">Add Tag</SelectItem>
                      <SelectItem value="notify_sales">Notify Sales</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button size="sm">Save Trigger</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {triggers.map((trigger) => (
          <div 
            key={trigger.id}
            className={`flex items-center justify-between p-3 rounded-lg border ${
              trigger.isActive ? "bg-muted/30" : "bg-muted/10 opacity-60"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                trigger.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}>
                {triggerTypeIcons[trigger.type]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{trigger.name}</span>
                  <Badge variant="outline" className="text-xs capitalize">
                    {trigger.type.replace("_", " ")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{trigger.condition}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowRight className="h-3 w-3" />
                <span className="flex items-center gap-1">
                  {actionIcons[trigger.action]}
                  <span className="capitalize">{trigger.action.replace("_", " ")}</span>
                </span>
              </div>
              <Switch 
                checked={trigger.isActive}
                onCheckedChange={() => toggleTrigger(trigger.id)}
              />
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => deleteTrigger(trigger.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
