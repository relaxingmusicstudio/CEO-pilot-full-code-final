import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useClickThrough } from "@/hooks/useClickThrough";
import type { EntityType } from "@/hooks/useClickThrough";
import { 
  Target, 
  Clock, 
  AlertTriangle, 
  Zap, 
  ChevronRight,
  CheckCircle2,
  Phone,
  FileText
} from "lucide-react";

interface FocusItem {
  id: string;
  type: "hot_lead" | "pending_approval" | "follow_up" | "alert";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  action: string;
  entity: EntityType;
  entityId?: string;
}

export function TodaysFocusWidget() {
  const [items, setItems] = useState<FocusItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { navigateToDetail } = useClickThrough();

  useEffect(() => {
    fetchFocusItems();

    const channel = supabase
      .channel("focus-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, fetchFocusItems)
      .on("postgres_changes", { event: "*", schema: "public", table: "content" }, fetchFocusItems)
      .on("postgres_changes", { event: "*", schema: "public", table: "follow_up_tasks" }, fetchFocusItems)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchFocusItems = async () => {
    try {
      const [hotLeadsRes, pendingRes, followUpsRes] = await Promise.all([
        supabase
          .from("leads")
          .select("id, name, email, lead_score, lead_temperature, business_name")
          .or("lead_temperature.eq.hot,lead_score.gte.70")
          .order("lead_score", { ascending: false })
          .limit(5),
        supabase
          .from("content")
          .select("id, title, content_type, created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("follow_up_tasks")
          .select("id, topic, priority, status")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(3),
      ]);

      const focusItems: FocusItem[] = [];

      // Add hot leads
      (hotLeadsRes.data || []).forEach(lead => {
        focusItems.push({
          id: lead.id,
          type: "hot_lead",
          title: lead.name || lead.email || "Hot Lead",
          description: lead.business_name || `Score: ${lead.lead_score}`,
          priority: "high",
          action: "Call Now",
          entity: "crm",
          entityId: lead.id,
        });
      });

      // Add pending approvals
      (pendingRes.data || []).forEach(content => {
        focusItems.push({
          id: content.id,
          type: "pending_approval",
          title: content.title || "Pending Content",
          description: content.content_type || "Review needed",
          priority: "medium",
          action: "Review",
          entity: "approvals",
          entityId: content.id,
        });
      });

      // Add follow-ups
      (followUpsRes.data || []).forEach(task => {
        focusItems.push({
          id: task.id,
          type: "follow_up",
          title: task.topic,
          description: `Priority: ${task.priority}`,
          priority: task.priority as "high" | "medium" | "low" || "medium",
          action: "Complete",
          entity: "crm",
          entityId: task.id,
        });
      });

      // Sort by priority
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      focusItems.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      setItems(focusItems.slice(0, 8));
    } catch (error) {
      console.error("Error fetching focus items:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getIcon = (type: FocusItem["type"]) => {
    switch (type) {
      case "hot_lead": return Zap;
      case "pending_approval": return FileText;
      case "follow_up": return Phone;
      case "alert": return AlertTriangle;
      default: return Target;
    }
  };

  const getPriorityColor = (priority: string): "destructive" | "secondary" | "outline" => {
    switch (priority) {
      case "high": return "destructive";
      case "medium": return "secondary";
      default: return "outline";
    }
  };

  const handleItemClick = (item: FocusItem) => {
    navigateToDetail(item.entity, item.entityId ? { id: item.entityId } : undefined);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Today's Focus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Today's Focus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
            <p className="text-sm font-medium">All caught up!</p>
            <p className="text-xs text-muted-foreground">No urgent items need attention</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Today's Focus
          </div>
          <Badge variant="secondary" className="text-xs">
            {items.length} items
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[280px]">
          <div className="p-4 pt-0 space-y-2">
            {items.map((item) => {
              const Icon = getIcon(item.type);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors group"
                  onClick={() => handleItemClick(item)}
                >
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                    item.priority === "high" ? "bg-destructive/10" : "bg-primary/10"
                  }`}>
                    <Icon className={`h-4 w-4 ${
                      item.priority === "high" ? "text-destructive" : "text-primary"
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getPriorityColor(item.priority)} className="text-xs">
                      {item.action}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
