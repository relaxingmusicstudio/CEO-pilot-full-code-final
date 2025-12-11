import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle, X, Send, Bot, User } from "lucide-react";

type Message = {
  id: number;
  sender: "bot" | "user";
  text: string;
  options?: string[];
};

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");

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
        text: "Hi there! 👋 I'm here to help you learn how ApexLocal360 can stop your missed calls. Quick question: Are you a solo plumber or do you have a team?",
        options: ["Solo plumber", "I have a team"],
      },
    ]);
  };

  const handleOpen = () => {
    setIsOpen(true);
    if (messages.length === 0) {
      initializeChat();
    }
  };

  const handleOptionClick = (option: string) => {
    const userMessage: Message = {
      id: messages.length + 1,
      sender: "user",
      text: option,
    };

    setMessages((prev) => [...prev, userMessage]);

    setTimeout(() => {
      let botResponse: Message;

      if (option === "Solo plumber") {
        botResponse = {
          id: messages.length + 2,
          sender: "bot",
          text: "Perfect! Our Starter Plan at $497/mo gives you a 24/7 dispatcher to never miss a job. Want to hear a quick demo or see the details?",
          options: ["Hear Demo", "See Starter Plan", "Send me pricing PDF"],
        };
      } else if (option === "I have a team") {
        botResponse = {
          id: messages.length + 2,
          sender: "bot",
          text: "Great! For teams, our Professional Plan ($997/mo) adds upsells and a 'Closer' agent to follow up on big quotes. Want to calculate your revenue loss or see the full feature list?",
          options: ["Calculate Loss", "See Pro Plan", "Send me pricing PDF"],
        };
      } else if (option === "Hear Demo" || option === "See Starter Plan" || option === "See Pro Plan") {
        const sectionId = option === "Hear Demo" ? "demo" : "pricing";
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
        botResponse = {
          id: messages.length + 2,
          sender: "bot",
          text: "I've scrolled you to that section! Let me know if you have any questions. 😊",
          options: ["I have a question", "Thanks!"],
        };
      } else if (option === "Calculate Loss") {
        document.getElementById("calculator")?.scrollIntoView({ behavior: "smooth" });
        botResponse = {
          id: messages.length + 2,
          sender: "bot",
          text: "Check out our calculator above! It shows exactly how much you're losing from missed calls. 📊",
          options: ["Show me plans", "I have a question"],
        };
      } else if (option === "Send me pricing PDF") {
        botResponse = {
          id: messages.length + 2,
          sender: "bot",
          text: "I'd love to send you our pricing PDF! What's the best email to reach you?",
        };
      } else if (option === "Show me plans") {
        document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
        botResponse = {
          id: messages.length + 2,
          sender: "bot",
          text: "Here are our plans! Both come with a 30-day ROI guarantee. 🚀",
          options: ["I have a question", "Thanks!"],
        };
      } else {
        botResponse = {
          id: messages.length + 2,
          sender: "bot",
          text: "I'm here to help! What would you like to know about ApexLocal360?",
          options: ["How does it work?", "Show me pricing", "Hear a demo"],
        };
      }

      setMessages((prev) => [...prev, botResponse]);
    }, 800);
  };

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: messages.length + 1,
      sender: "user",
      text: inputValue,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");

    setTimeout(() => {
      const botResponse: Message = {
        id: messages.length + 2,
        sender: "bot",
        text: "Thanks for your message! For detailed questions, I'd recommend checking out our demo or pricing sections. Is there something specific I can help with?",
        options: ["Hear Demo", "See pricing", "How does it work?"],
      };
      setMessages((prev) => [...prev, botResponse]);
    }, 1000);
  };

  return (
    <>
      {/* Chat Button */}
      <button
        onClick={handleOpen}
        className={`fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full bg-accent text-accent-foreground shadow-xl hover:shadow-2xl transition-all duration-300 flex items-center justify-center group ${
          isOpen ? "scale-0" : "scale-100"
        }`}
      >
        <MessageCircle className="w-7 h-7 group-hover:scale-110 transition-transform" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full animate-pulse" />
      </button>

      {/* Chat Window */}
      <div
        className={`fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] bg-card rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden ${
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
                        className="px-3 py-1.5 text-sm bg-card border-2 border-primary/30 text-primary rounded-full hover:bg-primary hover:text-primary-foreground transition-all"
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
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Type a message..."
              className="flex-1 h-10 px-4 rounded-full border-2 border-border bg-background text-foreground focus:border-accent focus:ring-0 outline-none transition-all"
            />
            <button
              onClick={handleSendMessage}
              className="w-10 h-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center hover:bg-accent/90 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Chatbot;
