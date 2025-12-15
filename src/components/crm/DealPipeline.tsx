import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DollarSign, ArrowRight, Clock, User, TrendingUp } from "lucide-react";

interface Deal {
  id: string;
  name: string;
  company: string;
  value: number;
  stage: string;
  probability: number;
  daysInStage: number;
  nextAction: string;
}

const mockDeals: Deal[] = [
  { id: "1", name: "Enterprise Package", company: "Acme Corp", value: 12000, stage: "proposal", probability: 75, daysInStage: 3, nextAction: "Follow up call" },
  { id: "2", name: "Growth Plan", company: "Tech Startup", value: 5000, stage: "qualified", probability: 40, daysInStage: 7, nextAction: "Send case study" },
  { id: "3", name: "Basic Package", company: "Local Shop", value: 2000, stage: "new", probability: 20, daysInStage: 1, nextAction: "Discovery call" },
  { id: "4", name: "Premium Suite", company: "Big Corp", value: 25000, stage: "negotiation", probability: 85, daysInStage: 2, nextAction: "Contract review" },
];

const stages = [
  { id: "new", label: "New", color: "bg-blue-500" },
  { id: "qualified", label: "Qualified", color: "bg-yellow-500" },
  { id: "proposal", label: "Proposal", color: "bg-purple-500" },
  { id: "negotiation", label: "Negotiation", color: "bg-orange-500" },
  { id: "closed", label: "Closed Won", color: "bg-green-500" },
];

export const DealPipeline = () => {
  const [deals] = useState<Deal[]>(mockDeals);

  const getDealsByStage = (stageId: string) => deals.filter(d => d.stage === stageId);
  
  const getStageValue = (stageId: string) => 
    getDealsByStage(stageId).reduce((sum, d) => sum + d.value, 0);

  const getWeightedValue = (stageId: string) =>
    getDealsByStage(stageId).reduce((sum, d) => sum + (d.value * d.probability / 100), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Deal Pipeline</h3>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            Total Value: <span className="font-semibold text-foreground">${deals.reduce((s, d) => s + d.value, 0).toLocaleString()}</span>
          </span>
          <span className="text-muted-foreground">
            Weighted: <span className="font-semibold text-green-500">${deals.reduce((s, d) => s + (d.value * d.probability / 100), 0).toLocaleString()}</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {stages.map((stage) => (
          <Card key={stage.id} className="bg-muted/30">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                  <CardTitle className="text-sm font-medium">{stage.label}</CardTitle>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {getDealsByStage(stage.id).length}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                ${getStageValue(stage.id).toLocaleString()} | ${getWeightedValue(stage.id).toLocaleString()} weighted
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-2 space-y-2 max-h-[400px] overflow-y-auto">
              {getDealsByStage(stage.id).map((deal) => (
                <Card key={deal.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm truncate">{deal.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {deal.probability}%
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      {deal.company}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-green-500 flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {deal.value.toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {deal.daysInStage}d
                      </span>
                    </div>
                    <div className="text-xs text-primary truncate flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" />
                      {deal.nextAction}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {getDealsByStage(stage.id).length === 0 && (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  No deals
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
