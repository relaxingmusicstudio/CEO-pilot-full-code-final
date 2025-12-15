import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { 
  Send, 
  Loader2, 
  Bot, 
  User,
  Sparkles,
  Mic,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Users,
  Zap,
  Activity,
  FileText,
  ChevronRight,
  RefreshCw,
  Bell,
  Shield,
  Video
} from "lucide-react";
import { toast } from "sonner";
import CEOVoiceAssistant from "@/components/CEOVoiceAssistant";
import ComplianceEnrichmentWidget from "@/components/ceo/ComplianceEnrichmentWidget";
import UserDirectivesWidget from "@/components/ceo/UserDirectivesWidget";
import { FollowUpTasksWidget } from "@/components/ceo/FollowUpTasksWidget";
import { VoiceAgentHealthCheck } from "@/components/ceo/VoiceAgentHealthCheck";
import VideoProviderHealthMonitor from "@/components/video/VideoProviderHealthMonitor";
import VideoCostAnalytics from "@/components/video/VideoCostAnalytics";
import FinanceHealthWidget from "@/components/finance/FinanceHealthWidget";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface PendingItem {
  id: string;
  type: "content" | "sequence" | "ad" | "social" | "lead";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  createdAt: string;
}

interface DailyMetrics {
  revenue: number;
  revenueChange: number;
  hotLeads: number;
  conversions: number;
  conversionRate: number;
  pendingApprovals: number;
  systemHealth: "healthy" | "warning" | "critical";
}

const MORNING_PROMPTS = [
  { label: "Daily Brief", query: "Give me my morning brief with key metrics, pending approvals, and recommended actions" },
  { label: "Hot Leads", query: "Show me all hot leads that need attention today" },
  { label: "What did AI do?", query: "Summarize all AI activity from the last 24 hours" },
  { label: "Revenue Status", query: "How's revenue tracking this month vs targets?" },
];

const QUICK_COMMANDS = [
  { label: "Approve all", query: "Approve all pending content and sequences" },
  { label: "Pause outreach", query: "Pause all cold outreach for 24 hours" },
  { label: "Priority calls", query: "Who should I call first today?" },
  { label: "Pipeline health", query: "Analyze my sales pipeline health" },
];

const CEOHub = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [metrics, setMetrics] = useState<DailyMetrics | null>(null);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("chat");
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      const [leadsRes, contentRes, automationRes, clientsRes] = await Promise.all([
        supabase.from("leads").select("*").gte("created_at", yesterday.toISOString()),
        supabase.from("content").select("*").eq("status", "pending"),
        supabase.from("automation_logs").select("*").gte("started_at", yesterday.toISOString()).order("started_at", { ascending: false }).limit(20),
        supabase.from("clients").select("*").eq("status", "active"),
      ]);

      const leads = leadsRes.data || [];
      const content = contentRes.data || [];
      const logs = automationRes.data || [];
      const clients = clientsRes.data || [];

      const hotLeads = leads.filter(l => l.lead_score >= 70 || l.lead_temperature === "hot");
      const wonLeads = leads.filter(l => l.status === "won" || l.status === "converted");
      const revenue = wonLeads.reduce((sum, l) => sum + (l.revenue_value || 0), 0);

      setMetrics({
        revenue,
        revenueChange: 12.5,
        hotLeads: hotLeads.length,
        conversions: wonLeads.length,
        conversionRate: leads.length > 0 ? (wonLeads.length / leads.length) * 100 : 0,
        pendingApprovals: content.length,
        systemHealth: logs.some(l => l.status === "failed") ? "warning" : "healthy",
      });

      // Create pending items from content
      const pending: PendingItem[] = content.map(c => ({
        id: c.id,
        type: "content" as const,
        title: c.title || "Untitled Content",
        description: c.content_type || "Content piece",
        priority: "medium" as const,
        createdAt: c.created_at,
      }));
      setPendingItems(pending);

      // Set activity log
      setActivityLog(logs.map(l => ({
        id: l.id,
        agent: l.function_name,
        action: l.status,
        timestamp: l.started_at,
        details: l.metadata,
      })));

      // Auto-generate morning brief if first load
      if (messages.length === 0) {
        const greeting = getTimeBasedGreeting();
        const briefMessage: Message = {
          role: "assistant",
          content: `${greeting}\n\n**📊 Today's Snapshot:**\n• Revenue: $${revenue.toLocaleString()}\n• Hot Leads: ${hotLeads.length} ready to close\n• Pending Approvals: ${content.length}\n• Active Clients: ${clients.length}\n\n**🎯 Recommended Actions:**\n1. Review ${hotLeads.length} hot leads\n2. Approve ${content.length} pending content pieces\n3. Check pipeline health\n\nHow can I help you today?`,
          timestamp: new Date(),
        };
        setMessages([briefMessage]);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    }
  };

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "☀️ Good morning, CEO!";
    if (hour < 17) return "👋 Good afternoon, CEO!";
    return "🌙 Good evening, CEO!";
  };

  const logUserInput = async (content: string, source: string, inputType: string = 'text') => {
    try {
      await supabase.functions.invoke('user-input-logger', {
        body: {
          action: 'log_input',
          source,
          input_type: inputType,
          content,
          classify: true,
        },
      });
    } catch (error) {
      console.error('Failed to log user input:', error);
    }
  };

  const sendMessage = async (query: string) => {
    if (!query.trim() || isLoading) return;
    
    // Log user input to directives system
    await logUserInput(query, 'ceo_hub', 'text');
    
    const userMessage: Message = { role: "user", content: query, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setStreamingContent("");

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ceo-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          query,
          timeRange: "7d",
          conversationHistory: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          toast.error("Rate limited. Please try again in a moment.");
          return;
        }
        if (response.status === 402) {
          toast.error("AI credits exhausted. Please add funds.");
          return;
        }
        throw new Error("Failed to get response");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "metrics") {
              // Update metrics from stream
            } else {
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                setStreamingContent(fullContent);
              }
            }
          } catch {}
        }
      }

      const assistantMessage: Message = { role: "assistant", content: fullContent, timestamp: new Date() };
      setMessages(prev => [...prev, assistantMessage]);
      setStreamingContent("");
    } catch (error) {
      console.error("CEO Hub error:", error);
      toast.error("Failed to get AI response");
    } finally {
      setIsLoading(false);
    }
  };

  const formatContent = (content: string) => {
    return content
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>')
      .replace(/\n/g, '<br/>');
  };

  const handleApprove = async (item: PendingItem) => {
    try {
      await supabase.from("content").update({ status: "approved" }).eq("id", item.id);
      setPendingItems(prev => prev.filter(p => p.id !== item.id));
      toast.success(`Approved: ${item.title}`);
    } catch (error) {
      toast.error("Failed to approve");
    }
  };

  const handleDeny = async (item: PendingItem) => {
    try {
      await supabase.from("content").update({ status: "rejected" }).eq("id", item.id);
      setPendingItems(prev => prev.filter(p => p.id !== item.id));
      toast.success(`Denied: ${item.title}`);
    } catch (error) {
      toast.error("Failed to deny");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <CEOVoiceAssistant 
        isOpen={isVoiceOpen} 
        onClose={() => setIsVoiceOpen(false)}
        onTranscript={(text, role) => {
          setMessages(prev => [...prev, { role, content: text, timestamp: new Date() }]);
        }}
      />

      {/* Header */}
      <header className="hero-gradient text-primary-foreground">
        <div className="container py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Bot className="h-6 w-6" />
                CEO Command Center
              </h1>
              <p className="text-primary-foreground/70 text-sm">Chat with your business. Get things done.</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchDashboardData}
                className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsVoiceOpen(true)}
                className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
              >
                <Mic className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/admin/ceo")}
                className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
              >
                Full Dashboard
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>

          {/* Quick Metrics */}
          {metrics && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-primary-foreground/10 rounded-lg p-3">
                <div className="flex items-center gap-2 text-primary-foreground/70 text-xs mb-1">
                  <DollarSign className="h-3 w-3" />
                  Revenue Today
                </div>
                <div className="text-lg font-bold">${metrics.revenue.toLocaleString()}</div>
              </div>
              <div className="bg-primary-foreground/10 rounded-lg p-3">
                <div className="flex items-center gap-2 text-primary-foreground/70 text-xs mb-1">
                  <Zap className="h-3 w-3" />
                  Hot Leads
                </div>
                <div className="text-lg font-bold">{metrics.hotLeads}</div>
              </div>
              <div className="bg-primary-foreground/10 rounded-lg p-3">
                <div className="flex items-center gap-2 text-primary-foreground/70 text-xs mb-1">
                  <TrendingUp className="h-3 w-3" />
                  Conversion
                </div>
                <div className="text-lg font-bold">{metrics.conversionRate.toFixed(1)}%</div>
              </div>
              <div className="bg-primary-foreground/10 rounded-lg p-3">
                <div className="flex items-center gap-2 text-primary-foreground/70 text-xs mb-1">
                  <Clock className="h-3 w-3" />
                  Pending
                </div>
                <div className="text-lg font-bold">{metrics.pendingApprovals}</div>
              </div>
              <div className="bg-primary-foreground/10 rounded-lg p-3">
                <div className="flex items-center gap-2 text-primary-foreground/70 text-xs mb-1">
                  <Activity className="h-3 w-3" />
                  System
                </div>
                <div className="text-lg font-bold flex items-center gap-1">
                  {metrics.systemHealth === "healthy" && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                  {metrics.systemHealth === "warning" && <AlertTriangle className="h-4 w-4 text-yellow-400" />}
                  {metrics.systemHealth}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chat Panel - Main Focus */}
          <div className="lg:col-span-2">
            <Card className="h-[calc(100vh-320px)] flex flex-col">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  Talk to Your Business
                  <Badge variant="secondary" className="text-xs ml-auto">AI Connected</Badge>
                </CardTitle>
              </CardHeader>
              
              <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
                {/* Morning Prompts */}
                {messages.length <= 1 && (
                  <div className="p-4 border-b bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-2">Start your day:</p>
                    <div className="flex flex-wrap gap-2">
                      {MORNING_PROMPTS.map((prompt) => (
                        <Button
                          key={prompt.label}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => sendMessage(prompt.query)}
                        >
                          {prompt.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages */}
                <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                  <div className="space-y-4">
                    {messages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        {msg.role === "assistant" && (
                          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                            <Bot className="h-4 w-4 text-accent" />
                          </div>
                        )}
                        <div
                          className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          }`}
                          dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
                        />
                        {msg.role === "user" && (
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {streamingContent && (
                      <div className="flex gap-3 justify-start">
                        <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                          <Sparkles className="h-4 w-4 text-accent animate-pulse" />
                        </div>
                        <div
                          className="max-w-[80%] rounded-lg px-4 py-3 text-sm bg-muted text-foreground"
                          dangerouslySetInnerHTML={{ __html: formatContent(streamingContent) }}
                        />
                      </div>
                    )}
                    
                    {isLoading && !streamingContent && (
                      <div className="flex gap-3 justify-start">
                        <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                          <Loader2 className="h-4 w-4 text-accent animate-spin" />
                        </div>
                        <div className="bg-muted rounded-lg px-4 py-3">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 bg-muted-foreground/30 rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-muted-foreground/30 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                            <div className="w-2 h-2 bg-muted-foreground/30 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* Quick Commands */}
                <div className="p-3 border-t bg-muted/20">
                  <div className="flex flex-wrap gap-1 mb-3">
                    {QUICK_COMMANDS.map((cmd) => (
                      <Button
                        key={cmd.label}
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => sendMessage(cmd.query)}
                        disabled={isLoading}
                      >
                        {cmd.label}
                      </Button>
                    ))}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendMessage(input);
                    }}
                    className="flex gap-2"
                  >
                    <Input
                      placeholder="Ask anything... 'What needs my attention?' 'Update lead status' 'Create a campaign'"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      disabled={isLoading}
                      className="text-sm"
                    />
                    <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Side Panel */}
          <div className="space-y-4">
            {/* Pending Approvals */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Pending Approvals
                  {pendingItems.length > 0 && (
                    <Badge variant="destructive" className="ml-auto">{pendingItems.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    All caught up!
                  </p>
                ) : (
                  pendingItems.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.type}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-green-500" onClick={() => handleApprove(item)}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeny(item)}>
                          <AlertTriangle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
                {pendingItems.length > 5 && (
                  <Button variant="link" size="sm" className="w-full" onClick={() => sendMessage("Show all pending approvals")}>
                    View all {pendingItems.length} items
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Follow-up Tasks (Human Request Handling) */}
            <FollowUpTasksWidget />

            {/* Voice Agent Health Check */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Mic className="h-4 w-4 text-primary" />
                  Voice Agent Health
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <VoiceAgentHealthCheck />
              </CardContent>
            </Card>

            {/* Video Production Health */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Video className="h-4 w-4 text-purple-500" />
                  Video Production
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <VideoProviderHealthMonitor compact />
              </CardContent>
            </Card>

            {/* Finance Health Widget */}
            <FinanceHealthWidget />

            {/* User Commands Widget */}
            <UserDirectivesWidget />

            {/* AI Activity Log */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Recent AI Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-32">
                  <div className="space-y-2">
                    {activityLog.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
                    ) : (
                      activityLog.slice(0, 5).map((log) => (
                        <div key={log.id} className="flex items-start gap-2 p-2 bg-muted/30 rounded text-xs">
                          <Zap className="h-3 w-3 text-accent mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{log.agent}</p>
                            <p className="text-muted-foreground">{log.action}</p>
                          </div>
                          <span className="text-muted-foreground whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
                <Button variant="link" size="sm" className="w-full mt-2" onClick={() => navigate("/admin/automation")}>
                  View Full Activity Log
                </Button>
              </CardContent>
            </Card>

            {/* Compliance & Enrichment Widget */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-500" />
                  Compliance & Leads
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ComplianceEnrichmentWidget />
              </CardContent>
            </Card>

            {/* Quick Navigation */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Quick Access</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate("/admin/leads")}>
                  <Users className="h-4 w-4 mr-2" />
                  Leads
                </Button>
                <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate("/admin/pipeline")}>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Pipeline
                </Button>
                <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate("/admin/agent/content")}>
                  <FileText className="h-4 w-4 mr-2" />
                  Content
                </Button>
                <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate("/admin/agent/sequences")}>
                  <Zap className="h-4 w-4 mr-2" />
                  Sequences
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CEOHub;
