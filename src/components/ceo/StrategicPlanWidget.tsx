import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { 
  Target, 
  Calendar, 
  Users, 
  AlertTriangle, 
  CheckCircle2,
  Clock,
  Loader2,
  Bot
} from "lucide-react";

interface StrategicPlan {
  id: string;
  current_phase: string;
  plan_horizon_days: number;
  weekly_objectives: Array<{
    week: number;
    objectives: string[];
    assigned_agents: string[];
  }>;
  daily_focus: Array<{
    date: string;
    focus_area: string;
    key_tasks: string[];
    responsible_agent: string;
  }>;
  agent_workloads: Record<string, {
    active_tasks: number;
    completed_today: number;
    pending: number;
  }>;
  milestones: Array<{
    title: string;
    due_date: string;
    status: 'pending' | 'in_progress' | 'completed';
  }>;
  blockers: Array<{
    description: string;
    severity: 'low' | 'medium' | 'high';
    created_at: string;
  }>;
  next_review_at: string;
}

interface StrategicPlanWidgetProps {
  compact?: boolean;
  className?: string;
}

const PHASE_COLORS: Record<string, string> = {
  foundation: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  growth: "bg-green-500/20 text-green-400 border-green-500/30",
  optimization: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  expansion: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

const AGENT_ICONS: Record<string, string> = {
  content: "📝",
  ads: "📢",
  sequences: "📧",
  inbox: "💬",
  social: "🌐",
  ceo: "👔",
};

export const StrategicPlanWidget = ({ compact = false, className = "" }: StrategicPlanWidgetProps) => {
  const [plan, setPlan] = useState<StrategicPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlan();
  }, []);

  const loadPlan = async () => {
    try {
      const { data, error } = await supabase
        .from('ceo_strategic_plan')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        const weekly_objectives = Array.isArray(data.weekly_objectives)
          ? (data.weekly_objectives as StrategicPlan["weekly_objectives"])
          : [];
        const daily_focus = Array.isArray(data.daily_focus)
          ? (data.daily_focus as StrategicPlan["daily_focus"])
          : [];
        const milestones = Array.isArray(data.milestones)
          ? (data.milestones as StrategicPlan["milestones"])
          : [];
        const blockers = Array.isArray(data.blockers)
          ? (data.blockers as StrategicPlan["blockers"])
          : [];
        const agent_workloads =
          data.agent_workloads && typeof data.agent_workloads === "object"
            ? (data.agent_workloads as StrategicPlan["agent_workloads"])
            : {};

        setPlan({
          ...data,
          weekly_objectives,
          daily_focus,
          agent_workloads,
          milestones,
          blockers,
        });
      }
    } catch (err) {
      console.error('Failed to load strategic plan:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-4 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!plan) {
    return (
      <Card className={className}>
        <CardContent className="p-4 text-center text-muted-foreground text-sm">
          <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No strategic plan yet</p>
          <p className="text-xs mt-1">Start a conversation with CEO AI to create one</p>
        </CardContent>
      </Card>
    );
  }

  const completedMilestones = plan.milestones.filter(m => m.status === 'completed').length;
  const totalMilestones = plan.milestones.length;
  const progress = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0;
  const highBlockers = plan.blockers.filter(b => b.severity === 'high').length;

  if (compact) {
    return (
      <Card className={className}>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">2-Week Plan</span>
              <Badge className={`text-xs ${PHASE_COLORS[plan.current_phase] || ''}`}>
                {plan.current_phase}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                {completedMilestones}/{totalMilestones}
              </span>
              {highBlockers > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  {highBlockers}
                </span>
              )}
            </div>
          </div>
          <Progress value={progress} className="h-1.5 mt-2" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Strategic Plan
            <Badge className={`text-xs ${PHASE_COLORS[plan.current_phase] || ''}`}>
              {plan.current_phase}
            </Badge>
          </CardTitle>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {plan.plan_horizon_days}d horizon
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Milestones</span>
            <span>{completedMilestones}/{totalMilestones} complete</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Agent Workloads */}
        {Object.keys(plan.agent_workloads).length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <Bot className="h-3 w-3" />
              Agent Workloads
            </p>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(plan.agent_workloads).map(([agent, workload]) => (
                <div key={agent} className="bg-muted/50 rounded p-2 text-center">
                  <span className="text-lg">{AGENT_ICONS[agent] || '🤖'}</span>
                  <p className="text-xs font-medium capitalize mt-1">{agent}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {workload.active_tasks} active
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* This Week's Objectives */}
        {plan.weekly_objectives[0] && (
          <div>
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              This Week
            </p>
            <ul className="space-y-1">
              {plan.weekly_objectives[0].objectives.slice(0, 3).map((obj, i) => (
                <li key={i} className="text-xs flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  {obj}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Blockers */}
        {plan.blockers.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Blockers ({plan.blockers.length})
            </p>
            <div className="space-y-1">
              {plan.blockers.slice(0, 2).map((blocker, i) => (
                <div 
                  key={i} 
                  className={`text-xs p-2 rounded border ${
                    blocker.severity === 'high' 
                      ? 'bg-destructive/10 border-destructive/30 text-destructive' 
                      : 'bg-muted/50 border-border'
                  }`}
                >
                  {blocker.description}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Next Review */}
        <div className="text-xs text-muted-foreground text-center pt-2 border-t">
          Next plan review: {new Date(plan.next_review_at).toLocaleDateString()}
        </div>
      </CardContent>
    </Card>
  );
};

export default StrategicPlanWidget;
