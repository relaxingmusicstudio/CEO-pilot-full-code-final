import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { 
  FlaskConical, 
  Trophy, 
  TrendingUp, 
  Check,
  ArrowRight,
  Loader2
} from "lucide-react";
import { toast } from "sonner";

interface ABTest {
  id: string;
  name: string;
  elementType: string;
  status: string;
  variants: {
    id: string;
    name: string;
    value: string;
    views: number;
    conversions: number;
    conversionRate: number;
  }[];
  winner?: string;
  confidence?: number;
}

interface ABTestsWidgetProps {
  tests: ABTest[];
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const ABTestsWidget = ({ tests, onRefresh, isLoading }: ABTestsWidgetProps) => {
  const [applying, setApplying] = useState<string | null>(null);

  const calculateConfidence = (test: ABTest) => {
    if (test.variants.length < 2) return 0;
    const sorted = [...test.variants].sort((a, b) => b.conversionRate - a.conversionRate);
    const best = sorted[0];
    const second = sorted[1];
    
    if (best.views < 100 || second.views < 100) return 0;
    
    const diff = best.conversionRate - second.conversionRate;
    const pooled = (best.conversionRate + second.conversionRate) / 2;
    if (pooled === 0) return 0;
    
    // Simplified confidence calculation
    const zScore = diff / Math.sqrt((pooled * (100 - pooled)) / Math.min(best.views, second.views));
    const confidence = Math.min(99, Math.max(0, 50 + zScore * 20));
    return Math.round(confidence);
  };

  const applyWinner = async (test: ABTest, winnerId: string) => {
    setApplying(test.id);
    try {
      await supabase
        .from("ab_test_experiments")
        .update({ 
          status: "completed", 
          winner_variant_id: winnerId,
          end_date: new Date().toISOString()
        })
        .eq("id", test.id);
      
      toast.success(`Applied winning variant for "${test.name}"`);
      onRefresh?.();
    } catch (error) {
      toast.error("Failed to apply winner");
    } finally {
      setApplying(null);
    }
  };

  const activeTests = tests.filter(t => t.status === "active");
  const completedTests = tests.filter(t => t.status === "completed");

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            A/B Tests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading tests...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          A/B Tests
          {activeTests.length > 0 && (
            <Badge variant="secondary">{activeTests.length} active</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeTests.length === 0 && completedTests.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No A/B tests running. Create one in the Funnels agent.
          </p>
        ) : (
          <>
            {activeTests.map((test) => {
              const confidence = calculateConfidence(test);
              const sorted = [...test.variants].sort((a, b) => b.conversionRate - a.conversionRate);
              const leader = sorted[0];
              const hasWinner = confidence >= 95;

              return (
                <div key={test.id} className="border rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{test.name}</p>
                      <p className="text-xs text-muted-foreground">{test.elementType}</p>
                    </div>
                    {hasWinner ? (
                      <Badge className="bg-green-500/20 text-green-600 hover:bg-green-500/30">
                        <Trophy className="h-3 w-3 mr-1" />
                        Winner Found
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        {confidence}% confidence
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    {test.variants.map((variant, i) => (
                      <div key={variant.id} className="flex items-center gap-2">
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium">
                              {variant.name}
                              {i === 0 && variant.conversionRate > 0 && (
                                <TrendingUp className="inline h-3 w-3 ml-1 text-green-500" />
                              )}
                            </span>
                            <span className="text-muted-foreground">
                              {variant.conversions}/{variant.views} ({variant.conversionRate.toFixed(1)}%)
                            </span>
                          </div>
                          <Progress 
                            value={variant.conversionRate} 
                            className="h-1.5"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {hasWinner && (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => applyWinner(test, leader.id)}
                      disabled={applying === test.id}
                    >
                      {applying === test.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Check className="h-4 w-4 mr-2" />
                      )}
                      Apply Winner: {leader.name}
                    </Button>
                  )}
                </div>
              );
            })}

            {completedTests.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2">Recently completed:</p>
                {completedTests.slice(0, 2).map((test) => (
                  <div key={test.id} className="flex items-center justify-between text-sm py-1">
                    <span>{test.name}</span>
                    <Badge variant="outline" className="text-green-600">
                      <Check className="h-3 w-3 mr-1" />
                      Completed
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ABTestsWidget;
