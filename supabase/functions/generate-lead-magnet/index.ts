import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHL_WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/R76edRoS33Lv8KfplU5i/webhook-trigger/c79b5649-d39a-4858-ba1e-7b0b558125d3";

// Professional PDF generator with branding
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
(LOCAL SERVICE LEADS) Tj
0.976 0.451 0.086 rg
/F1 16 Tf
0 -100 Td
(The Complete Playbook for Home Service Businesses) Tj
1 1 1 rg
/F1 12 Tf
0 -180 Td
(A Free Guide from [MY_COMPANY_NAME]) Tj
0 -20 Td
(Your Partner in AI-Powered Business Growth) Tj
ET
`);

  // Build PDF structure
  let objects: string[] = [];
  let objectCount = 0;
  
  const addObject = (content: string): number => {
    objectCount++;
    objects.push(`${objectCount} 0 obj\n${content}\nendobj\n`);
    return objectCount;
  };
  
  // Catalog
  const catalogId = addObject(`<< /Type /Catalog /Pages 2 0 R >>`);
  
  // Pages container
  const pagesId = addObject(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
  
  // Single page
  const pageId = addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`);
  
  // Page content
  const content = `
BT
0.118 0.227 0.373 rg
/F2 36 Tf
50 700 Td
(The Local Service Playbook) Tj
0 0 0 rg
/F1 14 Tf
0 -50 Td
(7 Proven Strategies for HVAC Business Growth) Tj
/F1 12 Tf
0 -40 Td
(Thank you for downloading! Check your email for the full guide.) Tj
ET
`;
  
  const streamContent = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  const contentId = addObject(streamContent);
  
  // Fonts
  const font1Id = addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  const font2Id = addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`);
  
  // Build PDF
  let pdf = "%PDF-1.4\n";
  let xref = "xref\n0 " + (objectCount + 1) + "\n0000000000 65535 f \n";
  let offset = pdf.length;
  
  for (let i = 0; i < objects.length; i++) {
    xref += offset.toString().padStart(10, '0') + " 00000 n \n";
    pdf += objects[i];
    offset = pdf.length;
  }
  
  pdf += xref;
  pdf += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`;
  
  return new TextEncoder().encode(pdf);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, name } = await req.json();
    
    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing lead magnet request for:", email);

    // Send to GHL webhook with HVAC tags
    const webhookPayload = {
      email: email,
      name: name || "",
      source: "hvac-playbook-download",
      tags: ["hvac-lead", "playbook-download"],
      customField: {
        "hvac_playbook": "downloaded",
        "download_date": new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    console.log("Sending to GHL webhook:", JSON.stringify(webhookPayload));

    const ghlResponse = await fetch(GHL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookPayload),
    });

    console.log("GHL webhook response:", ghlResponse.status);

    // Generate PDF
    const pdfBytes = generateBrandedPDF();
    const pdfBase64 = btoa(String.fromCharCode(...pdfBytes));

    return new Response(
      JSON.stringify({ 
        success: true,
        pdf: pdfBase64,
        filename: "Local-Service-Playbook.pdf",
        message: "Lead magnet generated successfully"
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: unknown) {
    console.error("Error in generate-lead-magnet:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
