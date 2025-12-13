import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MousePointer, ArrowRight, Percent } from "lucide-react";

interface TouchPoint {
  source: string;
  count: number;
  position: "first" | "middle" | "last";
}

interface Lead {
  id: string;
  visitorId?: string;
  status: string;
  revenueValue?: number;
}

interface Visitor {
  visitorId: string;
  utmSource?: string;
  referrer?: string;
}

interface MultiTouchAttributionProps {
  leads: Lead[];
  visitors: Visitor[];
  analyticsEvents?: { visitorId: string; utmSource?: string; pageUrl?: string }[];
  className?: string;
}

const MultiTouchAttribution = ({ leads, visitors, analyticsEvents = [], className = "" }: MultiTouchAttributionProps) => {
  const attribution = useMemo(() => {
    const sourceStats: Record<string, {
      firstTouch: number;
      lastTouch: number;
      assisted: number;
      conversions: number;
      revenue: number;
    }> = {};

    // Group events by visitor
    const visitorJourneys: Record<string, string[]> = {};
    
    visitors.forEach(v => {
      const source = v.utmSource || v.referrer || "Direct";
      if (!visitorJourneys[v.visitorId]) {
        visitorJourneys[v.visitorId] = [];
      }
      if (!visitorJourneys[v.visitorId].includes(source)) {
        visitorJourneys[v.visitorId].push(source);
      }
    });

    analyticsEvents.forEach(e => {
      if (e.visitorId && e.utmSource) {
        if (!visitorJourneys[e.visitorId]) {
          visitorJourneys[e.visitorId] = [];
        }
        if (!visitorJourneys[e.visitorId].includes(e.utmSource)) {
          visitorJourneys[e.visitorId].push(e.utmSource);
        }
      }
    });

    // Analyze converted leads
    const convertedLeads = leads.filter(l => l.status === "converted" || l.status === "won");
    
    convertedLeads.forEach(lead => {
      const journey = lead.visitorId ? visitorJourneys[lead.visitorId] : null;
      
      if (journey && journey.length > 0) {
        // First touch attribution
        const firstSource = journey[0];
        if (!sourceStats[firstSource]) {
          sourceStats[firstSource] = { firstTouch: 0, lastTouch: 0, assisted: 0, conversions: 0, revenue: 0 };
        }
        sourceStats[firstSource].firstTouch++;
        sourceStats[firstSource].conversions++;
        sourceStats[firstSource].revenue += lead.revenueValue || 0;

        // Last touch attribution
        const lastSource = journey[journey.length - 1];
        if (!sourceStats[lastSource]) {
          sourceStats[lastSource] = { firstTouch: 0, lastTouch: 0, assisted: 0, conversions: 0, revenue: 0 };
        }
        sourceStats[lastSource].lastTouch++;

        // Assisted conversions (middle touches)
        journey.slice(1, -1).forEach(source => {
          if (!sourceStats[source]) {
            sourceStats[source] = { firstTouch: 0, lastTouch: 0, assisted: 0, conversions: 0, revenue: 0 };
          }
          sourceStats[source].assisted++;
        });
      } else {
        // No journey data, attribute to Direct
        if (!sourceStats["Direct"]) {
          sourceStats["Direct"] = { firstTouch: 0, lastTouch: 0, assisted: 0, conversions: 0, revenue: 0 };
        }
        sourceStats["Direct"].firstTouch++;
        sourceStats["Direct"].lastTouch++;
        sourceStats["Direct"].conversions++;
        sourceStats["Direct"].revenue += lead.revenueValue || 0;
      }
    });

    const totalConversions = convertedLeads.length;
    const totalRevenue = convertedLeads.reduce((sum, l) => sum + (l.revenueValue || 0), 0);

    // Sort by total impact
    const sortedSources = Object.entries(sourceStats)
      .map(([source, stats]) => ({
        source,
        ...stats,
        totalImpact: stats.firstTouch + stats.lastTouch + stats.assisted,
        revenueShare: totalRevenue > 0 ? (stats.revenue / totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.totalImpact - a.totalImpact)
      .slice(0, 6);

    return {
      sources: sortedSources,
      totalConversions,
      totalRevenue,
      avgTouchpoints: Object.values(visitorJourneys).reduce((sum, j) => sum + j.length, 0) / 
        Math.max(Object.keys(visitorJourneys).length, 1),
    };
  }, [leads, visitors, analyticsEvents]);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MousePointer className="h-4 w-4 text-primary" />
            Multi-Touch Attribution
          </div>
          <Badge variant="outline" className="text-xs">
            {attribution.avgTouchpoints.toFixed(1)} avg touches
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="p-2 bg-primary/10 rounded-lg">
            <p className="text-lg font-bold">{attribution.totalConversions}</p>
            <p className="text-xs text-muted-foreground">Conversions</p>
          </div>
          <div className="p-2 bg-accent/10 rounded-lg">
            <p className="text-lg font-bold">${attribution.totalRevenue.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Revenue</p>
          </div>
        </div>

        {/* Attribution Table */}
        <div className="space-y-2">
          <div className="grid grid-cols-5 gap-1 text-xs text-muted-foreground px-2">
            <span className="col-span-2">Source</span>
            <span className="text-center">First</span>
            <span className="text-center">Last</span>
            <span className="text-center">Assist</span>
          </div>
          
          {attribution.sources.map((source) => (
            <div 
              key={source.source}
              className="p-2 bg-muted/30 rounded-lg space-y-2"
            >
              <div className="grid grid-cols-5 gap-1 items-center">
                <div className="col-span-2">
                  <p className="text-sm font-medium truncate">{source.source}</p>
                  <p className="text-xs text-muted-foreground">
                    ${source.revenue.toLocaleString()}
                  </p>
                </div>
                <div className="text-center">
                  <Badge variant="outline" className="text-xs">{source.firstTouch}</Badge>
                </div>
                <div className="text-center">
                  <Badge variant="outline" className="text-xs">{source.lastTouch}</Badge>
                </div>
                <div className="text-center">
                  <Badge variant="secondary" className="text-xs">{source.assisted}</Badge>
                </div>
              </div>
              <Progress value={source.revenueShare} className="h-1" />
            </div>
          ))}
        </div>

        {attribution.sources.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <MousePointer className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No attribution data yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MultiTouchAttribution;
