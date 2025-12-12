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
  allowFreeText?: boolean;
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
  const [awaitingFreeText, setAwaitingFreeText] = useState(false);
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
    inputPlaceholder?: string,
    field?: string,
    allowFreeText?: boolean
  ) => {
    setIsTyping(true);
    // Variable typing speed based on message length
    const typingTime = Math.min(1500, 600 + text.length * 8);
    await delay(typingTime);
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
      allowFreeText,
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  const initializeChat = async () => {
    setMessages([]);
    setIsTyping(true);
    await delay(700);
    setIsTyping(false);
    
    // 2025 Sales: Lead with genuine curiosity, not a pitch
    setMessages([
      {
        id: 1,
        sender: "bot",
        text: "Hey there! 👋 I'm Alex from ApexLocal360. Before I tell you what we do — I'd love to learn a bit about your business first. That way I can see if we're actually a good fit to help, or point you in a better direction. Sound fair?",
        options: ["Yeah, let's chat", "Just browsing for now"],
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

  // Calculate if they're a good fit based on responses
  const evaluateFit = (data: LeadData): { isGoodFit: boolean; reason: string } => {
    // Good fit criteria
    if (data.callVolume === "<50" && data.teamSize === "Solo" && data.monthlyAdSpend === "Nothing right now") {
      return { 
        isGoodFit: false, 
        reason: "early_stage" 
      };
    }
    if (data.aiTimeline === "Not interested") {
      return { 
        isGoodFit: false, 
        reason: "not_ready" 
      };
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
Fit Score: ${updatedData.isGoodFit ? "QUALIFIED ✓" : "NOT READY - " + updatedData.fitReason}

=== CONVERSATION NOTES ===
${updatedData.notes.join("\n") || "None"}

Source: Chatbot - Consultative Qualification`;

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

      // Tailor closing message based on fit
      if (updatedData.isGoodFit) {
        await addBotMessage(
          "Perfect, you're all set! 🎉 Based on what you've shared, I think we can genuinely help you capture more jobs. One of our specialists will reach out within 24 hours with a custom plan. In the meantime — want to explore anything?",
          ["See Pricing", "Hear Demo", "Calculate My Losses"]
        );
      } else if (updatedData.fitReason === "early_stage") {
        await addBotMessage(
          "Thanks for chatting with me! 😊 Honestly, based on where you're at, our AI dispatching might be overkill right now. But I've saved your info — when you're ready to scale up, we'll be here. In the meantime, check out our free resources:",
          ["See Pricing", "Hear Demo", "Calculate My Losses"]
        );
      } else {
        await addBotMessage(
          "Appreciate you taking the time! I've noted your info. If your situation changes and you want to explore AI solutions down the road, just come back — we'll be ready. Anything else I can help with today?",
          ["See Pricing", "Hear Demo", "Calculate My Losses"]
        );
      }
      
      setCurrentStep(100);
      toast({
        title: "Got it!",
        description: "We'll be in touch soon.",
      });
    } catch (error) {
      console.error("Error submitting lead:", error);
      await addBotMessage("Hmm, something glitched. Mind trying again?");
      toast({
        title: "Oops!",
        description: "Failed to submit. Please try again.",
        variant: "destructive",
      });
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
          "Awesome, I've got a solid picture now. Let me grab your details so someone from our team can put together a custom game plan. What's your name?"
        );
        await delay(200);
        await addBotMessage(
          undefined,
          undefined,
          false,
          "text",
          "Your first name",
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
      case 1: // Opening rapport
        if (option === "Just browsing for now") {
          await addBotMessage(
            "No problem at all! Feel free to look around. If you want to chat later, I'll be right here. One quick thing though — what kind of service business are you in? Just so I know who's stopping by 😊",
            businessTypes,
            false,
            undefined,
            undefined,
            undefined,
            true
          );
          setAwaitingFreeText(true);
        } else {
          await addBotMessage(
            "Love it! So tell me — what kind of service business are you running?",
            businessTypes,
            false,
            undefined,
            undefined,
            undefined,
            true
          );
          setAwaitingFreeText(true);
        }
        setCurrentStep(2);
        break;

      case 2: // Business type
        if (option === "Other") {
          setAwaitingFreeText(true);
          await addBotMessage(
            "Interesting! What type of service do you offer? I work with all kinds of trades.",
            undefined,
            false,
            "text",
            "Type your trade/service",
            "businessTypeOther"
          );
          setCurrentStep(2.5);
          return;
        }
        setLeadData((prev) => ({ ...prev, businessType: option }));
        setCurrentStep(3);
        await addBotMessage(
          `${option} — solid trade! I work with a lot of ${option.toLowerCase()} companies. Let me understand your operation a bit better...`
        );
        await delay(300);
        await addBotMessage(
          "How big is your team right now? This helps me understand your scale.",
          ["Solo operator", "2-5 people", "6-10", "10+ trucks"]
        );
        break;

      case 3: // Team size - with empathy
        const teamMap: { [key: string]: string } = {
          "Solo operator": "Solo",
          "2-5 people": "2-5",
          "6-10": "6-10",
          "10+ trucks": "10+ trucks",
        };
        setLeadData((prev) => ({ ...prev, teamSize: teamMap[option] || option }));
        setCurrentStep(4);
        
        if (option === "Solo operator") {
          await addBotMessage(
            "Running it solo — that's impressive! You're wearing all the hats. Quick question: when you're on a job, how do you handle incoming calls right now?",
            ["I try to answer everything", "Goes to voicemail", "My spouse/family helps", "I have an answering service", "Something else"]
          );
        } else {
          await addBotMessage(
            "Nice team! At that size, coordination becomes everything. How do you currently handle incoming calls when everyone's out on jobs?",
            ["Office staff answers", "Goes to voicemail", "We rotate who answers", "Answering service", "Something else"]
          );
        }
        break;

      case 4: // Current solution - dig deeper
        setLeadData((prev) => ({ ...prev, currentSolution: option }));
        addNote(`Current call handling: ${option}`);
        setCurrentStep(5);
        
        if (option.includes("voicemail")) {
          await addBotMessage(
            "Yeah, voicemail's tough — studies show 80% of callers won't leave a message, they just call the next company. How many calls would you say you're getting per month?",
            ["Under 50", "50-100", "100-200", "200+"]
          );
        } else if (option === "Something else") {
          await addBotMessage(
            "Got it — everyone's setup is different! About how many calls come in each month?",
            ["Under 50", "50-100", "100-200", "200+"]
          );
        } else {
          await addBotMessage(
            "Makes sense! And roughly how many calls are coming in each month?",
            ["Under 50", "50-100", "100-200", "200+"]
          );
        }
        break;

      case 5: // Call volume - calculate the problem
        const volumeMap: { [key: string]: string } = {
          "Under 50": "<50",
          "50-100": "50-100",
          "100-200": "100-200",
          "200+": "200+",
        };
        setLeadData((prev) => ({ ...prev, callVolume: volumeMap[option] || option }));
        setCurrentStep(6);
        
        // Value-based selling: help them see the math
        await addBotMessage(
          "Here's where it gets interesting... What's your average job worth? This helps me understand the real impact of missed calls.",
          ["Under $200", "$200-500", "$500-1,000", "$1,000-2,500", "$2,500+"]
        );
        break;

      case 6: // Avg job value - do the math for them
        setLeadData((prev) => ({ ...prev, avgJobValue: option }));
        setCurrentStep(7);
        
        // Calculate potential loss (consultative insight)
        let missedRevenue = "";
        const callVol = leadData.callVolume;
        if (option === "$2,500+" && (callVol === "100-200" || callVol === "200+")) {
          missedRevenue = "At that job value with your call volume, even a 10% miss rate could mean $25K+ leaving the table monthly.";
        } else if (option === "$1,000-2,500") {
          missedRevenue = "At $1-2.5K per job, every missed call really stings.";
        } else if (option === "$500-1,000") {
          missedRevenue = "Those $500-1K jobs add up fast when you miss a few.";
        } else {
          missedRevenue = "Even at that ticket size, it adds up quickly.";
        }
        
        await addBotMessage(
          `${missedRevenue} One more thing — are you running ads or doing any marketing right now?`,
          ["Yes, spending money on ads", "Some organic/referrals", "Nothing right now"]
        );
        break;

      case 7: // Ad spend context
        const spendMap: { [key: string]: string } = {
          "Yes, spending money on ads": "Running paid ads",
          "Some organic/referrals": "Organic/referrals",
          "Nothing right now": "Nothing right now",
        };
        setLeadData((prev) => ({ ...prev, monthlyAdSpend: spendMap[option] || option }));
        setCurrentStep(8);
        
        if (option === "Yes, spending money on ads") {
          await addBotMessage(
            "That's actually the worst combo — paying for leads and then missing them when they call. It's like pouring money down the drain. What would you say is your biggest challenge right now?",
            ["Missing calls/losing leads", "Finding good technicians", "Getting consistent work", "Managing scheduling chaos", "Growing to the next level"]
          );
        } else {
          await addBotMessage(
            "Got it. What would you say is the biggest challenge in your business right now?",
            ["Missing calls/losing leads", "Finding good technicians", "Getting consistent work", "Managing scheduling chaos", "Growing to the next level"]
          );
        }
        break;

      case 8: // Biggest challenge - show empathy & expertise
        setLeadData((prev) => ({ ...prev, biggestChallenge: option }));
        addNote(`Main challenge: ${option}`);
        setCurrentStep(8.5);
        
        // Consultative response based on their challenge
        if (option === "Missing calls/losing leads") {
          await addBotMessage(
            "That's exactly what we solve! Our AI answers every call instantly — 24/7 — books jobs, and dispatches your crew. No more missed opportunities. When were you thinking about solving this?",
            ["ASAP - it's costing me money", "Next 1-3 months", "3-6 months out", "Just exploring options"]
          );
        } else if (option === "Finding good technicians") {
          await addBotMessage(
            "The tech shortage is brutal right now. While we can't clone your best guy (yet 😄), we CAN make sure every lead your current team can handle actually gets captured. When's the right time to tackle the call problem?",
            ["ASAP - it's costing me money", "Next 1-3 months", "3-6 months out", "Just exploring options"]
          );
        } else if (option === "Getting consistent work") {
          await addBotMessage(
            "Consistency usually comes from two things: marketing and actually answering when people call. The second one's easier to fix. When would you want to get that dialed in?",
            ["ASAP - it's costing me money", "Next 1-3 months", "3-6 months out", "Just exploring options"]
          );
        } else {
          await addBotMessage(
            "I hear that a lot! Here's what I've seen: fixing the lead capture problem often creates the bandwidth to tackle everything else. When were you thinking about making some changes?",
            ["ASAP - it's costing me money", "Next 1-3 months", "3-6 months out", "Just exploring options"]
          );
        }
        break;

      case 8.5: // Timeline
        const timelineMap: { [key: string]: string } = {
          "ASAP - it's costing me money": "Within 3 months",
          "Next 1-3 months": "Within 3 months",
          "3-6 months out": "3-6 months",
          "Just exploring options": "Just exploring",
        };
        setLeadData((prev) => ({ ...prev, aiTimeline: timelineMap[option] || option }));
        setCurrentStep(9);
        setSelectedInterests([]);
        
        if (option === "ASAP - it's costing me money") {
          await addBotMessage(
            "Love the urgency — we can usually get you live in under a week. Quick last thing: besides call handling, anything else you'd want help with? Pick all that apply 👇",
            [...interestOptions, "Done"],
            true
          );
        } else {
          await addBotMessage(
            "Totally fair. Besides AI call handling, is there anything else you'd want help with down the road? Pick any that interest you:",
            [...interestOptions, "Done"],
            true
          );
        }
        break;

      case 100: // Post-submission navigation
        if (option === "See Pricing") {
          document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
          await addBotMessage("Scrolled you to pricing! It's all transparent — no hidden fees. Let me know if you have any questions 😊");
        } else if (option === "Hear Demo") {
          document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
          await addBotMessage("Check out the demo above — you'll hear exactly how our AI handles a real service call. Pretty cool, right? 🎧");
        } else if (option === "Calculate My Losses") {
          document.getElementById("calculator")?.scrollIntoView({ behavior: "smooth" });
          await addBotMessage("Here's the calculator — plug in your numbers and see what missed calls are really costing you. Fair warning: it might sting a little 📊");
        }
        break;

      default:
        await addBotMessage(
          "I'm here if you need anything! What would you like to explore?",
          ["See Pricing", "Hear Demo", "Calculate My Losses"]
        );
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isSubmitting) return;

    const value = inputValue.trim();
    addUserMessage(value);
    setInputValue("");

    // Handle free-text for "Other" business type
    if (currentStep === 2.5) {
      setLeadData((prev) => ({ 
        ...prev, 
        businessType: "Other",
        businessTypeOther: value 
      }));
      addNote(`Business type: Other - ${value}`);
      setAwaitingFreeText(false);
      setCurrentStep(3);
      await addBotMessage(
        `${value} — interesting! I haven't worked with many of those, but the same principles apply. Let me learn more...`
      );
      await delay(300);
      await addBotMessage(
        "How big is your team right now?",
        ["Solo operator", "2-5 people", "6-10", "10+ trucks"]
      );
      return;
    }

    // Handle contact info collection
    switch (currentStep) {
      case 10: // Name
        setLeadData((prev) => ({ ...prev, name: value }));
        setCurrentStep(11);
        await addBotMessage(
          `Great to meet you, ${value}! What's the best email to reach you? We'll send over some useful info before our call.`,
          undefined,
          false,
          "email",
          "your@email.com",
          "email"
        );
        break;

      case 11: // Email
        if (!value.includes("@") || value.length < 5) {
          await addBotMessage(
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
        setCurrentStep(12);
        await addBotMessage(
          "Perfect! Last thing — what's the best number to reach you? Our specialist will call (not text) to discuss your custom plan 📞",
          undefined,
          false,
          "phone",
          "(555) 123-4567",
          "phone"
        );
        break;

      case 12: // Phone
        if (value.replace(/\D/g, "").length < 10) {
          await addBotMessage(
            "That seems a bit short. Can you double-check the number?",
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
        // Capture any free-text as notes
        if (awaitingFreeText) {
          addNote(`User input: ${value}`);
          setAwaitingFreeText(false);
        }
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
        placeholder: lastBotMessage.inputPlaceholder || "Type a message...",
        show: true,
      };
    }
    if (awaitingFreeText) {
      return { type: "text", placeholder: "Type your answer...", show: true };
    }
    return { type: "text", placeholder: "Type a message...", show: false };
  };

  const inputConfig = getCurrentInputConfig();
  const showInput = currentStep >= 10 || inputConfig.show;

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
                Saving your info...
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
