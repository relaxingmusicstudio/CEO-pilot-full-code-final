/**
 * Onboarding Conversation Page
 * #5: Conversation-first experience for NEW users only
 * 
 * New users are directed here for natural language onboarding with AI CEO
 * before being redirected to the main Decisions dashboard.
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Brain, Send, Loader2, Sparkles, ArrowRight } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const INITIAL_MESSAGE = `Welcome! 👋 I'm your AI CEO assistant. Let's set up your business together.

To get started, please tell me:
1. **What's your business name?**
2. **What industry are you in?** (e.g., HVAC, Plumbing, Legal, etc.)
3. **What's the biggest challenge you're facing right now?**

Just type naturally - I'll help guide you through the setup!`;

export default function OnboardingConversation() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: INITIAL_MESSAGE }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [canComplete, setCanComplete] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Check if enough info has been gathered (at least 3 user messages)
  useEffect(() => {
    const userMessages = messages.filter(m => m.role === "user");
    setCanComplete(userMessages.length >= 2);
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: text };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await supabase.functions.invoke("ceo-agent", {
        body: {
          query: text,
          context: "onboarding",
          conversationHistory: messages.slice(-10),
        },
      });

      if (response.error) throw response.error;

      const aiContent = response.data?.response || response.data?.message || 
        "Thanks for sharing! Tell me more about your business goals.";
      
      setMessages(prev => [...prev, { role: "assistant", content: aiContent }]);
    } catch (error) {
      console.error("Error in onboarding chat:", error);
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "I'm here to help! Please tell me about your business and what you're looking to achieve." 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const completeOnboarding = async () => {
    setIsLoading(true);
    try {
      // Mark onboarding as complete
      const { error } = await supabase
        .from("business_profile")
        .upsert({
          onboarding_completed_at: new Date().toISOString(),
          onboarding_progress: { conversation_complete: true, messages_count: messages.length },
        }, { onConflict: "id" });

      if (error) {
        // If upsert fails, try insert
        await supabase.from("business_profile").insert({
          onboarding_completed_at: new Date().toISOString(),
          onboarding_progress: { conversation_complete: true, messages_count: messages.length },
        });
      }

      toast.success("Welcome aboard! Let's get started.");
      navigate("/app");
    } catch (error) {
      console.error("Error completing onboarding:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Welcome | Setup Your Business</title>
      </Helmet>

      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl h-[80vh] flex flex-col">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <span>Welcome to Your AI CEO</span>
              <Sparkles className="h-4 w-4 text-yellow-500" />
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Let's set up your business with a quick conversation
            </p>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col p-0">
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`rounded-lg px-4 py-2 max-w-[80%] ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="rounded-lg px-4 py-2 bg-muted">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="p-4 border-t space-y-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage(input);
                }}
                className="flex gap-2"
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your response..."
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button type="submit" disabled={isLoading || !input.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>

              {canComplete && (
                <Button
                  onClick={completeOnboarding}
                  disabled={isLoading}
                  className="w-full"
                  variant="default"
                >
                  Continue to Dashboard
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
