import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

interface ChannelData {
  source: string;
  visitors: number;
  leads: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
}

interface ChannelPerformanceTableProps {
  data: ChannelData[];
  isLoading?: boolean;
}

export const ChannelPerformanceTable = ({ data, isLoading }: ChannelPerformanceTableProps) => {
  const getBadgeVariant = (rate: number) => {
    if (rate >= 30) return "default";
    if (rate >= 15) return "secondary";
    return "outline";
  };

  const getTrend = (rate: number, avg: number) => {
    if (rate > avg * 1.1) return "up";
    if (rate < avg * 0.9) return "down";
    return "neutral";
  };

  const avgRate = data.length > 0 
    ? data.reduce((sum, d) => sum + d.conversionRate, 0) / data.length 
    : 0;

  if (isLoading) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="animate-pulse p-8 text-center text-muted-foreground">
          Loading channel data...
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="p-8 text-center text-muted-foreground">
          No channel data yet. Traffic will appear here once visitors come from tracked sources.
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold">Source</TableHead>
            <TableHead className="text-right font-semibold">Visitors</TableHead>
            <TableHead className="text-right font-semibold">Leads</TableHead>
            <TableHead className="text-right font-semibold">Conversions</TableHead>
            <TableHead className="text-right font-semibold">Revenue</TableHead>
            <TableHead className="text-right font-semibold">Conv. Rate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((channel) => {
            const trend = getTrend(channel.conversionRate, avgRate);
            return (
              <TableRow key={channel.source} className="hover:bg-muted/30">
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-accent" />
                    {channel.source}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {channel.visitors.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {channel.leads}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {channel.conversions}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  ${channel.revenue.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {trend === "up" && <ArrowUpRight className="h-3 w-3 text-green-500" />}
                    {trend === "down" && <ArrowDownRight className="h-3 w-3 text-red-500" />}
                    {trend === "neutral" && <Minus className="h-3 w-3 text-muted-foreground" />}
                    <Badge variant={getBadgeVariant(channel.conversionRate)}>
                      {channel.conversionRate.toFixed(1)}%
                    </Badge>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default ChannelPerformanceTable;
