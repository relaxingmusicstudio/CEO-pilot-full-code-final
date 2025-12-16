import { useState, useRef, useEffect, useCallback } from "react";
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
  AlertCircle,
  Mic,
  CheckCircle2,
  ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import CEOVoiceAssistant from "./CEOVoiceAssistant";
import FeedbackButtons from "./FeedbackButtons";
import StrategicPlanWidget from "./ceo/StrategicPlanWidget";

interface AgentDelegation {
  id: string;
  agent: string;
  task: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  suggestedActions?: string[];
  delegations?: AgentDelegation[];
}

interface CEOChatPanelProps {
  onInsightGenerated?: (insight: any) => void;
  className?: string;
}

const QUICK_ACTIONS = [
  { label: "What's the plan?", query: "Show me the current 2-week strategic plan" },
  { label: "Status update", query: "What's been accomplished since we last talked?" },
  { label: "Hot leads", query: "Show me today's hottest leads" },
  { label: "Revenue focus", query: "What should we focus on to maximize revenue this week?" },
];

const COMPLETION_PHRASES = [
  "that's all", "i'm done", "thanks, bye", "no more questions", 
  "goodbye", "bye", "that's it", "all done", "nothing else"
];

const AGENT_LABELS: Record<string, { label: string; icon: string }> = {
  content: { label: "Content Agent", icon: "📝" },
  ads: { label: "Ads Agent", icon: "📢" },
  sequences: { label: "Sequences Agent", icon: "📧" },
  inbox: { label: "Inbox Agent", icon: "💬" },
  social: { label: "Social Agent", icon: "🌐" },
};

// Parse suggested actions from AI response
function parseSuggestedActions(content: string): string[] {
  const actions: string[] = [];
  
  const patterns = [
    /(?:Would you like to|Want me to|Should I|Options?:)\s*(?:\n|:)?\s*((?:[1-3•\-\*]\.?\s+[^\n]+\n?)+)/gi,
    /(?:\*\*What would you like to do\?\*\*|What's next\?)\s*(?:\n)?\s*((?:[•\-\*]\s+[^\n]+\n?)+)/gi,
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      const lines = match[1].split('\n').filter(l => l.trim());
      for (const line of lines.slice(0, 3)) {
        const cleaned = line.replace(/^[1-3•\-\*]\.?\s*/, '').trim();
        if (cleaned && cleaned.length < 80) {
          actions.push(cleaned);
        }
      }
    }
  }
  
  const questionMatch = content.match(/(?:or should we|or do you want to|or would you prefer)\s+([^?]+)\?/gi);
  if (questionMatch && actions.length < 3) {
    for (const match of questionMatch.slice(0, 2)) {
      const option = match.replace(/^(or should we|or do you want to|or would you prefer)\s+/i, '').replace('?', '').trim();
      if (option && option.length < 60) {
        actions.push(option);
      }
    }
  }
  
  return actions.slice(0, 3);
}

// Parse agent delegations from AI response
function parseDelegations(content: string): AgentDelegation[] {
  const delegations: AgentDelegation[] = [];
  const pattern = /🤖\s*\*\*Delegating to ([^*]+)\*\*:\s*([^\n]+)/gi;
  let match;
  
  while ((match = pattern.exec(content)) !== null) {
    const agentName = match[1].toLowerCase().trim();
    const task = match[2].trim();
    delegations.push({
      id: `del-${Date.now()}-${delegations.length}`,
      agent: agentName,
      task,
      status: 'in_progress'
    });
  }
  
  return delegations;
}

export const CEOChatPanel = ({ onInsightGenerated, className = "" }: CEOChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [conversationComplete, setConversationComplete] = useState(false);
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pendingCorrection, setPendingCorrection] = useState<{
    query: string;
    response: string;
    index: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialLoadRef = useRef(false);

  // Load conversation on mount
  useEffect(() => {
    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
      loadConversation();
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const loadConversation = async () => {
    try {
      const { data, error } = await supabase
        .from('ceo_conversations')
        .select('*')
        .eq('is_active', true)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error loading conversation:', error);
        return;
      }

      if (data && data.messages) {
        const loadedMessages = (data.messages as any[]).map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
        setMessages(loadedMessages);
        setConversationId(data.id);
        setIsReturningUser(loadedMessages.length > 0);
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
        timestamp: m.timestamp.toISOString(),
        suggestedActions: m.suggestedActions || null,
        delegations: m.delegations ? m.delegations.map(d => ({
          id: d.id,
          agent: d.agent,
          task: d.task,
          status: d.status,
          result: d.result || null
        })) : null
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
        const { data, error } = await supabase
          .from('ceo_conversations')
          .insert([{
            messages: messagesToSave as any,
            is_active: true,
            last_message_at: new Date().toISOString()
          }])
          .select()
          .single();
        
        if (data && !error) {
          setConversationId(data.id);
        }
      }
    } catch (err) {
      console.error('Failed to save conversation:', err);
    }
  }, [conversationId]);

  const isConversationEnding = (text: string): boolean => {
    const lower = text.toLowerCase().trim();
    return COMPLETION_PHRASES.some(phrase => lower.includes(phrase));
  };

  const sendMessage = async (query: string) => {
    if (!query.trim() || isLoading) return;
    
    if (isConversationEnding(query)) {
      setConversationComplete(true);
      const userMessage: Message = { role: "user", content: query, timestamp: new Date() };
      const assistantMessage: Message = { 
        role: "assistant", 
        content: "Great session! I'll keep working on the plan in the background. Come back anytime to check progress or adjust priorities. 🎯", 
        timestamp: new Date() 
      };
      const newMessages = [...messages, userMessage, assistantMessage];
      setMessages(newMessages);
      saveConversation(newMessages);
      setInput("");
      return;
    }
    
    setConversationComplete(false);
    const userMessage: Message = { role: "user", content: query, timestamp: new Date() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);
    setStreamingContent("");

    try {
      const requestBody: any = {
        query,
        timeRange: "7d",
        conversationHistory: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        stream: true,
      };
      
      if (pendingCorrection) {
        requestBody.correctionContext = {
          previousQuery: pendingCorrection.query,
          previousResponse: pendingCorrection.response,
          userCorrection: query,
        };
        setPendingCorrection(null);
      }
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ceo-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify(requestBody),
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

      const suggestedActions = parseSuggestedActions(fullContent);
      const delegations = parseDelegations(fullContent);
      
      const assistantMessage: Message = { 
        role: "assistant", 
        content: fullContent, 
        timestamp: new Date(),
        suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
        delegations: delegations.length > 0 ? delegations : undefined
      };
      
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      setStreamingContent("");
      saveConversation(finalMessages);
      setIsReturningUser(true);
    } catch (error) {
      console.error("CEO Chat error:", error);
      toast.error("Failed to get AI response");
    } finally {
      setIsLoading(false);
    }
  };

  const formatContent = (content: string) => {
    // Remove delegation markers from display (they're shown separately)
    let cleaned = content.replace(/🤖\s*\*\*Delegating to [^*]+\*\*:\s*[^\n]+\n?/gi, '');
    return cleaned
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>')
      .replace(/\n/g, '<br/>');
  };

  const handleVoiceTranscript = (text: string, role: "user" | "assistant") => {
    const newMessage: Message = { role, content: text, timestamp: new Date() };
    const newMessages = [...messages, newMessage];
    setMessages(newMessages);
    saveConversation(newMessages);
  };

  const handleSuggestedAction = (action: string) => {
    sendMessage(action);
  };

  const handleEndConversation = () => {
    sendMessage("That's all for now, thanks!");
  };

  const renderDelegation = (delegation: AgentDelegation) => {
    const agentInfo = AGENT_LABELS[delegation.agent] || { label: delegation.agent, icon: "🤖" };
    
    return (
      <div 
        key={delegation.id}
        className="ml-8 my-2 p-2 bg-primary/5 rounded-lg border border-primary/20"
      >
        <div className="flex items-center gap-2 text-sm">
          <span>{agentInfo.icon}</span>
          <span className="font-medium text-primary">{agentInfo.label}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">{delegation.task}</span>
        </div>
        <div className="flex items-center gap-1 mt-1">
          {delegation.status === 'completed' ? (
            <Badge variant="outline" className="text-[10px] text-green-600 border-green-600/30">
              <CheckCircle2 className="h-2 w-2 mr-1" />
              Done
            </Badge>
          ) : delegation.status === 'in_progress' ? (
            <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
              <Loader2 className="h-2 w-2 mr-1 animate-spin" />
              Working
            </Badge>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <>
      <CEOVoiceAssistant 
        isOpen={isVoiceOpen} 
        onClose={() => setIsVoiceOpen(false)}
        onTranscript={handleVoiceTranscript}
      />
      
      <Card className={`flex flex-col overflow-hidden ${className}`}>
        <CardHeader className="pb-3 border-b flex-shrink-0">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bot className="h-4 w-4 text-accent" />
            CEO AI Partner
            <Badge variant="secondary" className="text-xs">Live</Badge>
            {conversationComplete && (
              <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Session Complete
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-7 w-7"
              onClick={() => setIsVoiceOpen(true)}
              title="Voice Assistant"
            >
              <Mic className="h-4 w-4 text-primary" />
            </Button>
          </CardTitle>
        </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0 min-h-0 overflow-hidden">
        {/* Strategic Plan Widget for returning users */}
        {isReturningUser && messages.length > 0 && (
          <div className="p-3 border-b">
            <StrategicPlanWidget compact />
          </div>
        )}
        
        {/* Quick Actions - only for new users */}
        {messages.length === 0 && !isReturningUser && (
          <div className="p-4 border-b bg-muted/30">
            <p className="text-xs text-muted-foreground mb-2">Start a conversation:</p>
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
        <ScrollArea className="flex-1 p-4 min-h-0" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((msg, i) => {
              const prevUserMsg = msg.role === "assistant" && i > 0 
                ? messages.slice(0, i).reverse().find(m => m.role === "user")
                : null;
              
              return (
                <div key={i}>
                  <div
                    className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="h-3 w-3 text-accent" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm break-words overflow-hidden ${
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
                  
                  {/* Agent Delegations */}
                  {msg.role === "assistant" && msg.delegations && msg.delegations.length > 0 && (
                    <div className="space-y-1">
                      {msg.delegations.map(renderDelegation)}
                    </div>
                  )}
                  
                  {/* Feedback Buttons for assistant messages */}
                  {msg.role === "assistant" && prevUserMsg && (
                    <div className="ml-8 mt-1">
                      <FeedbackButtons
                        agentType="ceo-agent"
                        query={prevUserMsg.content}
                        response={msg.content}
                        onFeedbackSubmitted={(type) => {
                          if (type === 'negative') {
                            setPendingCorrection({
                              query: prevUserMsg.content,
                              response: msg.content,
                              index: i,
                            });
                          }
                        }}
                        className="opacity-60 hover:opacity-100 transition-opacity"
                      />
                    </div>
                  )}
                  
                  {/* Suggested Actions */}
                  {msg.role === "assistant" && msg.suggestedActions && msg.suggestedActions.length > 0 && i === messages.length - 1 && !conversationComplete && (
                    <div className="ml-8 mt-2 space-y-1.5">
                      <p className="text-xs text-muted-foreground">Quick options:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.suggestedActions.map((action, j) => (
                          <Button
                            key={j}
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 bg-background"
                            onClick={() => handleSuggestedAction(action)}
                          >
                            {action.length > 50 ? action.slice(0, 50) + '...' : action}
                          </Button>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 text-muted-foreground"
                          onClick={handleEndConversation}
                        >
                          I'm done
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            
            {streamingContent && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-3 w-3 text-accent animate-pulse" />
                </div>
                <div
                  className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted text-foreground break-words overflow-hidden"
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
              placeholder={conversationComplete ? "Start a new topic..." : "What should we focus on?"}
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
    </>
  );
};

export default CEOChatPanel;
