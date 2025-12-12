import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle, X, Send, Bot, User, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Message = {
  id: number;
  sender: "bot" | "user";
  text: string;
  options?: string[];
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
};

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
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  const initializeChat = () => {
    setMessages([
      {
        id: 1,
        sender: "bot",
        text: "Hi there! 👋 I'm here to help you stop losing money from missed calls. Let me ask a few quick questions to see how we can help. What type of service business do you run?",
        options: ["Plumbing", "HVAC", "Electrical", "Roofing", "Other"],
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

  const addBotMessage = (text: string, options?: string[], inputType?: "text" | "email" | "phone", inputPlaceholder?: string, field?: string) => {
    const newMessage: Message = {
      id: Date.now(),
      sender: "bot",
      text,
      options,
      inputType,
      inputPlaceholder,
      field,
    };
    setMessages((prev) => [...prev, newMessage]);
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
Source: Chatbot Qualification`;

      const { error } = await supabase.functions.invoke('contact-form', {
        body: {
          name: finalData.name,
          email: finalData.email,
          phone: finalData.phone,
          message: qualificationSummary,
          // Send all qualification fields separately
          businessType: finalData.businessType,
          teamSize: finalData.teamSize,
          callVolume: finalData.callVolume,
          aiTimeline: finalData.aiTimeline,
          interests: finalData.interests,
        },
      });

      if (error) throw error;

      addBotMessage(
        "🎉 Awesome! I've got all your info. One of our specialists will reach out within 24 hours to discuss how we can help you capture more jobs. In the meantime, want to explore our solutions?",
        ["See Pricing", "Hear Demo", "Calculate My Losses"]
      );
      setCurrentStep(100); // Completed

      toast({
        title: "Info Submitted!",
        description: "We'll be in touch soon.",
      });
    } catch (error) {
      console.error("Error submitting lead:", error);
      addBotMessage("Oops! Something went wrong. Please try again or contact us directly.");
      toast({
        title: "Error",
        description: "Failed to submit. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOptionClick = (option: string) => {
    addUserMessage(option);

    setTimeout(() => {
      switch (currentStep) {
        case 1: // Business type selected
          setLeadData((prev) => ({ ...prev, businessType: option }));
          setCurrentStep(2);
          addBotMessage(
            "Great! How many technicians/trucks do you have?",
            ["Solo (just me)", "2-5 trucks", "6-10 trucks", "10+ trucks"]
          );
          break;

        case 2: // Team size selected
          setLeadData((prev) => ({ ...prev, teamSize: option }));
          setCurrentStep(3);
          addBotMessage(
            "And roughly how many calls do you get per month?",
            ["Less than 50", "50-100", "100-200", "200+"]
          );
          break;

        case 3: // Call volume selected
          setLeadData((prev) => ({ ...prev, callVolume: option }));
          setCurrentStep(4);
          addBotMessage(
            "When are you looking to add AI into your business?",
            ["Within 3 months", "3-6 months", "6-12 months", "Just exploring"]
          );
          break;

        case 4: // AI timeline selected
          setLeadData((prev) => ({ ...prev, aiTimeline: option }));
          setCurrentStep(5);
          addBotMessage(
            "Besides AI dispatching, what else would help grow your business? (Pick all that apply, then type 'done')",
            ["More website traffic/SEO", "Google Ads", "Review management", "Multi-location support", "Done - just AI dispatching"]
          );
          break;

        case 5: // Interests selected
          if (option === "Done - just AI dispatching" || option === "Done - let's continue") {
            setCurrentStep(6);
            addBotMessage(
              "Perfect! Now let me get your info so we can show you exactly how much revenue you're leaving on the table. What's your name?",
              undefined,
              "text",
              "Enter your name",
              "name"
            );
          } else {
            setLeadData((prev) => ({ 
              ...prev, 
              interests: prev.interests.includes(option) ? prev.interests : [...prev.interests, option] 
            }));
            addBotMessage(
              `Added "${option}"! Pick another or click "Done" when finished.`,
              ["More website traffic/SEO", "Google Ads", "Review management", "Multi-location support", "Done - let's continue"]
            );
          }
          break;


        case 100: // Post-submission navigation
          if (option === "See Pricing") {
            document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
            addBotMessage("I've scrolled you to our pricing! Let me know if you have questions. 😊");
          } else if (option === "Hear Demo") {
            document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
            addBotMessage("Check out our demo above! It shows exactly how our AI handles calls. 🎧");
          } else if (option === "Calculate My Losses") {
            document.getElementById("calculator")?.scrollIntoView({ behavior: "smooth" });
            addBotMessage("Use the calculator to see your potential losses from missed calls! 📊");
          }
          break;

        default:
          addBotMessage(
            "I'm here to help! What would you like to know?",
            ["See Pricing", "Hear Demo", "Calculate My Losses"]
          );
      }
    }, 500);
  };

  const handleSendMessage = () => {
    if (!inputValue.trim() || isSubmitting) return;

    const value = inputValue.trim();
    addUserMessage(value);
    setInputValue("");

    setTimeout(() => {
      switch (currentStep) {
        case 6: // Name entered
          setLeadData((prev) => ({ ...prev, name: value }));
          setCurrentStep(7);
          addBotMessage(
            `Nice to meet you, ${value}! What's the best email to reach you?`,
            undefined,
            "email",
            "Enter your email",
            "email"
          );
          break;

        case 7: // Email entered
          if (!value.includes("@")) {
            addBotMessage("That doesn't look like a valid email. Can you try again?", undefined, "email", "Enter your email", "email");
            return;
          }
          setLeadData((prev) => ({ ...prev, email: value }));
          setCurrentStep(8);
          addBotMessage(
            "Great! And what's the best phone number to reach you?",
            undefined,
            "phone",
            "Enter your phone number",
            "phone"
          );
          break;

        case 8: // Phone entered
          const updatedData = { ...leadData, phone: value };
          setLeadData(updatedData);
          submitLead(updatedData);
          break;

        default:
          // Free-form question after qualification
          addBotMessage(
            "Thanks for your message! For detailed questions, I'd recommend checking out our demo or pricing. Is there something specific I can help with?",
            ["See Pricing", "Hear Demo", "Calculate My Losses"]
          );
      }
    }, 500);
  };

  const getCurrentInputConfig = () => {
    const lastBotMessage = [...messages].reverse().find((m) => m.sender === "bot");
    if (lastBotMessage?.inputType) {
      return {
        type: lastBotMessage.inputType,
        placeholder: lastBotMessage.inputPlaceholder || "Type a message...",
      };
    }
    return { type: "text", placeholder: "Type a message..." };
  };

  const inputConfig = getCurrentInputConfig();

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
              <div className="font-semibold text-primary-foreground">AI Assistant</div>
              <div className="text-xs text-primary-foreground/70">ApexLocal360</div>
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
                <div
                  className={`p-3 rounded-2xl ${
                    message.sender === "user"
                      ? "bg-accent text-accent-foreground rounded-br-sm"
                      : "bg-secondary text-secondary-foreground rounded-bl-sm"
                  }`}
                >
                  {message.text}
                </div>
                
                {message.options && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {message.options.map((option, index) => (
                      <button
                        key={index}
                        onClick={() => handleOptionClick(option)}
                        disabled={isSubmitting}
                        className="px-3 py-1.5 text-sm bg-card border-2 border-primary/30 text-primary rounded-full hover:bg-primary hover:text-primary-foreground transition-all disabled:opacity-50"
                      >
                        {option}
                      </button>
                    ))}
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
          {isSubmitting && (
            <div className="flex gap-2 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary shrink-0 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" />
              </div>
              <div className="p-3 rounded-2xl bg-secondary text-secondary-foreground rounded-bl-sm">
                Submitting your info...
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
              disabled={isSubmitting}
              className="flex-1 h-10 px-4 rounded-full border-2 border-border bg-background text-foreground focus:border-accent focus:ring-0 outline-none transition-all disabled:opacity-50"
            />
            <button
              onClick={handleSendMessage}
              disabled={isSubmitting || !inputValue.trim()}
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