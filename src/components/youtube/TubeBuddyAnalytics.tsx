import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp,
  TrendingDown,
  Eye,
  Clock,
  ThumbsUp,
  MessageSquare,
  Share2,
  Users,
  BarChart3,
  Target,
  Zap,
  Award,
  type LucideIcon,
} from "lucide-react";

interface AnalyticsData {
  views: { value: number; change: number; period: string };
  watchTime: { value: string; change: number; period: string };
  subscribers: { value: number; change: number; period: string };
  engagement: { value: number; change: number; period: string };
  ctr: { value: number; benchmark: number };
  avgViewDuration: { value: string; benchmark: string };
  impressions: { value: number; change: number };
  uniqueViewers: { value: number; change: number };
}

interface VideoPerformance {
  id: string;
  title: string;
  thumbnail?: string;
  views: number;
  ctr: number;
  avgDuration: string;
  retention: number;
  likes: number;
  comments: number;
  shares: number;
  publishedAt: string;
  seoScore: number;
  viralScore: number;
}

interface TubeBuddyAnalyticsProps {
  analytics: AnalyticsData;
  topVideos: VideoPerformance[];
  channelHealth: {
    overall: number;
    seo: number;
    engagement: number;
    consistency: number;
    growth: number;
  };
}

export function TubeBuddyAnalytics({
  analytics,
  topVideos,
  channelHealth,
}: TubeBuddyAnalyticsProps) {
  return (
    <div className="space-y-6">
      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          icon={Eye}
          label="Views"
          value={formatNumber(analytics.views.value)}
          change={analytics.views.change}
          period={analytics.views.period}
          iconBg="bg-primary/20"
          iconColor="text-primary"
        />
        <MetricCard
          icon={Clock}
          label="Watch Time"
          value={analytics.watchTime.value}
          change={analytics.watchTime.change}
          period={analytics.watchTime.period}
          iconBg="bg-accent/20"
          iconColor="text-accent"
        />
        <MetricCard
          icon={Users}
          label="Subscribers"
          value={formatNumber(analytics.subscribers.value)}
          change={analytics.subscribers.change}
          period={analytics.subscribers.period}
          iconBg="bg-green-500/20"
          iconColor="text-green-500"
        />
        <MetricCard
          icon={ThumbsUp}
          label="Engagement"
          value={`${analytics.engagement.value}%`}
          change={analytics.engagement.change}
          period={analytics.engagement.period}
          iconBg="bg-purple-500/20"
          iconColor="text-purple-500"
        />
      </div>

      {/* Channel Health Score */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Award className="h-4 w-4 text-accent" />
            Channel Health Score
            <Badge
              variant={channelHealth.overall >= 80 ? "default" : "secondary"}
              className="ml-auto"
            >
              {channelHealth.overall}/100
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <HealthMetric label="SEO Optimization" value={channelHealth.seo} />
          <HealthMetric label="Engagement Rate" value={channelHealth.engagement} />
          <HealthMetric label="Upload Consistency" value={channelHealth.consistency} />
          <HealthMetric label="Growth Velocity" value={channelHealth.growth} />
        </CardContent>
      </Card>

      {/* CTR & Retention Benchmarks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Click-Through Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-3xl font-bold">{analytics.ctr.value}%</span>
              <span className="text-sm text-muted-foreground mb-1">
                vs {analytics.ctr.benchmark}% benchmark
              </span>
            </div>
            <Progress
              value={(analytics.ctr.value / 15) * 100}
              className="h-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Poor (&lt;2%)</span>
              <span>Average (4-5%)</span>
              <span>Excellent (&gt;10%)</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-accent" />
              Avg. View Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-3xl font-bold">{analytics.avgViewDuration.value}</span>
              <span className="text-sm text-muted-foreground mb-1">
                vs {analytics.avgViewDuration.benchmark} benchmark
              </span>
            </div>
            <Progress value={65} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              <Zap className="h-3 w-3 inline mr-1 text-accent" />
              Tip: Add pattern interrupts every 30s to boost retention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top Performing Videos */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Top Performing Videos
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {topVideos.slice(0, 5).map((video) => (
              <div
                key={video.id}
                className="p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-24 h-14 bg-muted rounded flex-shrink-0 flex items-center justify-center">
                    <Eye className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">{video.title}</h4>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {formatNumber(video.views)}
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" />
                        {formatNumber(video.likes)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {video.comments}
                      </span>
                      <span className="flex items-center gap-1">
                        <Share2 className="h-3 w-3" />
                        {video.shares}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant={video.seoScore >= 80 ? "default" : "secondary"}
                      className="text-xs"
                    >
                      SEO: {video.seoScore}
                    </Badge>
                    <Badge
                      variant={video.viralScore >= 80 ? "default" : "outline"}
                      className="text-xs"
                    >
                      Viral: {video.viralScore}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  change,
  period,
  iconBg,
  iconColor,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  change: number;
  period: string;
  iconBg: string;
  iconColor: string;
}) {
  const isPositive = change >= 0;
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div className="flex-1">
            <p className="text-xl font-bold">{value}</p>
            <div className="flex items-center gap-1">
              <p className="text-xs text-muted-foreground">{label}</p>
              <span
                className={`text-xs flex items-center ${
                  isPositive ? "text-green-500" : "text-destructive"
                }`}
              >
                {isPositive ? (
                  <TrendingUp className="h-3 w-3 mr-0.5" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-0.5" />
                )}
                {Math.abs(change)}%
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HealthMetric({ label, value }: { label: string; value: number }) {
  const getColor = (val: number) => {
    if (val >= 80) return "bg-green-500";
    if (val >= 60) return "bg-accent";
    if (val >= 40) return "bg-yellow-500";
    return "bg-destructive";
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{value}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor(value)} transition-all duration-500`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}
