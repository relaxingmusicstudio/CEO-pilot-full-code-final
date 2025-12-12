import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHL_WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/R76edRoS33Lv8KfplU5i/webhook-trigger/c79b5649-d39a-4858-ba1e-7b0b558125d3";

// Generate a branded PDF with navy blue (#1e3a5f) and orange (#f97316) colors
function generatePDF(): Uint8Array {
  // Navy: RGB(30, 58, 95) | Orange: RGB(249, 115, 22)
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R 6 0 R 7 0 R 8 0 R 9 0 R 10 0 R] /Count 8 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 11 0 R /Resources << /Font << /F1 20 0 R /F2 21 0 R >> >> >>
endobj

4 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 12 0 R /Resources << /Font << /F1 20 0 R /F2 21 0 R >> >> >>
endobj

5 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 13 0 R /Resources << /Font << /F1 20 0 R /F2 21 0 R >> >> >>
endobj

6 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 14 0 R /Resources << /Font << /F1 20 0 R /F2 21 0 R >> >> >>
endobj

7 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 15 0 R /Resources << /Font << /F1 20 0 R /F2 21 0 R >> >> >>
endobj

8 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 16 0 R /Resources << /Font << /F1 20 0 R /F2 21 0 R >> >> >>
endobj

9 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 17 0 R /Resources << /Font << /F1 20 0 R /F2 21 0 R >> >> >>
endobj

10 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 18 0 R /Resources << /Font << /F1 20 0 R /F2 21 0 R >> >> >>
endobj

11 0 obj
<< /Length 1100 >>
stream
q
0.118 0.227 0.373 rg
0 692 612 100 re f
Q
BT
1 1 1 rg
/F2 32 Tf
72 740 Td
(7 WAYS TO GENERATE) Tj
0 -38 Td
(MORE LOCAL PLUMBING LEADS) Tj
0.976 0.451 0.086 rg
/F1 14 Tf
0 -50 Td
(ServiceAgentAI.com) Tj
0.118 0.227 0.373 rg
/F2 16 Tf
0 -80 Td
(TABLE OF CONTENTS) Tj
/F1 12 Tf
0.2 0.2 0.2 rg
0 -35 Td
(1. Never Miss Another Call with 24/7 AI Dispatching ........... 2) Tj
0 -22 Td
(2. Dominate Google Maps with Strategic Reviews ................ 3) Tj
0 -22 Td
(3. Build a Referral Engine That Runs on Autopilot ............... 4) Tj
0 -22 Td
(4. Target Emergency Keywords in Local SEO ........................ 5) Tj
0 -22 Td
(5. Convert Website Visitors with Live Chat ............................ 6) Tj
0 -22 Td
(6. Run Hyper-Local Facebook Ads ............................................ 7) Tj
0 -22 Td
(7. Follow Up Like Your Business Depends On It ................... 8) Tj
ET
endstream
endobj

12 0 obj
<< /Length 1200 >>
stream
q
0.118 0.227 0.373 rg
0 752 612 40 re f
Q
BT
1 1 1 rg
/F2 14 Tf
72 765 Td
(ServiceAgentAI.com) Tj
500 0 Td
(Page 2) Tj
0.976 0.451 0.086 rg
/F2 10 Tf
72 730 Td
(STRATEGY #1) Tj
0.118 0.227 0.373 rg
/F2 18 Tf
0 -25 Td
(Never Miss Another Call with 24/7 AI Dispatching) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -30 Td
(The average plumber misses 40% of incoming calls. That is money) Tj
0 -16 Td
(walking out the door every single day.) Tj
0 -25 Td
(When a homeowner has a burst pipe at 2 AM, they are not leaving a) Tj
0 -16 Td
(voicemail - they are calling your competitor.) Tj
0.976 0.451 0.086 rg
/F2 12 Tf
0 -30 Td
(THE SOLUTION:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -20 Td
(Implement an AI-powered phone system that answers every call) Tj
0 -16 Td
(instantly, 24/7/365. Modern AI dispatchers can:) Tj
0 -22 Td
(   - Answer calls in under 2 seconds) Tj
0 -16 Td
(   - Qualify leads and book appointments automatically) Tj
0 -16 Td
(   - Handle emergency dispatching) Tj
0 -16 Td
(   - Upsell additional services) Tj
0.118 0.227 0.373 rg
/F2 12 Tf
0 -30 Td
(REAL RESULTS:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -20 Td
(Plumbers using AI dispatching report 35-50% more booked jobs) Tj
0 -16 Td
(within the first month.) Tj
ET
endstream
endobj

13 0 obj
<< /Length 1150 >>
stream
q
0.118 0.227 0.373 rg
0 752 612 40 re f
Q
BT
1 1 1 rg
/F2 14 Tf
72 765 Td
(ServiceAgentAI.com) Tj
500 0 Td
(Page 3) Tj
0.976 0.451 0.086 rg
/F2 10 Tf
72 730 Td
(STRATEGY #2) Tj
0.118 0.227 0.373 rg
/F2 18 Tf
0 -25 Td
(Dominate Google Maps with Strategic Reviews) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -30 Td
(93% of consumers read online reviews before hiring a service provider.) Tj
0 -16 Td
(Your Google Business Profile is your most valuable free marketing asset.) Tj
0.976 0.451 0.086 rg
/F2 12 Tf
0 -30 Td
(ACTION STEPS:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -22 Td
(   - Ask for reviews at the moment of maximum satisfaction) Tj
0 -16 Td
(   - Respond to every review within 24 hours) Tj
0 -16 Td
(   - Include photos of completed work in your responses) Tj
0 -16 Td
(   - Use review management software to automate follow-ups) Tj
0.118 0.227 0.373 rg
/F2 12 Tf
0 -30 Td
(PRO TIP:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -20 Td
(Aim for 5+ new reviews per week. Businesses with 50+ reviews get) Tj
0 -16 Td
(266% more leads than those with fewer.) Tj
ET
endstream
endobj

14 0 obj
<< /Length 1100 >>
stream
q
0.118 0.227 0.373 rg
0 752 612 40 re f
Q
BT
1 1 1 rg
/F2 14 Tf
72 765 Td
(ServiceAgentAI.com) Tj
500 0 Td
(Page 4) Tj
0.976 0.451 0.086 rg
/F2 10 Tf
72 730 Td
(STRATEGY #3) Tj
0.118 0.227 0.373 rg
/F2 18 Tf
0 -25 Td
(Build a Referral Engine That Runs on Autopilot) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -30 Td
(Word-of-mouth referrals convert 4x better than any other lead source.) Tj
0 -16 Td
(The problem? Most plumbers leave referrals to chance.) Tj
0.976 0.451 0.086 rg
/F2 12 Tf
0 -30 Td
(SYSTEMIZE YOUR REFERRALS:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -22 Td
(   - Offer a $50 credit for every referral that books) Tj
0 -16 Td
(   - Send thank-you cards with referral cards included) Tj
0 -16 Td
(   - Create a VIP Club for repeat customers) Tj
0 -16 Td
(   - Partner with realtors, property managers, and contractors) Tj
0.118 0.227 0.373 rg
/F2 12 Tf
0 -30 Td
(EXPECTED ROI:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -20 Td
(A proper referral system should generate 20-30% of your new) Tj
0 -16 Td
(business within 6 months.) Tj
ET
endstream
endobj

15 0 obj
<< /Length 1100 >>
stream
q
0.118 0.227 0.373 rg
0 752 612 40 re f
Q
BT
1 1 1 rg
/F2 14 Tf
72 765 Td
(ServiceAgentAI.com) Tj
500 0 Td
(Page 5) Tj
0.976 0.451 0.086 rg
/F2 10 Tf
72 730 Td
(STRATEGY #4) Tj
0.118 0.227 0.373 rg
/F2 18 Tf
0 -25 Td
(Target Emergency Keywords in Local SEO) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -30 Td
(When someone searches emergency plumber near me, they are ready) Tj
0 -16 Td
(to pay premium prices. These high-intent keywords are gold.) Tj
0.976 0.451 0.086 rg
/F2 12 Tf
0 -30 Td
(FOCUS ON THESE KEYWORDS:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -22 Td
(   - Emergency plumber [your city]) Tj
0 -16 Td
(   - 24 hour plumber near me) Tj
0 -16 Td
(   - Same day plumbing service) Tj
0 -16 Td
(   - Burst pipe repair [your city]) Tj
0.118 0.227 0.373 rg
/F2 12 Tf
0 -30 Td
(QUICK WIN:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -20 Td
(Create dedicated landing pages for each emergency service. Include) Tj
0 -16 Td
(your phone number prominently and enable click-to-call on mobile.) Tj
ET
endstream
endobj

16 0 obj
<< /Length 1050 >>
stream
q
0.118 0.227 0.373 rg
0 752 612 40 re f
Q
BT
1 1 1 rg
/F2 14 Tf
72 765 Td
(ServiceAgentAI.com) Tj
500 0 Td
(Page 6) Tj
0.976 0.451 0.086 rg
/F2 10 Tf
72 730 Td
(STRATEGY #5) Tj
0.118 0.227 0.373 rg
/F2 18 Tf
0 -25 Td
(Convert Website Visitors with Live Chat) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -30 Td
(78% of customers buy from the first business that responds. A live) Tj
0 -16 Td
(chat or AI chatbot captures leads while you are on the job.) Tj
0.976 0.451 0.086 rg
/F2 12 Tf
0 -30 Td
(BEST PRACTICES:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -22 Td
(   - Greet visitors within 10 seconds) Tj
0 -16 Td
(   - Qualify leads with 3-4 simple questions) Tj
0 -16 Td
(   - Offer instant appointment booking) Tj
0 -16 Td
(   - Capture contact info for follow-up) Tj
0.118 0.227 0.373 rg
/F2 12 Tf
0 -30 Td
(THE NUMBERS:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -20 Td
(Websites with chat convert 40% more visitors into leads.) Tj
ET
endstream
endobj

17 0 obj
<< /Length 1050 >>
stream
q
0.118 0.227 0.373 rg
0 752 612 40 re f
Q
BT
1 1 1 rg
/F2 14 Tf
72 765 Td
(ServiceAgentAI.com) Tj
500 0 Td
(Page 7) Tj
0.976 0.451 0.086 rg
/F2 10 Tf
72 730 Td
(STRATEGY #6) Tj
0.118 0.227 0.373 rg
/F2 18 Tf
0 -25 Td
(Run Hyper-Local Facebook Ads) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -30 Td
(Facebook lets you target homeowners within a 5-mile radius of your) Tj
0 -16 Td
(service area. This precision targeting means every dollar works harder.) Tj
0.976 0.451 0.086 rg
/F2 12 Tf
0 -30 Td
(WINNING AD STRATEGY:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -22 Td
(   - Target homeowners aged 35-65) Tj
0 -16 Td
(   - Use before/after photos of your work) Tj
0 -16 Td
(   - Highlight emergency availability) Tj
0 -16 Td
(   - Include a clear call-to-action) Tj
0.118 0.227 0.373 rg
/F2 12 Tf
0 -30 Td
(BUDGET TIP:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -20 Td
(Start with $10-20/day and scale what works. Track cost-per-lead.) Tj
ET
endstream
endobj

18 0 obj
<< /Length 1200 >>
stream
q
0.118 0.227 0.373 rg
0 752 612 40 re f
Q
BT
1 1 1 rg
/F2 14 Tf
72 765 Td
(ServiceAgentAI.com) Tj
500 0 Td
(Page 8) Tj
0.976 0.451 0.086 rg
/F2 10 Tf
72 730 Td
(STRATEGY #7) Tj
0.118 0.227 0.373 rg
/F2 18 Tf
0 -25 Td
(Follow Up Like Your Business Depends On It) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -30 Td
(80% of sales require 5+ follow-ups, but most plumbers give up after) Tj
0 -16 Td
(one. The money is in the follow-up.) Tj
0.976 0.451 0.086 rg
/F2 12 Tf
0 -30 Td
(CREATE A FOLLOW-UP SYSTEM:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -22 Td
(   - Day 1: Thank-you text/email) Tj
0 -16 Td
(   - Day 3: Check-in call) Tj
0 -16 Td
(   - Week 2: Maintenance reminder) Tj
0 -16 Td
(   - Month 3: Seasonal service offer) Tj
0.118 0.227 0.373 rg
/F2 12 Tf
0 -30 Td
(AUTOMATION IS KEY:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -20 Td
(Use a CRM or AI assistant to handle follow-ups automatically.) Tj
0 -30 Td
(-------------------------------------------------------------------) Tj
0.976 0.451 0.086 rg
/F2 14 Tf
0 -30 Td
(Ready to 10x Your Leads?) Tj
0.118 0.227 0.373 rg
/F1 12 Tf
0 -22 Td
(Visit ServiceAgentAI.com to get your AI dispatcher today.) Tj
ET
endstream
endobj

20 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

21 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj

xref
0 22
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000147 00000 n 
0000000282 00000 n 
0000000417 00000 n 
0000000552 00000 n 
0000000687 00000 n 
0000000822 00000 n 
0000000957 00000 n 
0000001093 00000 n 
0000001230 00000 n 
0000002383 00000 n 
0000003636 00000 n 
0000004839 00000 n 
0000005992 00000 n 
0000007145 00000 n 
0000008248 00000 n 
0000009351 00000 n 
0000010604 00000 n 
0000010604 00000 n 
0000010670 00000 n 

trailer
<< /Size 22 /Root 1 0 R >>
startxref
10740
%%EOF`;

  return new TextEncoder().encode(content);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, action } = await req.json();
    
    // If action is 'download', just return the PDF
    if (action === 'download') {
      console.log('Generating PDF for download');
      const pdfBytes = generatePDF();
      return new Response(pdfBytes.buffer as ArrayBuffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="7-Ways-To-Generate-Plumbing-Leads.pdf"',
        },
      });
    }
    
    // Otherwise, capture lead and send to GHL
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
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Lead captured successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
