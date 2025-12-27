import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useClickThrough } from "@/hooks/useClickThrough";
import type { EntityType } from "@/hooks/useClickThrough";
import { 
  TrendingUp, 
  TrendingDown, 
  ChevronRight,
  Activity,
  LucideIcon
} from "lucide-react";

interface LiveMetricsCardProps {
  title: string;
  value: number;
  previousValue?: number;
  format?: "number" | "currency" | "percentage";
  icon: LucideIcon;
  isLive?: boolean;
  entity?: EntityType;
  filter?: Record<string, string>;
  className?: string;
}

export function LiveMetricsCard({
  title,
  value,
  previousValue,
  format = "number",
  icon: Icon,
  isLive = false,
  entity,
  filter,
  className,
}: LiveMetricsCardProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const displayValueRef = useRef(displayValue);
  const { navigateToDetail } = useClickThrough();

  useEffect(() => {
    displayValueRef.current = displayValue;
  }, [displayValue]);

  // Animate value changes
  useEffect(() => {
    if (displayValueRef.current !== value) {
      setIsAnimating(true);
      const duration = 500;
      const startValue = displayValueRef.current;
      const diff = value - startValue;
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // Ease out cubic
        setDisplayValue(Math.round(startValue + diff * eased));

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setIsAnimating(false);
        }
      };

      requestAnimationFrame(animate);
    }
  }, [value]);

  const formatValue = (val: number): string => {
    switch (format) {
      case "currency":
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(val);
      case "percentage":
        return `${val.toFixed(1)}%`;
      default:
        return val.toLocaleString();
    }
  };

  const trend = previousValue !== undefined
    ? value > previousValue ? "up" : value < previousValue ? "down" : "neutral"
    : undefined;

  const trendPercent = previousValue !== undefined && previousValue !== 0
    ? Math.abs(((value - previousValue) / previousValue) * 100).toFixed(1)
    : undefined;

  const handleClick = () => {
    if (entity) {
      navigateToDetail(entity, filter);
    }
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/30 group relative overflow-hidden",
        className
      )}
      onClick={handleClick}
    >
      {/* Live indicator pulse */}
      {isLive && (
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="text-[10px] text-green-600 font-medium">LIVE</span>
        </div>
      )}

      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground font-medium">{title}</span>
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <div className={cn(
              "text-2xl font-bold transition-all",
              isAnimating && "text-primary"
            )}>
              {formatValue(displayValue)}
            </div>

            {trend && trend !== "neutral" && trendPercent && (
              <div className={cn(
                "flex items-center gap-1 text-xs mt-1",
                trend === "up" ? "text-green-600" : "text-red-600"
              )}>
                {trend === "up" ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                <span>{trendPercent}%</span>
              </div>
            )}
          </div>

          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </CardContent>
    </Card>
  );
}
