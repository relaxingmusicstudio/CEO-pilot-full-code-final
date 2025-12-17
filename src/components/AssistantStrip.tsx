/**
 * AssistantStrip - Inline AI assistant for page-level context
 * 
 * Features:
 * - Quick prompt chips for common actions
 * - Expandable input for custom questions
 * - Does NOT call AI on page load (only on user action)
 * 
 * USAGE:
 * <AssistantStrip
 *   pageContext="CRM page - managing leads"
 *   quickPrompts={[
 *     { label: "Hot leads", prompt: "Show hot leads" },
 *     { label: "Follow up", prompt: "Who needs follow up?" }
 *   ]}
 * />
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Send, X, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface QuickPrompt {
  label: string;
  prompt: string;
}

interface AssistantStripProps {
  pageContext: string;
  quickPrompts?: QuickPrompt[];
  placeholder?: string;
  onResponse?: (response: string) => void;
  className?: string;
}

export function AssistantStrip({
  pageContext,
  quickPrompts = [],
  placeholder = "Ask about this page...",
  onResponse,
  className,
}: AssistantStripProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  const sendPrompt = async (prompt: string) => {
    if (!prompt.trim() || isLoading) return;
    
    setIsLoading(true);
    setResponse(null);
    setIsExpanded(true);
    
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ceo-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          query: prompt,
          context: pageContext,
          stream: false,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to get response");
      }

      const data = await res.json();
      const answer = data.response || data.content || "No response received.";
      setResponse(answer);
      onResponse?.(answer);
    } catch (error) {
      console.error("AssistantStrip error:", error);
      toast.error("Failed to get AI response");
    } finally {
      setIsLoading(false);
      setInput("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendPrompt(input);
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput("");
    sendPrompt(prompt);
  };

  const dismiss = () => {
    setResponse(null);
    setIsExpanded(false);
  };

  return (
    <div className={cn("px-4 md:px-6 py-2 bg-muted/30", className)}>
      {/* Main Row */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs font-medium hidden sm:inline">AI</span>
        </div>
        
        {/* Quick Prompts */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {quickPrompts.map((qp) => (
            <Button
              key={qp.label}
              variant="outline"
              size="sm"
              className="h-7 text-xs whitespace-nowrap shrink-0"
              onClick={() => handleQuickPrompt(qp.prompt)}
              disabled={isLoading}
            >
              {qp.label}
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          ))}
        </div>
        
        {/* Expandable Input */}
        <form 
          onSubmit={handleSubmit}
          className={cn(
            "flex items-center gap-2 transition-all",
            isExpanded ? "flex-1" : "w-auto"
          )}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setIsExpanded(true)}
            placeholder={placeholder}
            className={cn(
              "h-7 text-xs transition-all",
              isExpanded ? "w-full" : "w-32 md:w-48"
            )}
            disabled={isLoading}
          />
          {isExpanded && (
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              disabled={isLoading || !input.trim()}
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
            </Button>
          )}
        </form>
      </div>

      {/* Response Area */}
      {(response || isLoading) && (
        <div className="mt-2 p-3 rounded-lg bg-background border border-border relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 absolute top-2 right-2"
            onClick={dismiss}
          >
            <X className="h-3 w-3" />
          </Button>
          
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Thinking...</span>
            </div>
          ) : (
            <p className="text-sm pr-8 whitespace-pre-wrap">{response}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default AssistantStrip;
