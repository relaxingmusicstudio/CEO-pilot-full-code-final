import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { 
  MessageSquare, 
  Send, 
  Loader2, 
  Bot, 
  User,
  Sparkles,
  TrendingUp,
  Target,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface CEOChatPanelProps {
  onInsightGenerated?: (insight: any) => void;
  className?: string;
}

const QUICK_ACTIONS = [
  { label: "Weekly summary", query: "Give me a weekly performance summary" },
  { label: "Top channels", query: "Which traffic channels are performing best?" },
  { label: "Hot leads", query: "Show me today's hottest leads" },
  { label: "A/B winners", query: "Any A/B tests with clear winners?" },
];

export const CEOChatPanel = ({ onInsightGenerated, className = "" }: CEOChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

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
            if (parsed.type === "metrics" && onInsightGenerated) {
              onInsightGenerated(parsed.metrics);
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
      console.error("CEO Chat error:", error);
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

  return (
    <Card className={`flex flex-col ${className}`}>
      <CardHeader className="pb-3 border-b">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Bot className="h-4 w-4 text-accent" />
          CEO AI Assistant
          <Badge variant="secondary" className="text-xs">Live</Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0">
        {/* Quick Actions */}
        {messages.length === 0 && (
          <div className="p-4 border-b bg-muted/30">
            <p className="text-xs text-muted-foreground mb-2">Quick actions:</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => sendMessage(action.query)}
                >
                  {action.label}
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
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="h-3 w-3 text-accent" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                  dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
                />
                {msg.role === "user" && (
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <User className="h-3 w-3 text-primary" />
                  </div>
                )}
              </div>
            ))}
            
            {streamingContent && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-3 w-3 text-accent animate-pulse" />
                </div>
                <div
                  className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted text-foreground"
                  dangerouslySetInnerHTML={{ __html: formatContent(streamingContent) }}
                />
              </div>
            )}
            
            {isLoading && !streamingContent && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <Loader2 className="h-3 w-3 text-accent animate-spin" />
                </div>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-muted-foreground/30 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-muted-foreground/30 rounded-full animate-bounce delay-100" />
                    <div className="w-2 h-2 bg-muted-foreground/30 rounded-full animate-bounce delay-200" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-3 border-t">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex gap-2"
          >
            <Input
              placeholder="Ask about performance, leads, strategy..."
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
  );
};

export default CEOChatPanel;
