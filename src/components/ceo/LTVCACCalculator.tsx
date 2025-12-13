import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Users, TrendingUp, Calculator } from "lucide-react";

interface Client {
  id: string;
  mrr: number;
  startDate: string;
  status: string;
}

interface Lead {
  id: string;
  createdAt: string;
  status: string;
}

interface Visitor {
  id: string;
  utmSource?: string;
  createdAt: string;
}

interface LTVCACCalculatorProps {
  clients: Client[];
  leads: Lead[];
  visitors: Visitor[];
  marketingSpend?: number;
  className?: string;
}

const LTVCACCalculator = ({ 
  clients, 
  leads, 
  visitors, 
  marketingSpend = 0,
  className = "" 
}: LTVCACCalculatorProps) => {
  const metrics = useMemo(() => {
    const activeClients = clients.filter(c => c.status === "active");
    const churnedClients = clients.filter(c => c.status === "churned");
    
    // Average MRR per customer
    const avgMRR = activeClients.length > 0 
      ? activeClients.reduce((sum, c) => sum + c.mrr, 0) / activeClients.length 
      : 0;

    // Churn rate (monthly)
    const monthlyChurnRate = clients.length > 0 
      ? (churnedClients.length / clients.length) * 100 
      : 5; // Default 5% if no data

    // Average customer lifespan in months
    const avgLifespan = monthlyChurnRate > 0 ? 100 / monthlyChurnRate : 24;

    // LTV = ARPU × Average Customer Lifespan
    const ltv = avgMRR * avgLifespan;

    // Calculate CAC
    const newClientsLast90Days = clients.filter(c => {
      const start = new Date(c.startDate);
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      return start >= ninetyDaysAgo;
    }).length;

    const cac = newClientsLast90Days > 0 && marketingSpend > 0
      ? marketingSpend / newClientsLast90Days
      : 350; // Industry average if no data

    // LTV:CAC Ratio
    const ltvCacRatio = cac > 0 ? ltv / cac : 0;

    // Payback period in months
    const paybackMonths = avgMRR > 0 ? cac / avgMRR : 0;

    // Conversion rates
    const visitorToLead = visitors.length > 0 
      ? (leads.length / visitors.length) * 100 
      : 0;
    
    const leadToCustomer = leads.length > 0 
      ? (clients.length / leads.length) * 100 
      : 0;

    return {
      ltv: Math.round(ltv),
      cac: Math.round(cac),
      ltvCacRatio: ltvCacRatio.toFixed(1),
      paybackMonths: paybackMonths.toFixed(1),
      avgMRR: Math.round(avgMRR),
      churnRate: monthlyChurnRate.toFixed(1),
      avgLifespan: avgLifespan.toFixed(1),
      visitorToLead: visitorToLead.toFixed(1),
      leadToCustomer: leadToCustomer.toFixed(1),
    };
  }, [clients, leads, visitors, marketingSpend]);

  const getRatioStatus = (ratio: number) => {
    if (ratio >= 3) return { label: "Excellent", color: "bg-green-500" };
    if (ratio >= 2) return { label: "Good", color: "bg-blue-500" };
    if (ratio >= 1) return { label: "Break-even", color: "bg-yellow-500" };
    return { label: "Losing", color: "bg-red-500" };
  };

  const ratioStatus = getRatioStatus(parseFloat(metrics.ltvCacRatio));

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            LTV & CAC Analysis
          </div>
          <Badge className={`text-xs text-white ${ratioStatus.color}`}>
            {ratioStatus.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-lg text-center">
            <p className="text-xs text-muted-foreground mb-1">Lifetime Value</p>
            <p className="text-2xl font-bold text-green-600">${metrics.ltv.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{metrics.avgLifespan}mo lifespan</p>
          </div>
          <div className="p-3 bg-gradient-to-br from-orange-500/10 to-orange-500/5 rounded-lg text-center">
            <p className="text-xs text-muted-foreground mb-1">Acquisition Cost</p>
            <p className="text-2xl font-bold text-orange-600">${metrics.cac.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{metrics.paybackMonths}mo payback</p>
          </div>
        </div>

        {/* LTV:CAC Ratio */}
        <div className="p-3 bg-primary/5 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">LTV:CAC Ratio</span>
            <span className="text-2xl font-bold text-primary">{metrics.ltvCacRatio}x</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all ${ratioStatus.color}`}
              style={{ width: `${Math.min(parseFloat(metrics.ltvCacRatio) / 5 * 100, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>0x</span>
            <span>3x (Target)</span>
            <span>5x+</span>
          </div>
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="font-medium">${metrics.avgMRR}/mo</p>
            <p className="text-muted-foreground">Avg Revenue</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="font-medium">{metrics.churnRate}%</p>
            <p className="text-muted-foreground">Churn Rate</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="font-medium">{metrics.visitorToLead}%</p>
            <p className="text-muted-foreground">Visitor → Lead</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="font-medium">{metrics.leadToCustomer}%</p>
            <p className="text-muted-foreground">Lead → Customer</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LTVCACCalculator;
