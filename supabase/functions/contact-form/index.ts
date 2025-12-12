import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GHL_WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/R76edRoS33Lv8KfplU5i/webhook-trigger/WeAIRnNsvl426RVqtQhX";

interface ContactFormRequest {
  name: string;
  email: string;
  message: string;
  phone?: string;
  // Chatbot qualification fields
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
  // Legacy fields for backwards compatibility
  biggestChallenge?: string;
  monthlyAdSpend?: string;
  aiTimeline?: string;
  interests?: string[];
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Contact form function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      name, 
      email, 
      message, 
      phone,
      businessType,
      businessTypeOther,
      teamSize,
      callVolume,
      currentSolution,
      avgJobValue,
      missedCalls,
      potentialLoss,
      notes,
      isGoodFit,
      fitReason,
      // Legacy fields
      biggestChallenge,
      monthlyAdSpend,
      aiTimeline,
      interests,
    }: ContactFormRequest = await req.json();
    
    console.log("Received form data:", { 
      name, 
      email, 
      phone, 
      businessType,
      businessTypeOther,
      teamSize, 
      callVolume,
      currentSolution,
      avgJobValue,
      missedCalls,
      potentialLoss,
      notes,
      isGoodFit,
      fitReason,
      messageLength: message?.length 
    });

    // Split name into firstName and lastName for GHL
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    // Determine source and tags based on qualification
    const isChatbot = !!phone && !!businessType;
    const source = isChatbot ? "hvac-ai-website" : "Website Form";
    
    // Build smart tags
    const tags: string[] = ["hvac-lead"];
    if (isChatbot) {
      tags.push("website-contact", "ai-voice-interest");
      
      // Qualification status
      if (isGoodFit === true) {
        tags.push("Qualified");
      } else if (isGoodFit === false) {
        tags.push("Not Ready");
        if (fitReason === "early_stage") tags.push("Early Stage");
        if (fitReason === "not_ready") tags.push("Just Exploring");
      }
      
      // Business type tag
      if (businessType) {
        tags.push(businessType);
      }
      
      // Urgency tags based on potential loss
      const loss = parseInt(potentialLoss || "0");
      if (loss >= 5000) {
        tags.push("High Value Opportunity");
      } else if (loss >= 2000) {
        tags.push("Warm Lead");
      }
      
      // High-value ticket tag
      if (avgJobValue === "$2,500+" || avgJobValue === "$1,000-2,500") {
        tags.push("High Ticket");
      }
      
      // Volume tag
      if (callVolume === "20+ calls" || callVolume === "10-20 calls") {
        tags.push("High Volume");
      }
    } else {
      tags.push("Website Lead");
    }

    // Combine business type with "Other" specification
    const serviceOffered = businessTypeOther 
      ? `Other - ${businessTypeOther}` 
      : (businessType || "");

    // Build comprehensive notes for GHL
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
    
    const webhookPayload = {
      // GHL default contact fields
      firstName: firstName,
      lastName: lastName,
      email: email,
      phone: phone || "",
      source: source,
      tags: tags,
      tags_string: tags.join(", "),
      
      // Custom fields matching GHL field names exactly
      customField: {
        message: ghlNotes,
        "Trade": businessType || "",
        "Business Name": businessTypeOther || "",
        "Team Size": teamSize || "",
        "Daily Call Volume": callVolume || "",
        "Call Handling": currentSolution || "",
        "Avg Job Value": avgJobValue || "",
        "Missed Calls/Month": missedCalls || "",
        "Potential Monthly Loss": potentialLoss ? `$${potentialLoss}` : "",
        "Lead Score": isGoodFit ? "Qualified" : "Nurture",
        "Conversation Notes": notes || "",
        tags: tags.join(", "),
      },
      
      // Flat versions for flexible mapping
      name: name,
      message: ghlNotes,
      "Trade": businessType || "",
      "Business Name": businessTypeOther || "",
      "Team Size": teamSize || "",
      "Daily Call Volume": callVolume || "",
      "Call Handling": currentSolution || "",
      "Avg Job Value": avgJobValue || "",
      "Missed Calls/Month": missedCalls || "",
      "Potential Monthly Loss": potentialLoss ? `$${potentialLoss}` : "",
      "Lead Score": isGoodFit ? "Qualified" : "Nurture",
      "Conversation Notes": notes || "",
      timestamp: new Date().toISOString(),
    };
    
    console.log("Webhook payload:", JSON.stringify(webhookPayload));
    
    const ghlResponse = await fetch(GHL_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(webhookPayload),
    });
    console.log("GHL webhook response status:", ghlResponse.status);

    // Send confirmation email
    console.log("Sending confirmation email to:", email);
    
    // Personalized email based on fit
    const emailSubject = isGoodFit !== false 
      ? "We received your info - next steps inside!" 
      : "Thanks for chatting with us!";
    
    const emailBody = isGoodFit !== false 
      ? `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1e3a5f;">Thanks for chatting with us, ${firstName}!</h1>
          <p style="font-size: 16px; color: #333;">Great conversation! Based on what you shared about your ${businessType || "HVAC"} business, I think we can really help.</p>
          <p style="font-size: 16px; color: #333;">One of our specialists will reach out within <strong>24 hours</strong> to discuss a custom plan for your situation.</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #666;"><strong>What happens next:</strong></p>
            <ul style="color: #333;">
              <li>We'll review your specific situation</li>
              <li>Our team will call you to discuss solutions</li>
              <li>If it's a fit, we can have you live in under 48 hours</li>
            </ul>
          </div>
          <p style="font-size: 14px; color: #666;">Talk soon!<br>The [MY_COMPANY_NAME] Team</p>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1e3a5f;">Thanks for stopping by, ${firstName}!</h1>
          <p style="font-size: 16px; color: #333;">Appreciate you taking the time to chat with us about your HVAC business.</p>
          <p style="font-size: 16px; color: #333;">We've saved your info — when you're ready to explore AI solutions for your ${businessType || "HVAC"} business, just reach out. We'll be here!</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #666;"><strong>In the meantime, check out:</strong></p>
            <ul style="color: #333;">
              <li>Our calculator to see what missed calls cost</li>
              <li>Demo of how our AI handles HVAC calls</li>
            </ul>
          </div>
          <p style="font-size: 14px; color: #666;">Best of luck!<br>The [MY_COMPANY_NAME] Team</p>
        </div>
      `;
    
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "[MY_COMPANY_NAME] <onboarding@resend.dev>",
        to: [email],
        subject: emailSubject,
        html: emailBody,
      }),
    });

    const emailResult = await emailResponse.json();
    console.log("Email response:", emailResult);

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
