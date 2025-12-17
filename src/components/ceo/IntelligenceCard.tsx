import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { LucideIcon, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type CardState = "healthy" | "attention" | "urgent" | "inactive";

interface IntelligenceCardProps {
  title: string;
  icon: LucideIcon;
  primaryMetric: string | number;
  primaryLabel: string;
  secondaryMetric?: string;
  cta: string;
  state: CardState;
  navigateTo: string;
  planGated?: boolean;
  isLoading?: boolean;
}

const stateStyles: Record<CardState, { border: string; badge: string; badgeText: string }> = {
  healthy: {
    border: "border-l-green-500",
    badge: "bg-green-500/10 text-green-700 dark:text-green-400",
    badgeText: "Healthy"
  },
  attention: {
    border: "border-l-amber-500",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    badgeText: "Needs Attention"
  },
  urgent: {
    border: "border-l-red-500",
    badge: "bg-red-500/10 text-red-700 dark:text-red-400",
    badgeText: "Urgent"
  },
  inactive: {
    border: "border-l-muted",
    badge: "bg-muted text-muted-foreground",
    badgeText: "Inactive"
  }
};

export function IntelligenceCard({
  title,
  icon: Icon,
  primaryMetric,
  primaryLabel,
  secondaryMetric,
  cta,
  state,
  navigateTo,
  planGated = false,
  isLoading = false
}: IntelligenceCardProps) {
  const navigate = useNavigate();
  const styles = stateStyles[state];

  const handleClick = () => {
    if (!planGated) {
      navigate(navigateTo);
    }
  };

  if (isLoading) {
    return (
      <Card className="border-l-4 border-l-muted animate-pulse">
        <CardContent className="p-4">
          <div className="h-4 w-24 bg-muted rounded mb-3" />
          <div className="h-8 w-16 bg-muted rounded mb-2" />
          <div className="h-3 w-32 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className={cn(
        "border-l-4 cursor-pointer transition-all hover:shadow-md group",
        styles.border,
        planGated && "opacity-60 cursor-not-allowed"
      )}
      onClick={handleClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{title}</span>
          </div>
          {state !== "inactive" && (
            <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", styles.badge)}>
              {styles.badgeText}
            </Badge>
          )}
          {planGated && (
            <Badge variant="outline" className="text-[10px]">Pro</Badge>
          )}
        </div>
        
        <div className="mb-2">
          <div className="text-2xl font-bold text-foreground">{primaryMetric}</div>
          <div className="text-xs text-muted-foreground">{primaryLabel}</div>
        </div>

        {secondaryMetric && (
          <div className="text-xs text-muted-foreground mb-2">{secondaryMetric}</div>
        )}

        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-primary group-hover:underline">{cta}</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </div>
      </CardContent>
    </Card>
  );
}
