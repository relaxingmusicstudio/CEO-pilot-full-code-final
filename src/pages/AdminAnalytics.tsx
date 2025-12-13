import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { 
  BarChart3, Users, MessageSquare, TrendingUp, Send, Loader2, Brain, ArrowLeft,
  Zap, AlertTriangle, FileText, Target, Lightbulb, StopCircle
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCEOAgent } from "@/hooks/useCEOAgent";

interface ChatMessage {
  role: "user" | "ceo";
  content: string;
}

const STORAGE_KEY = "ceo-agent-chat-history";

const AdminAnalytics = () => {
  const navigate = useNavigate();
  const { 
    askCEOStream, 
    cancelStream,
    isLoading, 
    isStreaming,
    lastResponse, 
    getWeeklySummary,
    analyzeObjections,
    findDropoffPatterns,
    suggestPromptImprovements,
    analyzeSuccessfulCloses
  } = useCEOAgent();
  
  const [query, setQuery] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [currentStreamContent, setCurrentStreamContent] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load chat history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setChatHistory(JSON.parse(saved));
      } catch {
        // Invalid JSON, clear it
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Save chat history to localStorage
  useEffect(() => {
    if (chatHistory.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chatHistory.slice(-50))); // Keep last 50 messages
    }
  }, [chatHistory]);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, currentStreamContent]);

  // Load initial summary on mount if no history
  useEffect(() => {
    if (chatHistory.length === 0) {
      handlePresetQuery("Give me a quick overview of how we're doing", "Weekly Overview");
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (!query.trim() || isStreaming) return;
    
    const userMessage = query.trim();
    setQuery("");
    
    // Add user message
    const newHistory = [...chatHistory, { role: "user" as const, content: userMessage }];
    setChatHistory(newHistory);
    setCurrentStreamContent("");

    // Stream the response
    await askCEOStream(
      userMessage,
      "7d",
      newHistory,
      (chunk) => {
        setCurrentStreamContent(prev => prev + chunk);
      },
      () => {
        // On done, add the complete message to history
        setCurrentStreamContent(prev => {
          if (prev) {
            setChatHistory(h => [...h, { role: "ceo", content: prev }]);
          }
          return "";
        });
        inputRef.current?.focus();
      }
    );
  }, [query, chatHistory, isStreaming, askCEOStream]);

  const handlePresetQuery = useCallback(async (prompt: string, label: string) => {
    if (isStreaming) return;
    
    const newHistory = [...chatHistory, { role: "user" as const, content: label }];
    setChatHistory(newHistory);
    setCurrentStreamContent("");

    await askCEOStream(
      prompt,
      "7d",
      newHistory,
      (chunk) => {
        setCurrentStreamContent(prev => prev + chunk);
      },
      () => {
        setCurrentStreamContent(prev => {
          if (prev) {
            setChatHistory(h => [...h, { role: "ceo", content: prev }]);
          }
          return "";
        });
      }
    );
  }, [chatHistory, isStreaming, askCEOStream]);

  const clearHistory = () => {
    setChatHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const metrics = lastResponse?.metrics;

  // Format message content with basic markdown support
  const formatContent = (content: string) => {
    // Convert markdown headers
    let formatted = content
      .replace(/^### (.*$)/gim, '<h4 class="font-semibold text-base mt-3 mb-1">$1</h4>')
      .replace(/^## (.*$)/gim, '<h3 class="font-semibold text-lg mt-4 mb-2">$1</h3>')
      .replace(/^# (.*$)/gim, '<h2 class="font-bold text-xl mt-4 mb-2">$1</h2>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Bullet points
      .replace(/^[•\-] (.*$)/gim, '<li class="ml-4">$1</li>')
      // Numbered lists
      .replace(/^\d+\. (.*$)/gim, '<li class="ml-4 list-decimal">$1</li>')
      // Line breaks
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');
    
    return formatted;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 lg:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
                <Brain className="w-7 h-7 text-primary" />
                CEO Agent
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">AI-powered business intelligence</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={clearHistory}>
            Clear Chat
          </Button>
        </div>

        {/* Metrics Cards */}
        {metrics && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Card className="bg-card/50">
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">Visitors</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent className="py-0 px-4 pb-3">
                <div className="text-2xl font-bold">{metrics.totalVisitors}</div>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">Conversations</CardTitle>
                <MessageSquare className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent className="py-0 px-4 pb-3">
                <div className="text-2xl font-bold">{metrics.totalConversations}</div>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">Leads</CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent className="py-0 px-4 pb-3">
                <div className="text-2xl font-bold">{metrics.totalLeads}</div>
                <div className="flex gap-1.5 text-[10px] mt-0.5">
                  <span className="text-green-500">{metrics.hotLeads}🔥</span>
                  <span className="text-yellow-500">{metrics.warmLeads}🌡️</span>
                  <span className="text-muted-foreground">{metrics.coldLeads}❄️</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">Conversion</CardTitle>
                <BarChart3 className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent className="py-0 px-4 pb-3">
                <div className="text-2xl font-bold">{metrics.conversionRate}%</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Chat Interface */}
        <Card className="h-[calc(100vh-280px)] min-h-[500px] flex flex-col">
          <CardHeader className="py-3 px-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <CardTitle className="text-sm font-medium">Chat with CEO Agent</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Ask about traffic, leads, transcripts, or get optimization suggestions
              </CardDescription>
            </div>
          </CardHeader>
          
          <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
            {/* Chat Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {chatHistory.length === 0 && !isStreaming && (
                  <div className="text-center py-12">
                    <Brain className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground text-sm">
                      Ask me anything about your business performance...
                    </p>
                  </div>
                )}
                
                {chatHistory.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] lg:max-w-[75%] p-3 rounded-2xl ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-secondary/50 border border-border rounded-bl-sm"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <p className="text-sm">{msg.content}</p>
                      ) : (
                        <div 
                          className="text-sm prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
                        />
                      )}
                    </div>
                  </div>
                ))}
                
                {/* Streaming message */}
                {(isStreaming || currentStreamContent) && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] lg:max-w-[75%] p-3 rounded-2xl bg-secondary/50 border border-border rounded-bl-sm">
                      {currentStreamContent ? (
                        <div 
                          className="text-sm prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{ __html: formatContent(currentStreamContent) }}
                        />
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Analyzing...
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>

            {/* Quick Actions */}
            <div className="px-4 py-2 border-t bg-secondary/20">
              <p className="text-[10px] text-muted-foreground mb-1.5">Analytics</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => handlePresetQuery(
                    "Analyze our conversation transcripts. What are the most common objections and how should we handle them better?",
                    "Analyze Objections"
                  )}
                  disabled={isStreaming}
                >
                  <AlertTriangle className="w-3 h-3" />
                  Objections
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => handlePresetQuery(
                    "Where are leads dropping off in our conversations? Analyze the transcripts and show me the weak points.",
                    "Find Drop-offs"
                  )}
                  disabled={isStreaming}
                >
                  <Target className="w-3 h-3" />
                  Drop-offs
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => handlePresetQuery(
                    "Based on transcript analysis, suggest specific improvements to our chatbot prompts with before/after examples.",
                    "Improve Scripts"
                  )}
                  disabled={isStreaming}
                >
                  <Lightbulb className="w-3 h-3" />
                  Script Ideas
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => handlePresetQuery(
                    "Give me an executive summary of this week with key wins, concerns, and action items.",
                    "Weekly Summary"
                  )}
                  disabled={isStreaming}
                >
                  <FileText className="w-3 h-3" />
                  Summary
                </Button>
              </div>
              
              <p className="text-[10px] text-muted-foreground mb-1.5">Lead Management</p>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => handlePresetQuery(
                    "Get my priority leads. Show me the hottest leads I should call today.",
                    "Priority Leads"
                  )}
                  disabled={isStreaming}
                >
                  <Zap className="w-3 h-3" />
                  Hot Leads
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => handlePresetQuery(
                    "Show me all the current chatbot prompts and suggest improvements based on transcript analysis.",
                    "View Prompts"
                  )}
                  disabled={isStreaming}
                >
                  <FileText className="w-3 h-3" />
                  Prompts
                </Button>
              </div>
            </div>

            {/* Input */}
            <div className="p-4 border-t bg-background">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Ask about traffic, leads, objections, or how to improve..."
                  disabled={isStreaming}
                  className="flex-1"
                />
                {isStreaming ? (
                  <Button variant="destructive" onClick={cancelStream}>
                    <StopCircle className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button onClick={handleSend} disabled={!query.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminAnalytics;
