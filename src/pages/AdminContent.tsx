import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Search, TrendingUp, Youtube, Lightbulb, Wand2, 
  Image, Video, FileText, Calendar, Check, X, Loader2,
  ThumbsUp, ThumbsDown, Send, Clock, Sparkles
} from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { AssistantStrip } from "@/components/AssistantStrip";

interface ContentIdea {
  id: string;
  source: string;
  source_url: string | null;
  topic: string;
  niche: string | null;
  viral_score: number | null;
  suggested_formats: string[] | null;
  status: string;
  created_at: string;
}

interface Content {
  id: string;
  content_type: string;
  title: string;
  body: string | null;
  media_url: string | null;
  platform: string | null;
  status: string;
  scheduled_for: string | null;
  created_at: string;
}

const AdminContent = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("discover");
  const [searchQuery, setSearchQuery] = useState("");
  const [niche, setNiche] = useState("HVAC");
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationType, setGenerationType] = useState<string | null>(null);

  // Generation form state
  const [genTopic, setGenTopic] = useState("");
  const [genFormat, setGenFormat] = useState("social");
  const [genPlatform, setGenPlatform] = useState("instagram");

  useEffect(() => {
    fetchIdeas();
    fetchContent();
  }, []);

  const fetchIdeas = async () => {
    const { data } = await supabase
      .from("content_ideas")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setIdeas((data as ContentIdea[]) || []);
  };

  const fetchContent = async () => {
    const { data } = await supabase
      .from("content")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setContent((data as Content[]) || []);
  };

  const discoverTrending = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("youtube-discover", {
        body: { query: searchQuery || niche, maxResults: 10 }
      });

      if (error) throw error;

      toast({
        title: "Trending Content Found",
        description: `Discovered ${data?.videos?.length || 0} trending videos.`
      });

      fetchIdeas();
    } catch (error) {
      console.error("Error discovering content:", error);
      toast({
        title: "Discovery Failed",
        description: "Could not fetch trending content. Check your API settings.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const generateContent = async (type: string) => {
    setGenerating(true);
    setGenerationType(type);
    try {
      const endpoint = type === "image" ? "content-image" : 
                       type === "video" ? "heygen-video" : "content-generator";
      
      const { data, error } = await supabase.functions.invoke(endpoint, {
        body: {
          topic: genTopic,
          format: genFormat,
          platform: genPlatform,
          niche
        }
      });

      if (error) throw error;

      toast({
        title: "Content Generated",
        description: `Your ${type} content has been created.`
      });

      fetchContent();
    } catch (error) {
      console.error("Error generating content:", error);
      toast({
        title: "Generation Failed",
        description: "Could not generate content. Please try again.",
        variant: "destructive"
      });
    } finally {
      setGenerating(false);
      setGenerationType(null);
    }
  };

  const updateContentStatus = async (id: string, status: string) => {
    await supabase.from("content").update({ status }).eq("id", id);
    fetchContent();
    toast({ title: "Content Updated", description: `Status changed to ${status}.` });
  };

  const updateIdeaStatus = async (id: string, status: string) => {
    await supabase.from("content_ideas").update({ status }).eq("id", id);
    fetchIdeas();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved": return "bg-green-500/20 text-green-400";
      case "rejected": return "bg-red-500/20 text-red-400";
      case "published": return "bg-blue-500/20 text-blue-400";
      case "scheduled": return "bg-purple-500/20 text-purple-400";
      default: return "bg-yellow-500/20 text-yellow-400";
    }
  };

  const CONTENT_PROMPTS = [
    { label: "Trending ideas", prompt: "What content topics are trending right now?" },
    { label: "Best time to post", prompt: "When should I publish for maximum engagement?" },
    { label: "Content strategy", prompt: "Help me plan this week's content calendar" },
  ];

  const assistantStrip = (
    <AssistantStrip
      pageContext="Content Studio - content discovery, creation, and publishing"
      quickPrompts={CONTENT_PROMPTS}
      placeholder="Ask about content strategy or get publishing tips..."
    />
  );

  return (
    <PageShell
      title="Content Studio"
      subtitle="Discover, create, and manage content"
      assistantStrip={assistantStrip}
    >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="discover" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Discover
            </TabsTrigger>
            <TabsTrigger value="create" className="flex items-center gap-2">
              <Wand2 className="h-4 w-4" /> Create
            </TabsTrigger>
            <TabsTrigger value="queue" className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Review Queue
            </TabsTrigger>
            <TabsTrigger value="published" className="flex items-center gap-2">
              <Check className="h-4 w-4" /> Published
            </TabsTrigger>
          </TabsList>

          {/* Discover Tab */}
          <TabsContent value="discover" className="space-y-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Youtube className="h-5 w-5 text-red-500" />
                  Trending Content Discovery
                </CardTitle>
                <CardDescription>Find viral content ideas from YouTube and Google Trends</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <Input
                    placeholder="Search topic or keyword..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Niche"
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    className="w-32"
                  />
                  <Button onClick={discoverTrending} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                    Discover
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {ideas.filter(i => i.status === "new").map(idea => (
                <Card key={idea.id} className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <Badge variant="outline" className="mb-2">{idea.source}</Badge>
                      {idea.viral_score && (
                        <Badge className="bg-orange-500/20 text-orange-400">
                          🔥 {idea.viral_score}%
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-base line-clamp-2">{idea.topic}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2 mb-3">
                      {idea.suggested_formats?.map(format => (
                        <Badge key={format} variant="secondary" className="text-xs">{format}</Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => {
                        setGenTopic(idea.topic);
                        setActiveTab("create");
                        updateIdeaStatus(idea.id, "used");
                      }}>
                        <Lightbulb className="h-4 w-4 mr-1" /> Use Idea
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => updateIdeaStatus(idea.id, "rejected")}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Create Tab */}
          <TabsContent value="create" className="space-y-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-primary" />
                  AI Content Generator
                </CardTitle>
                <CardDescription>Generate text, images, and videos with AI</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="What topic do you want content about?"
                  value={genTopic}
                  onChange={(e) => setGenTopic(e.target.value)}
                  rows={3}
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Format</label>
                    <select
                      value={genFormat}
                      onChange={(e) => setGenFormat(e.target.value)}
                      className="w-full p-2 rounded-md bg-background border border-border"
                    >
                      <option value="social">Social Post</option>
                      <option value="blog">Blog Article</option>
                      <option value="ad">Ad Copy</option>
                      <option value="email">Email</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Platform</label>
                    <select
                      value={genPlatform}
                      onChange={(e) => setGenPlatform(e.target.value)}
                      className="w-full p-2 rounded-md bg-background border border-border"
                    >
                      <option value="instagram">Instagram</option>
                      <option value="facebook">Facebook</option>
                      <option value="twitter">Twitter/X</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="tiktok">TikTok</option>
                      <option value="youtube">YouTube</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button 
                    className="flex-1" 
                    onClick={() => generateContent("text")}
                    disabled={generating || !genTopic}
                  >
                    {generating && generationType === "text" ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    Generate Text
                  </Button>
                  <Button 
                    variant="secondary" 
                    className="flex-1"
                    onClick={() => generateContent("image")}
                    disabled={generating || !genTopic}
                  >
                    {generating && generationType === "image" ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Image className="h-4 w-4 mr-2" />
                    )}
                    Generate Image
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => generateContent("video")}
                    disabled={generating || !genTopic}
                  >
                    {generating && generationType === "video" ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Video className="h-4 w-4 mr-2" />
                    )}
                    Generate Video
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Review Queue Tab */}
          <TabsContent value="queue" className="space-y-4">
            {content.filter(c => c.status === "pending").map(item => (
              <Card key={item.id} className="bg-card border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline">{item.content_type}</Badge>
                        {item.platform && <Badge variant="secondary">{item.platform}</Badge>}
                      </div>
                      <CardTitle className="text-lg">{item.title}</CardTitle>
                    </div>
                    <Badge className={getStatusColor(item.status)}>{item.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {item.body && (
                    <p className="text-muted-foreground mb-4 whitespace-pre-wrap">{item.body}</p>
                  )}
                  {item.media_url && (
                    <img src={item.media_url} alt="" className="rounded-lg mb-4 max-h-64 object-cover" />
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateContentStatus(item.id, "approved")}>
                      <ThumbsUp className="h-4 w-4 mr-2" /> Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => updateContentStatus(item.id, "scheduled")}>
                      <Calendar className="h-4 w-4 mr-2" /> Schedule
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateContentStatus(item.id, "rejected")}>
                      <ThumbsDown className="h-4 w-4 mr-2" /> Reject
                    </Button>
                    <Button size="sm" variant="default" className="ml-auto" onClick={() => updateContentStatus(item.id, "published")}>
                      <Send className="h-4 w-4 mr-2" /> Publish Now
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {content.filter(c => c.status === "pending").length === 0 && (
              <Card className="bg-card border-border">
                <CardContent className="py-12 text-center">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No Content Pending</h3>
                  <p className="text-muted-foreground">Generate some content to start reviewing.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Published Tab */}
          <TabsContent value="published" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {content.filter(c => c.status === "published" || c.status === "approved").map(item => (
                <Card key={item.id} className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <Badge variant="outline">{item.content_type}</Badge>
                      <Badge className={getStatusColor(item.status)}>{item.status}</Badge>
                    </div>
                    <CardTitle className="text-base line-clamp-2">{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {item.media_url && (
                      <img src={item.media_url} alt="" className="rounded-lg mb-3 h-32 w-full object-cover" />
                    )}
                    {item.platform && (
                      <Badge variant="secondary" className="text-xs">{item.platform}</Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
    </PageShell>
  );
};

export default AdminContent;
