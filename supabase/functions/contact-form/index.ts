import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const GHL_WEBHOOK_URL = Deno.env.get("GHL_WEBHOOK_URL");

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
    
    if (!message || message.length < 1) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
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
    const missedCallsNumeric = missedCalls ? parseInt(missedCalls.replace(/[^0-9]/g, '')) || 0 : 0;
    const missedCallRevenue = avgJobNumeric * missedCallsNumeric;
    
    // Parse potential loss as numeric
    const potentialLossNumeric = potentialLoss ? parseInt(potentialLoss.replace(/[^0-9]/g, '')) || 0 : 0;
    
    // Get interests/services - handle both array (interests) and string (otherServicesNeeded)
    const interests = requestData.interests || [];
    const rawOtherServices = sanitizeString((requestData as any).otherServicesNeeded, 200);
    const otherServicesNeeded = rawOtherServices || interests.join(", ");
    
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
      
      // Custom fields object
      customField: {
        // CRITICAL: Core contact fields inside customField for GHL mapping
        first_name: firstName,
        last_name: lastName,
        full_name: name,
        email: email,
        phone: phone || "",
        website: website || "",
        company_name: derivedBusinessName,
        business_name: businessName || derivedBusinessName,
        
        // Page 1 fields
        services_offered: businessType || "",
        team_size: teamSize || "",
        tag_string: tags.join(", "),
        
        // Page 2 fields - strip $ symbol for GHL compatibility
        avg_job_value: (avgJobValue || "").replace(/^\$/, ""),
        call_volume_monthly: callVolume || "",
        other_services_needed: otherServicesNeeded,
        ai_timeline: aiTimeline || "",
        lead_temperature: isChatbot ? "HOT" : isPDF ? "WARM" : isNewsletter ? "NURTURE" : "WARM",
        lead_qualification: isGoodFit === true ? "YES" : "NO",
        fit_reason: fitReason || "",
        lead_intent: isChatbot ? "High - Engaged in conversation" : isPDF ? "Medium - Downloaded resource" : isNewsletter ? "Low - Newsletter signup" : "Medium - Form submission",
        lead_score: calculateLeadScore().toString(),
        
        // Page 3 fields
        missed_call_revenue: `$${missedCallRevenue.toLocaleString()}`,
        potential_revenue_loss: `$${potentialLossNumeric.toLocaleString()}`,
        missed_calls_monthly: missedCallsNumeric.toString(),
        current_call_handling: currentSolution || "",
        form_name: formName,
        // NEW: Address fields
        street_address: streetAddress,
        city: city,
        state: state,
        postal_code: postalCode,
        country: country,
        // NEW: Business/lead fields (business_name already defined above)
        business_overview: businessOverview,
        call_routing_hours: callRoutingHours,
        contact_type: requestData.contactType || (isChatbot ? "Lead" : isPDF ? "Subscriber" : "Prospect"),
        // Payment/Stripe fields
        amount_paid: amountPaid,
        download_date: downloadDate,
        plan: plan,
        stripe_session_id: stripeSessionId,
        payment_date: paymentDate,
        // AI Analysis fields
        ai_lead_score: aiLeadScore?.toString() || "",
        ai_lead_temperature: aiLeadTemperature || "",
        ai_lead_intent: aiLeadIntent || "",
        ai_conversion_probability: aiConversionProbability?.toString() || "",
        ai_urgency_level: aiUrgencyLevel || "",
        ai_buying_signals: aiBuyingSignals.join(", "),
        ai_objections_raised: aiObjectionsRaised.join(", "),
        ai_recommended_followup: aiRecommendedFollowup || "",
        ai_conversation_summary: aiConversationSummary || "",
        ai_key_insights: aiKeyInsights.join(" | "),
        ai_bant_budget: aiBudgetScore?.toString() || "",
        ai_bant_authority: aiAuthorityScore?.toString() || "",
        ai_bant_need: aiNeedScore?.toString() || "",
        ai_bant_timeline: aiTimelineScore?.toString() || "",
        // Visitor Intelligence fields
        visitor_id: visitorId || "",
        is_returning_visitor: isReturningVisitor || "NO",
        visit_count: visitCount || "1",
        first_visit_date: firstVisitDate || "",
        last_visit_date: lastVisitDate || "",
        utm_source: utmSource || "",
        utm_medium: utmMedium || "",
        utm_campaign: utmCampaign || "",
        utm_content: utmContent || "",
        utm_term: utmTerm || "",
        referrer_source: referrerSource || "Direct",
        landing_page: landingPage || "",
        entry_page: entryPage || "",
        device_type: deviceType || "",
        browser: browser || "",
        pages_viewed: pagesViewed || "",
        sections_viewed: sectionsViewed || "",
        cta_clicks: ctaClicks || "",
        calculator_used: calculatorUsed || "NO",
        demo_watched: demoWatched || "NO",
        demo_watch_time: demoWatchTime || "0s",
        scroll_depth: scrollDepth || "0%",
        time_on_site: timeOnSite || "0min",
        chatbot_opened: chatbotOpened || "NO",
        chatbot_engaged: chatbotEngaged || "NO",
        engagement_score: engagementScore || "0",
        interest_signals: interestSignals || "",
        behavioral_intent: behavioralIntent || "Unknown",
      },
      
      // Root level duplicates for GHL webhook compatibility
      services_offered: businessType || "",
      team_size: teamSize || "",
      tag_string: tags.join(", "),
      avg_job_value: avgJobValue || "",
      call_volume_monthly: callVolume || "",
      other_services_needed: otherServicesNeeded,
      ai_timeline: aiTimeline || "",
      lead_temperature: isChatbot ? "HOT" : isPDF ? "WARM" : isNewsletter ? "NURTURE" : "WARM",
      lead_qualification: isGoodFit === true ? "YES" : "NO",
      fit_reason: fitReason || "",
      lead_intent: isChatbot ? "High - Engaged in conversation" : isPDF ? "Medium - Downloaded resource" : isNewsletter ? "Low - Newsletter signup" : "Medium - Form submission",
      lead_score: calculateLeadScore().toString(),
      missed_call_revenue: `$${missedCallRevenue.toLocaleString()}`,
      potential_revenue_loss: `$${potentialLossNumeric.toLocaleString()}`,
      missed_calls_monthly: missedCallsNumeric.toString(),
      current_call_handling: currentSolution || "",
      form_name: formName,
      // NEW: Address fields (root level)
      street_address: streetAddress,
      city: city,
      state: state,
      postal_code: postalCode,
      country: country,
      // NEW: Business/lead fields (root level)
      business_overview: businessOverview,
      call_routing_hours: callRoutingHours,
      contact_type: requestData.contactType || (isChatbot ? "Lead" : isPDF ? "Subscriber" : "Prospect"),
      // Payment/Stripe fields (root level)
      amount_paid: amountPaid,
      download_date: downloadDate,
      // AI Analysis fields (root level)
      ai_lead_score: aiLeadScore?.toString() || "",
      ai_lead_temperature: aiLeadTemperature || "",
      ai_lead_intent: aiLeadIntent || "",
      ai_conversion_probability: aiConversionProbability?.toString() || "",
      ai_urgency_level: aiUrgencyLevel || "",
      ai_buying_signals: aiBuyingSignals.join(", "),
      ai_objections_raised: aiObjectionsRaised.join(", "),
      ai_recommended_followup: aiRecommendedFollowup || "",
      ai_conversation_summary: aiConversationSummary || "",
      ai_key_insights: aiKeyInsights.join(" | "),
      ai_bant_budget: aiBudgetScore?.toString() || "",
      ai_bant_authority: aiAuthorityScore?.toString() || "",
      ai_bant_need: aiNeedScore?.toString() || "",
      ai_bant_timeline: aiTimelineScore?.toString() || "",
      plan: plan,
      stripe_session_id: stripeSessionId,
      payment_date: paymentDate,
      // Visitor Intelligence fields (root level)
      visitor_id: visitorId || "",
      is_returning_visitor: isReturningVisitor || "NO",
      visit_count: visitCount || "1",
      first_visit_date: firstVisitDate || "",
      last_visit_date: lastVisitDate || "",
      utm_source: utmSource || "",
      utm_medium: utmMedium || "",
      utm_campaign: utmCampaign || "",
      utm_content: utmContent || "",
      utm_term: utmTerm || "",
      referrer_source: referrerSource || "Direct",
      landing_page: landingPage || "",
      entry_page: entryPage || "",
      device_type: deviceType || "",
      browser: browser || "",
      pages_viewed: pagesViewed || "",
      sections_viewed: sectionsViewed || "",
      cta_clicks: ctaClicks || "",
      calculator_used: calculatorUsed || "NO",
      demo_watched: demoWatched || "NO",
      demo_watch_time: demoWatchTime || "0s",
      scroll_depth: scrollDepth || "0%",
      time_on_site: timeOnSite || "0min",
      chatbot_opened: chatbotOpened || "NO",
      chatbot_engaged: chatbotEngaged || "NO",
      engagement_score: engagementScore || "0",
      interest_signals: interestSignals || "",
      behavioral_intent: behavioralIntent || "Unknown",
      
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
