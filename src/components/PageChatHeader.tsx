import { useState } from "react";
import { MessageSquare, Send, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface QuickAction {
  label: string;
  prompt: string;
}

interface PageChatHeaderProps {
  pageContext: string;
  placeholder?: string;
  quickActions?: QuickAction[];
}

const COMPLETION_PHRASES = [
  "that's all", "i'm done", "thanks, bye", "no more questions", 
  "goodbye", "bye", "that's it", "all done", "nothing else"
];

// Parse suggested actions from AI response
function parseSuggestedActions(content: string): string[] {
  const actions: string[] = [];
  
  // Look for question-based options
  const patterns = [
    /(?:Would you like to|Want me to|Should I)\s+([^?]+)\?/gi,
    /(?:or should we|or do you want to)\s+([^?]+)\?/gi,
  ];
  
  for (const pattern of patterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const action = match[1].trim();
      if (action && action.length < 60 && actions.length < 3) {
        actions.push(action);
      }
    }
  }
  
  return actions;
}

export function PageChatHeader({
  pageContext,
  placeholder = "Ask me anything about this page...",
  quickActions = [],
}: PageChatHeaderProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [suggestedActions, setSuggestedActions] = useState<string[]>([]);
  const [conversationComplete, setConversationComplete] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Array<{role: string, content: string}>>([]);

  const isConversationEnding = (text: string): boolean => {
    const lower = text.toLowerCase().trim();
    return COMPLETION_PHRASES.some(phrase => lower.includes(phrase));
  };

  const sendMessage = async (message: string) => {
    if (!message.trim()) return;

    // Check if user is ending conversation
    if (isConversationEnding(message)) {
      setConversationComplete(true);
      setResponse("Great! I'm here whenever you need help with this page. Just ask anytime. 🎯");
      setSuggestedActions([]);
      setInput("");
      return;
    }

    setConversationComplete(false);
    setIsLoading(true);
    setIsExpanded(true);
    setResponse("");
    setSuggestedActions([]);

    // Add user message to history
    const newHistory = [...conversationHistory, { role: "user", content: message }];
    setConversationHistory(newHistory);

    try {
      const { data, error } = await supabase.functions.invoke("ceo-agent", {
        body: {
          query: `[Page Context: ${pageContext}] ${message}`,
          conversationHistory: newHistory.slice(-6),
          stream: false,
        },
      });

      if (error) throw error;

      const aiResponse = data?.response || data?.message || "I processed your request.";
      setResponse(aiResponse);
      
      // Add AI response to history
      setConversationHistory([...newHistory, { role: "assistant", content: aiResponse }]);
      
      // Parse and set suggested actions
      const actions = parseSuggestedActions(aiResponse);
      setSuggestedActions(actions);
      
    } catch (error: any) {
      console.error("Chat error:", error);
      toast.error("Could not get a response. Try again.");
    } finally {
      setIsLoading(false);
      setInput("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSuggestedAction = (action: string) => {
    sendMessage(`Yes, ${action}`);
  };

  const handleEndConversation = () => {
    sendMessage("That's all, thanks!");
  };

  return (
    <Card className="mb-6 p-4 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">AI Assistant</h3>
          <p className="text-xs text-muted-foreground">Ask questions or get help with this page</p>
        </div>
        {conversationComplete && (
          <Badge variant="outline" className="text-xs text-green-600 border-green-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Complete
          </Badge>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={conversationComplete ? "Start a new question..." : placeholder}
          className="flex-1 bg-background"
          disabled={isLoading}
        />
        <Button type="submit" size="sm" disabled={isLoading || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>

      {quickActions.length > 0 && !response && (
        <div className="flex flex-wrap gap-2 mb-3">
          {quickActions.map((action, i) => (
            <Button
              key={i}
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() => sendMessage(action.prompt)}
              disabled={isLoading}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}

      {(isExpanded || response) && (
        <div className="mt-3 p-3 rounded-lg bg-background border">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MessageSquare className="h-4 w-4 animate-pulse" />
              <span>Thinking...</span>
            </div>
          ) : response ? (
            <>
              <div className="text-sm whitespace-pre-wrap">{response}</div>
              
              {/* Suggested Actions */}
              {suggestedActions.length > 0 && !conversationComplete && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Quick options:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedActions.map((action, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => handleSuggestedAction(action)}
                      >
                        {action.length > 40 ? action.slice(0, 40) + '...' : action}
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
            </>
          ) : null}
        </div>
      )}
    </Card>
  );
}
