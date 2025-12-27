import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { 
  Send, Loader2, Bot, User, Sparkles, Mic, DollarSign, Zap, Target, Clock, BarChart3
} from "lucide-react";
import { toast } from "sonner";
import CEOVoiceAssistant from "@/components/CEOVoiceAssistant";
import { SummaryWidget } from "@/components/ceo/SummaryWidget";
import { TodaysFocusWidget } from "@/components/ceo/TodaysFocusWidget";
// GOVERNANCE: QuickActionsPanel removed - no execution controls in CEO view
import { SystemStatusWidget } from "@/components/ceo/SystemStatusWidget";
import ErrorBoundary from "@/components/ErrorBoundary";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface DashboardMetrics {
  revenue: number;
  revenueChange: number;
  hotLeads: number;
  pipelineValue: number;
  pendingApprovals: number;
}

const QUICK_PROMPTS = [
  { label: "Daily Brief", query: "Give me my morning brief with key metrics and recommended actions" },
  { label: "Hot Leads", query: "Show me all hot leads that need attention today" },
  { label: "AI Activity", query: "Summarize all AI activity from the last 24 hours" },
  { label: "Revenue", query: "How's revenue tracking this month vs targets?" },
];

export default function AICEODashboard() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seededGreetingRef = useRef(false);
  const navigate = useNavigate();

  const fetchMetrics = useCallback(async () => {
    setIsLoadingMetrics(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      const [leadsRes, contentRes, pipelineRes] = await Promise.all([
        supabase.from("leads").select("*").gte("created_at", yesterday.toISOString()),
        supabase.from("content").select("*").eq("status", "pending"),
        supabase.from("deal_pipeline").select("*"),
      ]);

      const leads = leadsRes.data || [];
      const content = contentRes.data || [];
      const pipeline = pipelineRes.data || [];

      const hotLeads = leads.filter(l => l.lead_score >= 70 || l.lead_temperature === "hot");
      const wonLeads = leads.filter(l => l.status === "won" || l.status === "converted");
      const revenue = wonLeads.reduce((sum, l) => sum + (l.revenue_value || 0), 0);
      const pipelineValue = pipeline.reduce((sum, d) => sum + (d.value || 0), 0);

      setMetrics({ revenue, revenueChange: 12.5, hotLeads: hotLeads.length, pipelineValue, pendingApprovals: content.length });

      if (!seededGreetingRef.current) {
        const hour = new Date().getHours();
        const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        setMessages([{
          role: "assistant",
          content: `${greeting}, CEO! 👋\n\n**Today's Snapshot:**\n• Revenue: $${revenue.toLocaleString()}\n• ${hotLeads.length} hot leads ready to close\n• ${content.length} items pending approval\n• Pipeline: $${pipelineValue.toLocaleString()}\n\nHow can I help you today?`,
          timestamp: new Date(),
        }]);
        seededGreetingRef.current = true;
      }
    } catch (error) {
      console.error("Error fetching metrics:", error);
    } finally {
      setIsLoadingMetrics(false);
    }
  }, []);



  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamingContent]);

  useEffect(() => {
    fetchMetrics();
    const handleRefresh = () => fetchMetrics();
    window.addEventListener("workspace-refresh", handleRefresh);
    return () => window.removeEventListener("workspace-refresh", handleRefresh);
  }, [fetchMetrics]);

  useEffect(() => {
    const channel = supabase
      .channel("metrics-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchMetrics())
      .on("postgres_changes", { event: "*", schema: "public", table: "content" }, () => fetchMetrics())
      .on("postgres_changes", { event: "*", schema: "public", table: "deal_pipeline" }, () => fetchMetrics())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMetrics]);

  const sendMessage = async (query: string) => {
    if (!query.trim() || isLoading) return;
    const userMessage: Message = { role: "user", content: query, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setStreamingContent("");

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ceo-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ query, timeRange: "7d", conversationHistory: messages.slice(-10).map(m => ({ role: m.role, content: m.content })), stream: true }),
      });

      if (!response.ok) { toast.error(response.status === 429 ? "Rate limited" : "Failed to get response"); return; }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");
      const decoder = new TextDecoder();
      let fullContent = "", buffer = "";

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
          try { const parsed = JSON.parse(data); const content = parsed.choices?.[0]?.delta?.content; if (content) { fullContent += content; setStreamingContent(fullContent); } } catch { /* ignore streaming parse errors */ }
        }
      }
      setMessages(prev => [...prev, { role: "assistant", content: fullContent, timestamp: new Date() }]);
      setStreamingContent("");
    } catch { toast.error("Failed to get AI response"); } finally { setIsLoading(false); }
  };

  const formatContent = (content: string) => content.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>').replace(/\n/g, "<br/>");

  return (
    <ErrorBoundary>
      <div className="container py-6 space-y-6">
        <CEOVoiceAssistant isOpen={isVoiceOpen} onClose={() => setIsVoiceOpen(false)} onTranscript={(text, role) => setMessages(prev => [...prev, { role, content: text, timestamp: new Date() }])} />

        {/* GOVERNANCE: Read-only Intelligence Banner */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">AI CEO Intelligence</span>
            <span className="text-xs text-muted-foreground">Read-only view • No execution controls</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/app")}>
            Go to Decisions
          </Button>
        </div>

        {/* Metrics Bar - Read only insight */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryWidget title="Today's Revenue" value={metrics?.revenue || 0} icon={DollarSign} entity="crm" filter={{ status: "converted" }} format="currency" isLoading={isLoadingMetrics} trend="up" trendLabel={`${metrics?.revenueChange?.toFixed(1)}%`} />
          <SummaryWidget title="Hot Leads" value={metrics?.hotLeads || 0} icon={Zap} entity="crm" filter={{ filter: "hot" }} isLoading={isLoadingMetrics} badge={metrics?.hotLeads ? "Insight" : undefined} badgeVariant="secondary" />
          <SummaryWidget title="Pipeline Value" value={metrics?.pipelineValue || 0} icon={Target} entity="pipeline" format="currency" isLoading={isLoadingMetrics} />
          <SummaryWidget title="Pending Approvals" value={metrics?.pendingApprovals || 0} icon={Clock} entity="approvals" isLoading={isLoadingMetrics} />
        </div>

        {/* Main Layout: Chat + Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* AI Chat Panel - Intelligence queries only */}
          <Card className="lg:col-span-2 h-[calc(100vh-380px)] flex flex-col">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" />AI CEO Intelligence</div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setIsVoiceOpen(true)}><Mic className="h-4 w-4" /></Button>
                  <Badge variant="outline" className="text-xs">Read-only</Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
              {messages.length <= 1 && (
                <div className="p-4 border-b bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-2">Ask about business intelligence:</p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_PROMPTS.map((p) => <Button key={p.label} variant="outline" size="sm" className="text-xs" onClick={() => sendMessage(p.query)}>{p.label}</Button>)}
                  </div>
                </div>
              )}
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-4">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role === "assistant" && <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><Bot className="h-4 w-4 text-primary" /></div>}
                      <div className={`rounded-lg px-4 py-2 max-w-[80%] ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        <div className="text-sm" dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }} />
                      </div>
                      {msg.role === "user" && <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0"><User className="h-4 w-4" /></div>}
                    </div>
                  ))}
                  {streamingContent && <div className="flex gap-3 justify-start"><div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><Bot className="h-4 w-4 text-primary" /></div><div className="rounded-lg px-4 py-2 max-w-[80%] bg-muted"><div className="text-sm" dangerouslySetInnerHTML={{ __html: formatContent(streamingContent) }} /></div></div>}
                  {isLoading && !streamingContent && <div className="flex gap-3 justify-start"><div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center"><Loader2 className="h-4 w-4 text-primary animate-spin" /></div><div className="rounded-lg px-4 py-2 bg-muted"><div className="flex items-center gap-2 text-sm text-muted-foreground"><span>Analyzing...</span></div></div></div>}
                </div>
              </ScrollArea>
              <div className="p-4 border-t">
                <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
                  <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your business intelligence..." disabled={isLoading} className="flex-1" />
                  <Button type="submit" disabled={isLoading || !input.trim()}>{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
                </form>
              </div>
            </CardContent>
          </Card>

          {/* Sidebar - Intelligence widgets only, NO execution controls */}
          <div className="space-y-4">
            <TodaysFocusWidget />
            {/* GOVERNANCE: QuickActionsPanel removed - no execution controls in CEO view */}
            <SystemStatusWidget />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
