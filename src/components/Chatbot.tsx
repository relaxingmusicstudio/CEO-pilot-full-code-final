import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, X, Send, User, Loader2, Check, AlertTriangle, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isSupabaseRestConfigured } from "@/lib/supabase/rest";
import { Kernel } from "@/kernel/run";
import { useToast } from "@/hooks/use-toast";
import { useVisitor } from "@/contexts/useVisitor";

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
  trade: string;
  teamSize: string;
  callVolume: string;
  aiTimeline: string;
  interests: string[];
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

type RateLimitState = {
  isRateLimited: boolean;
  retryAfterSeconds: number;
  countdownSeconds: number;
  lastErrorCode: string | null;
  lastHttpStatus: number | null;
  timestamp: number | null;
  networkRetries: number;
};

const ALEX_AVATAR = "/alex-avatar.png";
const MAX_NETWORK_RETRIES = 2;
const CHAT_AUTH_MESSAGE = "Chat is temporarily unavailable (backend not authorized).";
const AUTH_ERROR_STATUSES = new Set([401, 403]);
const AUTH_ERROR_PATTERNS = ["unauthorized", "jwt", "invalid api key", "invalid api-key"];

const getAuthStatus = (error: unknown): number | null => {
  if (!error) return null;
  if (typeof error === "number") {
    return AUTH_ERROR_STATUSES.has(error) ? error : null;
  }
  if (typeof error === "string") {
    const lowered = error.toLowerCase();
    if (AUTH_ERROR_PATTERNS.some((pattern) => lowered.includes(pattern))) {
      return 401;
    }
    return null;
  }
  if (typeof error === "object") {
    const status = (error as { status?: number }).status ?? (error as { context?: { status?: number } }).context?.status;
    if (status && AUTH_ERROR_STATUSES.has(status)) {
      return status;
    }
    const message = (error as { message?: string }).message;
    if (message) {
      const lowered = message.toLowerCase();
      if (AUTH_ERROR_PATTERNS.some((pattern) => lowered.includes(pattern))) {
        return 401;
      }
    }
  }
  return null;
};

const isAuthError = (error: unknown): boolean => getAuthStatus(error) !== null;

const logChatError = (message: string, error?: unknown) => {
  if (import.meta.env.DEV) {
    console.error(message, error);
    return;
  }
  console.warn(message);
};

const isSupabaseFunctionsConfigured = (): boolean => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!isSupabaseRestConfigured() || !url) return false;
  if (url.includes("<") || url.includes(">")) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
};

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
  
  // Rate limit state
  const [rateLimitState, setRateLimitState] = useState<RateLimitState>({
    isRateLimited: false,
    retryAfterSeconds: 0,
    countdownSeconds: 0,
    lastErrorCode: null,
    lastHttpStatus: null,
    timestamp: null,
    networkRetries: 0,
  });
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [chatAuthUnavailable, setChatAuthUnavailable] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const conversationStartRef = useRef<number>(Date.now());
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const initializeChatRef = useRef<() => void>(() => {});
  const savePartialLeadRef = useRef<() => void>(() => {});

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
        initializeChatRef.current();
      }
    }, 15000);

    const handleScroll = () => {
      if (window.scrollY > 500 && !hasAutoOpened && !isOpen) {
        setIsOpen(true);
        setHasAutoOpened(true);
        initializeChatRef.current();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [hasAutoOpened, initializeChatRef, isOpen]);

  // Inactivity timer - save data after 5 minutes
  useEffect(() => {
    const checkInactivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current > 300000 && !hasSubmitted && leadData.email) {
        savePartialLeadRef.current();
      }
    };

    inactivityTimerRef.current = setInterval(checkInactivity, 30000);
    
    return () => {
      if (inactivityTimerRef.current) {
        clearInterval(inactivityTimerRef.current);
      }
    };
  }, [hasSubmitted, leadData, savePartialLeadRef]);

  // Rate limit countdown timer - dependency on countdownSeconds to re-run when it changes
  useEffect(() => {
    if (!rateLimitState.isRateLimited || rateLimitState.countdownSeconds <= 0) {
      return;
    }

    const intervalId = setInterval(() => {
      setRateLimitState(prev => {
        const newCountdown = prev.countdownSeconds - 1;
        console.log(`[RateLimit] Countdown: ${prev.countdownSeconds} -> ${newCountdown}`);
        if (newCountdown <= 0) {
          console.log('[RateLimit] Countdown complete, re-enabling');
          return {
            ...prev,
            isRateLimited: false,
            countdownSeconds: 0,
          };
        }
        return { ...prev, countdownSeconds: newCountdown };
      });
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [rateLimitState.isRateLimited, rateLimitState.countdownSeconds]);

  // Clear network error after 5 seconds
  useEffect(() => {
    if (networkError) {
      const timeout = setTimeout(() => setNetworkError(null), 5000);
      return () => clearTimeout(timeout);
    }
  }, [networkError]);

  useEffect(() => {
    if (!isSupabaseFunctionsConfigured()) {
      setChatAuthUnavailable(true);
    }
  }, []);

  const trackActivity = () => {
    lastActivityRef.current = Date.now();
  };

  // Save conversation to database for analytics
  const saveConversation = async (
    updatedMessages: Array<{ role: string; content: string }>,
    phase: string,
    outcome?: string,
    aiAnalysis?: Record<string, unknown> | null
  ) => {
    if (chatAuthUnavailable) return;

    try {
      const visitorGHLData = getGHLData();
      const durationSeconds = Math.floor((Date.now() - conversationStartRef.current) / 1000);
      
      const saveResult = await Kernel.run("analytics.save_conversation", {
        visitorId: visitorGHLData.visitor_id || null,
        sessionId,
        messages: updatedMessages,
        leadData,
        aiAnalysis: aiAnalysis || null,
        conversationPhase: phase,
        outcome: outcome || null,
        durationSeconds,
        messageCount: updatedMessages.length,
      }, {
        consent: { analytics: true },
        budgetCents: 2,
        maxBudgetCents: 10,
      });

      if (!saveResult.ok) {
        if (saveResult.error?.code === "unauthorized") {
          setChatAuthUnavailable(true);
          return;
        }
        logChatError("Error saving conversation:", saveResult.error?.message);
        return;
      }

      const newId = (saveResult.result as { conversationId?: string } | null)?.conversationId;
      if (newId) {
        setConversationId(newId);
      }
    } catch (error) {
      logChatError("Error saving conversation:", error);
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
      logChatError("Error saving partial lead:", error);
    }
  };
  savePartialLeadRef.current = savePartialLead;

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
    if (chatAuthUnavailable) {
      return;
    }
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
  initializeChatRef.current = initializeChat;

  const logUserInput = async (content: string) => {
    if (chatAuthUnavailable) return;
    if (!isSupabaseFunctionsConfigured()) {
      setChatAuthUnavailable(true);
      return;
    }
    try {
      const { error } = await supabase.functions.invoke('user-input-logger', {
        body: {
          action: 'log_input',
          source: 'chatbot',
          input_type: 'text',
          content,
          classify: true,
          metadata: { session_id: sessionId, conversation_id: conversationId },
        },
      });
      if (error) {
        if (isAuthError(error)) {
          setChatAuthUnavailable(true);
          return;
        }
        logChatError("Failed to log chatbot input:", error);
      }
    } catch (error) {
      if (isAuthError(error)) {
        setChatAuthUnavailable(true);
        return;
      }
      logChatError("Failed to log chatbot input:", error);
    }
  };

  const sendToAlex = async (newMessages: Array<{ role: string; content: string }>): Promise<AIResponse | null> => {
    // Don't send if rate limited
    if (rateLimitState.isRateLimited || chatAuthUnavailable) {
      return null;
    }
    if (!isSupabaseFunctionsConfigured()) {
      setChatAuthUnavailable(true);
      return null;
    }

    try {
      const allMessages = [...conversationHistory, ...newMessages];
      
      // Log the user message
      const userMessage = newMessages.find(m => m.role === 'user');
      if (userMessage && userMessage.content !== 'START_CONVERSATION') {
        await logUserInput(userMessage.content);
      }
      
      const { data, error } = await supabase.functions.invoke('alex-chat', {
        body: {
          messages: allMessages,
          leadData: leadData,
        },
      });

      const authStatus = getAuthStatus(error) ?? getAuthStatus(data?.error);
      if (authStatus) {
        setChatAuthUnavailable(true);
        return null;
      }

      // Helper to detect quota/rate limit errors
      const detectQuotaError = (obj: unknown): { isQuota: boolean; retryAfter: number; code: string } => {
        if (!obj) return { isQuota: false, retryAfter: 60, code: '' };
        const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
        const isQuota = str.includes('QUOTA_EXCEEDED') || str.includes('rate_limit') || str.includes('429');
        let retryAfter = 60;
        let code = 'QUOTA_EXCEEDED';
        try {
          const parsed = typeof obj === 'string' ? JSON.parse(obj) : (obj as Record<string, unknown>);
          const retryValue = (parsed as Record<string, unknown>)?.retryAfter;
          const codeValue = (parsed as Record<string, unknown>)?.code;
          if (typeof retryValue === 'number') retryAfter = retryValue;
          if (typeof retryValue === 'string' && retryValue.trim()) {
            const parsedRetry = Number(retryValue);
            if (!Number.isNaN(parsedRetry)) retryAfter = parsedRetry;
          }
          if (typeof codeValue === 'string') code = codeValue;
        } catch { /* ignore */ }
        return { isQuota, retryAfter, code };
      };

      // Check for rate limit in data.error (200 response with error field)
      const dataQuota = detectQuotaError(data?.error);
      
      // Check for rate limit in invoke error (500 response)
      const errorQuota = detectQuotaError(error?.message || error?.context?.body || error);

      if (dataQuota.isQuota || errorQuota.isQuota) {
        const retryAfter = dataQuota.isQuota ? dataQuota.retryAfter : errorQuota.retryAfter;
        const code = dataQuota.isQuota ? dataQuota.code : errorQuota.code;
        
        console.log(`[Chatbot] Rate limit detected: code=${code}, retryAfter=${retryAfter}s`);
        
        setRateLimitState({
          isRateLimited: true,
          retryAfterSeconds: retryAfter,
          countdownSeconds: retryAfter,
          lastErrorCode: code,
          lastHttpStatus: 429,
          timestamp: Date.now(),
          networkRetries: 0,
        });
        
        toast({
          title: "Rate limit reached",
          description: `Too many requests. Please wait ${retryAfter} seconds.`,
          variant: "destructive",
        });
        
        // Return the fallback response from the server if available
        if (data?.text) {
          return data as AIResponse;
        }
        return null;
      }

      // Non-quota error from invoke
      if (error) {
        throw error;
      }
      
      // Reset network retries on success
      setRateLimitState(prev => ({ ...prev, networkRetries: 0 }));
      setNetworkError(null);
      
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
    } catch (error: unknown) {
      if (isAuthError(error)) {
        setChatAuthUnavailable(true);
        return null;
      }
      logChatError("Error calling alex-chat:", error);
      
      // Handle network errors (Failed to fetch)
      const errorMessage = (error as { message?: string })?.message ?? String(error);
      const isNetworkError = errorMessage.includes('Failed to fetch') || 
                             errorMessage.includes('NetworkError') ||
                             errorMessage.includes('network');
      
      if (isNetworkError) {
        const currentRetries = rateLimitState.networkRetries;
        if (currentRetries < MAX_NETWORK_RETRIES) {
          setRateLimitState(prev => ({ 
            ...prev, 
            networkRetries: prev.networkRetries + 1,
            lastErrorCode: 'NETWORK_ERROR',
            lastHttpStatus: 0,
            timestamp: Date.now(),
          }));
          setNetworkError(`Network error. Check connection. (Retry ${currentRetries + 1}/${MAX_NETWORK_RETRIES})`);
        } else {
          setNetworkError("Network error. Max retries reached. Please check your connection.");
          setRateLimitState(prev => ({
            ...prev,
            lastErrorCode: 'MAX_RETRIES_EXCEEDED',
            lastHttpStatus: 0,
            timestamp: Date.now(),
          }));
        }
      } else {
        setRateLimitState(prev => ({
          ...prev,
          lastErrorCode: 'UNKNOWN_ERROR',
          lastHttpStatus: null,
          timestamp: Date.now(),
        }));
      }
      
      return null;
    }
  };

  const updateLeadData = (extractedData: Record<string, string | number | string[]> | null) => {
    if (!extractedData) return;
    
    setLeadData(prev => {
      const updated = { ...prev };
      
      Object.entries(extractedData).forEach(([key, value]) => {
        if (Object.prototype.hasOwnProperty.call(updated, key)) {
          const typedKey = key as keyof LeadData;
          updated[typedKey] = value as LeadData[keyof LeadData];
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
    if (chatAuthUnavailable) return;
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
    if (!inputValue.trim() || isSubmitting || isTyping || chatAuthUnavailable) return;
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
        logChatError("AI analysis failed, continuing without:", analysisErr);
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
      logChatError("Error submitting lead:", error);
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

  const isChatDisabled = chatAuthUnavailable || isSubmitting || isTyping || rateLimitState.isRateLimited;

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

        {chatAuthUnavailable && (
          <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">{CHAT_AUTH_MESSAGE}</span>
            </div>
          </div>
        )}

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
                          disabled={isChatDisabled}
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

        {/* Rate Limit Banner */}
        {rateLimitState.isRateLimited && (
          <div className="px-4 py-2 bg-amber-500/10 border-t border-amber-500/30">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">
                Rate limit hit. Retry in {rateLimitState.countdownSeconds}s
              </span>
            </div>
          </div>
        )}

        {/* Network Error Banner */}
        {networkError && !rateLimitState.isRateLimited && (
          <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/30">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <WifiOff className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">{networkError}</span>
            </div>
          </div>
        )}

        {/* Dev Diagnostics (only in dev mode) */}
        {import.meta.env.DEV && rateLimitState.lastErrorCode && (
          <div className="px-4 py-1 bg-muted/50 border-t border-border text-xs font-mono text-muted-foreground">
            <div className="flex flex-wrap gap-2">
              <span>err: {rateLimitState.lastErrorCode}</span>
              <span>status: {rateLimitState.lastHttpStatus ?? 'n/a'}</span>
              <span>retry: {rateLimitState.retryAfterSeconds}s</span>
              <span>ts: {rateLimitState.timestamp ? new Date(rateLimitState.timestamp).toLocaleTimeString() : 'n/a'}</span>
            </div>
          </div>
        )}

        {/* Dev-only: Simulate 429 button for testing */}
        {import.meta.env.DEV && !rateLimitState.isRateLimited && (
          <div className="px-4 py-1 bg-blue-500/10 border-t border-blue-500/30">
            <button
              onClick={() => {
                console.log('[DEV] Simulating 429 rate limit');
                setRateLimitState({
                  isRateLimited: true,
                  retryAfterSeconds: 10,
                  countdownSeconds: 10,
                  lastErrorCode: 'SIMULATED_429',
                  lastHttpStatus: 429,
                  timestamp: Date.now(),
                  networkRetries: 0,
                });
                toast({
                  title: "[DEV] Simulated Rate Limit",
                  description: "Rate limit triggered for testing. Wait 10s.",
                  variant: "destructive",
                });
              }}
              className="text-xs text-blue-600 dark:text-blue-400 underline"
            >
              [DEV] Simulate 429
            </button>
          </div>
        )}

        {/* Input area */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={(e) => e.key === "Enter" && !isChatDisabled && handleSendMessage()}
              placeholder={
                chatAuthUnavailable
                  ? "Chat unavailable"
                  : rateLimitState.isRateLimited 
                  ? `Wait ${rateLimitState.countdownSeconds}s...` 
                  : isPhoneInputPhase() 
                    ? "XXX-XXX-XXXX" 
                    : "Type a message..."
              }
              disabled={isChatDisabled}
              className="flex-1 h-10 px-4 rounded-full border-2 border-border bg-background text-foreground focus:border-accent focus:ring-0 outline-none transition-all disabled:opacity-50"
            />
            <button
              onClick={handleSendMessage}
              disabled={isChatDisabled || !inputValue.trim()}
              className="w-10 h-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center hover:bg-accent/90 transition-colors disabled:opacity-50"
              title={
                chatAuthUnavailable
                  ? "Chat unavailable"
                  : rateLimitState.isRateLimited
                  ? `Rate limited - wait ${rateLimitState.countdownSeconds}s`
                  : "Send message"
              }
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
