import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
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
  teamSize: string;
  callVolume: string;
  aiTimeline: string;
  interests: string[];
  painPoint: string;
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
    teamSize: "",
    callVolume: "",
    aiTimeline: "",
    interests: [],
    painPoint: "",
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

  // Auto-open after 15 seconds or scroll
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

  const addBotMessageWithTyping = async (
    text: string,
    options?: string[],
    multiSelect?: boolean,
    inputType?: "text" | "email" | "phone",
    inputPlaceholder?: string,
    field?: string
  ) => {
    setIsTyping(true);
    await delay(900 + Math.random() * 800);
    setIsTyping(false);

    const newMessage: Message = {
      id: Date.now(),
      sender: "bot",
      text,
      options,
      multiSelect,
      inputType,
      inputPlaceholder,
      field,
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  const initializeChat = async () => {
    setMessages([]);
    setIsTyping(true);
    await delay(700);
    setIsTyping(false);
    
    setMessages([
      {
        id: 1,
        sender: "bot",
        text: "Hey! 👋 I'm Alex. Quick question for you — are you losing jobs because calls go unanswered?",
        options: ["Yeah, it's a problem", "Sometimes", "Not really, just curious"],
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
    const newMessage: Message = {
      id: Date.now(),
      sender: "user",
      text,
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  const submitLead = async (finalData: LeadData) => {
    setIsSubmitting(true);
    try {
      const qualificationSummary = `
Business Type: ${finalData.businessType}
Team Size: ${finalData.teamSize}
Monthly Calls: ${finalData.callVolume}
AI Timeline: ${finalData.aiTimeline}
Interests: ${finalData.interests.join(", ") || "None selected"}
Pain Point: ${finalData.painPoint}
Source: Chatbot Qualification`;

      const { error } = await supabase.functions.invoke('contact-form', {
        body: {
          name: finalData.name,
          email: finalData.email,
          phone: finalData.phone,
          message: qualificationSummary,
          businessType: finalData.businessType,
          teamSize: finalData.teamSize,
          callVolume: finalData.callVolume,
          aiTimeline: finalData.aiTimeline,
          interests: finalData.interests,
        },
      });

      if (error) throw error;

      await addBotMessageWithTyping(
        "You're all set! 🎉 I'm handing your info to one of our specialists — they'll reach out within 24 hours to map out a game plan. Want to explore anything in the meantime?",
        ["See Pricing", "Hear Demo", "Calculate My Losses"]
      );
      setCurrentStep(100);

      toast({
        title: "You're in!",
        description: "We'll be in touch soon.",
      });
    } catch (error) {
      console.error("Error submitting lead:", error);
      await addBotMessageWithTyping("Hmm, something glitched on our end. Mind trying again?");
      toast({
        title: "Oops!",
        description: "Failed to submit. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTeamSizeResponse = (businessType: string, teamSize: string) => {
    if (teamSize === "Solo") {
      return `Running solo in ${businessType}? That's hustle right there. Every missed call probably hurts, huh?`;
    } else if (teamSize === "2-5") {
      return `Nice! A tight crew. At that size, you're probably juggling a lot — dispatching, quoting, and still getting your hands dirty.`;
    } else if (teamSize === "6-10") {
      return `Solid team! At that size, things get real — scheduling gets complex and missed calls can really stack up.`;
    }
    return `Wow, 10+ trucks! You're running a real operation. At that scale, every inefficiency costs serious money.`;
  };

  const getCallVolumeResponse = (callVolume: string) => {
    if (callVolume === "<50") {
      return "Got it. Even at that volume, missing just 2-3 calls a week adds up fast. Have you figured out roughly how much each job is worth?";
    } else if (callVolume === "50-100") {
      return "That's solid call flow! At that volume, even a 5% miss rate means 3-5 lost jobs a month. What's your average ticket look like?";
    } else if (callVolume === "100-200") {
      return "Whoa, that's busy! With that many calls, you're leaving serious money on the table if even a few slip through. Are most of these during business hours?";
    }
    return "200+? You're running a call center at that point! How are you handling after-hours right now?";
  };

  const handleOptionClick = async (option: string) => {
    if (currentStep === 7) {
      // Multi-select for interests
      if (option === "Done") {
        addUserMessage(selectedInterests.length > 0 ? selectedInterests.join(", ") : "Just AI dispatching");
        setLeadData((prev) => ({ ...prev, interests: selectedInterests }));
        setSelectedInterests([]);
        setCurrentStep(8);
        await addBotMessageWithTyping(
          "Awesome, I've got the full picture now. Let me grab your details so our team can put together something tailored for you. What's your name?"
        );
        await delay(300);
        await addBotMessageWithTyping(
          undefined,
          undefined,
          false,
          "text",
          "Your name",
          "name"
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
      case 1: // Pain point acknowledgment
        setLeadData((prev) => ({ ...prev, painPoint: option }));
        if (option === "Not really, just curious") {
          setCurrentStep(2);
          await addBotMessageWithTyping(
            "No worries! Curiosity is good 😄 Let me show you what we do anyway — it might come in handy down the road. What kind of service business are you in?"
          );
          await delay(200);
          await addBotMessageWithTyping(
            undefined,
            businessTypes
          );
        } else {
          setCurrentStep(2);
          await addBotMessageWithTyping(
            "Yeah, I hear that a lot. It's brutal — you spend money on ads, your phone rings, and if you can't pick up... that lead's gone. What type of trade are you in?"
          );
          await delay(200);
          await addBotMessageWithTyping(
            undefined,
            businessTypes
          );
        }
        break;

      case 2: // Business type
        setLeadData((prev) => ({ ...prev, businessType: option }));
        setCurrentStep(3);
        await addBotMessageWithTyping(
          `${option} — nice! Love working with ${option.toLowerCase()} companies. How big is your crew right now?`,
          ["Solo", "2-5", "6-10", "10+ trucks"]
        );
        break;

      case 3: // Team size - with personalized response
        setLeadData((prev) => ({ ...prev, teamSize: option }));
        setCurrentStep(4);
        const teamResponse = getTeamSizeResponse(leadData.businessType, option);
        await addBotMessageWithTyping(teamResponse);
        await delay(400);
        await addBotMessageWithTyping(
          "How many calls do you typically get in a month?",
          ["<50", "50-100", "100-200", "200+"]
        );
        break;

      case 4: // Call volume - with personalized probing
        setLeadData((prev) => ({ ...prev, callVolume: option }));
        setCurrentStep(5);
        const callResponse = getCallVolumeResponse(option);
        await addBotMessageWithTyping(callResponse);
        await delay(400);
        await addBotMessageWithTyping(
          "So here's the thing — our AI answers every call instantly, books jobs, and dispatches your crew. No missed calls, ever. When are you looking to get something like this set up?",
          ["ASAP - we're bleeding money", "Next 1-3 months", "3-6 months", "Just exploring for now"]
        );
        break;

      case 5: // AI timeline - with urgency handling
        const timelineMap: { [key: string]: string } = {
          "ASAP - we're bleeding money": "Within 3 months",
          "Next 1-3 months": "Within 3 months",
          "3-6 months": "3-6 months",
          "Just exploring for now": "Just exploring",
        };
        setLeadData((prev) => ({ ...prev, aiTimeline: timelineMap[option] || option }));
        setCurrentStep(6);
        
        if (option === "ASAP - we're bleeding money") {
          await addBotMessageWithTyping(
            "I feel that urgency! Good news — we can usually get you live within a week. Before I connect you with our team, quick question..."
          );
        } else if (option === "Just exploring for now") {
          await addBotMessageWithTyping(
            "Totally get it — always smart to do your homework first. Let me ask you this..."
          );
        } else {
          await addBotMessageWithTyping(
            "Perfect timing actually — that gives us room to get everything dialed in right. Quick question for you..."
          );
        }
        await delay(400);
        await addBotMessageWithTyping(
          "What's the biggest headache in your business right now? Be honest 😅",
          ["Missed calls & lost leads", "Can't find good techs", "Marketing isn't working", "Scheduling chaos", "All of the above 😩"]
        );
        break;

      case 6: // Biggest pain - then interests
        setCurrentStep(7);
        setSelectedInterests([]);
        
        if (option === "All of the above 😩") {
          await addBotMessageWithTyping(
            "Ha! You're not alone — that's basically every service business owner I talk to. The good news? We can actually help with most of that."
          );
        } else if (option === "Missed calls & lost leads") {
          await addBotMessageWithTyping(
            "That's literally why we exist! Our AI picks up every call, qualifies leads, and books them straight into your calendar."
          );
        } else if (option === "Can't find good techs") {
          await addBotMessageWithTyping(
            "Oof, the tech shortage is real. While we can't clone your best guy (yet 😄), we can make sure every lead gets captured so you maximize the crew you have."
          );
        } else {
          await addBotMessageWithTyping(
            "I hear that a lot! We actually help with that too — a lot of our clients see big improvements once they're not leaking leads."
          );
        }
        await delay(400);
        await addBotMessageWithTyping(
          "Besides AI call handling, anything else you'd like help with? Pick all that apply 👇",
          [...interestOptions, "Done"],
          true
        );
        break;

      case 100: // Post-submission
        if (option === "See Pricing") {
          document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
          await addBotMessageWithTyping("Scrolled you down to pricing! Take a look — no surprises, everything's transparent. Holler if you have Qs 😊");
        } else if (option === "Hear Demo") {
          document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
          await addBotMessageWithTyping("Check out the demo above — you can hear exactly how our AI handles a real call. Pretty wild, right? 🎧");
        } else if (option === "Calculate My Losses") {
          document.getElementById("calculator")?.scrollIntoView({ behavior: "smooth" });
          await addBotMessageWithTyping("Here's the calculator — plug in your numbers. Warning: it might sting a little when you see the total 📊");
        }
        break;

      default:
        await addBotMessageWithTyping(
          "I'm here if you need anything! What can I help with?",
          ["See Pricing", "Hear Demo", "Calculate My Losses"]
        );
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isSubmitting) return;

    const value = inputValue.trim();
    addUserMessage(value);
    setInputValue("");

    switch (currentStep) {
      case 8: // Name
        setLeadData((prev) => ({ ...prev, name: value }));
        setCurrentStep(9);
        await addBotMessageWithTyping(
          `Great to meet you, ${value}! What's the best email to reach you? We'll send over some info before our call.`,
          undefined,
          false,
          "email",
          "your@email.com",
          "email"
        );
        break;

      case 9: // Email
        if (!value.includes("@") || value.length < 5) {
          await addBotMessageWithTyping(
            "Hmm, that doesn't look quite right. Mind double-checking? I need a valid email to send you the good stuff 😄",
            undefined,
            false,
            "email",
            "your@email.com",
            "email"
          );
          return;
        }
        setLeadData((prev) => ({ ...prev, email: value }));
        setCurrentStep(10);
        await addBotMessageWithTyping(
          "Perfect! Last thing — what's the best number to reach you? Our team will call, not text, so make sure it's a number you'll actually pick up 📞",
          undefined,
          false,
          "phone",
          "(555) 123-4567",
          "phone"
        );
        break;

      case 10: // Phone
        if (value.replace(/\D/g, "").length < 10) {
          await addBotMessageWithTyping(
            "That seems a bit short for a phone number. Can you double-check?",
            undefined,
            false,
            "phone",
            "(555) 123-4567",
            "phone"
          );
          return;
        }
        const updatedData = { ...leadData, phone: value };
        setLeadData(updatedData);
        await submitLead(updatedData);
        break;

      default:
        await addBotMessageWithTyping(
          "Thanks for reaching out! Want me to point you somewhere helpful?",
          ["See Pricing", "Hear Demo", "Calculate My Losses"]
        );
    }
  };

  const getCurrentInputConfig = () => {
    const lastBotMessage = [...messages].reverse().find((m) => m.sender === "bot" && m.inputType);
    if (lastBotMessage?.inputType) {
      return {
        type: lastBotMessage.inputType,
        placeholder: lastBotMessage.inputPlaceholder || "Type a message...",
      };
    }
    return { type: "text", placeholder: "Type a message..." };
  };

  const inputConfig = getCurrentInputConfig();
  const showInput = currentStep >= 8 && currentStep <= 10;

  return (
    <>
      {/* Chat Button */}
      <button
        onClick={handleOpen}
        className={`fixed bottom-24 right-6 z-50 w-16 h-16 rounded-full bg-accent text-accent-foreground shadow-xl hover:shadow-2xl transition-all duration-300 flex items-center justify-center group ${
          isOpen ? "scale-0" : "scale-100"
        }`}
      >
        <MessageCircle className="w-7 h-7 group-hover:scale-110 transition-transform" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full animate-pulse" />
      </button>

      {/* Chat Window */}
      <div
        className={`fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] bg-card rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden ${
          isOpen ? "scale-100 opacity-100" : "scale-0 opacity-0"
        }`}
      >
        {/* Header */}
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

        {/* Messages */}
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

          {/* Typing indicator */}
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
                Hang tight, saving your info...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <input
              type={inputConfig.type}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder={inputConfig.placeholder}
              disabled={isSubmitting || isTyping || !showInput}
              className="flex-1 h-10 px-4 rounded-full border-2 border-border bg-background text-foreground focus:border-accent focus:ring-0 outline-none transition-all disabled:opacity-50"
            />
            <button
              onClick={handleSendMessage}
              disabled={isSubmitting || isTyping || !inputValue.trim() || !showInput}
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
