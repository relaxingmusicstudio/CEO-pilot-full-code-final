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
  email: string;
  message: string;
  phone?: string;
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
    const fitReason = sanitizeString(requestData.fitReason, 50);
    
    console.log("Validated form data:", { 
      name, 
      emailLength: email.length, 
      phone: phone ? "provided" : "not provided", 
      businessType,
      teamSize, 
      callVolume,
      messageLength: message.length 
    });

    // Split name into firstName and lastName for GHL
    const nameParts = name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    // Get formName from request to determine source
    const rawFormName = sanitizeString(requestData.formName, 100);
    
    // Determine source type based on formName
    const isChatbot = rawFormName?.toLowerCase().includes('chatbot') || rawFormName?.toLowerCase().includes('alex');
    const isPDF = rawFormName?.toLowerCase().includes('pdf') || rawFormName?.toLowerCase().includes('playbook') || rawFormName?.toLowerCase().includes('lead magnet');
    const isNewsletter = rawFormName?.toLowerCase().includes('newsletter');
    
    // Set source for GHL
    let source = "Website Form";
    let sourceType = "CONTACT FORM";
    if (isChatbot) {
      source = "Chatbot - Consultative";
      sourceType = "CHATBOT";
    } else if (isPDF) {
      source = "Lead Magnet Download";
      sourceType = "PDF DOWNLOAD";
    } else if (isNewsletter) {
      source = "Newsletter Signup";
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
    
    const webhookPayload = {
      firstName: firstName,
      lastName: lastName,
      email: email,
      phone: phone || "",
      source: source,
      tags: tags,
      tags_string: tags.join(", "),
      
      customField: {
        message: ghlNotes,
        formName: formName,
        contact_source: source,
        services_offered: businessType || "",
        "Business Name": businessTypeOther || "",
        "Team Size": teamSize || "",
        call_volume_monthly: callVolume || "",
        "Current Call Handling": currentSolution || "",
        "Avg Job Value": avgJobValue || "",
        ai_timeline: sanitizeString(requestData.aiTimeline, 50) || "",
        website: website,
        tags: tags.join(", "),
        tags_string: tags.join(", "),
      },
      
      name: name,
      message: ghlNotes,
      formName: formName,
      services_offered: businessType || "",
      "Business Name": businessTypeOther || "",
      "Team Size": teamSize || "",
      call_volume_monthly: callVolume || "",
      "Current Call Handling": currentSolution || "",
      "Avg Job Value": avgJobValue || "",
      ai_timeline: sanitizeString(requestData.aiTimeline, 50) || "",
      website: website,
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
