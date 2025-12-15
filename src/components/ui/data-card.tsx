import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "./card";
import { cn } from "@/lib/utils";

interface DataCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: number;
    label: string;
    positive?: boolean;
  };
  subtitle?: string;
  className?: string;
  variant?: "default" | "primary" | "success" | "warning" | "danger";
}

export function DataCard({
  title,
  value,
  icon: Icon,
  trend,
  subtitle,
  className,
  variant = "default",
}: DataCardProps) {
  const variantStyles = {
    default: "bg-card",
    primary: "bg-primary/5 border-primary/20",
    success: "bg-green-500/5 border-green-500/20",
    warning: "bg-yellow-500/5 border-yellow-500/20",
    danger: "bg-red-500/5 border-red-500/20",
  };

  const iconVariantStyles = {
    default: "text-muted-foreground/30",
    primary: "text-primary/30",
    success: "text-green-500/30",
    warning: "text-yellow-500/30",
    danger: "text-red-500/30",
  };

  return (
    <Card className={cn(variantStyles[variant], className)}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1 mt-1">
                <span
                  className={cn(
                    "text-xs font-medium",
                    trend.positive ? "text-green-500" : "text-red-500"
                  )}
                >
                  {trend.positive ? "↑" : "↓"} {Math.abs(trend.value)}%
                </span>
                <span className="text-xs text-muted-foreground">{trend.label}</span>
              </div>
            )}
          </div>
          {Icon && <Icon className={cn("h-8 w-8", iconVariantStyles[variant])} />}
        </div>
      </CardContent>
    </Card>
  );
}
