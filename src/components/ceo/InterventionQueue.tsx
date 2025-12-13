import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  AlertTriangle, 
  Phone, 
  Gift, 
  TrendingUp, 
  CheckCircle2,
  Clock,
  RefreshCw,
  Sparkles
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Intervention {
  id: string;
  client_id: string;
  intervention_type: string;
  trigger_reason: string | null;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  clients: {
    id: string;
    name: string;
    business_name: string | null;
    mrr: number;
    health_score: number | null;
    plan: string;
  } | null;
}

interface InterventionQueueProps {
  className?: string;
}

const InterventionQueue = ({ className = "" }: InterventionQueueProps) => {
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [generatingStrategy, setGeneratingStrategy] = useState<string | null>(null);

  const fetchInterventions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("churn-intervention", {
        body: { action: "get_pending" }
      });
      if (!error && data?.interventions) {
        setInterventions(data.interventions);
      }
    } catch (err) {
      console.error("Failed to fetch interventions:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInterventions();
  }, []);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "at_risk_outreach": return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case "check_in_call": return <Phone className="h-4 w-4 text-blue-500" />;
      case "milestone_celebration": return <Gift className="h-4 w-4 text-purple-500" />;
      case "upsell_opportunity": return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "health_check": return <Clock className="h-4 w-4 text-orange-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "at_risk_outreach": return "At Risk";
      case "check_in_call": return "Check-in";
      case "milestone_celebration": return "Milestone";
      case "upsell_opportunity": return "Upsell";
      case "health_check": return "Health Check";
      default: return type.replace(/_/g, " ");
    }
  };

  const getPriorityColor = (type: string) => {
    switch (type) {
      case "at_risk_outreach": return "bg-red-500";
      case "upsell_opportunity": return "bg-green-500";
      case "milestone_celebration": return "bg-purple-500";
      default: return "bg-blue-500";
    }
  };

  const completeIntervention = async (id: string, outcome: string) => {
    try {
      const { error } = await supabase.functions.invoke("churn-intervention", {
        body: { 
          action: "complete", 
          intervention_id: id,
          outcome,
          notes: `Completed via CEO Dashboard`
        }
      });
      if (error) throw error;
      toast.success("Intervention completed");
      fetchInterventions();
    } catch (err) {
      toast.error("Failed to complete intervention");
    }
  };

  const generateStrategy = async (clientId: string) => {
    setGeneratingStrategy(clientId);
    try {
      const { data, error } = await supabase.functions.invoke("churn-intervention", {
        body: { action: "generate_strategy", client_id: clientId }
      });
      if (error) throw error;
      
      // Show strategy in toast or modal
      toast.success("Strategy generated", {
        description: data.strategy?.primary_issue || "See console for details"
      });
      console.log("Retention Strategy:", data.strategy);
    } catch (err) {
      toast.error("Failed to generate strategy");
    } finally {
      setGeneratingStrategy(null);
    }
  };

  const urgentCount = interventions.filter(i => i.intervention_type === "at_risk_outreach").length;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Intervention Queue
            {urgentCount > 0 && (
              <Badge variant="destructive" className="text-xs">{urgentCount} urgent</Badge>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={fetchInterventions}
            disabled={isLoading}
            className="h-6 w-6 p-0"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {interventions.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
            No pending interventions
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-3">
              {interventions.map((intervention) => (
                <div 
                  key={intervention.id} 
                  className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {getTypeIcon(intervention.intervention_type)}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {intervention.clients?.business_name || intervention.clients?.name || "Unknown"}
                          </span>
                          <Badge className={`text-xs text-white ${getPriorityColor(intervention.intervention_type)}`}>
                            {getTypeLabel(intervention.intervention_type)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {intervention.trigger_reason}
                        </p>
                        {intervention.clients && (
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>${intervention.clients.mrr}/mo</span>
                            <span>•</span>
                            <span>Health: {intervention.clients.health_score || 0}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="h-7 text-xs flex-1"
                      onClick={() => completeIntervention(intervention.id, "positive")}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Complete
                    </Button>
                    {intervention.intervention_type === "at_risk_outreach" && intervention.clients && (
                      <Button 
                        size="sm" 
                        variant="secondary"
                        className="h-7 text-xs"
                        onClick={() => generateStrategy(intervention.clients!.id)}
                        disabled={generatingStrategy === intervention.clients.id}
                      >
                        <Sparkles className={`h-3 w-3 mr-1 ${generatingStrategy === intervention.clients.id ? "animate-spin" : ""}`} />
                        AI Strategy
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default InterventionQueue;
