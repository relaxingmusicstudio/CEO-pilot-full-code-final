import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHL_WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/R76edRoS33Lv8KfplU5i/webhook-trigger/c79b5649-d39a-4858-ba1e-7b0b558125d3";

// Professional PDF generator with ApexLocal360 branding
function generateBrandedPDF(): Uint8Array {
  const pages: string[] = [];
  
  // Cover Page
  pages.push(`
q
0.118 0.227 0.373 rg
0 0 612 792 re f
Q
q
0.976 0.451 0.086 rg
50 350 512 4 re f
Q
BT
1 1 1 rg
/F2 42 Tf
50 520 Td
(7 PROVEN WAYS) Tj
0 -50 Td
(TO GENERATE MORE) Tj
0 -50 Td
(LOCAL PLUMBING LEADS) Tj
0.976 0.451 0.086 rg
/F1 16 Tf
0 -100 Td
(The Complete Playbook for Home Service Businesses) Tj
1 1 1 rg
/F1 12 Tf
0 -180 Td
(A Free Guide from ApexLocal360.com) Tj
0 -20 Td
(Your Partner in AI-Powered Business Growth) Tj
ET
`);

  // Page 2 - Introduction
  pages.push(`
q
0.118 0.227 0.373 rg
0 742 612 50 re f
Q
q
0.976 0.451 0.086 rg
0 738 612 4 re f
Q
BT
1 1 1 rg
/F2 12 Tf
50 762 Td
(APEXLOCAL360.COM) Tj
/F1 10 Tf
480 762 Td
(Page 2) Tj
0.118 0.227 0.373 rg
/F2 24 Tf
50 680 Td
(Why Most Plumbers Struggle) Tj
0 -30 Td
(To Get Consistent Leads) Tj
0.2 0.2 0.2 rg
/F1 12 Tf
50 600 Td
(If you are reading this, you probably know the frustration:) Tj
0 -24 Td
(Some weeks your phone rings nonstop. Other weeks? Crickets.) Tj
0 -40 Td
(Here is the truth most marketing agencies will not tell you:) Tj
0 -30 Td
(The problem is not that you need more marketing.) Tj
0 -20 Td
(The problem is that you are losing the leads you already have.) Tj
0.976 0.451 0.086 rg
/F2 14 Tf
0 -50 Td
(Consider these statistics:) Tj
0.2 0.2 0.2 rg
/F1 12 Tf
0 -30 Td
(   - 40% of service calls go unanswered after hours) Tj
0 -22 Td
(   - 78% of customers hire the first company that responds) Tj
0 -22 Td
(   - The average plumber loses $47,000/year in missed calls) Tj
0.118 0.227 0.373 rg
/F1 12 Tf
0 -50 Td
(This guide will show you exactly how to fix that and more.) Tj
0 -20 Td
(These are the same strategies our clients use to consistently) Tj
0 -20 Td
(book 35-50% more jobs every single month.) Tj
ET
`);

  // Page 3 - Strategy 1
  pages.push(`
q
0.118 0.227 0.373 rg
0 742 612 50 re f
Q
q
0.976 0.451 0.086 rg
0 738 612 4 re f
Q
BT
1 1 1 rg
/F2 12 Tf
50 762 Td
(APEXLOCAL360.COM) Tj
/F1 10 Tf
480 762 Td
(Page 3) Tj
0.976 0.451 0.086 rg
/F2 11 Tf
50 700 Td
(STRATEGY #1) Tj
0.118 0.227 0.373 rg
/F2 22 Tf
0 -30 Td
(Never Miss Another Call With) Tj
0 -28 Td
(24/7 AI-Powered Dispatching) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -35 Td
(Picture this: It is 2 AM on a Saturday. A homeowner has water) Tj
0 -18 Td
(gushing from a burst pipe. They are panicking. They call you.) Tj
0 -25 Td
(What happens next determines whether you book a $1,500 job) Tj
0 -18 Td
(or your competitor does.) Tj
0.976 0.451 0.086 rg
/F2 12 Tf
0 -35 Td
(THE SOLUTION:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -25 Td
(Deploy an AI phone agent that answers every call instantly,) Tj
0 -18 Td
(qualifies the lead, books appointments, and dispatches techs.) Tj
0 -25 Td
(Modern AI dispatchers deliver:) Tj
0 -22 Td
(   + Sub-2-second answer times, 24/7/365) Tj
0 -18 Td
(   + Professional call handling that matches your brand) Tj
0 -18 Td
(   + Automatic appointment booking and confirmations) Tj
0 -18 Td
(   + Smart upselling of additional services) Tj
0.118 0.227 0.373 rg
/F2 11 Tf
0 -30 Td
(REAL CLIENT RESULT:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -20 Td
("We went from missing 40% of after-hours calls to capturing) Tj
0 -18 Td
(100%. That translated to $8,400 in extra revenue the first month.") Tj
0 -18 Td
(- Mike T., Phoenix Plumbing Pro) Tj
ET
`);

  // Page 4 - Strategy 2
  pages.push(`
q
0.118 0.227 0.373 rg
0 742 612 50 re f
Q
q
0.976 0.451 0.086 rg
0 738 612 4 re f
Q
BT
1 1 1 rg
/F2 12 Tf
50 762 Td
(APEXLOCAL360.COM) Tj
/F1 10 Tf
480 762 Td
(Page 4) Tj
0.976 0.451 0.086 rg
/F2 11 Tf
50 700 Td
(STRATEGY #2) Tj
0.118 0.227 0.373 rg
/F2 22 Tf
0 -30 Td
(Dominate Google Maps With) Tj
0 -28 Td
(A Strategic Review System) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -35 Td
(93% of consumers check reviews before calling a service provider.) Tj
0 -18 Td
(Your Google Business Profile is the most valuable free marketing) Tj
0 -18 Td
(asset you own. Yet most plumbers ignore it completely.) Tj
0.976 0.451 0.086 rg
/F2 12 Tf
0 -35 Td
(THE 5-STAR REVIEW FORMULA:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -25 Td
(1. Ask at peak satisfaction - right after completing a job well) Tj
0 -20 Td
(2. Make it effortless - send a direct link via text) Tj
0 -20 Td
(3. Respond to EVERY review within 24 hours) Tj
0 -20 Td
(4. Include photos of your best work) Tj
0 -20 Td
(5. Automate the follow-up with review software) Tj
0.118 0.227 0.373 rg
/F2 11 Tf
0 -35 Td
(THE DATA:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -22 Td
(Businesses with 50+ reviews get 266% more leads than those) Tj
0 -18 Td
(with fewer. Aim for 5 new reviews per week minimum.) Tj
0 -30 Td
(Pro tip: Respond to negative reviews professionally. 45% of) Tj
0 -18 Td
(consumers say they would use a business that responds well) Tj
0 -18 Td
(to negative feedback over one with only positive reviews.) Tj
ET
`);

  // Page 5 - Strategy 3
  pages.push(`
q
0.118 0.227 0.373 rg
0 742 612 50 re f
Q
q
0.976 0.451 0.086 rg
0 738 612 4 re f
Q
BT
1 1 1 rg
/F2 12 Tf
50 762 Td
(APEXLOCAL360.COM) Tj
/F1 10 Tf
480 762 Td
(Page 5) Tj
0.976 0.451 0.086 rg
/F2 11 Tf
50 700 Td
(STRATEGY #3) Tj
0.118 0.227 0.373 rg
/F2 22 Tf
0 -30 Td
(Build A Referral Engine) Tj
0 -28 Td
(That Runs On Autopilot) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -35 Td
(Referrals convert at 4x the rate of any other lead source.) Tj
0 -18 Td
(They cost nothing to acquire. And they trust you from day one.) Tj
0 -25 Td
(The problem? Most plumbers leave referrals to chance.) Tj
0 -18 Td
(Hope is not a strategy. Systems are.) Tj
0.976 0.451 0.086 rg
/F2 12 Tf
0 -35 Td
(BUILD YOUR REFERRAL MACHINE:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -25 Td
(Step 1: Create a compelling offer) Tj
0 -18 Td
(   Give $50 credit for every referral that books. It pays for itself.) Tj
0 -22 Td
(Step 2: Make referring effortless) Tj
0 -18 Td
(   Send thank-you cards with referral cards included.) Tj
0 -22 Td
(Step 3: Build strategic partnerships) Tj
0 -18 Td
(   Realtors, property managers, and contractors are goldmines.) Tj
0 -22 Td
(Step 4: Create a VIP club for repeat customers) Tj
0 -18 Td
(   Priority scheduling + 10% discount = loyal advocates.) Tj
0.118 0.227 0.373 rg
/F2 11 Tf
0 -30 Td
(EXPECTED RESULT:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -20 Td
(A proper referral system should generate 20-30% of new business) Tj
0 -18 Td
(within 6 months. That is free, high-quality leads on autopilot.) Tj
ET
`);

  // Page 6 - Strategy 4
  pages.push(`
q
0.118 0.227 0.373 rg
0 742 612 50 re f
Q
q
0.976 0.451 0.086 rg
0 738 612 4 re f
Q
BT
1 1 1 rg
/F2 12 Tf
50 762 Td
(APEXLOCAL360.COM) Tj
/F1 10 Tf
480 762 Td
(Page 6) Tj
0.976 0.451 0.086 rg
/F2 11 Tf
50 700 Td
(STRATEGY #4) Tj
0.118 0.227 0.373 rg
/F2 22 Tf
0 -30 Td
(Target Emergency Keywords) Tj
0 -28 Td
(That Print Money) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -35 Td
(When someone searches "emergency plumber near me" at 11 PM,) Tj
0 -18 Td
(they are not browsing. They are ready to pay premium prices NOW.) Tj
0 -25 Td
(These high-intent keywords are pure gold. Own them.) Tj
0.976 0.451 0.086 rg
/F2 12 Tf
0 -35 Td
(HIGH-VALUE KEYWORDS TO TARGET:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -25 Td
(   + "Emergency plumber [your city]") Tj
0 -18 Td
(   + "24 hour plumber near me") Tj
0 -18 Td
(   + "Same day plumbing service [your city]") Tj
0 -18 Td
(   + "Burst pipe repair near me") Tj
0 -18 Td
(   + "Water heater repair [your city]") Tj
0.118 0.227 0.373 rg
/F2 11 Tf
0 -35 Td
(QUICK IMPLEMENTATION:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -22 Td
(1. Create dedicated landing pages for each emergency service) Tj
0 -18 Td
(2. Put your phone number at the top, big and bold) Tj
0 -18 Td
(3. Enable click-to-call on mobile) Tj
0 -18 Td
(4. Add schema markup for local business) Tj
0 -18 Td
(5. Collect reviews that mention specific services) Tj
ET
`);

  // Page 7 - Strategy 5 & 6
  pages.push(`
q
0.118 0.227 0.373 rg
0 742 612 50 re f
Q
q
0.976 0.451 0.086 rg
0 738 612 4 re f
Q
BT
1 1 1 rg
/F2 12 Tf
50 762 Td
(APEXLOCAL360.COM) Tj
/F1 10 Tf
480 762 Td
(Page 7) Tj
0.976 0.451 0.086 rg
/F2 11 Tf
50 700 Td
(STRATEGY #5) Tj
0.118 0.227 0.373 rg
/F2 18 Tf
0 -25 Td
(Convert Website Visitors With AI Chat) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -28 Td
(78% of customers hire the first business that responds.) Tj
0 -18 Td
(An AI chatbot captures leads 24/7 while you focus on jobs.) Tj
0 -22 Td
(Key features: Instant greeting, lead qualification, appointment) Tj
0 -18 Td
(booking, and seamless handoff to your team when needed.) Tj
0 -18 Td
(Result: 40% more website visitors become paying customers.) Tj
0.976 0.451 0.086 rg
/F2 11 Tf
0 -40 Td
(STRATEGY #6) Tj
0.118 0.227 0.373 rg
/F2 18 Tf
0 -25 Td
(Run Hyper-Local Facebook Ads) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -28 Td
(Facebook lets you target homeowners within a 5-mile radius.) Tj
0 -18 Td
(This precision means every dollar works harder for you.) Tj
0.976 0.451 0.086 rg
/F2 11 Tf
0 -28 Td
(WINNING FORMULA:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -22 Td
(   + Target homeowners aged 35-65 in your service area) Tj
0 -18 Td
(   + Use before/after photos of your best work) Tj
0 -18 Td
(   + Lead with 24/7 availability in your headline) Tj
0 -18 Td
(   + Start with $15/day, scale what converts) Tj
ET
`);

  // Page 8 - Strategy 7 & CTA
  pages.push(`
q
0.118 0.227 0.373 rg
0 742 612 50 re f
Q
q
0.976 0.451 0.086 rg
0 738 612 4 re f
Q
BT
1 1 1 rg
/F2 12 Tf
50 762 Td
(APEXLOCAL360.COM) Tj
/F1 10 Tf
480 762 Td
(Page 8) Tj
0.976 0.451 0.086 rg
/F2 11 Tf
50 700 Td
(STRATEGY #7) Tj
0.118 0.227 0.373 rg
/F2 18 Tf
0 -25 Td
(Follow Up Like Your Business Depends On It) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -28 Td
(80% of sales require 5+ follow-ups. Most plumbers quit after one.) Tj
0 -18 Td
(The fortune is in the follow-up. Automate it.) Tj
0.976 0.451 0.086 rg
/F2 11 Tf
0 -28 Td
(THE FOLLOW-UP SEQUENCE:) Tj
0.2 0.2 0.2 rg
/F1 11 Tf
0 -22 Td
(   Day 1: Thank-you text with maintenance tips) Tj
0 -18 Td
(   Day 3: Quick check-in call) Tj
0 -18 Td
(   Week 2: Seasonal maintenance reminder) Tj
0 -18 Td
(   Month 3: Exclusive returning customer offer) Tj
ET
q
0.976 0.451 0.086 rg
50 320 512 120 re f
Q
BT
1 1 1 rg
/F2 20 Tf
80 400 Td
(Ready To 10X Your Leads?) Tj
/F1 12 Tf
0 -35 Td
(These strategies work. But implementing them takes time) Tj
0 -18 Td
(you do not have. That is where we come in.) Tj
/F2 14 Tf
0 -35 Td
(Visit ApexLocal360.com to get your AI-powered) Tj
0 -20 Td
(dispatcher and watch your business transform.) Tj
ET
q
0.118 0.227 0.373 rg
50 100 512 60 re f
Q
BT
1 1 1 rg
/F1 10 Tf
180 125 Td
(ApexLocal360.com | AI-Powered Growth for Local Businesses) Tj
ET
`);

  // Build PDF structure
  let pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [`;
  
  for (let i = 0; i < pages.length; i++) {
    pdf += `${3 + i} 0 R `;
  }
  pdf += `] /Count ${pages.length} >>
endobj

`;

  // Page objects
  for (let i = 0; i < pages.length; i++) {
    pdf += `${3 + i} 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${3 + pages.length + i} 0 R /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R /F2 ${4 + pages.length * 2} 0 R >> >> >>
endobj

`;
  }

  // Content streams
  for (let i = 0; i < pages.length; i++) {
    const content = pages[i];
    pdf += `${3 + pages.length + i} 0 obj
<< /Length ${content.length} >>
stream
${content}
endstream
endobj

`;
  }

  // Fonts
  pdf += `${3 + pages.length * 2} 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

${4 + pages.length * 2} 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj

`;

  // Cross-reference table and trailer
  pdf += `xref
0 ${5 + pages.length * 2}
0000000000 65535 f 
`;

  for (let i = 1; i < 5 + pages.length * 2; i++) {
    pdf += `${String(i * 100).padStart(10, '0')} 00000 n 
`;
  }

  pdf += `
trailer
<< /Size ${5 + pages.length * 2} /Root 1 0 R >>
startxref
${pdf.length}
%%EOF`;

  return new TextEncoder().encode(pdf);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, action } = await req.json();
    
    // If action is 'download', just return the PDF
    if (action === 'download') {
      console.log('Generating branded PDF for ApexLocal360');
      const pdfBytes = generateBrandedPDF();
      return new Response(pdfBytes.buffer as ArrayBuffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="7-Ways-To-Generate-Plumbing-Leads-ApexLocal360.pdf"',
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

    console.log(`Lead captured for ApexLocal360: ${name} - ${email}`);

    // Send to GHL webhook with source
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0] || name;
    const lastName = nameParts.slice(1).join(' ') || '';

    const ghlPayload = {
      firstName,
      lastName,
      email,
      name,
      source: "Lead Magnet - ApexLocal360 - Local Service Playbook",
      tags: ["Lead Magnet Download", "Local Service Playbook", "ApexLocal360", "Website Visitor", "Playbook Download"],
      customField: {
        lead_magnet: "The Local Service Playbook",
        download_date: new Date().toISOString(),
        source_url: "ApexLocal360.com",
      },
      timestamp: new Date().toISOString(),
    };

    console.log("Sending to GHL:", JSON.stringify(ghlPayload));

    try {
      const ghlResponse = await fetch(GHL_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
