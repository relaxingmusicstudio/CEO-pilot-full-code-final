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
  biggestChallenge?: string;
  monthlyAdSpend?: string;
  avgJobValue?: string;
  aiTimeline?: string;
  interests?: string[];
  notes?: string;
  isGoodFit?: boolean;
  fitReason?: string;
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
      biggestChallenge,
      monthlyAdSpend,
      avgJobValue,
      aiTimeline,
      interests,
      notes,
      isGoodFit,
      fitReason,
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
      biggestChallenge,
      monthlyAdSpend,
      avgJobValue,
      aiTimeline,
      interests,
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
    const source = isChatbot ? "Chatbot - Consultative" : "Website Form";
    
    // Build smart tags
    const tags: string[] = [];
    if (isChatbot) {
      tags.push("Chatbot Lead");
      
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
      
      // Urgency tags based on timeline
      if (aiTimeline === "Within 3 months") {
        tags.push("Hot Lead");
      } else if (aiTimeline === "3-6 months") {
        tags.push("Warm Lead");
      }
      
      // High-value tag
      if (avgJobValue === "$2,500+" || avgJobValue === "$1,000-2,500") {
        tags.push("High Ticket");
      }
      
      // Running ads (urgent - wasting money)
      if (monthlyAdSpend === "Running paid ads") {
        tags.push("Running Ads");
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

--- Conversation Notes ---
${notes || "No additional notes"}

Current Solution: ${currentSolution || "Not specified"}
Biggest Challenge: ${biggestChallenge || "Not specified"}
Monthly Ad Spend: ${monthlyAdSpend || "Not specified"}
Avg Job Value: ${avgJobValue || "Not specified"}
Fit Assessment: ${isGoodFit ? "Qualified" : `Not Ready (${fitReason})`}
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
        "Services Offered": serviceOffered,
        "Team Size": teamSize || "",
        "Call Volume": callVolume || "",
        "AI Timeline": aiTimeline || "",
        "Interests": interests?.join(", ") || "",
        "Current Solution": currentSolution || "",
        "Biggest Challenge": biggestChallenge || "",
        "Monthly Ad Spend": monthlyAdSpend || "",
        "Avg Job Value": avgJobValue || "",
        "Lead Score": isGoodFit ? "Qualified" : "Nurture",
        "Fit Reason": fitReason || "",
        "Conversation Notes": notes || "",
        tags: tags.join(", "),
      },
      
      // Flat versions for flexible mapping
      name: name,
      message: ghlNotes,
      "Services Offered": serviceOffered,
      "Team Size": teamSize || "",
      "Call Volume": callVolume || "",
      "AI Timeline": aiTimeline || "",
      "Interests": interests?.join(", ") || "",
      "Current Solution": currentSolution || "",
      "Biggest Challenge": biggestChallenge || "",
      "Monthly Ad Spend": monthlyAdSpend || "",
      "Avg Job Value": avgJobValue || "",
      "Lead Score": isGoodFit ? "Qualified" : "Nurture",
      "Fit Reason": fitReason || "",
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
