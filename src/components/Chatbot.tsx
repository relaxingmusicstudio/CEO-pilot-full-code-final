import { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Send, Bot, User, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Message = {
  id: number;
  sender: "bot" | "user";
  text: string;
  options?: string[];
  multiSelect?: boolean;
  inputType?: "text" | "email" | "phone";
  inputPlaceholder?: string;
  field?: string;
};

type LeadData = {
  name: string;
  email: string;
  phone: string;
  businessType: string;
  businessTypeOther: string;
  teamSize: string;
  callVolume: string;
  currentSolution: string;
  biggestChallenge: string;
  monthlyAdSpend: string;
  avgJobValue: string;
  aiTimeline: string;
  interests: string[];
  notes: string[];
  isGoodFit: boolean;
  fitReason: string;
};

// Synced with ContactForm.tsx
const businessTypes = ["Plumbing", "HVAC", "Electrical", "Roofing", "Other"];
const interestOptions = [
  "Website SEO",
  "Google Maps SEO",
  "Paid Ads",
  "Sales Funnels",
  "Websites That Convert",
];

const Chatbot = () => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [leadData, setLeadData] = useState<LeadData>({
    name: "",
    email: "",
    phone: "",
    businessType: "",
    businessTypeOther: "",
    teamSize: "",
    callVolume: "",
    currentSolution: "",
    biggestChallenge: "",
    monthlyAdSpend: "",
    avgJobValue: "",
    aiTimeline: "",
    interests: [],
    notes: [],
    isGoodFit: true,
    fitReason: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasAutoOpened && !isOpen) {
        setIsOpen(true);
        setHasAutoOpened(true);
        initializeChat();
      }
    }, 15000);

    const handleScroll = () => {
      if (window.scrollY > 500 && !hasAutoOpened && !isOpen) {
        setIsOpen(true);
        setHasAutoOpened(true);
        initializeChat();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [hasAutoOpened, isOpen]);

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const addBotMessage = async (
    text: string,
    options?: string[],
    multiSelect?: boolean,
    inputType?: "text" | "email" | "phone",
    inputPlaceholder?: string
  ) => {
    try {
      setIsTyping(true);
      const typingTime = Math.min(1200, 500 + (text?.length || 0) * 5);
      await delay(typingTime);
    } finally {
      setIsTyping(false);
    }

    if (text || options) {
      const newMessage: Message = {
        id: Date.now(),
        sender: "bot",
        text: text || "",
        options,
        multiSelect,
        inputType,
        inputPlaceholder,
      };
      setMessages((prev) => [...prev, newMessage]);
    }
  };

  const initializeChat = async () => {
    setMessages([]);
    setIsTyping(true);
    await delay(600);
    setIsTyping(false);
    
    setMessages([
      {
        id: 1,
        sender: "bot",
        text: "Hey there! 👋 I'm Alex from ApexLocal360. Before I tell you what we do — I'd love to learn about your business first. That way I can see if we're actually a good fit to help. Sound fair?",
        options: ["Yeah, let's chat", "Just browsing"],
      },
    ]);
    setCurrentStep(1);
  };

  const handleOpen = () => {
    setIsOpen(true);
    if (messages.length === 0) {
      initializeChat();
    }
  };

  const addUserMessage = (text: string) => {
    setMessages((prev) => [...prev, {
      id: Date.now(),
      sender: "user",
      text,
    }]);
  };

  const addNote = (note: string) => {
    setLeadData((prev) => ({
      ...prev,
      notes: [...prev.notes, note],
    }));
  };

  const evaluateFit = (data: LeadData): { isGoodFit: boolean; reason: string } => {
    if (data.callVolume === "<50" && data.teamSize === "Solo" && data.monthlyAdSpend === "Nothing right now") {
      return { isGoodFit: false, reason: "early_stage" };
    }
    if (data.aiTimeline === "Not interested") {
      return { isGoodFit: false, reason: "not_ready" };
    }
    return { isGoodFit: true, reason: "qualified" };
  };

  const submitLead = async (finalData: LeadData) => {
    setIsSubmitting(true);
    try {
      const fit = evaluateFit(finalData);
      const updatedData = { ...finalData, isGoodFit: fit.isGoodFit, fitReason: fit.reason };

      const qualificationNotes = `
=== QUALIFICATION SUMMARY ===
Business: ${updatedData.businessType}${updatedData.businessTypeOther ? ` (${updatedData.businessTypeOther})` : ""}
Team Size: ${updatedData.teamSize}
Monthly Calls: ${updatedData.callVolume}
Avg Job Value: ${updatedData.avgJobValue}
Ad Spend: ${updatedData.monthlyAdSpend}
Current Solution: ${updatedData.currentSolution}
Biggest Challenge: ${updatedData.biggestChallenge}
AI Timeline: ${updatedData.aiTimeline}
Interests: ${updatedData.interests.join(", ") || "AI Dispatching only"}
Fit Score: ${updatedData.isGoodFit ? "QUALIFIED" : "NOT READY - " + updatedData.fitReason}

=== CONVERSATION NOTES ===
${updatedData.notes.join("\n") || "None"}`;

      const { error } = await supabase.functions.invoke('contact-form', {
        body: {
          name: updatedData.name,
          email: updatedData.email,
          phone: updatedData.phone,
          message: qualificationNotes,
          businessType: updatedData.businessType,
          businessTypeOther: updatedData.businessTypeOther,
          teamSize: updatedData.teamSize,
          callVolume: updatedData.callVolume,
          currentSolution: updatedData.currentSolution,
          biggestChallenge: updatedData.biggestChallenge,
          monthlyAdSpend: updatedData.monthlyAdSpend,
          avgJobValue: updatedData.avgJobValue,
          aiTimeline: updatedData.aiTimeline,
          interests: updatedData.interests,
          notes: updatedData.notes.join(" | "),
          isGoodFit: updatedData.isGoodFit,
          fitReason: updatedData.fitReason,
        },
      });

      if (error) throw error;

      setCurrentStep(13);
      await addBotMessage(
        `Awesome, ${updatedData.name}! Just curious — what made you start looking into AI call handling? Was there a specific moment or situation?`,
        undefined,
        false,
        "text",
        "Share what prompted this..."
      );
      toast({ title: "Got it!", description: "Info captured." });
    } catch (error) {
      console.error("Error submitting lead:", error);
      await addBotMessage("Hmm, something glitched. Mind trying again?");
      toast({ title: "Oops!", description: "Failed to submit.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOptionClick = async (option: string) => {
    // Multi-select for interests
    if (currentStep === 9) {
      if (option === "Done") {
        addUserMessage(selectedInterests.length > 0 ? selectedInterests.join(", ") : "Just AI dispatching");
        setLeadData((prev) => ({ ...prev, interests: selectedInterests }));
        setSelectedInterests([]);
        setCurrentStep(10);
        await addBotMessage(
          "Awesome! Let me grab your details so we can put together a custom plan. What's your name?",
          undefined,
          false,
          "text",
          "Your first name"
        );
        return;
      }
      setSelectedInterests((prev) =>
        prev.includes(option) ? prev.filter((i) => i !== option) : [...prev, option]
      );
      return;
    }

    addUserMessage(option);

    switch (currentStep) {
      case 1:
        setCurrentStep(2);
        await addBotMessage(
          "Great! What kind of service business are you running? Pick one or type your own:",
          businessTypes
        );
        break;

      case 2:
        if (option === "Other") {
          setCurrentStep(2.5);
          await addBotMessage(
            "Interesting! What type of service do you offer?",
            undefined,
            false,
            "text",
            "Type your trade/service"
          );
          return;
        }
        setLeadData((prev) => ({ ...prev, businessType: option }));
        setCurrentStep(3);
        await addBotMessage(
          `${option} — solid trade! How big is your team right now?`,
          ["Solo operator", "2-5 people", "6-10", "10+ trucks"]
        );
        break;

      case 3:
        const teamMap: Record<string, string> = {
          "Solo operator": "Solo", "2-5 people": "2-5", "6-10": "6-10", "10+ trucks": "10+ trucks"
        };
        setLeadData((prev) => ({ ...prev, teamSize: teamMap[option] || option }));
        setCurrentStep(4);
        await addBotMessage(
          "When you're on a job, how do you handle incoming calls right now?",
          ["I try to answer everything", "Goes to voicemail", "Spouse/family helps", "Answering service", "Something else"]
        );
        break;

      case 4:
        setLeadData((prev) => ({ ...prev, currentSolution: option }));
        addNote(`Current call handling: ${option}`);
        setCurrentStep(5);
        await addBotMessage(
          "Makes sense! About how many calls come in each month?",
          ["Under 50", "50-100", "100-200", "200+"]
        );
        break;

      case 5:
        const volumeMap: Record<string, string> = {
          "Under 50": "<50", "50-100": "50-100", "100-200": "100-200", "200+": "200+"
        };
        setLeadData((prev) => ({ ...prev, callVolume: volumeMap[option] || option }));
        setCurrentStep(6);
        await addBotMessage(
          "What's your average job worth? This helps me understand the real impact of missed calls.",
          ["Under $200", "$200-500", "$500-1,000", "$1,000-2,500", "$2,500+"]
        );
        break;

      case 6:
        setLeadData((prev) => ({ ...prev, avgJobValue: option }));
        setCurrentStep(7);
        await addBotMessage(
          "Are you running ads or doing any marketing right now?",
          ["Yes, spending on ads", "Some organic/referrals", "Nothing right now"]
        );
        break;

      case 7:
        const spendMap: Record<string, string> = {
          "Yes, spending on ads": "Running paid ads",
          "Some organic/referrals": "Organic/referrals",
          "Nothing right now": "Nothing right now"
        };
        setLeadData((prev) => ({ ...prev, monthlyAdSpend: spendMap[option] || option }));
        setCurrentStep(8);
        await addBotMessage(
          "What's the biggest challenge in your business right now? Or type your own:",
          ["Missing calls/losing leads", "Finding good technicians", "Getting consistent work", "Scheduling chaos", "Growing to the next level"]
        );
        break;

      case 8:
        setLeadData((prev) => ({ ...prev, biggestChallenge: option }));
        addNote(`Main challenge: ${option}`);
        setCurrentStep(8.5);
        await addBotMessage(
          "When were you thinking about tackling the call problem?",
          ["ASAP - it's costing me", "Next 1-3 months", "3-6 months out", "Just exploring"]
        );
        break;

      case 8.5:
        const timelineMap: Record<string, string> = {
          "ASAP - it's costing me": "Within 3 months",
          "Next 1-3 months": "Within 3 months",
          "3-6 months out": "3-6 months",
          "Just exploring": "Just exploring"
        };
        setLeadData((prev) => ({ ...prev, aiTimeline: timelineMap[option] || option }));
        setCurrentStep(9);
        setSelectedInterests([]);
        await addBotMessage(
          "Besides AI call handling, anything else you'd want help with? Pick all that apply:",
          [...interestOptions, "Done"],
          true
        );
        break;

      case 100:
        if (option === "See Pricing") {
          document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
          await addBotMessage("Scrolled you to pricing! Let me know if you have questions 😊");
        } else if (option === "Hear Demo") {
          document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
          await addBotMessage("Check out the demo above — hear how our AI handles real calls 🎧");
        } else if (option === "Calculate My Losses") {
          document.getElementById("calculator")?.scrollIntoView({ behavior: "smooth" });
          await addBotMessage("Here's the calculator — see what missed calls are really costing you 📊");
        }
        break;

      default:
        await addBotMessage(
          "Anything else I can help with?",
          ["See Pricing", "Hear Demo", "Calculate My Losses"]
        );
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isSubmitting || isTyping) return;

    const value = inputValue.trim();
    addUserMessage(value);
    setInputValue("");

    // Handle "Other" business type
    if (currentStep === 2.5) {
      setLeadData((prev) => ({ ...prev, businessType: "Other", businessTypeOther: value }));
      addNote(`Business type: Other - ${value}`);
      setCurrentStep(3);
      await addBotMessage(
        `${value} — cool! How big is your team right now?`,
        ["Solo operator", "2-5 people", "6-10", "10+ trucks"]
      );
      return;
    }

    // Handle free-text at any step with options (user typed instead of clicking)
    if (currentStep === 2) {
      // They typed their business instead of selecting
      setLeadData((prev) => ({ ...prev, businessType: "Other", businessTypeOther: value }));
      addNote(`Business type (typed): ${value}`);
      setCurrentStep(3);
      await addBotMessage(
        `${value} — nice! How big is your team?`,
        ["Solo operator", "2-5 people", "6-10", "10+ trucks"]
      );
      return;
    }

    if (currentStep === 8) {
      // They typed their challenge
      setLeadData((prev) => ({ ...prev, biggestChallenge: value }));
      addNote(`Main challenge (typed): ${value}`);
      setCurrentStep(8.5);
      await addBotMessage(
        "Thanks for sharing! When were you thinking about tackling this?",
        ["ASAP - it's costing me", "Next 1-3 months", "3-6 months out", "Just exploring"]
      );
      return;
    }

    // Handle contact info collection
    switch (currentStep) {
      case 10:
        setLeadData((prev) => ({ ...prev, name: value }));
        setCurrentStep(11);
        await addBotMessage(
          `Great to meet you, ${value}! What's the best email to reach you?`,
          undefined,
          false,
          "email",
          "your@email.com"
        );
        break;

      case 11:
        if (!value.includes("@") || value.length < 5) {
          await addBotMessage(
            "That doesn't look right. Mind double-checking the email?",
            undefined,
            false,
            "email",
            "your@email.com"
          );
          return;
        }
        setLeadData((prev) => ({ ...prev, email: value }));
        setCurrentStep(12);
        await addBotMessage(
          "Perfect! What's the best number to reach you?",
          undefined,
          false,
          "phone",
          "555-123-4567"
        );
        break;

      case 12:
        if (value.replace(/\D/g, "").length < 10) {
          await addBotMessage(
            "That seems short for a phone number. Can you check it?",
            undefined,
            false,
            "phone",
            "555-123-4567"
          );
          return;
        }
        const updatedData = { ...leadData, phone: value };
        setLeadData(updatedData);
        await submitLead(updatedData);
        break;

      case 13:
        // After phone collection - first follow-up question
        addNote(`What prompted AI search: ${value}`);
        setCurrentStep(14);
        await addBotMessage(
          "That makes total sense. If you had to pick ONE thing you'd want AI to fix first in your business, what would it be?",
          ["Never miss a call", "Book more jobs automatically", "Stop losing leads to voicemail", "Free up my time"]
        );
        break;

      case 14:
        // Second follow-up
        addNote(`Top priority: ${value}`);
        setCurrentStep(15);
        await addBotMessage(
          `${value} — that's exactly what we focus on. One more thing: how soon would you want to see results if you started today?`,
          ["This week", "Within a month", "Just want to see how it works first"]
        );
        break;

      case 15:
        // Final engagement before funnel options
        addNote(`Timeline expectation: ${value}`);
        setCurrentStep(100);
        await addBotMessage(
          "Love it! You're now in our priority list. Here's what I'd recommend checking out next:",
          ["See Pricing", "Hear Demo", "Calculate My Losses"]
        );
        break;

      default:
        // Capture any other free-text as notes
        addNote(`User said: ${value}`);
        await addBotMessage(
          "Thanks for sharing! Anything else I can help with?",
          ["See Pricing", "Hear Demo", "Calculate My Losses"]
        );
    }
  };

  const getCurrentInputConfig = () => {
    const lastBotMessage = [...messages].reverse().find((m) => m.sender === "bot" && m.inputType);
    if (lastBotMessage?.inputType) {
      return {
        type: lastBotMessage.inputType,
        placeholder: lastBotMessage.inputPlaceholder || "Type here...",
      };
    }
    // Always allow typing at steps with options
    if ([2, 8].includes(currentStep)) {
      return { type: "text", placeholder: "Or type your own..." };
    }
    return { type: "text", placeholder: "Type a message..." };
  };

  const inputConfig = getCurrentInputConfig();
  // Always show input - let users type anytime
  const showInput = true;

  return (
    <>
      <button
        onClick={handleOpen}
        className={`fixed bottom-24 right-6 z-50 w-16 h-16 rounded-full bg-accent text-accent-foreground shadow-xl hover:shadow-2xl transition-all duration-300 flex items-center justify-center group ${
          isOpen ? "scale-0" : "scale-100"
        }`}
      >
        <MessageCircle className="w-7 h-7 group-hover:scale-110 transition-transform" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full animate-pulse" />
      </button>

      <div
        className={`fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] bg-card rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden ${
          isOpen ? "scale-100 opacity-100" : "scale-0 opacity-0"
        }`}
      >
        <div className="bg-primary p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
              <Bot className="w-5 h-5 text-accent-foreground" />
            </div>
            <div>
              <div className="font-semibold text-primary-foreground">Alex</div>
              <div className="text-xs text-primary-foreground/70 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Online now
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-primary-foreground/20 transition-colors"
          >
            <X className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>

        <div className="h-80 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-2 ${message.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.sender === "bot" && (
                <div className="w-8 h-8 rounded-full bg-primary shrink-0 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary-foreground" />
                </div>
              )}

              <div className="max-w-[80%]">
                {message.text && (
                  <div
                    className={`p-3 rounded-2xl ${
                      message.sender === "user"
                        ? "bg-accent text-accent-foreground rounded-br-sm"
                        : "bg-secondary text-secondary-foreground rounded-bl-sm"
                    }`}
                  >
                    {message.text}
                  </div>
                )}

                {message.options && (
                  <div className={`flex flex-wrap gap-2 ${message.text ? "mt-2" : ""}`}>
                    {message.options.map((option, index) => {
                      const isSelected = message.multiSelect && selectedInterests.includes(option);
                      const isDone = option === "Done";
                      
                      return (
                        <button
                          key={index}
                          onClick={() => handleOptionClick(option)}
                          disabled={isSubmitting || isTyping}
                          className={`px-3 py-1.5 text-sm rounded-full transition-all disabled:opacity-50 flex items-center gap-1.5 ${
                            isDone
                              ? "bg-accent text-accent-foreground hover:bg-accent/90"
                              : isSelected
                              ? "bg-primary text-primary-foreground"
                              : "bg-card border-2 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3" />}
                          {option}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {message.sender === "user" && (
                <div className="w-8 h-8 rounded-full bg-accent shrink-0 flex items-center justify-center">
                  <User className="w-4 h-4 text-accent-foreground" />
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-2 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary shrink-0 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="p-3 rounded-2xl bg-secondary text-secondary-foreground rounded-bl-sm">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          {isSubmitting && (
            <div className="flex gap-2 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary shrink-0 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" />
              </div>
              <div className="p-3 rounded-2xl bg-secondary text-secondary-foreground rounded-bl-sm">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <input
              type={inputConfig.type === "phone" ? "tel" : inputConfig.type}
              value={inputValue}
              onChange={(e) => {
                if (inputConfig.type === "phone") {
                  // Auto-format phone: XXX-XXX-XXXX
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                  let formatted = digits;
                  if (digits.length > 3 && digits.length <= 6) {
                    formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
                  } else if (digits.length > 6) {
                    formatted = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
                  }
                  setInputValue(formatted);
                } else {
                  setInputValue(e.target.value);
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder={inputConfig.placeholder}
              disabled={isSubmitting || isTyping}
              className="flex-1 h-10 px-4 rounded-full border-2 border-border bg-background text-foreground focus:border-accent focus:ring-0 outline-none transition-all disabled:opacity-50"
            />
            <button
              onClick={handleSendMessage}
              disabled={isSubmitting || isTyping || !inputValue.trim()}
              className="w-10 h-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Chatbot;
