import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import AgentWorkItem, { WorkItem } from "@/components/AgentWorkItem";
import AgentChatPanel from "@/components/AgentChatPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { YOUTUBE_AGENT_PROMPT } from "@/data/agentPrompts";
import { ChannelSelector, YouTubeChannel } from "@/components/youtube/ChannelSelector";
import { TubeBuddyAnalytics } from "@/components/youtube/TubeBuddyAnalytics";
import { SocialRepurposer } from "@/components/youtube/SocialRepurposer";
import {
  Youtube,
  TrendingUp,
  RefreshCw,
  Play,
  BarChart3,
  Scissors,
  Settings,
} from "lucide-react";

interface VideoIdea {
  id: string;
  title: string;
  description: string;
  viralScore: number;
  status: "new" | "scripted" | "filmed" | "published";
  suggestedFormats: string[];
}

// Mock data for multiple channels
const mockChannels: YouTubeChannel[] = [
  {
    id: "ch1",
    name: "HVAC Pro Tips",
    handle: "@hvacprotips",
    subscribers: 28500,
    totalViews: 1250000,
    videoCount: 124,
    isConnected: true,
  },
  {
    id: "ch2",
    name: "Emergency HVAC 24/7",
    handle: "@emergencyhvac247",
    subscribers: 8200,
    totalViews: 325000,
    videoCount: 45,
    isConnected: true,
  },
  {
    id: "ch3",
    name: "Home Comfort Academy",
    handle: "@homecomfortacademy",
    subscribers: 15600,
    totalViews: 680000,
    videoCount: 78,
    isConnected: true,
  },
];

const mockAnalytics = {
  views: { value: 45200, change: 23, period: "Last 28 days" },
  watchTime: { value: "1,247h", change: 18, period: "Last 28 days" },
  subscribers: { value: 2850, change: 12, period: "Last 28 days" },
  engagement: { value: 8.4, change: 5, period: "Last 28 days" },
  ctr: { value: 7.2, benchmark: 4.5 },
  avgViewDuration: { value: "4:32", benchmark: "3:45" },
  impressions: { value: 628000, change: 31 },
  uniqueViewers: { value: 38200, change: 19 },
};

const mockChannelHealth = {
  overall: 82,
  seo: 78,
  engagement: 85,
  consistency: 72,
  growth: 88,
};

const mockTopVideos = [
  {
    id: "v1",
    title: "Why Your AC Runs But Doesn't Cool (5 Hidden Causes)",
    views: 12500,
    ctr: 8.2,
    avgDuration: "5:42",
    retention: 52,
    likes: 847,
    comments: 156,
    shares: 89,
    publishedAt: "2024-01-15",
    seoScore: 92,
    viralScore: 87,
  },
  {
    id: "v2",
    title: "HVAC Technician Day in My Life - Real Calls",
    views: 9800,
    ctr: 6.8,
    avgDuration: "7:21",
    retention: 48,
    likes: 623,
    comments: 98,
    shares: 45,
    publishedAt: "2024-01-10",
    seoScore: 85,
    viralScore: 91,
  },
  {
    id: "v3",
    title: "Never Buy These HVAC Brands (From a Technician)",
    views: 8400,
    ctr: 9.1,
    avgDuration: "4:15",
    retention: 61,
    likes: 1245,
    comments: 287,
    shares: 156,
    publishedAt: "2024-01-05",
    seoScore: 88,
    viralScore: 95,
  },
  {
    id: "v4",
    title: "How to Change Your Furnace Filter (The Right Way)",
    views: 6200,
    ctr: 5.4,
    avgDuration: "3:28",
    retention: 72,
    likes: 412,
    comments: 34,
    shares: 28,
    publishedAt: "2024-01-01",
    seoScore: 95,
    viralScore: 68,
  },
];

const mockClips = [
  {
    id: "clip1",
    videoId: "v1",
    videoTitle: "Why Your AC Runs But Doesn't Cool",
    startTime: "0:00",
    endTime: "0:45",
    duration: "45s",
    suggestedCaption: "5 reasons your AC isn't cooling (and what to check first!) 🥶❄️ #HVAC #ACrepair #HomeOwnerTips",
    hookScore: 92,
    platforms: ["instagram", "tiktok"],
    status: "pending" as const,
  },
  {
    id: "clip2",
    videoId: "v2",
    videoTitle: "HVAC Technician Day in My Life",
    startTime: "2:15",
    endTime: "3:00",
    duration: "45s",
    suggestedCaption: "You won't believe what we found in this ductwork 😱 #HVAClife #HVAC #DayInMyLife",
    hookScore: 88,
    platforms: ["instagram", "tiktok", "twitter"],
    status: "generated" as const,
  },
  {
    id: "clip3",
    videoId: "v3",
    videoTitle: "Never Buy These HVAC Brands",
    startTime: "0:00",
    endTime: "0:58",
    duration: "58s",
    suggestedCaption: "HVAC brands I'd NEVER put in my own home 🚫 Save this for later! #HVAC #HomeOwner #DontBuyThis",
    hookScore: 95,
    platforms: ["instagram", "tiktok", "linkedin"],
    status: "posted" as const,
  },
  {
    id: "clip4",
    videoId: "v1",
    videoTitle: "Why Your AC Runs But Doesn't Cool",
    startTime: "3:20",
    endTime: "4:05",
    duration: "45s",
    suggestedCaption: "This simple fix could save you $500 in AC repairs 💰 #HVACTips #MoneySaving #ACrepair",
    hookScore: 85,
    platforms: ["tiktok", "facebook"],
    status: "pending" as const,
  },
];

const mockVideoIdeas: VideoIdea[] = [
  {
    id: "1",
    title: "Why Your AC Runs But Doesn't Cool (5 Hidden Causes)",
    description: "Educational troubleshooting video targeting high-search-volume keywords",
    viralScore: 87,
    status: "new",
    suggestedFormats: ["Long-form", "Shorts"],
  },
  {
    id: "2",
    title: "We Fixed a 15-Year-Old Furnace - Here's What We Found",
    description: "Behind-the-scenes diagnostic video with before/after reveal",
    viralScore: 92,
    status: "scripted",
    suggestedFormats: ["Long-form", "Reel"],
  },
  {
    id: "3",
    title: "HVAC Techs React to DIY Disaster Videos",
    description: "Reaction-style content for entertainment and authority building",
    viralScore: 95,
    status: "new",
    suggestedFormats: ["Long-form", "Clips"],
  },
];

const mockWorkItems: WorkItem[] = [
  {
    id: "yt1",
    title: "Video Script: Emergency AC Repair Guide",
    description: "12-minute educational script with retention hooks every 30 seconds.",
    type: "approval",
    status: "pending",
    priority: "high",
    createdAt: new Date().toISOString(),
    details: "Hook: 'Your AC just died in 100-degree heat. Here's what to do before calling anyone.' Includes 5 chapters with pattern interrupts.",
  },
  {
    id: "yt2",
    title: "Thumbnail Concepts: Furnace Horror Stories",
    description: "3 A/B test thumbnail variations for upcoming video.",
    type: "review",
    status: "pending",
    priority: "medium",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "yt3",
    title: "Shorts Batch: Quick HVAC Tips (5 videos)",
    description: "Vertical video scripts under 60 seconds each.",
    type: "approval",
    status: "pending",
    priority: "medium",
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
];

const AdminAgentYouTube = () => {
  const [selectedChannel, setSelectedChannel] = useState(mockChannels[0].id);
  const [activeTab, setActiveTab] = useState("analytics");
  const [videoIdeas, setVideoIdeas] = useState<VideoIdea[]>(mockVideoIdeas);
  const [workItems, setWorkItems] = useState<WorkItem[]>(mockWorkItems);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const pendingCount = workItems.filter((w) => w.status === "pending").length;

  const handleApprove = (id: string) => {
    setWorkItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: "approved" as const } : item
      )
    );
    toast({ title: "Approved", description: "Content approved for production." });
  };

  const handleDeny = (id: string, reason: string) => {
    setWorkItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: "denied" as const } : item
      )
    );
    toast({ title: "Denied", description: reason, variant: "destructive" });
  };

  const handleDiscuss = (id: string) => {
    toast({ title: "Opening Discussion", description: "Use the chat panel to discuss." });
  };

  const handleRefresh = async () => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setLoading(false);
    toast({ title: "Refreshed", description: "YouTube data updated." });
  };

  const handleAddChannel = () => {
    toast({
      title: "Connect Channel",
      description: "YouTube OAuth flow would open here.",
    });
  };

  return (
    <AdminLayout
      title="YouTube Agent"
      subtitle="TubeBuddy-style analytics & AI-powered content strategy"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Channel Selector */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <ChannelSelector
              channels={mockChannels}
              selectedChannel={selectedChannel}
              onChannelChange={setSelectedChannel}
              onAddChannel={handleAddChannel}
            />
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Sync Data
            </Button>
          </div>

          {/* Main Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="analytics" className="flex items-center gap-1">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Analytics</span>
              </TabsTrigger>
              <TabsTrigger value="repurpose" className="flex items-center gap-1">
                <Scissors className="h-4 w-4" />
                <span className="hidden sm:inline">Repurpose</span>
              </TabsTrigger>
              <TabsTrigger value="ideas" className="flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                <span className="hidden sm:inline">Ideas</span>
              </TabsTrigger>
              <TabsTrigger value="queue" className="flex items-center gap-1">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Queue</span>
                {pendingCount > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Analytics Tab */}
            <TabsContent value="analytics" className="mt-4">
              <TubeBuddyAnalytics
                analytics={mockAnalytics}
                topVideos={mockTopVideos}
                channelHealth={mockChannelHealth}
              />
            </TabsContent>

            {/* Repurpose Tab */}
            <TabsContent value="repurpose" className="mt-4">
              <SocialRepurposer clips={mockClips} />
            </TabsContent>

            {/* Ideas Tab */}
            <TabsContent value="ideas" className="mt-4">
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Trending Video Ideas
                    <Badge variant="secondary" className="ml-auto">
                      {videoIdeas.length} ideas
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {videoIdeas.map((idea) => (
                      <div
                        key={idea.id}
                        className="p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge
                                variant={idea.viralScore >= 90 ? "default" : "secondary"}
                                className="text-xs"
                              >
                                {idea.viralScore}% viral
                              </Badge>
                              <Badge variant="outline" className="text-xs capitalize">
                                {idea.status}
                              </Badge>
                            </div>
                            <h4 className="font-medium text-sm">{idea.title}</h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              {idea.description}
                            </p>
                            <div className="flex gap-1 mt-2">
                              {idea.suggestedFormats.map((format) => (
                                <Badge key={format} variant="outline" className="text-xs">
                                  {format}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <Button size="sm" variant="outline">
                            <Play className="h-3 w-3 mr-1" />
                            Script
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Queue Tab */}
            <TabsContent value="queue" className="mt-4 space-y-4">
              <Tabs defaultValue="pending">
                <TabsList>
                  <TabsTrigger value="pending">
                    Pending
                    {pendingCount > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {pendingCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="completed">Completed</TabsTrigger>
                </TabsList>

                <TabsContent value="pending" className="space-y-4 mt-4">
                  {workItems
                    .filter((w) => w.status === "pending")
                    .map((item) => (
                      <AgentWorkItem
                        key={item.id}
                        item={item}
                        onApprove={handleApprove}
                        onDeny={handleDeny}
                        onDiscuss={handleDiscuss}
                      />
                    ))}
                </TabsContent>

                <TabsContent value="completed" className="space-y-4 mt-4">
                  {workItems
                    .filter((w) => w.status !== "pending")
                    .map((item) => (
                      <AgentWorkItem key={item.id} item={item} />
                    ))}
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column - AI Chat */}
        <div className="lg:col-span-1">
          <AgentChatPanel
            agentName="YouTube"
            agentType="youtube"
            systemPrompt={YOUTUBE_AGENT_PROMPT}
            className="h-[600px] sticky top-4"
          />
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminAgentYouTube;
