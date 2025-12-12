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
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Contact form function called");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, message }: ContactFormRequest = await req.json();
    console.log("Received form data:", { name, email, messageLength: message?.length });

    // Send to GHL webhook
    console.log("Sending to GHL webhook...");
    const ghlResponse = await fetch(GHL_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        email,
        message,
        timestamp: new Date().toISOString(),
      }),
    });
    console.log("GHL webhook response status:", ghlResponse.status);

    // Send confirmation email to customer using Resend API directly
    console.log("Sending confirmation email to:", email);
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ApexLocal360 <onboarding@resend.dev>",
        to: [email],
        subject: "We received your message!",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1e3a5f;">Thank you for contacting us, ${name}!</h1>
            <p style="font-size: 16px; color: #333;">We have received your message and will get back to you within 24 hours.</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #666;"><strong>Your message:</strong></p>
              <p style="margin: 10px 0 0 0; color: #333;">${message}</p>
            </div>
            <p style="font-size: 14px; color: #666;">Best regards,<br>The ApexLocal360 Team</p>
          </div>
        `,
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
