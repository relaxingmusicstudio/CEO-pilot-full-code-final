import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, TrendingDown, Clock, DollarSign } from "lucide-react";

interface Client {
  id: string;
  name: string;
  healthScore: number;
  mrr: number;
  status: string;
  lastContact?: string;
  loginCount?: number;
  ticketCount?: number;
}

interface ChurnPredictionWidgetProps {
  clients: Client[];
  className?: string;
}

const ChurnPredictionWidget = ({ clients, className = "" }: ChurnPredictionWidgetProps) => {
  const predictions = useMemo(() => {
    const activeClients = clients.filter(c => c.status === "active");
    
    return activeClients.map(client => {
      // Churn risk factors (simplified algorithm)
      let riskScore = 0;
      const factors: string[] = [];

      // Health score factor (0-40 points)
      if (client.healthScore < 30) {
        riskScore += 40;
        factors.push("Critical health score");
      } else if (client.healthScore < 50) {
        riskScore += 25;
        factors.push("Low health score");
      } else if (client.healthScore < 70) {
        riskScore += 10;
      }

      // Last contact factor (0-20 points)
      if (client.lastContact) {
        const daysSinceContact = Math.floor(
          (Date.now() - new Date(client.lastContact).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceContact > 30) {
          riskScore += 20;
          factors.push("No contact in 30+ days");
        } else if (daysSinceContact > 14) {
          riskScore += 10;
          factors.push("No recent contact");
        }
      }

      // Low engagement (0-20 points)
      if (client.loginCount !== undefined && client.loginCount < 3) {
        riskScore += 15;
        factors.push("Low platform usage");
      }

      // Support issues (0-20 points)
      if (client.ticketCount !== undefined && client.ticketCount > 5) {
        riskScore += 15;
        factors.push("Multiple support tickets");
      }

      return {
        ...client,
        churnRisk: Math.min(100, riskScore),
        factors,
        atRiskMRR: riskScore > 50 ? client.mrr : 0,
      };
    })
    .filter(c => c.churnRisk > 30)
    .sort((a, b) => b.churnRisk - a.churnRisk);
  }, [clients]);

  const totalAtRiskMRR = predictions
    .filter(p => p.churnRisk > 50)
    .reduce((sum, p) => sum + p.mrr, 0);

  const getRiskLevel = (score: number): { label: string; color: "destructive" | "outline" | "secondary" } => {
    if (score >= 70) return { label: "High", color: "destructive" };
    if (score >= 50) return { label: "Medium", color: "outline" };
    return { label: "Low", color: "secondary" };
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-destructive" />
            Churn Prediction
          </div>
          {totalAtRiskMRR > 0 && (
            <Badge variant="destructive" className="text-xs">
              ${totalAtRiskMRR.toLocaleString()} at risk
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {predictions.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No significant churn risk detected</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 gap-2 text-center mb-4">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <p className="text-lg font-bold text-destructive">
                  {predictions.filter(p => p.churnRisk >= 70).length}
                </p>
                <p className="text-xs text-muted-foreground">High Risk</p>
              </div>
              <div className="p-2 bg-yellow-500/10 rounded-lg">
                <p className="text-lg font-bold text-yellow-600">
                  {predictions.filter(p => p.churnRisk >= 50 && p.churnRisk < 70).length}
                </p>
                <p className="text-xs text-muted-foreground">Medium Risk</p>
              </div>
            </div>

            {/* At-risk clients */}
            <div className="space-y-2">
              {predictions.slice(0, 4).map((client) => {
                const risk = getRiskLevel(client.churnRisk);
                return (
                  <div 
                    key={client.id}
                    className="p-3 bg-muted/50 rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate max-w-[140px]">
                          {client.name}
                        </span>
                        <Badge variant={risk.color} className="text-xs">
                          {risk.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <DollarSign className="h-3 w-3" />
                        {client.mrr.toLocaleString()}/mo
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Churn Risk</span>
                        <span className="font-medium">{client.churnRisk}%</span>
                      </div>
                      <Progress 
                        value={client.churnRisk} 
                        className="h-1.5"
                      />
                    </div>

                    {client.factors.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {client.factors.slice(0, 2).map((factor, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {factor}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ChurnPredictionWidget;
