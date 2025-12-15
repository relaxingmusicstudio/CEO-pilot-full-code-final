import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Loader2,
  Landmark,
} from "lucide-react";

interface FinanceHealth {
  mrr: number;
  ai_costs_mtd: number;
  gross_margin: number;
  quickbooks_connected: boolean;
  plaid_connections: number;
  uncategorized_transactions: number;
}

export default function FinanceHealthWidget() {
  const { data: health, isLoading } = useQuery({
    queryKey: ['finance-health'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('finance-agent', {
        body: { action: 'get_finance_health' }
      });
      if (error) throw error;
      return data as FinanceHealth;
    },
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}k`;
    }
    return `$${value.toFixed(0)}`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Landmark className="h-4 w-4 text-green-500" />
          Finance Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              MRR
            </div>
            <p className="text-lg font-bold">{formatCurrency(health?.mrr || 0)}</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              Gross Margin
            </div>
            <p className="text-lg font-bold">{(health?.gross_margin || 0).toFixed(1)}%</p>
          </div>
        </div>

        {/* AI Costs */}
        <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
          <span className="text-xs text-muted-foreground">AI Costs MTD</span>
          <span className="text-sm font-medium">{formatCurrency(health?.ai_costs_mtd || 0)}</span>
        </div>

        {/* Connection Status */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">QuickBooks</span>
            {health?.quickbooks_connected ? (
              <Badge variant="outline" className="text-green-600 text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-xs">
                Not Connected
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Bank Accounts</span>
            <Badge variant="outline" className="text-xs">
              {health?.plaid_connections || 0} linked
            </Badge>
          </div>
        </div>

        {/* Action Items */}
        {(health?.uncategorized_transactions || 0) > 0 && (
          <div className="flex items-center gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <AlertCircle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
            <span className="text-xs">
              {health?.uncategorized_transactions} transactions need review
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
