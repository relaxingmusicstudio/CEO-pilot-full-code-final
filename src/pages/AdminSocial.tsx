import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  ArrowLeft, Calendar, MessageSquare, Send, Clock, 
  Instagram, Facebook, Twitter, Linkedin, Youtube,
  ThumbsUp, MessageCircle, Share2, Eye, Loader2, Sparkles
} from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";

interface CalendarItem {
  id: string;
  content_id: string;
  platform: string;
  scheduled_date: string;
  time_slot: string;
  status: string;
}

interface Comment {
  id: string;
  platform: string;
  comment_text: string;
  commenter_name: string;
  ai_reply: string | null;
  reply_status: string;
  created_at: string;
}

const platformIcons: Record<string, React.ReactNode> = {
  instagram: <Instagram className="h-4 w-4" />,
  facebook: <Facebook className="h-4 w-4" />,
  twitter: <Twitter className="h-4 w-4" />,
  linkedin: <Linkedin className="h-4 w-4" />,
  youtube: <Youtube className="h-4 w-4" />
};

const platformColors: Record<string, string> = {
  instagram: "bg-pink-500/20 text-pink-400",
  facebook: "bg-blue-500/20 text-blue-400",
  twitter: "bg-sky-500/20 text-sky-400",
  linkedin: "bg-indigo-500/20 text-indigo-400",
  youtube: "bg-red-500/20 text-red-400"
};

const AdminSocial = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("calendar");
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingReply, setGeneratingReply] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [calendarRes, commentsRes] = await Promise.all([
        supabase.from("content_calendar").select("*").order("scheduled_date", { ascending: true }),
        supabase.from("content_comments").select("*").order("created_at", { ascending: false }).limit(50)
      ]);

      setCalendarItems((calendarRes.data as CalendarItem[]) || []);
      setComments((commentsRes.data as Comment[]) || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateAIReply = async (commentId: string, commentText: string) => {
    setGeneratingReply(commentId);
    try {
      const { data, error } = await supabase.functions.invoke("comment-responder", {
        body: { comment: commentText }
      });

      if (error) throw error;

      await supabase
        .from("content_comments")
        .update({ ai_reply: data?.reply, reply_status: "pending" })
        .eq("id", commentId);

      fetchData();
      toast({ title: "Reply Generated", description: "AI has suggested a reply." });
    } catch (error) {
      console.error("Error generating reply:", error);
      toast({ title: "Error", description: "Failed to generate reply.", variant: "destructive" });
    } finally {
      setGeneratingReply(null);
    }
  };

  const sendReply = async (commentId: string) => {
    try {
      await supabase
        .from("content_comments")
        .update({ reply_status: "sent" })
        .eq("id", commentId);

      fetchData();
      toast({ title: "Reply Sent", description: "Your reply has been posted." });
    } catch (error) {
      console.error("Error sending reply:", error);
    }
  };

  const groupByDate = (items: CalendarItem[]) => {
    return items.reduce((acc, item) => {
      const date = item.scheduled_date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(item);
      return acc;
    }, {} as Record<string, CalendarItem[]>);
  };

  const groupedCalendar = groupByDate(calendarItems);

  // Mock analytics data
  const analytics: Record<string, { followers: number; engagement: number; posts: number; subscribers?: number; views?: number; videos?: number }> = {
    instagram: { followers: 12500, engagement: 4.2, posts: 45 },
    facebook: { followers: 8900, engagement: 2.8, posts: 32 },
    twitter: { followers: 5600, engagement: 1.9, posts: 78 },
    linkedin: { followers: 3200, engagement: 3.5, posts: 24 },
    youtube: { followers: 2100, engagement: 3.0, posts: 18, subscribers: 2100, views: 45000, videos: 18 }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/app" className="text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Share2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Social Media Hub</h1>
                  <p className="text-sm text-muted-foreground">Manage your social presence</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Platform Overview */}
        <div className="grid gap-4 md:grid-cols-5 mb-8">
          {Object.entries(analytics).map(([platform, stats]) => (
            <Card key={platform} className="bg-card border-border">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`p-2 rounded-lg ${platformColors[platform]}`}>
                    {platformIcons[platform]}
                  </div>
                  <span className="font-medium capitalize">{platform}</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {platform === "youtube" ? "Subscribers" : "Followers"}
                    </span>
                    <span className="font-medium">
                      {(platform === "youtube" ? stats.subscribers : stats.followers).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {platform === "youtube" ? "Views" : "Engagement"}
                    </span>
                    <span className="font-medium">
                      {platform === "youtube" ? stats.views.toLocaleString() : `${stats.engagement}%`}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Content Calendar
            </TabsTrigger>
            <TabsTrigger value="comments" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Comments
              {comments.filter(c => c.reply_status === "pending").length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                  {comments.filter(c => c.reply_status === "pending").length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <Eye className="h-4 w-4" /> Analytics
            </TabsTrigger>
          </TabsList>

          {/* Calendar Tab */}
          <TabsContent value="calendar" className="space-y-6">
            {Object.keys(groupedCalendar).length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="py-12 text-center">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No Scheduled Content</h3>
                  <p className="text-muted-foreground mb-4">Schedule content from the Content Studio.</p>
                  <Link to="/admin/content">
                    <Button>Go to Content Studio</Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              Object.entries(groupedCalendar).map(([date, items]) => (
                <div key={date}>
                  <h3 className="text-lg font-medium text-foreground mb-3">
                    {format(new Date(date), "EEEE, MMMM d, yyyy")}
                  </h3>
                  <div className="grid gap-3">
                    {items.map(item => (
                      <Card key={item.id} className="bg-card border-border">
                        <CardContent className="py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${platformColors[item.platform]}`}>
                                {platformIcons[item.platform]}
                              </div>
                              <div>
                                <p className="font-medium capitalize">{item.platform}</p>
                                <p className="text-sm text-muted-foreground">{item.time_slot}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={item.status === "published" ? "default" : "secondary"}>
                                {item.status}
                              </Badge>
                              <Button size="sm" variant="outline">
                                <Send className="h-4 w-4 mr-2" /> Publish Now
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          {/* Comments Tab */}
          <TabsContent value="comments" className="space-y-4">
            {comments.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="py-12 text-center">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No Comments Yet</h3>
                  <p className="text-muted-foreground">Comments from your social posts will appear here.</p>
                </CardContent>
              </Card>
            ) : (
              comments.map(comment => (
                <Card key={comment.id} className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${platformColors[comment.platform]}`}>
                          {platformIcons[comment.platform]}
                        </div>
                        <div>
                          <p className="font-medium">{comment.commenter_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(comment.created_at), "MMM d, h:mm a")}
                          </p>
                        </div>
                      </div>
                      <Badge variant={comment.reply_status === "sent" ? "default" : "outline"}>
                        {comment.reply_status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-foreground">{comment.comment_text}</p>
                    
                    {comment.ai_reply ? (
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-sm text-muted-foreground mb-2">AI Suggested Reply:</p>
                        <Textarea 
                          defaultValue={comment.ai_reply} 
                          className="mb-3"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => sendReply(comment.id)}>
                            <Send className="h-4 w-4 mr-2" /> Send Reply
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => generateAIReply(comment.id, comment.comment_text)}>
                            <Sparkles className="h-4 w-4 mr-2" /> Regenerate
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => generateAIReply(comment.id, comment.comment_text)}
                        disabled={generatingReply === comment.id}
                      >
                        {generatingReply === comment.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        Generate AI Reply
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ThumbsUp className="h-5 w-5 text-green-400" />
                    Engagement Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(analytics).map(([platform, stats]) => (
                      <div key={platform} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {platformIcons[platform]}
                          <span className="capitalize">{platform}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-muted-foreground">
                            {platform === "youtube" ? `${stats.views.toLocaleString()} views` : `${stats.engagement}% rate`}
                          </span>
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary"
                              style={{ width: `${platform === "youtube" ? 75 : stats.engagement * 20}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-blue-400" />
                    Content Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total Posts</span>
                      <span className="text-2xl font-bold">
                        {Object.values(analytics).reduce((sum, s) => sum + (s.posts || s.videos || 0), 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Avg Engagement</span>
                      <span className="text-2xl font-bold">
                        {(Object.values(analytics).reduce((sum, s) => sum + (s.engagement || 0), 0) / 4).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total Reach</span>
                      <span className="text-2xl font-bold">
                        {Object.values(analytics).reduce((sum, s) => sum + (s.followers || s.subscribers || 0), 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminSocial;
