import { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Send, User, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useVisitor } from "@/contexts/VisitorContext";

type Message = {
  id: number;
  sender: "bot" | "user";
  text: string;
  options?: string[];
  multiSelect?: boolean;
};

type LeadData = {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  // Match form fields exactly
  trade: string;           // businessType in form
  teamSize: string;        // Solo, 2-5, 6-10, 10+ trucks
  callVolume: string;      // <50, 50-100, 100-200, 200+
  aiTimeline: string;      // Within 3 months, 3-6 months, etc.
  interests: string[];     // Multi-select array
  // Calculated fields
  potentialLoss: number;
  conversationPhase: string;
  isQualified: boolean;
  notes: string[];
};

type AIResponse = {
  text: string;
  suggestedActions: string[] | null;
  extractedData: Record<string, string | number | string[]> | null;
  conversationPhase: string;
  error?: string;
};

const ALEX_AVATAR = "/alex-avatar.png";

const Chatbot = () => {
  const { toast } = useToast();
  const { trackChatbotOpen, trackChatbotEngage, getGHLData } = useVisitor();
  const [isOpen, setIsOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [leadData, setLeadData] = useState<LeadData>({
    name: "",
    businessName: "",
    email: "",
    phone: "",
    trade: "",
    teamSize: "",
    callVolume: "",
    aiTimeline: "",
    interests: [],
    potentialLoss: 0,
    conversationPhase: "opener",
    isQualified: false,
    notes: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const conversationStartRef = useRef<number>(Date.now());
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Auto-open after 15s or 500px scroll
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

  // Inactivity timer - save data after 5 minutes
  useEffect(() => {
    const checkInactivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current > 300000 && !hasSubmitted && leadData.email) {
        savePartialLead();
      }
    };

    inactivityTimerRef.current = setInterval(checkInactivity, 30000);
    
    return () => {
      if (inactivityTimerRef.current) {
        clearInterval(inactivityTimerRef.current);
      }
    };
  }, [hasSubmitted, leadData]);

  const trackActivity = () => {
    lastActivityRef.current = Date.now();
  };

  // Save conversation to database for analytics
  const saveConversation = async (
    updatedMessages: Array<{ role: string; content: string }>,
    phase: string,
    outcome?: string,
    aiAnalysis?: any
  ) => {
    try {
      const visitorGHLData = getGHLData();
      const durationSeconds = Math.floor((Date.now() - conversationStartRef.current) / 1000);
      
      const conversationData = {
        visitor_id: visitorGHLData.visitor_id || null,
        session_id: sessionId,
        messages: updatedMessages,
        lead_data: leadData,
        ai_analysis: aiAnalysis || null,
        conversation_phase: phase,
        outcome: outcome || null,
        duration_seconds: durationSeconds,
        message_count: updatedMessages.length,
        updated_at: new Date().toISOString(),
      };

      if (conversationId) {
        // Update existing conversation
        await supabase
          .from('conversations')
          .update(conversationData)
          .eq('id', conversationId);
      } else {
        // Create new conversation
        const { data, error } = await supabase
          .from('conversations')
          .insert({
            ...conversationData,
            created_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        
        if (!error && data) {
          setConversationId(data.id);
        }
      }
    } catch (error) {
      console.error("Error saving conversation:", error);
    }
  };

  const savePartialLead = async () => {
    if (hasSubmitted || !leadData.email) return;
    
    setHasSubmitted(true);
    try {
      const qualificationNotes = `
=== PARTIAL CAPTURE (Chat closed/timeout) ===
Name: ${leadData.name}
Business: ${leadData.businessName}
Trade: ${leadData.trade}
Team Size: ${leadData.teamSize}
Monthly Call Volume: ${leadData.callVolume}
Timeline: ${leadData.aiTimeline}
Interests: ${leadData.interests.join(", ")}
Potential Monthly Loss: $${leadData.potentialLoss}
Phase: ${leadData.conversationPhase}`;

      await supabase.functions.invoke('contact-form', {
        body: {
          name: leadData.name,
          email: leadData.email,
          phone: leadData.phone,
          message: qualificationNotes,
          businessType: leadData.trade,
          businessTypeOther: leadData.businessName,
          teamSize: leadData.teamSize,
          callVolume: leadData.callVolume,
          aiTimeline: leadData.aiTimeline,
          interests: leadData.interests,
          isGoodFit: leadData.isQualified,
          fitReason: "Partial_Capture",
          notes: leadData.notes.join(" | "),
        },
      });
    } catch (error) {
      console.error("Error saving partial lead:", error);
    }
  };

  const handleClose = () => {
    if (!hasSubmitted && leadData.email) {
      savePartialLead();
    }
    setIsOpen(false);
  };

  const addBotMessage = (text: string, options?: string[], multiSelect?: boolean) => {
    const newMessage: Message = {
      id: Date.now(),
      sender: "bot",
      text,
      options,
      multiSelect,
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  const addUserMessage = (text: string) => {
    setMessages((prev) => [...prev, {
      id: Date.now(),
      sender: "user",
      text,
    }]);
  };

  // Add a human-like typing delay (1-2 seconds)
  const addTypingDelay = () => new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

  const initializeChat = async () => {
    setMessages([]);
    setConversationHistory([]);
    setIsTyping(true);
    
    // Send initial message to AI
    try {
      const response = await sendToAlex([
        { role: "user", content: "START_CONVERSATION" }
      ]);
      
      // Add human-like delay before showing response
      await addTypingDelay();
      setIsTyping(false);
      
      if (response) {
        addBotMessage(response.text, response.suggestedActions || ["Sure, go ahead", "Just looking"]);
        if (response.conversationPhase) {
          setLeadData(prev => ({ ...prev, conversationPhase: response.conversationPhase }));
        }
      }
    } catch (error) {
      setIsTyping(false);
      addBotMessage(
        "Hi there! I'm Alex with ApexLocal360. We help trade business owners stop losing $1,200 calls to voicemail. Mind if I ask a few quick questions to see if our 24/7 AI dispatcher is a fit?",
        ["Sure, go ahead", "Just looking"]
      );
    }
  };

  const sendToAlex = async (newMessages: Array<{ role: string; content: string }>): Promise<AIResponse | null> => {
    try {
      const allMessages = [...conversationHistory, ...newMessages];
      
      const { data, error } = await supabase.functions.invoke('alex-chat', {
        body: {
          messages: allMessages,
          leadData: leadData,
        },
      });

      if (error) throw error;
      
      // Update conversation history
      setConversationHistory(allMessages);
      
      // Add assistant response to history for persistence
      const responseData = data as AIResponse;
      const updatedHistory = [...allMessages, { role: 'assistant', content: responseData.text }];
      
      // Save conversation to database
      await saveConversation(
        updatedHistory,
        responseData.conversationPhase || 'diagnostic',
        responseData.conversationPhase === 'complete' ? 'completed' : undefined
      );
      
      return responseData;
    } catch (error) {
      console.error("Error calling alex-chat:", error);
      return null;
    }
  };

  const updateLeadData = (extractedData: Record<string, string | number | string[]> | null) => {
    if (!extractedData) return;
    
    setLeadData(prev => {
      const updated = { ...prev };
      
      Object.entries(extractedData).forEach(([key, value]) => {
        if (key in updated) {
          (updated as any)[key] = value;
        }
      });
      
      // Calculate potential loss based on call volume
      if (updated.callVolume) {
        const lossMap: Record<string, number> = {
          "<50": 4000,
          "50-100": 8000,
          "100-200": 16000,
          "200+": 32000
        };
        updated.potentialLoss = lossMap[updated.callVolume] || 0;
      }
      
      return updated;
    });
  };

  const handleOptionClick = async (option: string) => {
    trackActivity();
    
    const lastMessage = messages[messages.length - 1];
    
    // Handle multi-select - only toggle if NOT clicking Done
    if (lastMessage?.multiSelect && option !== "Done") {
      setSelectedOptions(prev =>
        prev.includes(option) ? prev.filter(i => i !== option) : [...prev, option]
      );
      return;
    }
    
    // Determine what to send to AI
    let userContent = option;
    let displayMessage = option;
    
    // If Done on multi-select, send the selected options
    if (option === "Done" && lastMessage?.multiSelect) {
      const selections = selectedOptions.length > 0 ? selectedOptions.join(", ") : "None selected";
      userContent = selections;
      displayMessage = selections;
      setSelectedOptions([]);
    }
    
    addUserMessage(displayMessage);
    setIsTyping(true);
    
    try {
      const response = await sendToAlex([
        { role: "assistant", content: lastMessage?.text || "" },
        { role: "user", content: userContent }
      ]);
      
      // Add human-like delay before showing response
      await addTypingDelay();
      setIsTyping(false);
      
      if (response) {
        updateLeadData(response.extractedData);
        addBotMessage(response.text, response.suggestedActions || undefined);
        
        if (response.conversationPhase) {
          setLeadData(prev => ({ ...prev, conversationPhase: response.conversationPhase }));
        }
        
        // Check if we've completed contact capture
        if (response.conversationPhase === "complete" && leadData.email) {
          await submitLead();
        }
      }
    } catch (error) {
      setIsTyping(false);
      addBotMessage("I'm having a moment—give me a sec and try again!", ["Try again"]);
    }
  };

  // Format phone number as XXX-XXX-XXXX
  const formatPhoneNumber = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  // Check if we're in phone collection phase - only during contact_capture, not post-completion
  const isPhoneInputPhase = (): boolean => {
    // Only format as phone during contact_capture phase
    if (leadData.conversationPhase !== "contact_capture" && leadData.conversationPhase !== "diagnostic") {
      return false;
    }
    const lastBotMessage = messages.filter(m => m.sender === "bot").pop();
    if (!lastBotMessage) return false;
    const text = lastBotMessage.text.toLowerCase();
    // Only trigger for initial contact phone number questions
    const isAskingForContactPhone = (text.includes("number to reach") || text.includes("best number")) && !text.includes("still the best");
    return isAskingForContactPhone;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (isPhoneInputPhase()) {
      value = formatPhoneNumber(value);
    }
    setInputValue(value);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isSubmitting || isTyping) return;
    trackActivity();
    trackChatbotEngage();

    const value = inputValue.trim();
    addUserMessage(value);
    setInputValue("");
    
    // Add to conversation history
    const lastBotMessage = messages.filter(m => m.sender === "bot").pop();
    
    setIsTyping(true);
    
    try {
      const response = await sendToAlex([
        { role: "assistant", content: lastBotMessage?.text || "" },
        { role: "user", content: value }
      ]);
      
      // Add human-like delay before showing response
      await addTypingDelay();
      setIsTyping(false);
      
      if (response) {
        updateLeadData(response.extractedData);
        addBotMessage(response.text, response.suggestedActions || undefined);
        
        if (response.conversationPhase) {
          setLeadData(prev => ({ ...prev, conversationPhase: response.conversationPhase }));
        }
        
        // Check if we've completed contact capture
        if (response.conversationPhase === "complete" && leadData.email) {
          await submitLead();
        }
      }
    } catch (error) {
      setIsTyping(false);
      addBotMessage("I'm having a moment—give me a sec and try again!", ["Try again"]);
    }
  };

  const submitLead = async () => {
    if (hasSubmitted) return;
    
    setIsSubmitting(true);
    
    // Get visitor intelligence data first (only get once)
    const visitorGHLData = getGHLData();
    
    try {
      // First, analyze the lead with AI including behavioral data
      console.log("Analyzing lead with AI + behavioral data...");
      let aiAnalysis = null;
      
      try {
        const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-lead', {
          body: {
            conversationHistory: conversationHistory,
            leadData: leadData,
            visitorData: {
              visitorId: visitorGHLData.visitor_id,
              isReturningVisitor: visitorGHLData.is_returning_visitor === 'YES',
              visitCount: parseInt(visitorGHLData.visit_count) || 1,
              firstVisitAt: visitorGHLData.first_visit_date,
              utmSource: visitorGHLData.utm_source,
              utmMedium: visitorGHLData.utm_medium,
              utmCampaign: visitorGHLData.utm_campaign,
              referrer: visitorGHLData.referrer_source,
              engagementScore: parseInt(visitorGHLData.engagement_score) || 0,
              behavioralIntent: visitorGHLData.behavioral_intent,
              scrollDepth: parseInt(visitorGHLData.scroll_depth) || 0,
              timeOnPage: visitorGHLData.time_on_site,
              pagesViewed: visitorGHLData.pages_viewed?.split(', ')?.length || 1,
              calculatorUsed: visitorGHLData.calculator_used === 'YES',
              demoWatched: visitorGHLData.demo_watched === 'YES',
              demoWatchTime: parseInt(visitorGHLData.demo_watch_time) || 0,
              chatbotEngaged: visitorGHLData.chatbot_engaged === 'YES',
              ctaClicks: visitorGHLData.cta_clicks?.split(', ').filter(Boolean) || [],
              sectionsViewed: visitorGHLData.sections_viewed?.split(', ').filter(Boolean) || [],
              interestSignals: visitorGHLData.interest_signals?.split(', ').filter(Boolean) || [],
            },
          },
        });
        
        if (!analysisError && analysisData) {
          aiAnalysis = analysisData;
          console.log("AI Analysis complete:", aiAnalysis);
        }
      } catch (analysisErr) {
        console.error("AI analysis failed, continuing without:", analysisErr);
      }

      const qualificationNotes = `
=== QUALIFIED LEAD (Chatbot) ===
Name: ${leadData.name}
Business: ${leadData.businessName}
Trade: ${leadData.trade}
Team Size: ${leadData.teamSize}
Monthly Call Volume: ${leadData.callVolume}
Timeline: ${leadData.aiTimeline}
Interests: ${leadData.interests.join(", ")}
Potential Monthly Loss: $${leadData.potentialLoss}
Potential Annual Loss: $${leadData.potentialLoss * 12}

=== AI ANALYSIS (Enhanced with Behavioral Data) ===
Lead Score: ${aiAnalysis?.lead_score || 'N/A'}/100
Temperature: ${aiAnalysis?.lead_temperature?.toUpperCase() || 'N/A'}
Intent: ${aiAnalysis?.lead_intent || 'N/A'}
Conversion Probability: ${aiAnalysis?.conversion_probability || 'N/A'}%
Urgency: ${aiAnalysis?.urgency_level?.toUpperCase() || 'N/A'}
Traffic Quality: ${aiAnalysis?.traffic_quality?.toUpperCase() || 'N/A'}
Engagement Level: ${aiAnalysis?.engagement_level || 'N/A'}

BANTE Breakdown (Budget/Authority/Need/Timeline/Engagement):
- Budget: ${aiAnalysis?.qualification_breakdown?.budget_score || 'N/A'}/20
- Authority: ${aiAnalysis?.qualification_breakdown?.authority_score || 'N/A'}/15
- Need: ${aiAnalysis?.qualification_breakdown?.need_score || 'N/A'}/20
- Timeline: ${aiAnalysis?.qualification_breakdown?.timeline_score || 'N/A'}/20
- Engagement: ${aiAnalysis?.qualification_breakdown?.engagement_score || 'N/A'}/25

Buying Signals (Conversation + Behavior): ${aiAnalysis?.buying_signals?.join(', ') || 'None detected'}
Behavioral Insights: ${aiAnalysis?.behavioral_insights?.join(', ') || 'None'}
Objections: ${aiAnalysis?.objections_raised?.join(', ') || 'None'}
Recommended Followup: ${aiAnalysis?.recommended_followup || 'Standard sequence'}
Summary: ${aiAnalysis?.conversation_summary || 'N/A'}

=== VISITOR BEHAVIORAL DATA ===
Returning Visitor: ${visitorGHLData.is_returning_visitor}
Visit Count: ${visitorGHLData.visit_count}
Engagement Score: ${visitorGHLData.engagement_score}/100
Calculator Used: ${visitorGHLData.calculator_used}
Demo Watched: ${visitorGHLData.demo_watched}
CTA Clicks: ${visitorGHLData.cta_clicks}
Traffic Source: ${visitorGHLData.utm_source || visitorGHLData.referrer_source || 'Direct'}`;

      await supabase.functions.invoke('contact-form', {
        body: {
          name: leadData.name,
          email: leadData.email,
          phone: leadData.phone,
          message: qualificationNotes,
          businessType: leadData.trade,
          businessTypeOther: leadData.businessName,
          businessName: leadData.businessName,
          teamSize: leadData.teamSize,
          callVolume: leadData.callVolume,
          aiTimeline: leadData.aiTimeline,
          interests: leadData.interests,
          potentialLoss: String(leadData.potentialLoss),
          isGoodFit: true,
          fitReason: "Chatbot_Qualified",
          notes: leadData.notes.join(" | "),
          formName: "Chatbot - Alex (AI Scored)",
          // AI Analysis fields
          aiLeadScore: aiAnalysis?.lead_score,
          aiLeadTemperature: aiAnalysis?.lead_temperature,
          aiLeadIntent: aiAnalysis?.lead_intent,
          aiConversionProbability: aiAnalysis?.conversion_probability,
          aiUrgencyLevel: aiAnalysis?.urgency_level,
          aiBuyingSignals: aiAnalysis?.buying_signals,
          aiObjectionsRaised: aiAnalysis?.objections_raised,
          aiRecommendedFollowup: aiAnalysis?.recommended_followup,
          aiConversationSummary: aiAnalysis?.conversation_summary,
          aiKeyInsights: aiAnalysis?.key_insights,
          aiBudgetScore: aiAnalysis?.qualification_breakdown?.budget_score,
          aiAuthorityScore: aiAnalysis?.qualification_breakdown?.authority_score,
          aiNeedScore: aiAnalysis?.qualification_breakdown?.need_score,
          aiTimelineScore: aiAnalysis?.qualification_breakdown?.timeline_score,
          // Visitor Intelligence fields
          visitorId: visitorGHLData.visitor_id,
          isReturningVisitor: visitorGHLData.is_returning_visitor,
          visitCount: visitorGHLData.visit_count,
          firstVisitDate: visitorGHLData.first_visit_date,
          lastVisitDate: visitorGHLData.last_visit_date,
          utmSource: visitorGHLData.utm_source,
          utmMedium: visitorGHLData.utm_medium,
          utmCampaign: visitorGHLData.utm_campaign,
          utmContent: visitorGHLData.utm_content,
          utmTerm: visitorGHLData.utm_term,
          referrerSource: visitorGHLData.referrer_source,
          landingPage: visitorGHLData.landing_page,
          entryPage: visitorGHLData.entry_page,
          deviceType: visitorGHLData.device_type,
          browser: visitorGHLData.browser,
          pagesViewed: visitorGHLData.pages_viewed,
          sectionsViewed: visitorGHLData.sections_viewed,
          ctaClicks: visitorGHLData.cta_clicks,
          calculatorUsed: visitorGHLData.calculator_used,
          demoWatched: visitorGHLData.demo_watched,
          demoWatchTime: visitorGHLData.demo_watch_time,
          scrollDepth: visitorGHLData.scroll_depth,
          timeOnSite: visitorGHLData.time_on_site,
          chatbotOpened: visitorGHLData.chatbot_opened,
          chatbotEngaged: visitorGHLData.chatbot_engaged,
          engagementScore: visitorGHLData.engagement_score,
          interestSignals: visitorGHLData.interest_signals,
          behavioralIntent: visitorGHLData.behavioral_intent,
          // New AI behavioral analysis fields
          aiEngagementLevel: aiAnalysis?.engagement_level,
          aiTrafficQuality: aiAnalysis?.traffic_quality,
          aiBehavioralInsights: aiAnalysis?.behavioral_insights,
          aiEngagementScore: aiAnalysis?.qualification_breakdown?.engagement_score,
        },
      });

      setHasSubmitted(true);
      setLeadData(prev => ({ ...prev, isQualified: true }));
      
      toast({ 
        title: "Success!", 
        description: `Lead scored at ${aiAnalysis?.lead_score || 'N/A'}/100 - ${aiAnalysis?.lead_temperature || 'warm'} lead!`,
      });
    } catch (error) {
      console.error("Error submitting lead:", error);
      toast({ title: "Oops!", description: "Something went wrong.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    trackChatbotOpen();
    if (messages.length === 0) {
      initializeChat();
    }
  };

  return (
    <>
      {/* Floating chat button */}
      <button
        onClick={handleOpen}
        className={`fixed bottom-24 right-6 z-50 w-16 h-16 rounded-full bg-accent text-accent-foreground shadow-xl hover:shadow-2xl transition-all duration-300 flex items-center justify-center group ${
          isOpen ? "scale-0" : "scale-100"
        }`}
      >
        <MessageCircle className="w-7 h-7 group-hover:scale-110 transition-transform" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full animate-pulse" />
      </button>

      {/* Chat window */}
      <div
        className={`fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] bg-card rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden ${
          isOpen ? "scale-100 opacity-100" : "scale-0 opacity-0"
        }`}
      >
        {/* Header with Alex avatar */}
        <div className="bg-primary p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-accent">
              <img 
                src={ALEX_AVATAR} 
                alt="Alex" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback to initials if image fails
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement!.innerHTML = '<span class="w-full h-full flex items-center justify-center text-accent-foreground font-semibold">A</span>';
                }}
              />
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
            onClick={handleClose}
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
                <div className="w-8 h-8 rounded-full overflow-hidden bg-primary shrink-0">
                  <img 
                    src={ALEX_AVATAR} 
                    alt="Alex" 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).parentElement!.innerHTML = '<span class="w-full h-full flex items-center justify-center text-primary-foreground font-semibold text-xs">A</span>';
                    }}
                  />
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
                      const isSelected = message.multiSelect && selectedOptions.includes(option);
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
              <div className="w-8 h-8 rounded-full overflow-hidden bg-primary shrink-0">
                <img 
                  src={ALEX_AVATAR} 
                  alt="Alex" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.innerHTML = '<span class="w-full h-full flex items-center justify-center text-primary-foreground font-semibold text-xs">A</span>';
                  }}
                />
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

          {/* Submitting indicator */}
          {isSubmitting && (
            <div className="flex gap-2 justify-start">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-primary shrink-0 flex items-center justify-center">
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

        {/* Input area */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder={isPhoneInputPhase() ? "XXX-XXX-XXXX" : "Type a message..."}
              disabled={isSubmitting || isTyping}
              className="flex-1 h-10 px-4 rounded-full border-2 border-border bg-background text-foreground focus:border-accent focus:ring-0 outline-none transition-all disabled:opacity-50"
            />
            <button
              onClick={handleSendMessage}
              disabled={isSubmitting || isTyping || !inputValue.trim()}
              className="w-10 h-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center hover:bg-accent/90 transition-colors disabled:opacity-50"
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
