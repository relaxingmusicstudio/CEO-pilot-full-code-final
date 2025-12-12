import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHL_WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/R76edRoS33Lv8KfplU5i/webhook-trigger/c79b5649-d39a-4858-ba1e-7b0b558125d3";

// Generate a simple text-based PDF
function generatePDF(): Uint8Array {
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R 6 0 R 7 0 R 8 0 R 9 0 R 10 0 R] /Count 8 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 11 0 R /Resources << /Font << /F1 20 0 R >> >> >>
endobj

4 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 12 0 R /Resources << /Font << /F1 20 0 R >> >> >>
endobj

5 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 13 0 R /Resources << /Font << /F1 20 0 R >> >> >>
endobj

6 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 14 0 R /Resources << /Font << /F1 20 0 R >> >> >>
endobj

7 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 15 0 R /Resources << /Font << /F1 20 0 R >> >> >>
endobj

8 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 16 0 R /Resources << /Font << /F1 20 0 R >> >> >>
endobj

9 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 17 0 R /Resources << /Font << /F1 20 0 R >> >> >>
endobj

10 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 18 0 R /Resources << /Font << /F1 20 0 R >> >> >>
endobj

11 0 obj
<< /Length 800 >>
stream
BT
/F1 28 Tf
72 700 Td
(7 Ways to Generate More) Tj
0 -35 Td
(Local Plumbing Leads) Tj
/F1 14 Tf
0 -50 Td
(Proven strategies that top plumbers use) Tj
0 -20 Td
(to fill their calendars with high-paying jobs) Tj
/F1 12 Tf
0 -60 Td
(ServiceAgentAI.com) Tj
0 -40 Td
(----------------------------------------) Tj
0 -30 Td
(TABLE OF CONTENTS) Tj
0 -25 Td
(1. Never Miss Another Call with 24/7 AI Dispatching) Tj
0 -18 Td
(2. Dominate Google Maps with Strategic Reviews) Tj
0 -18 Td
(3. Build a Referral Engine That Runs on Autopilot) Tj
0 -18 Td
(4. Target Emergency Keywords in Local SEO) Tj
0 -18 Td
(5. Convert Website Visitors with Live Chat) Tj
0 -18 Td
(6. Run Hyper-Local Facebook Ads) Tj
0 -18 Td
(7. Follow Up Like Your Business Depends On It) Tj
ET
endstream
endobj

12 0 obj
<< /Length 900 >>
stream
BT
/F1 18 Tf
72 720 Td
(Strategy #1) Tj
/F1 14 Tf
0 -30 Td
(Never Miss Another Call with 24/7 AI Dispatching) Tj
/F1 11 Tf
0 -35 Td
(The average plumber misses 40% of incoming calls.) Tj
0 -16 Td
(That is money walking out the door every single day.) Tj
0 -25 Td
(When a homeowner has a burst pipe at 2 AM, they are not) Tj
0 -16 Td
(leaving a voicemail - they are calling your competitor.) Tj
0 -30 Td
(THE SOLUTION:) Tj
0 -20 Td
(Implement an AI-powered phone system that answers every) Tj
0 -16 Td
(call instantly, 24/7/365. Modern AI dispatchers can:) Tj
0 -25 Td
(- Answer calls in under 2 seconds) Tj
0 -16 Td
(- Qualify leads and book appointments) Tj
0 -16 Td
(- Handle emergency dispatching) Tj
0 -16 Td
(- Upsell additional services) Tj
0 -30 Td
(REAL RESULTS:) Tj
0 -20 Td
(Plumbers using AI dispatching report 35-50% more booked) Tj
0 -16 Td
(jobs within the first month.) Tj
ET
endstream
endobj

13 0 obj
<< /Length 850 >>
stream
BT
/F1 18 Tf
72 720 Td
(Strategy #2) Tj
/F1 14 Tf
0 -30 Td
(Dominate Google Maps with Strategic Reviews) Tj
/F1 11 Tf
0 -35 Td
(93% of consumers read online reviews before hiring a) Tj
0 -16 Td
(service provider. Your Google Business Profile is your) Tj
0 -16 Td
(most valuable free marketing asset.) Tj
0 -30 Td
(ACTION STEPS:) Tj
0 -20 Td
(- Ask for reviews at the moment of maximum satisfaction) Tj
0 -16 Td
(- Respond to every review within 24 hours) Tj
0 -16 Td
(- Include photos of completed work in your responses) Tj
0 -16 Td
(- Use review management software to automate follow-ups) Tj
0 -30 Td
(PRO TIP:) Tj
0 -20 Td
(Aim for 5+ new reviews per week. Businesses with 50+) Tj
0 -16 Td
(reviews get 266% more leads than those with fewer.) Tj
ET
endstream
endobj

14 0 obj
<< /Length 850 >>
stream
BT
/F1 18 Tf
72 720 Td
(Strategy #3) Tj
/F1 14 Tf
0 -30 Td
(Build a Referral Engine That Runs on Autopilot) Tj
/F1 11 Tf
0 -35 Td
(Word-of-mouth referrals convert 4x better than any other) Tj
0 -16 Td
(lead source. The problem? Most plumbers leave referrals) Tj
0 -16 Td
(to chance.) Tj
0 -30 Td
(SYSTEMIZE YOUR REFERRALS:) Tj
0 -20 Td
(- Offer a $50 credit for every referral that books) Tj
0 -16 Td
(- Send thank-you cards with referral cards included) Tj
0 -16 Td
(- Create a VIP Club for repeat customers) Tj
0 -16 Td
(- Partner with realtors, property managers, contractors) Tj
0 -30 Td
(EXPECTED ROI:) Tj
0 -20 Td
(A proper referral system should generate 20-30% of your) Tj
0 -16 Td
(new business within 6 months.) Tj
ET
endstream
endobj

15 0 obj
<< /Length 850 >>
stream
BT
/F1 18 Tf
72 720 Td
(Strategy #4) Tj
/F1 14 Tf
0 -30 Td
(Target Emergency Keywords in Local SEO) Tj
/F1 11 Tf
0 -35 Td
(When someone searches emergency plumber near me, they) Tj
0 -16 Td
(are ready to pay premium prices. These high-intent) Tj
0 -16 Td
(keywords are gold.) Tj
0 -30 Td
(FOCUS ON:) Tj
0 -20 Td
(- Emergency plumber [your city]) Tj
0 -16 Td
(- 24 hour plumber near me) Tj
0 -16 Td
(- Same day plumbing service) Tj
0 -16 Td
(- Burst pipe repair [your city]) Tj
0 -30 Td
(QUICK WIN:) Tj
0 -20 Td
(Create dedicated landing pages for each emergency service.) Tj
0 -16 Td
(Include your phone number prominently and enable) Tj
0 -16 Td
(click-to-call on mobile.) Tj
ET
endstream
endobj

16 0 obj
<< /Length 850 >>
stream
BT
/F1 18 Tf
72 720 Td
(Strategy #5) Tj
/F1 14 Tf
0 -30 Td
(Convert Website Visitors with Live Chat) Tj
/F1 11 Tf
0 -35 Td
(78% of customers buy from the first business that) Tj
0 -16 Td
(responds. A live chat or AI chatbot on your website) Tj
0 -16 Td
(captures leads while you are on the job.) Tj
0 -30 Td
(BEST PRACTICES:) Tj
0 -20 Td
(- Greet visitors within 10 seconds) Tj
0 -16 Td
(- Qualify leads with 3-4 simple questions) Tj
0 -16 Td
(- Offer instant appointment booking) Tj
0 -16 Td
(- Capture contact info for follow-up) Tj
0 -30 Td
(THE NUMBERS:) Tj
0 -20 Td
(Websites with chat convert 40% more visitors into leads.) Tj
ET
endstream
endobj

17 0 obj
<< /Length 850 >>
stream
BT
/F1 18 Tf
72 720 Td
(Strategy #6) Tj
/F1 14 Tf
0 -30 Td
(Run Hyper-Local Facebook Ads) Tj
/F1 11 Tf
0 -35 Td
(Facebook lets you target homeowners within a 5-mile) Tj
0 -16 Td
(radius of your service area. This precision targeting) Tj
0 -16 Td
(means every dollar works harder.) Tj
0 -30 Td
(WINNING AD STRATEGY:) Tj
0 -20 Td
(- Target homeowners aged 35-65) Tj
0 -16 Td
(- Use before/after photos of your work) Tj
0 -16 Td
(- Highlight emergency availability) Tj
0 -16 Td
(- Include a clear call-to-action) Tj
0 -30 Td
(BUDGET TIP:) Tj
0 -20 Td
(Start with $10-20/day and scale what works.) Tj
0 -16 Td
(Track cost-per-lead religiously.) Tj
ET
endstream
endobj

18 0 obj
<< /Length 900 >>
stream
BT
/F1 18 Tf
72 720 Td
(Strategy #7) Tj
/F1 14 Tf
0 -30 Td
(Follow Up Like Your Business Depends On It) Tj
/F1 11 Tf
0 -35 Td
(80% of sales require 5+ follow-ups, but most plumbers) Tj
0 -16 Td
(give up after one. The money is in the follow-up.) Tj
0 -30 Td
(CREATE A FOLLOW-UP SYSTEM:) Tj
0 -20 Td
(- Day 1: Thank-you text/email) Tj
0 -16 Td
(- Day 3: Check-in call) Tj
0 -16 Td
(- Week 2: Maintenance reminder) Tj
0 -16 Td
(- Month 3: Seasonal service offer) Tj
0 -30 Td
(AUTOMATION IS KEY:) Tj
0 -20 Td
(Use a CRM or AI assistant to handle follow-ups) Tj
0 -16 Td
(automatically. You should be fixing pipes, not chasing) Tj
0 -16 Td
(paperwork.) Tj
0 -40 Td
(----------------------------------------) Tj
0 -25 Td
(Ready to 10x Your Leads?) Tj
0 -20 Td
(Visit ServiceAgentAI.com to get your AI dispatcher.) Tj
ET
endstream
endobj

20 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

xref
0 21
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000147 00000 n 
0000000276 00000 n 
0000000405 00000 n 
0000000534 00000 n 
0000000663 00000 n 
0000000792 00000 n 
0000000921 00000 n 
0000001051 00000 n 
0000001182 00000 n 
0000002035 00000 n 
0000002988 00000 n 
0000003891 00000 n 
0000004794 00000 n 
0000005697 00000 n 
0000006600 00000 n 
0000007503 00000 n 
0000008456 00000 n 
0000008456 00000 n 

trailer
<< /Size 21 /Root 1 0 R >>
startxref
8520
%%EOF`;

  return new TextEncoder().encode(content);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email } = await req.json();
    
    if (!email || !name) {
      return new Response(
        JSON.stringify({ error: 'Name and email are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Lead captured: ${name} - ${email}`);

    // Send to GHL webhook with source
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0] || name;
    const lastName = nameParts.slice(1).join(' ') || '';

    const ghlPayload = {
      firstName,
      lastName,
      email,
      name,
      source: "Lead Magnet - 7 Ways to Generate Plumbing Leads",
      tags: ["Lead Magnet Download", "Plumbing Leads Guide", "Website Visitor"],
      customField: {
        lead_magnet: "7 Ways to Generate More Local Plumbing Leads",
        download_date: new Date().toISOString(),
        source_url: "ServiceAgentAI.com",
      },
      timestamp: new Date().toISOString(),
    };

    console.log("Sending to GHL:", JSON.stringify(ghlPayload));

    try {
      const ghlResponse = await fetch(GHL_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(ghlPayload),
      });
      console.log("GHL response status:", ghlResponse.status);
    } catch (ghlError) {
      console.error("Error sending to GHL:", ghlError);
      // Continue anyway - don't block PDF download if GHL fails
    }

    // Generate PDF
    const pdfBytes = generatePDF();
    
    return new Response(pdfBytes.buffer as ArrayBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="7-Ways-To-Generate-Plumbing-Leads.pdf"',
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
