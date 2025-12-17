import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat } from "../_shared/ai.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const GHL_WEBHOOK_URL = Deno.env.get("GHL_WEBHOOK_URL");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation helpers
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

function isValidPhone(phone: string): boolean {
  // Allow empty or valid phone format
  if (!phone) return true;
  const phoneRegex = /^[\d\s\-\+\(\)]{7,20}$/;
  return phoneRegex.test(phone);
}

function sanitizeString(str: string | undefined, maxLength: number = 500): string {
  if (!str) return "";
  return str.trim().slice(0, maxLength);
}

interface ContactFormRequest {
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  message: string;
  phone?: string;
  businessName?: string;
  businessType?: string;
  businessTypeOther?: string;
  teamSize?: string;
  callVolume?: string;
  currentSolution?: string;
  avgJobValue?: string;
  missedCalls?: string;
  potentialLoss?: string;
  notes?: string;
  isGoodFit?: boolean;
  fitReason?: string;
  biggestChallenge?: string;
  monthlyAdSpend?: string;
  aiTimeline?: string;
  interests?: string[];
  formName?: string;
  website?: string;
  // Address fields
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  // Business/lead fields
  businessOverview?: string;
  callRoutingHours?: string;
  contactType?: string;
  // Payment/Stripe fields
  amountPaid?: string;
  downloadDate?: string;
  plan?: string;
  stripeSessionId?: string;
  paymentDate?: string;
  // AI Analysis fields
  aiLeadScore?: number;
  aiLeadTemperature?: string;
  aiLeadIntent?: string;
  aiConversionProbability?: number;
  aiUrgencyLevel?: string;
  aiBuyingSignals?: string[];
  aiObjectionsRaised?: string[];
  aiRecommendedFollowup?: string;
  aiConversationSummary?: string;
  aiKeyInsights?: string[];
  aiBudgetScore?: number;
  aiAuthorityScore?: number;
  aiNeedScore?: number;
  aiTimelineScore?: number;
  // Visitor Intelligence fields
  visitorId?: string;
  isReturningVisitor?: string;
  visitCount?: string;
  firstVisitDate?: string;
  lastVisitDate?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrerSource?: string;
  landingPage?: string;
  entryPage?: string;
  deviceType?: string;
  browser?: string;
  pagesViewed?: string;
  sectionsViewed?: string;
  ctaClicks?: string;
  calculatorUsed?: string;
  demoWatched?: string;
  demoWatchTime?: string;
  scrollDepth?: string;
  timeOnSite?: string;
  chatbotOpened?: string;
  chatbotEngaged?: string;
  engagementScore?: string;
  interestSignals?: string;
  behavioralIntent?: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Contact form function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: ContactFormRequest = await req.json();
    
    // Validate required fields
    const name = sanitizeString(requestData.name, 100);
    const email = sanitizeString(requestData.email, 255);
    const message = sanitizeString(requestData.message, 2000);
    
    if (!name || name.length < 1) {
      return new Response(
        JSON.stringify({ error: "Name is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    if (!email || !isValidEmail(email)) {
      return new Response(
        JSON.stringify({ error: "Valid email is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    // Message is optional - don't require it
    
    // Validate optional phone
    const phone = sanitizeString(requestData.phone, 20);
    if (phone && !isValidPhone(phone)) {
      return new Response(
        JSON.stringify({ error: "Invalid phone format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    // Sanitize other fields
    const businessName = sanitizeString(requestData.businessName, 100);
    const businessType = sanitizeString(requestData.businessType, 50);
    const businessTypeOther = sanitizeString(requestData.businessTypeOther, 100);
    const teamSize = sanitizeString(requestData.teamSize, 20);
    const callVolume = sanitizeString(requestData.callVolume, 20);
    const currentSolution = sanitizeString(requestData.currentSolution, 200);
    const avgJobValue = sanitizeString(requestData.avgJobValue, 20);
    const missedCalls = sanitizeString(requestData.missedCalls, 20);
    const potentialLoss = sanitizeString(requestData.potentialLoss, 20);
    const notes = sanitizeString(requestData.notes, 1000);
    const isGoodFit = requestData.isGoodFit;
    const fitReason = sanitizeString(requestData.fitReason, 200);
    const aiTimeline = sanitizeString(requestData.aiTimeline, 50);
    
    // NEW: Address fields
    const streetAddress = sanitizeString(requestData.streetAddress, 200);
    const city = sanitizeString(requestData.city, 100);
    const state = sanitizeString(requestData.state, 50);
    const postalCode = sanitizeString(requestData.postalCode, 20);
    const country = sanitizeString(requestData.country, 100);
    
    // NEW: Business/lead fields
    const businessOverview = sanitizeString(requestData.businessOverview, 500);
    const callRoutingHours = sanitizeString(requestData.callRoutingHours, 200);
    
    // Payment/Stripe fields
    const amountPaid = sanitizeString(requestData.amountPaid, 20);
    const downloadDate = sanitizeString(requestData.downloadDate, 50);
    const plan = sanitizeString(requestData.plan, 50);
    const stripeSessionId = sanitizeString(requestData.stripeSessionId, 100);
    const paymentDate = sanitizeString(requestData.paymentDate, 50);
    
    // AI Analysis fields
    const aiLeadScore = requestData.aiLeadScore;
    const aiLeadTemperature = sanitizeString(requestData.aiLeadTemperature, 20);
    const aiLeadIntent = sanitizeString(requestData.aiLeadIntent, 50);
    const aiConversionProbability = requestData.aiConversionProbability;
    const aiUrgencyLevel = sanitizeString(requestData.aiUrgencyLevel, 20);
    const aiBuyingSignals = requestData.aiBuyingSignals || [];
    const aiObjectionsRaised = requestData.aiObjectionsRaised || [];
    const aiRecommendedFollowup = sanitizeString(requestData.aiRecommendedFollowup, 500);
    const aiConversationSummary = sanitizeString(requestData.aiConversationSummary, 500);
    const aiKeyInsights = requestData.aiKeyInsights || [];
    const aiBudgetScore = requestData.aiBudgetScore;
    const aiAuthorityScore = requestData.aiAuthorityScore;
    const aiNeedScore = requestData.aiNeedScore;
    const aiTimelineScore = requestData.aiTimelineScore;
    
    // Visitor Intelligence fields
    const visitorId = sanitizeString(requestData.visitorId, 50);
    const isReturningVisitor = sanitizeString(requestData.isReturningVisitor, 5);
    const visitCount = sanitizeString(requestData.visitCount, 10);
    const firstVisitDate = sanitizeString(requestData.firstVisitDate, 50);
    const lastVisitDate = sanitizeString(requestData.lastVisitDate, 50);
    const utmSource = sanitizeString(requestData.utmSource, 100);
    const utmMedium = sanitizeString(requestData.utmMedium, 100);
    const utmCampaign = sanitizeString(requestData.utmCampaign, 200);
    const utmContent = sanitizeString(requestData.utmContent, 200);
    const utmTerm = sanitizeString(requestData.utmTerm, 200);
    const referrerSource = sanitizeString(requestData.referrerSource, 500);
    const landingPage = sanitizeString(requestData.landingPage, 500);
    const entryPage = sanitizeString(requestData.entryPage, 200);
    const deviceType = sanitizeString(requestData.deviceType, 20);
    const browser = sanitizeString(requestData.browser, 50);
    const pagesViewed = sanitizeString(requestData.pagesViewed, 500);
    const sectionsViewed = sanitizeString(requestData.sectionsViewed, 500);
    const ctaClicks = sanitizeString(requestData.ctaClicks, 500);
    const calculatorUsed = sanitizeString(requestData.calculatorUsed, 5);
    const demoWatched = sanitizeString(requestData.demoWatched, 5);
    const demoWatchTime = sanitizeString(requestData.demoWatchTime, 20);
    const scrollDepth = sanitizeString(requestData.scrollDepth, 10);
    const timeOnSite = sanitizeString(requestData.timeOnSite, 20);
    const chatbotOpened = sanitizeString(requestData.chatbotOpened, 5);
    const chatbotEngaged = sanitizeString(requestData.chatbotEngaged, 5);
    const engagementScore = sanitizeString(requestData.engagementScore, 10);
    const interestSignals = sanitizeString(requestData.interestSignals, 500);
    const behavioralIntent = sanitizeString(requestData.behavioralIntent, 100);

    // Use directly provided firstName/lastName OR split from name
    const rawFirstName = sanitizeString(requestData.firstName, 50);
    const rawLastName = sanitizeString(requestData.lastName, 50);
    const nameParts = name.split(' ');
    const firstName = rawFirstName || nameParts[0] || '';
    const lastName = rawLastName || nameParts.slice(1).join(' ') || '';
    
    // Derive business name from multiple sources
    const derivedBusinessName = businessName || businessTypeOther || `${firstName}'s ${businessType || 'Business'}`;
    
    console.log("Validated form data:", { 
      name,
      firstName,
      lastName,
      emailLength: email.length, 
      phone: phone ? "provided" : "not provided", 
      businessName: derivedBusinessName,
      businessType,
      teamSize, 
      callVolume,
      fitReason,
      aiTimeline,
      messageLength: message.length 
    });
    
    // Get formName from request to determine source
    const rawFormName = sanitizeString(requestData.formName, 100);
    
    // Determine source type based on formName
    const isChatbot = rawFormName?.toLowerCase().includes('chatbot') || 
                      rawFormName?.toLowerCase().includes('alex') ||
                      rawFormName?.toLowerCase().includes('demo') ||
                      rawFormName?.toLowerCase().includes('voice agent');
    const isPDF = rawFormName?.toLowerCase().includes('pdf') || rawFormName?.toLowerCase().includes('playbook') || rawFormName?.toLowerCase().includes('lead magnet');
    const isNewsletter = rawFormName?.toLowerCase().includes('newsletter');
    
    // Set source for GHL - using standard GHL-compatible source values
    let source = isChatbot ? "chat_widget" : isPDF ? "pdf_download" : isNewsletter ? "newsletter" : "contact_form";
    let sourceType = "CONTACT FORM";
    if (isChatbot) {
      sourceType = "CHATBOT";
    } else if (isPDF) {
      sourceType = "PDF DOWNLOAD";
    } else if (isNewsletter) {
      sourceType = "NEWSLETTER";
    }
    
    // Build smart tags
    const tags: string[] = [];
    if (isChatbot) {
      tags.push("Chatbot Lead");
      
      if (isGoodFit === true) {
        tags.push("Qualified");
      } else if (isGoodFit === false) {
        tags.push("Not Ready");
        if (fitReason === "early_stage") tags.push("Early Stage");
        if (fitReason === "not_ready") tags.push("Just Exploring");
      }
      
      if (businessType) {
        tags.push(businessType);
      }
      
      const loss = parseInt(potentialLoss || "0");
      if (loss >= 5000) {
        tags.push("High Value Opportunity");
      } else if (loss >= 2000) {
        tags.push("Warm Lead");
      }
      
      if (avgJobValue === "$2,500+" || avgJobValue === "$1,000-2,500") {
        tags.push("High Ticket");
      }
      
      if (callVolume === "20+ calls" || callVolume === "10-20 calls") {
        tags.push("High Volume");
      }
    } else if (isPDF) {
      tags.push("PDF Download");
      tags.push("Lead Magnet");
    } else if (isNewsletter) {
      tags.push("Newsletter Signup");
    } else {
      tags.push("Website Lead");
      tags.push("Contact Form");
    }

    const serviceOffered = businessTypeOther 
      ? `Other - ${businessTypeOther}` 
      : (businessType || "");

    const ghlNotes = `
${message}

--- Qualification Summary ---
Trade: ${businessType || "Not specified"}
Business: ${businessTypeOther || "Not specified"}
Team Size: ${teamSize || "Not specified"}
Call Volume: ${callVolume || "Not specified"}
Avg Job Value: ${avgJobValue || "Not specified"}
Current Call Handling: ${currentSolution || "Not specified"}
Estimated Missed Calls/Month: ${missedCalls || "Not calculated"}
Potential Monthly Loss: $${potentialLoss || "Not calculated"}
Fit Assessment: ${isGoodFit ? "QUALIFIED" : `Not Ready (${fitReason})`}

--- Conversation Notes ---
${notes || "None"}
    `.trim();
    
    // Use rawFormName or set default based on source type
    const formName = rawFormName || (isChatbot ? "Chatbot - Alex" : isPDF ? "PDF Download" : isNewsletter ? "Newsletter" : "Contact Page Form");
    const website = sanitizeString(requestData.website, 255);
    
    // Get interests/services - handle both array (interests) and string (otherServicesNeeded)
    // IMPORTANT: This must be defined BEFORE analyzeLeadWithAI function uses it
    const interests = requestData.interests || [];
    const rawOtherServices = sanitizeString((requestData as any).otherServicesNeeded, 200);
    const otherServicesNeeded = rawOtherServices || interests.join(", ");
    
    // Calculate lead score
    const calculateLeadScore = () => {
      let score = 0;
      if (isChatbot) score += 40;
      else if (source === "Contact Form") score += 30;
      else if (isPDF) score += 20;
      else if (isNewsletter) score += 10;
      if (phone) score += 15;
      if (businessType) score += 10;
      if (isGoodFit) score += 20;
      if (missedCalls && parseInt(missedCalls) > 0) score += 10;
      if (missedCalls && parseInt(missedCalls) >= 20) score += 5;
      return Math.min(score, 100);
    };
    
    // ============================================
    // REAL AI-POWERED LEAD SCORING
    // ============================================
    const analyzeLeadWithAI = async () => {
      // Fallback scoring if AI unavailable
      const fallbackScoring = () => {
        let baseScore = 40;
        const timelineScores: Record<string, number> = {
          "ASAP - Losing calls now": 25, "Within 30 days": 18, "1-3 months": 10, "Just exploring": 5,
        };
        const teamScores: Record<string, number> = {
          "Solo": 5, "2-5": 10, "6-10": 15, "10+ trucks": 20,
        };
        const volumeScores: Record<string, number> = {
          "Under 50 calls": 5, "50-100 calls": 10, "100-200 calls": 15, "200+ calls": 20,
        };
        baseScore += (timelineScores[aiTimeline] || 8) + (teamScores[teamSize] || 8) + (volumeScores[callVolume] || 8);
        const engagementNum = parseInt(engagementScore) || 0;
        if (engagementNum >= 60) baseScore += 10;
        else if (engagementNum >= 40) baseScore += 5;
        const finalScore = Math.min(baseScore, 100);
        
        let temperature = finalScore >= 75 || aiTimeline === "ASAP - Losing calls now" ? "hot" : finalScore >= 55 ? "warm" : "cold";
        let urgency = aiTimeline === "ASAP - Losing calls now" ? "immediate" : aiTimeline === "Within 30 days" ? "high" : aiTimeline === "1-3 months" ? "medium" : "low";
        
        const budgetScore = teamSize === "10+ trucks" ? 90 : teamSize === "6-10" ? 75 : teamSize === "2-5" ? 55 : 40;
        const needScore = currentSolution === "Miss most calls" ? 90 : currentSolution === "Voicemail" ? 75 : 50;
        const timelineScore = aiTimeline === "ASAP - Losing calls now" ? 95 : aiTimeline === "Within 30 days" ? 75 : aiTimeline === "1-3 months" ? 50 : 25;
        
        let estimatedMissedCalls = 0;
        if (callVolume === "200+ calls") estimatedMissedCalls = currentSolution === "Miss most calls" ? 60 : 30;
        else if (callVolume === "100-200 calls") estimatedMissedCalls = currentSolution === "Miss most calls" ? 40 : 20;
        else if (callVolume === "50-100 calls") estimatedMissedCalls = currentSolution === "Miss most calls" ? 20 : 10;
        else estimatedMissedCalls = currentSolution === "Miss most calls" ? 14 : 7;
        
        return {
          score: finalScore, temperature, intent: "evaluating - form submission", conversionProb: `${Math.min(Math.round(finalScore * 0.85), 95)}%`,
          urgency, buyingSignals: "Fallback scoring - AI unavailable", objections: "n/a",
          followup: temperature === "hot" ? "Call immediately" : "Schedule demo within 48 hours",
          summary: `Contact form from ${businessType || "service"} business. Team: ${teamSize || "n/a"}, Volume: ${callVolume || "n/a"}.`,
          keyInsights: `${businessType || "Service"} business | ${teamSize || "Unknown"} team | ${callVolume || "Unknown"} calls | Timeline: ${aiTimeline || "Unknown"}`,
          budgetScore, authorityScore: "n/a", needScore, timelineScore, estimatedMissedCalls,
        };
      };
      
      try {
        console.log("=== CALLING AI FOR LEAD ANALYSIS ===");
        
        const leadContext = `
LEAD DATA:
- Business Type: ${businessType || "Not specified"}
- Team Size: ${teamSize || "Not specified"}
- Call Volume: ${callVolume || "Not specified"}
- Current Call Handling: ${currentSolution || "Not specified"}
- Average Job Value: ${avgJobValue || "Not specified"}
- Timeline: ${aiTimeline || "Not specified"}
- Additional Services Interested: ${otherServicesNeeded || "None"}
- Website: ${website || "Not provided"}
- Message: ${message || "None"}

BEHAVIORAL DATA:
- Engagement Score: ${engagementScore || "0"}
- Behavioral Intent: ${behavioralIntent || "Unknown"}
- Returning Visitor: ${isReturningVisitor || "NO"}
- Sections Viewed: ${sectionsViewed || "None"}
- Time on Site: ${timeOnSite || "Unknown"}
`;
        
        const aiResponse = await aiChat({
          messages: [
            {
              role: "system",
              content: `You are an expert B2B sales lead qualification AI for an AI voice agent company targeting HVAC, plumbing, electrical, and home service contractors.

Analyze leads and return a JSON object with EXACTLY these fields:
{
  "score": <number 1-100>,
  "temperature": "<hot|warm|cold>",
  "intent": "<string describing buyer intent>",
  "conversionProb": "<percentage string like '75%'>",
  "urgency": "<immediate|high|medium|low>",
  "buyingSignals": "<comma-separated list of positive signals>",
  "objections": "<potential objections or 'n/a'>",
  "followup": "<recommended next action>",
  "summary": "<2-3 sentence lead summary>",
  "keyInsights": "<key insights separated by |>",
  "budgetScore": <number 1-100>,
  "needScore": <number 1-100>,
  "timelineScore": <number 1-100>,
  "estimatedMissedCalls": <number>
}

SCORING GUIDELINES:
- ASAP timeline + high call volume + large team = HOT lead (80-100)
- Within 30 days + 50+ calls = WARM lead (60-79)  
- Just exploring OR low volume = COLD lead (40-59)
- Solo operators rarely convert unless ASAP timeline

ALWAYS respond with valid JSON only. No markdown, no explanations.`
            },
            {
              role: "user",
              content: `Analyze this lead and provide qualification scoring:\n${leadContext}`
            }
          ],
          max_tokens: 1000,
          temperature: 0.3,
          purpose: 'lead_scoring',
        });
        
        const aiContent = aiResponse.text;
        
        if (!aiContent) {
          console.error("No AI response content");
          return fallbackScoring();
        }
        
        console.log("AI Response:", aiContent);
        
        // Parse JSON from AI response
        let aiResult;
        try {
          // Clean potential markdown formatting
          const cleanedContent = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          aiResult = JSON.parse(cleanedContent);
        } catch (parseError) {
          console.error("Failed to parse AI response:", parseError);
          return fallbackScoring();
        }
        
        // Validate and normalize the response
        return {
          score: Math.min(100, Math.max(1, Number(aiResult.score) || 50)),
          temperature: ["hot", "warm", "cold"].includes(aiResult.temperature) ? aiResult.temperature : "warm",
          intent: aiResult.intent || "evaluating - form submission",
          conversionProb: aiResult.conversionProb || "50%",
          urgency: ["immediate", "high", "medium", "low"].includes(aiResult.urgency) ? aiResult.urgency : "medium",
          buyingSignals: aiResult.buyingSignals || "n/a",
          objections: aiResult.objections || "n/a",
          followup: aiResult.followup || "Schedule demo call",
          summary: aiResult.summary || `Lead from ${businessType || "service"} business`,
          keyInsights: aiResult.keyInsights || "n/a",
          budgetScore: Math.min(100, Math.max(1, Number(aiResult.budgetScore) || 50)),
          authorityScore: "n/a",
          needScore: Math.min(100, Math.max(1, Number(aiResult.needScore) || 50)),
          timelineScore: Math.min(100, Math.max(1, Number(aiResult.timelineScore) || 50)),
          estimatedMissedCalls: Number(aiResult.estimatedMissedCalls) || 14,
        };
        
      } catch (error) {
        console.error("AI analysis error:", error);
        return fallbackScoring();
      }
    };
    
    // Generate AI scoring data (async)
    console.log("Starting AI lead analysis...");
    const aiAnalysis = await analyzeLeadWithAI();
    console.log("AI Analysis complete:", JSON.stringify(aiAnalysis, null, 2));
    
    // Helper function: return value or "n/a" if empty
    const valueOrNA = (val: string | undefined | null): string => {
      if (val === undefined || val === null || val === "") return "n/a";
      return val;
    };
    
    // Calculate missed call revenue (avgJobValue * missedCalls)
    // Parse avgJobValue properly - extract first number from ranges like "$500-1,000"
    const parseAvgJobValue = (value: string): number => {
      if (!value) return 351;
      // Remove $ and commas, then split by dash to get range
      const cleaned = value.replace(/[$,]/g, '');
      const parts = cleaned.split('-');
      if (parts.length >= 2) {
        // It's a range like "500-1000", take average
        const low = parseInt(parts[0]) || 0;
        const high = parseInt(parts[1]) || 0;
        return low && high ? Math.round((low + high) / 2) : (low || high || 351);
      }
      // Single value like "$2500+"
      const num = parseInt(cleaned.replace(/[^0-9]/g, ''));
      return num || 351;
    };
    const avgJobNumeric = parseAvgJobValue(avgJobValue || "");
    // Use AI-calculated missed calls if not provided
    const missedCallsNumeric = missedCalls ? parseInt(missedCalls.replace(/[^0-9]/g, '')) || 0 : aiAnalysis.estimatedMissedCalls;
    const missedCallRevenue = avgJobNumeric * missedCallsNumeric;
    
    // Parse potential loss as numeric - use calculated value if not provided
    const potentialLossNumeric = potentialLoss ? parseInt(potentialLoss.replace(/[^0-9]/g, '')) || 0 : missedCallRevenue;
    
    const webhookPayload = {
      // GHL Standard Contact Fields - snake_case is GHL's native format
      // CRITICAL: These must be at root level for GHL to map correctly
      first_name: firstName,
      last_name: lastName,
      full_name: name,
      email: email,
      phone: phone || "",
      company_name: derivedBusinessName,
      website: website || "",
      source: source,
      tags: tags,
      // Also include camelCase as backup (some GHL integrations use this)
      firstName: firstName,
      lastName: lastName,
      name: name,
      companyName: derivedBusinessName,
      fullName: name,
      company: derivedBusinessName,
      businessName: derivedBusinessName,
      
      // FLAT custom fields at root level - GHL inbound webhooks read these directly
      // Use both snake_case and camelCase versions for maximum compatibility
      services_offered: valueOrNA(businessType),
      servicesOffered: valueOrNA(businessType),
      team_size: valueOrNA(teamSize),
      teamSize: valueOrNA(teamSize),
      tag_string: tags.join(", "),
      tagString: tags.join(", "),
      avg_job_value: valueOrNA((avgJobValue || "").replace(/^\$/, "")),
      avgJobValue: valueOrNA((avgJobValue || "").replace(/^\$/, "")),
      call_volume_monthly: valueOrNA(callVolume),
      callVolumeMonthly: valueOrNA(callVolume),
      // OTHER SERVICES - multiple formats for GHL compatibility
      other_services_needed: valueOrNA(otherServicesNeeded),
      otherServicesNeeded: valueOrNA(otherServicesNeeded),
      other_services: valueOrNA(otherServicesNeeded),
      otherServices: valueOrNA(otherServicesNeeded),
      additional_services: valueOrNA(otherServicesNeeded),
      additionalServices: valueOrNA(otherServicesNeeded),
      ai_timeline: valueOrNA(aiTimeline),
      aiTimeline: valueOrNA(aiTimeline),
      lead_temperature: aiAnalysis.temperature.toUpperCase(),
      leadTemperature: aiAnalysis.temperature.toUpperCase(),
      lead_qualification: isGoodFit === true ? "YES" : "NO",
      leadQualification: isGoodFit === true ? "YES" : "NO",
      fit_reason: valueOrNA(fitReason),
      fitReason: valueOrNA(fitReason),
      lead_intent: aiAnalysis.intent,
      leadIntent: aiAnalysis.intent,
      lead_score: aiAnalysis.score.toString(),
      leadScore: aiAnalysis.score.toString(),
      missed_call_revenue: `$${missedCallRevenue.toLocaleString()}`,
      missedCallRevenue: `$${missedCallRevenue.toLocaleString()}`,
      potential_revenue_loss: `$${potentialLossNumeric.toLocaleString()}`,
      potentialRevenueLoss: `$${potentialLossNumeric.toLocaleString()}`,
      missed_calls_monthly: missedCallsNumeric.toString(),
      missedCallsMonthly: missedCallsNumeric.toString(),
      current_call_handling: valueOrNA(currentSolution),
      currentCallHandling: valueOrNA(currentSolution),
      form_name: formName,
      formName: formName,
      // Address fields - use n/a for empty
      street_address: valueOrNA(streetAddress),
      streetAddress: valueOrNA(streetAddress),
      city: valueOrNA(city),
      state: valueOrNA(state),
      postal_code: valueOrNA(postalCode),
      postalCode: valueOrNA(postalCode),
      country: valueOrNA(country),
      // Business/lead fields
      business_overview: valueOrNA(businessOverview),
      businessOverview: valueOrNA(businessOverview),
      call_routing_hours: valueOrNA(callRoutingHours),
      callRoutingHours: valueOrNA(callRoutingHours),
      contact_type: requestData.contactType || (isChatbot ? "Lead" : isPDF ? "Subscriber" : "Prospect"),
      contactType: requestData.contactType || (isChatbot ? "Lead" : isPDF ? "Subscriber" : "Prospect"),
      // Payment/Stripe fields - use n/a for empty
      amount_paid: valueOrNA(amountPaid),
      amountPaid: valueOrNA(amountPaid),
      download_date: valueOrNA(downloadDate),
      downloadDate: valueOrNA(downloadDate),
      plan: valueOrNA(plan),
      stripe_session_id: valueOrNA(stripeSessionId),
      stripeSessionId: valueOrNA(stripeSessionId),
      payment_date: valueOrNA(paymentDate),
      paymentDate: valueOrNA(paymentDate),
      // AI Analysis fields - REAL AI-POWERED DATA
      ai_lead_score: aiAnalysis.score.toString(),
      ai_lead_temperature: aiAnalysis.temperature,
      ai_lead_intent: aiAnalysis.intent,
      ai_conversion_probability: aiAnalysis.conversionProb,
      ai_urgency_level: aiAnalysis.urgency,
      ai_buying_signals: aiAnalysis.buyingSignals,
      ai_objections_raised: aiAnalysis.objections,
      ai_recommended_followup: aiAnalysis.followup,
      ai_conversation_summary: aiAnalysis.summary,
      ai_key_insights: aiAnalysis.keyInsights,
      ai_bant_budget: aiAnalysis.budgetScore.toString(),
      ai_bant_authority: aiAnalysis.authorityScore,
      ai_bant_need: aiAnalysis.needScore.toString(),
      ai_bant_timeline: aiAnalysis.timelineScore.toString(),
      // Visitor Intelligence fields
      visitor_id: valueOrNA(visitorId),
      visitorId: valueOrNA(visitorId),
      is_returning_visitor: isReturningVisitor || "NO",
      isReturningVisitor: isReturningVisitor || "NO",
      repeat_visitor_status: isReturningVisitor || "NO",
      repeatVisitorStatus: isReturningVisitor || "NO",
      visit_count: visitCount || "1",
      visitCount: visitCount || "1",
      first_visit_date: valueOrNA(firstVisitDate),
      firstVisitDate: valueOrNA(firstVisitDate),
      last_visit_date: valueOrNA(lastVisitDate),
      lastVisitDate: valueOrNA(lastVisitDate),
      utm_source: valueOrNA(utmSource),
      utmSource: valueOrNA(utmSource),
      utm_medium: valueOrNA(utmMedium),
      utmMedium: valueOrNA(utmMedium),
      utm_campaign: valueOrNA(utmCampaign),
      utmCampaign: valueOrNA(utmCampaign),
      utm_content: valueOrNA(utmContent),
      utmContent: valueOrNA(utmContent),
      utm_term: valueOrNA(utmTerm),
      utmTerm: valueOrNA(utmTerm),
      referrer_source: referrerSource || "Direct",
      referrerSource: referrerSource || "Direct",
      landing_page: valueOrNA(landingPage),
      landingPage: valueOrNA(landingPage),
      entry_page: valueOrNA(entryPage),
      entryPage: valueOrNA(entryPage),
      device_type: valueOrNA(deviceType),
      deviceType: valueOrNA(deviceType),
      browser: valueOrNA(browser),
      pages_viewed: valueOrNA(pagesViewed),
      pagesViewed: valueOrNA(pagesViewed),
      sections_viewed: valueOrNA(sectionsViewed),
      sectionsViewed: valueOrNA(sectionsViewed),
      cta_clicks: valueOrNA(ctaClicks),
      ctaClicks: valueOrNA(ctaClicks),
      calculator_used: calculatorUsed || "NO",
      calculatorUsed: calculatorUsed || "NO",
      demo_watched: demoWatched || "NO",
      demoWatched: demoWatched || "NO",
      demo_watch_time: demoWatchTime || "0s",
      demoWatchTime: demoWatchTime || "0s",
      scroll_depth: scrollDepth || "0%",
      scrollDepth: scrollDepth || "0%",
      time_on_site: timeOnSite || "0min",
      timeOnSite: timeOnSite || "0min",
      chatbot_opened: chatbotOpened || "NO",
      chatbotOpened: chatbotOpened || "NO",
      chatbot_engaged: chatbotEngaged || "NO",
      chatbotEngaged: chatbotEngaged || "NO",
      engagement_score: engagementScore || "0",
      engagementScore: engagementScore || "0",
      interest_signals: valueOrNA(interestSignals),
      interestSignals: valueOrNA(interestSignals),
      behavioral_intent: behavioralIntent || "Unknown",
      behavioralIntent: behavioralIntent || "Unknown",
      // NEW: Additional fields with n/a fallback
      lead_magnet: isPDF ? "PDF Playbook" : "n/a",
      leadMagnet: isPDF ? "PDF Playbook" : "n/a",
      traffic_attribution: utmSource || utmMedium || referrerSource || "Direct",
      trafficAttribution: utmSource || utmMedium || referrerSource || "Direct",
      
      // Notes
      notes: ghlNotes,
      timestamp: new Date().toISOString(),
    };
    
    // Lead source tracking
    console.log("=== LEAD SOURCE TRACKING ===");
    console.log(`Source: ${sourceType}`);
    console.log(`FormName: ${formName}`);
    console.log(`Email: ${email}`);
    console.log(`Business Type: ${businessType || "Not specified"}`);
    console.log(`Qualified: ${isGoodFit ? "YES" : "NO"}`);
    console.log(`Tags: ${tags.join(", ")}`);
    console.log("============================");
    
    // Log FULL payload for debugging
    console.log("=== FULL GHL PAYLOAD ===");
    console.log(JSON.stringify(webhookPayload, null, 2));
    console.log("========================");
    
    console.log("Sending to GHL webhook");
    
    if (!GHL_WEBHOOK_URL) {
      console.error("GHL_WEBHOOK_URL is not configured");
      return new Response(
        JSON.stringify({ error: "Webhook URL not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    const ghlResponse = await fetch(GHL_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(webhookPayload),
    });
    console.log("GHL webhook response status:", ghlResponse.status);

    // ============================================
    // SAVE LEAD TO LOCAL DATABASE
    // ============================================
    let localLeadSaved = false;
    try {
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        
        const leadData = {
          name: name,
          email: email,
          phone: phone || null,
          business_name: derivedBusinessName,
          trade: businessType || null,
          team_size: teamSize || null,
          call_volume: callVolume || null,
          lead_score: aiAnalysis.score,
          lead_temperature: aiAnalysis.temperature,
          status: 'new',
          source: source,
          timeline: aiTimeline || null,
          notes: ghlNotes,
          form_name: formName,
          utm_source: utmSource || null,
          utm_medium: utmMedium || null,
          utm_campaign: utmCampaign || null,
          visitor_id: visitorId || null,
          landing_page: landingPage || null,
          conversion_probability: aiAnalysis.conversionProb,
          ai_analysis: {
            score: aiAnalysis.score,
            temperature: aiAnalysis.temperature,
            intent: aiAnalysis.intent,
            urgency: aiAnalysis.urgency,
            buyingSignals: aiAnalysis.buyingSignals,
            objections: aiAnalysis.objections,
            followup: aiAnalysis.followup,
            summary: aiAnalysis.summary,
            keyInsights: aiAnalysis.keyInsights,
            budgetScore: aiAnalysis.budgetScore,
            needScore: aiAnalysis.needScore,
            timelineScore: aiAnalysis.timelineScore,
          },
          avg_job_value: avgJobNumeric,
          missed_calls_monthly: missedCallsNumeric,
          potential_revenue_loss: potentialLossNumeric,
          engagement_score: parseInt(engagementScore) || 0,
          is_qualified: isGoodFit === true,
        };

        const { data: insertedLead, error: insertError } = await supabase
          .from('leads')
          .insert(leadData)
          .select()
          .single();

        if (insertError) {
          console.error("Failed to save lead to local database:", insertError);
        } else {
          console.log("Lead saved to local database:", insertedLead?.id);
          localLeadSaved = true;
        }
      } else {
        console.warn("Supabase credentials not configured - skipping local lead save");
      }
    } catch (dbError) {
      console.error("Error saving lead to local database:", dbError);
      // Don't fail the request if local save fails - GHL is primary
    }

    // Send confirmation email
    console.log("Sending confirmation email");
    
    const emailSubject = isGoodFit !== false 
      ? "We received your info - next steps inside!" 
      : "Thanks for chatting with us!";
    
    const emailBody = isGoodFit !== false 
      ? `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1e3a5f;">Thanks for chatting with us, ${firstName}!</h1>
          <p style="font-size: 16px; color: #333;">Great conversation! Based on what you shared about your ${businessType || "service"} business, I think we can really help.</p>
          <p style="font-size: 16px; color: #333;">One of our specialists will reach out within <strong>24 hours</strong> to discuss a custom plan for your situation.</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #666;"><strong>What happens next:</strong></p>
            <ul style="color: #333;">
              <li>We'll review your specific situation</li>
              <li>Our team will call you to discuss solutions</li>
              <li>If it's a fit, we can have you live in under a week</li>
            </ul>
          </div>
          <p style="font-size: 14px; color: #666;">Talk soon!<br>The ApexLocal360 Team</p>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1e3a5f;">Thanks for stopping by, ${firstName}!</h1>
          <p style="font-size: 16px; color: #333;">Appreciate you taking the time to chat with us about your business.</p>
          <p style="font-size: 16px; color: #333;">We've saved your info — when you're ready to explore AI solutions for your ${businessType || "service"} business, just reach out. We'll be here!</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #666;"><strong>In the meantime, check out:</strong></p>
            <ul style="color: #333;">
              <li>Our calculator to see what missed calls cost</li>
              <li>Demo of how our AI handles calls</li>
            </ul>
          </div>
          <p style="font-size: 14px; color: #666;">Best of luck!<br>The ApexLocal360 Team</p>
        </div>
      `;
    
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ApexLocal360 <onboarding@resend.dev>",
        to: [email],
        subject: emailSubject,
        html: emailBody,
      }),
    });

    const emailResult = await emailResponse.json();
    console.log("Email response status:", emailResponse.ok);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Form submitted successfully",
        ghlStatus: ghlResponse.status,
        emailSent: emailResponse.ok,
        isGoodFit: isGoodFit,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in contact-form function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
