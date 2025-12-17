import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Send, Loader2, Bot, User, Sparkles, Mic, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import CEOVoiceAssistant from "@/components/CEOVoiceAssistant";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface CEOChatFixedProps {
  /** System prompt to inject (used for onboarding) */
  systemPrompt?: string;
  /** Callback when agent responds */
  onAgentResponse?: (response: string) => void;
  /** Auto-expand on mount */
  autoExpand?: boolean;
  /** Auto-send a message on mount (only once) */
  initialMessage?: string;
}

const QUICK_PROMPTS = [
  { label: "Morning brief", query: "Give me my morning brief" },
  { label: "Hot leads", query: "Show me today's hot leads" },
  { label: "What's pending?", query: "What needs my attention?" },
];

export function CEOChatFixed({
  systemPrompt,
  onAgentResponse,
  autoExpand = false,
  initialMessage,
}: CEOChatFixedProps = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(autoExpand);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadConversation();
  }, []);

  // Handle initial message (for onboarding)
  useEffect(() => {
    if (initialMessage && !hasInitialized && !isLoading) {
      setHasInitialized(true);
      setIsExpanded(true);
      // Send the initial message after a short delay
      setTimeout(() => {
        sendMessageWithSystemPrompt(initialMessage, systemPrompt);
      }, 500);
    }
  }, [initialMessage, hasInitialized, isLoading]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const loadConversation = async () => {
    try {
      const { data } = await supabase
        .from('ceo_conversations')
        .select('*')
        .eq('is_active', true)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.messages) {
        const loadedMessages = (data.messages as any[]).map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
        // Only load last 5 messages for context limit
        setMessages(loadedMessages.slice(-5));
        setConversationId(data.id);
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  };

  const saveConversation = useCallback(async (newMessages: Message[]) => {
    try {
      const messagesToSave = newMessages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString()
      }));

      if (conversationId) {
        await supabase
          .from('ceo_conversations')
          .update({
            messages: messagesToSave as any,
            last_message_at: new Date().toISOString()
          })
          .eq('id', conversationId);
      } else {
        const { data } = await supabase
          .from('ceo_conversations')
          .insert([{
            messages: messagesToSave as any,
            is_active: true,
            last_message_at: new Date().toISOString()
          }])
          .select()
          .single();
        
        if (data) setConversationId(data.id);
      }
    } catch (err) {
      console.error('Failed to save conversation:', err);
    }
  }, [conversationId]);

  const sendMessageWithSystemPrompt = async (query: string, sysPrompt?: string) => {
    if (!query.trim() || isLoading) return;
    
    const userMessage: Message = { role: "user", content: query, timestamp: new Date() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);
    setStreamingContent("");
    setIsExpanded(true);

    try {
      // Build conversation history, optionally prepending system prompt
      const historyForRequest = messages.slice(-5).map(m => ({ role: m.role, content: m.content }));
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ceo-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          query,
          timeRange: "7d",
          conversationHistory: historyForRequest,
          systemPrompt: sysPrompt || systemPrompt,
          stream: true,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          toast.error("Rate limited. Please try again.");
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
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              setStreamingContent(fullContent);
            }
          } catch {}
        }
      }

      const assistantMessage: Message = { 
        role: "assistant", 
        content: fullContent, 
        timestamp: new Date()
      };
      
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      setStreamingContent("");
      saveConversation(finalMessages);
      
      // Notify parent of response (for onboarding completion detection)
      onAgentResponse?.(fullContent);
    } catch (error) {
      console.error("CEO Chat error:", error);
      toast.error("Failed to get AI response");
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (query: string) => {
    await sendMessageWithSystemPrompt(query);
  };

  const formatContent = (content: string) => {
    return content
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  };

  const handleVoiceTranscript = (text: string, role: "user" | "assistant") => {
    const newMessage: Message = { role, content: text, timestamp: new Date() };
    const newMessages = [...messages, newMessage];
    setMessages(newMessages);
    saveConversation(newMessages);
  };

  const handleFocus = () => {
    setIsExpanded(true);
  };

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const lastMessage = messages[messages.length - 1];

  return (
    <>
      <CEOVoiceAssistant 
        isOpen={isVoiceOpen} 
        onClose={() => setIsVoiceOpen(false)}
        onTranscript={handleVoiceTranscript}
      />
      
      <div className={cn(
        "border-t bg-card flex flex-col transition-all duration-300 shrink-0",
        isExpanded ? "h-[50vh] max-h-[400px]" : "h-[200px]"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <span className="text-sm font-medium">Your AI CEO</span>
            <Badge variant="secondary" className="text-[10px]">Live</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsVoiceOpen(true)}>
              <Mic className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleExpand}>
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {messages.length === 0 && !streamingContent ? (
            <div className="p-4 h-full flex flex-col justify-center">
              <p className="text-xs text-muted-foreground mb-2 text-center">Start a conversation:</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {QUICK_PROMPTS.map((p) => (
                  <Button
                    key={p.label}
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => sendMessage(p.query)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full p-3" ref={scrollRef}>
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                        <Bot className="h-3 w-3 text-accent" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                      dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
                    />
                    {msg.role === "user" && (
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <User className="h-3 w-3 text-primary" />
                      </div>
                    )}
                  </div>
                ))}
                {streamingContent && (
                  <div className="flex gap-2 justify-start">
                    <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                      <Bot className="h-3 w-3 text-accent" />
                    </div>
                    <div
                      className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted"
                      dangerouslySetInnerHTML={{ __html: formatContent(streamingContent) }}
                    />
                  </div>
                )}
                {isLoading && !streamingContent && (
                  <div className="flex gap-2 justify-start">
                    <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                      <Loader2 className="h-3 w-3 text-accent animate-spin" />
                    </div>
                    <div className="rounded-lg px-3 py-2 bg-muted text-sm text-muted-foreground">
                      Thinking...
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Input - Always Visible */}
        <div className="p-3 border-t shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex gap-2"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={handleFocus}
              placeholder="Ask your AI CEO..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
