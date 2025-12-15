import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EnrichmentRequest {
  lead_id: string;
  force_refresh?: boolean;
}

interface EnrichedProfile {
  fit_score: number;
  interest_score: number;
  engagement_score: number;
  segment: string;
  routing_agent: string;
  intent_tags: string[];
  contact_risk: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body: EnrichmentRequest = await req.json();
    const { lead_id, force_refresh = false } = body;

    console.log(`[Lead Enrichment] Processing lead: ${lead_id}`);

    // Check if already enriched and not forcing refresh
    if (!force_refresh) {
      const { data: existingProfile } = await supabase
        .from("lead_enrichment_profiles")
        .select("*")
        .eq("lead_id", lead_id)
        .single();

      if (existingProfile && existingProfile.segment) {
        console.log(`[Lead Enrichment] Using cached profile for: ${lead_id}`);
        return new Response(JSON.stringify({ profile: existingProfile, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update queue status to processing
    await supabase
      .from("enrichment_queue")
      .upsert({
        lead_id,
        status: "processing",
        stage: "ingestion",
        attempts: 1,
      }, { onConflict: "lead_id" });

    // ============================================
    // STAGE 1: INGESTION & VALIDATION
    // ============================================
    console.log(`[Lead Enrichment] Stage 1: Ingestion`);
    
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      throw new Error(`Lead not found: ${lead_id}`);
    }

    // Validate contact info
    const emailValid = lead.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email);
    const phoneValid = lead.phone && lead.phone.length >= 10;

    await supabase
      .from("enrichment_queue")
      .update({ stage: "augmentation" })
      .eq("lead_id", lead_id);

    // ============================================
    // STAGE 2: DATA AUGMENTATION
    // ============================================
    console.log(`[Lead Enrichment] Stage 2: Augmentation`);

    // Fetch internal interaction data
    const [callsRes, messagesRes, analyticsRes] = await Promise.all([
      supabase
        .from("call_logs")
        .select("*")
        .eq("lead_id", lead_id),
      supabase
        .from("messages_unified")
        .select("*")
        .eq("lead_id", lead_id),
      supabase
        .from("analytics_events")
        .select("*")
        .eq("visitor_id", lead.visitor_id || "")
        .limit(100),
    ]);

    const calls = callsRes.data || [];
    const messages = messagesRes.data || [];
    const pageViews = analyticsRes.data || [];

    // Extract company info if available
    const companySize = lead.company_size || inferCompanySize(lead);
    const industryMatch = checkIndustryMatch(lead.industry);
    const annualRevenue = estimateRevenue(lead);

    await supabase
      .from("enrichment_queue")
      .update({ stage: "scoring" })
      .eq("lead_id", lead_id);

    // ============================================
    // STAGE 3: SCORING & TAGGING
    // ============================================
    console.log(`[Lead Enrichment] Stage 3: Scoring`);

    // Calculate Fit Score (0-100)
    let fitScore = 50; // Base score
    if (industryMatch) fitScore += 20;
    if (companySize === "medium" || companySize === "large") fitScore += 15;
    if (annualRevenue && annualRevenue > 500000) fitScore += 15;
    fitScore = Math.min(fitScore, 100);

    // Calculate Interest Score (0-100)
    let interestScore = 0;
    const contentDownloads = pageViews.filter(e => e.event_type === "download").length;
    const pageVisitCount = pageViews.length;
    interestScore += Math.min(contentDownloads * 15, 45);
    interestScore += Math.min(pageVisitCount * 2, 30);
    if (lead.lead_temperature === "hot") interestScore += 25;
    interestScore = Math.min(interestScore, 100);

    // Calculate Engagement Score (0-100)
    let engagementScore = 0;
    const callResponses = calls.filter(c => c.status === "completed").length;
    const emailOpens = messages.filter(m => (m.metadata as { opened?: boolean })?.opened).length;
    const formSubmissions = lead.source === "form" ? 1 : 0;
    const chatInteractions = messages.filter(m => m.channel_type === "chat").length;
    
    engagementScore += callResponses * 20;
    engagementScore += emailOpens * 5;
    engagementScore += formSubmissions * 15;
    engagementScore += Math.min(chatInteractions * 3, 30);
    engagementScore = Math.min(engagementScore, 100);

    // Detect Intent Tags
    const intentTags: string[] = [];
    if (pageViews.some(e => e.page_url?.includes("pricing"))) intentTags.push("researching_pricing");
    if (pageViews.some(e => e.page_url?.includes("demo"))) intentTags.push("interested_in_demo");
    if (lead.notes?.toLowerCase().includes("urgent") || lead.notes?.toLowerCase().includes("emergency")) {
      intentTags.push("emergency_repair");
    }
    if (lead.lead_temperature === "hot") intentTags.push("high_intent");
    if (callResponses > 0) intentTags.push("responsive_to_calls");

    // Detect Buying Signals
    const buyingSignals = [];
    if (pageViews.length > 10) buyingSignals.push({ signal: "high_page_views", weight: 2 });
    if (callResponses > 0) buyingSignals.push({ signal: "answered_call", weight: 3 });
    if (contentDownloads > 0) buyingSignals.push({ signal: "downloaded_content", weight: 2 });
    if (lead.revenue_value && lead.revenue_value > 1000) buyingSignals.push({ signal: "high_value_opportunity", weight: 4 });

    // Determine Contact Risk Flags
    const contactRisk: string[] = [];
    const phone = lead.phone || "";
    
    // Check for EU phone numbers (GDPR)
    const euCodes = ["+33", "+49", "+39", "+34", "+31", "+32", "+43", "+351", "+353"];
    if (euCodes.some(code => phone.startsWith(code))) {
      contactRisk.push("gdpr_applicable");
    }
    
    // Check for California numbers (CCPA)
    if (phone.startsWith("+1") && ["213", "310", "323", "408", "415", "510", "619", "650", "714", "818", "858", "909", "949"].some(ac => phone.includes(ac))) {
      contactRisk.push("ccpa_applicable");
    }

    // Check DNC status from lead data
    if (lead.do_not_contact) {
      contactRisk.push("dnc_listed");
    }

    await supabase
      .from("enrichment_queue")
      .update({ stage: "segmentation" })
      .eq("lead_id", lead_id);

    // ============================================
    // STAGE 4: SEGMENTATION & ROUTING
    // ============================================
    console.log(`[Lead Enrichment] Stage 4: Segmentation`);

    const totalScore = (fitScore + interestScore + engagementScore) / 3;
    let segment: string;
    let routingAgent: string;

    // Determine segment based on scores and risk
    if (contactRisk.includes("dnc_listed")) {
      segment = "compliance_hold";
      routingAgent = "human_bypass";
    } else if (totalScore >= 70 && intentTags.includes("high_intent")) {
      segment = "hot_lead";
      routingAgent = "power_dialer";
    } else if (fitScore >= 60 && interestScore < 40) {
      segment = "marketing_nurture";
      routingAgent = "sequences";
    } else if (fitScore >= 50) {
      segment = "cold_outreach";
      routingAgent = "outreach";
    } else {
      segment = "marketing_nurture";
      routingAgent = "sequences";
    }

    // Build the enriched profile
    const profile = {
      lead_id,
      fit_score: fitScore,
      company_size: companySize,
      industry_match: industryMatch,
      annual_revenue_estimate: annualRevenue,
      interest_score: interestScore,
      content_downloads: contentDownloads,
      page_visits: pageVisitCount,
      email_opens: emailOpens,
      engagement_score: engagementScore,
      call_responses: callResponses,
      form_submissions: formSubmissions,
      chat_interactions: chatInteractions,
      intent_tags: intentTags,
      buying_signals: buyingSignals,
      contact_risk: contactRisk,
      consent_verified: !contactRisk.includes("dnc_listed"),
      segment,
      routing_agent: routingAgent,
      enriched_data: {
        total_score: totalScore,
        email_valid: emailValid,
        phone_valid: phoneValid,
        interactions_count: calls.length + messages.length,
      },
      enrichment_source: "internal_system",
    };

    // Upsert the profile
    const { error: profileError } = await supabase
      .from("lead_enrichment_profiles")
      .upsert(profile, { onConflict: "lead_id" });

    if (profileError) {
      console.error("[Lead Enrichment] Profile save error:", profileError);
    }

    // Update lead with segment for quick access
    await supabase
      .from("leads")
      .update({
        lead_score: Math.round(totalScore),
        lead_temperature: segment === "hot_lead" ? "hot" : segment === "cold_outreach" ? "cold" : "warm",
      })
      .eq("id", lead_id);

    // Mark queue as completed
    await supabase
      .from("enrichment_queue")
      .update({
        status: "completed",
        stage: "segmentation",
        processed_at: new Date().toISOString(),
      })
      .eq("lead_id", lead_id);

    // Log activity
    await supabase.from("automation_logs").insert({
      function_name: "lead-enrichment",
      status: "completed",
      items_processed: 1,
      metadata: {
        lead_id,
        segment,
        routing_agent: routingAgent,
        total_score: totalScore,
      },
    });

    console.log(`[Lead Enrichment] Complete: ${lead_id} -> ${segment} (${routingAgent})`);

    return new Response(JSON.stringify({ profile, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Lead Enrichment] Error:", error);
    
    // Update queue with error
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Helper functions
function inferCompanySize(lead: { employee_count?: number; company?: string }): string {
  if (lead.employee_count) {
    if (lead.employee_count < 10) return "small";
    if (lead.employee_count < 100) return "medium";
    return "large";
  }
  // Infer from company name patterns
  const company = (lead.company || "").toLowerCase();
  if (company.includes("corp") || company.includes("inc") || company.includes("llc")) {
    return "medium";
  }
  return "small";
}

function checkIndustryMatch(industry?: string): boolean {
  if (!industry) return false;
  // HVAC target industries
  const targetIndustries = ["hvac", "plumbing", "electrical", "construction", "home services", "property management", "real estate"];
  return targetIndustries.some(t => industry.toLowerCase().includes(t));
}

function estimateRevenue(lead: { annual_revenue?: number; employee_count?: number }): number | null {
  if (lead.annual_revenue) return lead.annual_revenue;
  if (lead.employee_count) {
    // Rough estimate: $100k revenue per employee for service businesses
    return lead.employee_count * 100000;
  }
  return null;
}
