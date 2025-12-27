import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Loader2, Sparkles, Wrench } from "lucide-react";
import LovablePromptOutput from "./LovablePromptOutput";
import FeedbackButtons from "./FeedbackButtons";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  query?: string; // Store the user query that led to this response
}

interface AgentChatPanelProps {
  agentName: string;
  agentType: "funnel" | "content" | "ads" | "sequences" | "inbox" | "social" | "youtube" | "ceo";
  systemPrompt: string;
  quickActions?: string[];
  className?: string;
  context?: Record<string, unknown>;
}

const DEFAULT_QUICK_ACTIONS: Record<string, string[]> = {
  funnel: ["Analyze conversion rates", "Suggest A/B tests", "🔧 Build exit popup", "🔧 Create lead form"],
  content: ["Generate blog ideas", "Create video script", "🔧 Build blog template", "🔧 Create calendar widget"],
  ads: ["Analyze campaign ROI", "Suggest targeting", "🔧 Build ROI dashboard", "🔧 Create tracking function"],
  sequences: ["Create nurture flow", "Improve open rates", "🔧 Build email cron job", "🔧 Create SMS automation"],
  inbox: ["Prioritize responses", "Handle objections", "🔧 Build auto-responder", "🔧 Create qualification card"],
  social: ["Comment strategy", "Find influencers", "🔧 Build mention tracker", "🔧 Create UGC gallery"],
  youtube: ["Trending topics", "Competitor analysis", "🔧 Build video scraper", "🔧 Create thumbnail gallery"],
  ceo: ["Weekly summary", "Top opportunities", "Revenue forecast", "Priority actions"],
};

const AgentChatPanel = ({
  agentName,
  agentType,
  systemPrompt,
  quickActions,
  className = "",
  context,
}: AgentChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const actions = quickActions || DEFAULT_QUICK_ACTIONS[agentType] || [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (query: string) => {
    if (!query.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: query,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ceo-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            query,
            systemPrompt,
            agentType,
            context,
            conversationHistory: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            stream: true,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let assistantContent = "";

      const assistantMessage: Message = {
        role: "assistant",
        content: "",
        timestamp: new Date(),
        query, // Store the query that led to this response
      };

      setMessages((prev) => [...prev, assistantMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantContent += content;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: assistantContent,
                  };
                  return updated;
                });
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <Card className={`flex flex-col ${className}`}>
      <CardHeader className="py-3 px-4 border-b">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/20">
            <Bot className="h-3.5 w-3.5 text-primary" />
          </div>
          {agentName} AI
          <Badge variant="outline" className="ml-auto text-xs">
            <Sparkles className="h-3 w-3 mr-1" />
            Live
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 min-h-0">
        {/* Quick Actions */}
        {messages.length === 0 && (
          <div className="p-3 border-b">
            <p className="text-xs text-muted-foreground mb-2">Quick actions:</p>
            <div className="flex flex-wrap gap-1.5">
              {actions.map((action) => (
                <Button
                  key={action}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => sendMessage(action)}
                  disabled={isLoading}
                >
                  {action}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1 p-3" ref={scrollRef}>
          <div className="space-y-3">
            {messages.map((msg, idx) => {
              // Check if message contains a Lovable prompt
              const lovablePromptMatch = msg.content.match(/```lovable\n([\s\S]*?)```/);
              const hasLovablePrompt = msg.role === "assistant" && lovablePromptMatch;
              
              if (hasLovablePrompt) {
                const promptContent = lovablePromptMatch[1].trim();
                const textBefore = msg.content.split("```lovable")[0].trim();
                const textAfter = msg.content.split("```")[2]?.trim() || "";
                
                return (
                  <div key={idx} className="space-y-2">
                    {textBefore && (
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted text-foreground">
                          <p className="whitespace-pre-wrap">{textBefore}</p>
                        </div>
                      </div>
                    )}
                    <LovablePromptOutput 
                      prompt={promptContent}
                      title="Implementation Prompt"
                      description="Copy and paste this into Lovable to build it"
                    />
                    {textAfter && (
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted text-foreground">
                          <p className="whitespace-pre-wrap">{textAfter}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }
              
              return (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.role === "assistant" && msg.content && !isLoading && (
                      <FeedbackButtons
                        agentType={agentType}
                        query={msg.query || ""}
                        response={msg.content}
                        className="mt-2 pt-2 border-t border-border/50"
                      />
                    )}
                  </div>
                </div>
              );
            })}
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-3 border-t">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask ${agentName}...`}
              disabled={isLoading}
              className="text-sm"
            />
            <Button
              size="icon"
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim()}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AgentChatPanel;
