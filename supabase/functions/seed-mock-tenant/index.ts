import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Predefined business scenarios
const scenarios = {
  saas: {
    scenario_key: "saas",
    business_name: "QuickScale Tech",
    industry: "software",
    business_model: "saas",
    target_customer: {
      type: "b2b",
      size: "smb",
      decision_makers: ["CTO", "VP Engineering", "Product Manager"],
      pain_points: ["scaling issues", "technical debt", "team productivity"],
      buying_cycle: "21-45 days",
    },
    brand_voice: {
      tone: "professional",
      style: "technical",
      formality: "moderate",
      personality: ["innovative", "reliable", "expert"],
    },
    products_services: [
      { name: "Starter", price: 49, billing: "monthly", features: ["5 users", "Basic analytics", "Email support"] },
      { name: "Growth", price: 149, billing: "monthly", features: ["25 users", "Advanced analytics", "Priority support", "API access"] },
      { name: "Enterprise", price: 499, billing: "monthly", features: ["Unlimited users", "Custom integrations", "Dedicated CSM", "SLA"] },
    ],
    pricing_strategy: {
      model: "tiered_subscription",
      annual_discount: 20,
      trial_days: 14,
    },
    competitors: [
      { name: "TechRival Inc", strength: "market share", weakness: "outdated UI" },
      { name: "ScaleUp Pro", strength: "pricing", weakness: "limited features" },
    ],
    unique_value_proposition: "The only platform that combines AI-powered scaling with enterprise-grade security",
    sales_cycle_days: 28,
    average_deal_value: 2988,
    churn_rate: 0.04,
  },

  local_service: {
    scenario_key: "local_service",
    business_name: "Heritage HVAC Services",
    industry: "hvac",
    business_model: "local_service",
    target_customer: {
      type: "homeowner",
      demographics: "homeowners 35-65",
      emergency_rate: 0.35,
      seasonal_peaks: ["summer", "winter"],
      pain_points: ["emergency breakdowns", "high energy bills", "unreliable contractors"],
    },
    brand_voice: {
      tone: "friendly",
      style: "helpful",
      formality: "casual",
      personality: ["trustworthy", "experienced", "local"],
    },
    products_services: [
      { name: "AC Repair", avg_price: 351, category: "repair" },
      { name: "Heating Repair", avg_price: 385, category: "repair" },
      { name: "System Replacement", avg_price: 8500, category: "installation" },
      { name: "Maintenance Plan", price: 199, billing: "annual", category: "maintenance" },
      { name: "Emergency Service", avg_price: 450, category: "emergency", premium: 1.5 },
    ],
    pricing_strategy: {
      model: "project_based",
      emergency_premium: 50,
      senior_discount: 10,
    },
    competitors: [
      { name: "CoolAir Express", strength: "24/7 availability", weakness: "higher prices" },
      { name: "Budget HVAC", strength: "low prices", weakness: "poor reviews" },
    ],
    unique_value_proposition: "Family-owned since 1985 with 100% satisfaction guarantee",
    sales_cycle_days: 3,
    average_deal_value: 2400,
    churn_rate: 0.08,
  },

  ecommerce: {
    scenario_key: "ecommerce",
    business_name: "UrbanFit Goods",
    industry: "retail",
    business_model: "ecommerce",
    target_customer: {
      type: "consumer",
      demographics: "fitness enthusiasts 25-45",
      interests: ["fitness", "wellness", "nutrition"],
      avg_order_frequency: "monthly",
      pain_points: ["quality concerns", "subscription fatigue", "product discovery"],
    },
    brand_voice: {
      tone: "energetic",
      style: "aspirational",
      formality: "casual",
      personality: ["motivating", "authentic", "community-focused"],
    },
    products_services: [
      { name: "Monthly Box", price: 49.99, billing: "monthly", contents: "curated fitness gear" },
      { name: "Quarterly Box", price: 129.99, billing: "quarterly", contents: "premium equipment + apparel" },
      { name: "Protein Supplements", avg_price: 35, category: "nutrition" },
      { name: "Workout Apparel", avg_price: 45, category: "apparel" },
      { name: "Fitness Equipment", avg_price: 75, category: "equipment" },
    ],
    pricing_strategy: {
      model: "subscription_plus_store",
      subscriber_discount: 15,
      free_shipping_threshold: 75,
    },
    competitors: [
      { name: "FitCrate", strength: "brand recognition", weakness: "generic products" },
      { name: "GymBox", strength: "low price", weakness: "quality issues" },
    ],
    unique_value_proposition: "Curated by real athletes, backed by science",
    sales_cycle_days: 7,
    average_deal_value: 65,
    churn_rate: 0.12,
  },
};

// Generate mock leads based on scenario
function generateMockLeads(scenario: unknown, count: number = 50) {
  const firstNames = ["John", "Jane", "Mike", "Sarah", "David", "Emily", "Chris", "Amanda", "Robert", "Lisa"];
  const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"];
  const companies = scenario.business_model === "saas" 
    ? ["Acme Corp", "TechStart Inc", "GrowthLabs", "DataDriven Co", "InnovateTech", "ScaleUp LLC", "CloudFirst", "DevOps Plus"]
    : scenario.business_model === "local_service"
    ? ["Oak Street Home", "Maple Avenue", "Downtown Condo", "Suburban Estate", "City Apartment"]
    : ["Fitness Studio", "Personal Trainer", "Gym Enthusiast", "Wellness Coach"];

  const sources = ["website", "referral", "google_ads", "linkedin", "cold_outreach", "trade_show", "content_marketing"];
  const statuses = ["new", "contacted", "qualified", "nurturing", "proposal", "negotiation"];

  return Array.from({ length: count }, (_, i) => {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const company = companies[Math.floor(Math.random() * companies.length)];
    
    return {
      name: `${firstName} ${lastName}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@${company.toLowerCase().replace(/\s/g, "")}.com`,
      phone: `+1555${String(Math.floor(Math.random() * 9000000) + 1000000)}`,
      company: scenario.business_model === "local_service" ? company : `${company} ${i + 1}`,
      source: sources[Math.floor(Math.random() * sources.length)],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      score: Math.floor(Math.random() * 100),
      estimated_value: scenario.average_deal_value * (0.5 + Math.random()),
      tags: [scenario.industry, scenario.business_model],
      is_demo_data: true,
    };
  });
}

// Generate mock deals
function generateMockDeals(leads: unknown[], scenario: unknown, count: number = 20) {
  const stages = ["discovery", "demo", "proposal", "negotiation", "closed_won", "closed_lost"];
  const selectedLeads = leads.slice(0, count);

  return selectedLeads.map((lead, i) => {
    const stage = stages[Math.floor(Math.random() * stages.length)];
    const value = scenario.average_deal_value * (0.5 + Math.random() * 1.5);
    
    return {
      title: `${lead.company} - ${scenario.products_services[0]?.name || "Service"}`,
      value: Math.round(value),
      stage,
      probability: stage === "closed_won" ? 100 : stage === "closed_lost" ? 0 : Math.floor(Math.random() * 80) + 10,
      expected_close_date: new Date(Date.now() + Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
      lead_id: null, // Will be set after lead insertion
      contact_name: lead.name,
      contact_email: lead.email,
      notes: `Mock deal for ${scenario.business_name} testing`,
      is_demo_data: true,
    };
  });
}

// Generate timeline events for 180-day simulation
function generateTimelineEvents(tenantId: string, simulationId: string, scenario: unknown, leadCount: number = 50) {
  const events: unknown[] = [];
  
  // Lead generation events (Day 1-60)
  for (let day = 1; day <= 60; day++) {
    if (Math.random() < 0.3) { // 30% chance of lead event each day
      events.push({
        tenant_id: tenantId,
        simulation_id: simulationId,
        event_day: day,
        event_type: "lead_created",
        event_description: `New lead from ${["website", "referral", "ad campaign"][Math.floor(Math.random() * 3)]}`,
        target_entity_type: "lead",
        trigger_data: { source: "simulation", scenario: scenario.scenario_key },
      });
    }
    
    if (day > 5 && Math.random() < 0.25) {
      events.push({
        tenant_id: tenantId,
        simulation_id: simulationId,
        event_day: day,
        event_type: "email_opened",
        event_description: "Lead opened nurture email",
        target_entity_type: "lead",
        trigger_data: { email_type: "nurture" },
      });
    }
  }

  // Conversion events (Day 30-120)
  for (let day = 30; day <= 120; day++) {
    if (Math.random() < 0.15) {
      events.push({
        tenant_id: tenantId,
        simulation_id: simulationId,
        event_day: day,
        event_type: "deal_created",
        event_description: "Lead qualified, deal created",
        target_entity_type: "deal",
        trigger_data: { value: scenario.average_deal_value * (0.8 + Math.random() * 0.4) },
      });
    }
    
    if (day > 45 && Math.random() < 0.1) {
      events.push({
        tenant_id: tenantId,
        simulation_id: simulationId,
        event_day: day,
        event_type: "deal_won",
        event_description: "Deal closed successfully",
        target_entity_type: "deal",
        trigger_data: { value: scenario.average_deal_value },
      });
    }
  }

  // Onboarding & Success (Day 60-150)
  for (let day = 60; day <= 150; day++) {
    if (Math.random() < 0.08) {
      events.push({
        tenant_id: tenantId,
        simulation_id: simulationId,
        event_day: day,
        event_type: "onboarding_started",
        event_description: "New client onboarding initiated",
        target_entity_type: "client",
        trigger_data: {},
      });
    }
    
    if (day > 90 && Math.random() < 0.05) {
      events.push({
        tenant_id: tenantId,
        simulation_id: simulationId,
        event_day: day,
        event_type: "support_ticket",
        event_description: "Client submitted support request",
        target_entity_type: "client",
        trigger_data: { priority: ["low", "medium", "high"][Math.floor(Math.random() * 3)] },
      });
    }
  }

  // Retention events (Day 120-180)
  for (let day = 120; day <= 180; day++) {
    if (Math.random() < 0.06) {
      events.push({
        tenant_id: tenantId,
        simulation_id: simulationId,
        event_day: day,
        event_type: "health_score_drop",
        event_description: "Client health score dropped below threshold",
        target_entity_type: "client",
        trigger_data: { old_score: 75, new_score: Math.floor(Math.random() * 30) + 20 },
      });
    }
    
    if (day > 150 && Math.random() < 0.04) {
      events.push({
        tenant_id: tenantId,
        simulation_id: simulationId,
        event_day: day,
        event_type: "churn_risk_detected",
        event_description: "AI detected high churn probability",
        target_entity_type: "client",
        trigger_data: { churn_probability: Math.random() * 0.3 + 0.5 },
      });
    }
    
    if (Math.random() < 0.03) {
      events.push({
        tenant_id: tenantId,
        simulation_id: simulationId,
        event_day: day,
        event_type: "expansion_opportunity",
        event_description: "Upsell opportunity identified",
        target_entity_type: "client",
        trigger_data: { potential_value: scenario.average_deal_value * 0.5 },
      });
    }
  }

  // Sort by day
  return events.sort((a, b) => a.event_day - b.event_day);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, scenario_key, lead_count = 50 } = await req.json();

    if (!tenant_id || !scenario_key) {
      return new Response(
        JSON.stringify({ error: "tenant_id and scenario_key are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const scenario = scenarios[scenario_key as keyof typeof scenarios];
    if (!scenario) {
      return new Response(
        JSON.stringify({ error: `Unknown scenario: ${scenario_key}. Valid options: saas, local_service, ecommerce` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Set tenant to mock environment
    await supabase
      .from("tenants")
      .update({ environment: "mock" })
      .eq("id", tenant_id);

    // Upsert business_dna
    const { error: dnaError } = await supabase
      .from("business_dna")
      .upsert({
        tenant_id,
        ...scenario,
      }, { onConflict: "tenant_id" });

    if (dnaError) {
      console.error("Error creating business_dna:", dnaError);
    }

    // Create simulation run
    const { data: simulationRun, error: simError } = await supabase
      .from("simulation_runs")
      .insert({
        tenant_id,
        scenario_key,
        scenario_name: scenario.business_name,
        status: "pending",
        total_days_simulated: 180,
      })
      .select()
      .single();

    if (simError) {
      throw new Error(`Failed to create simulation run: ${simError.message}`);
    }

    // Generate and insert mock leads
    const leads = generateMockLeads(scenario, lead_count);
    const { data: insertedLeads, error: leadsError } = await supabase
      .from("leads")
      .insert(leads.map(l => ({ ...l, tenant_id })))
      .select();

    if (leadsError) {
      console.error("Error inserting leads:", leadsError);
    }

    // Generate and insert mock deals
    const deals = generateMockDeals(leads, scenario, Math.floor(lead_count * 0.4));
    const { error: dealsError } = await supabase
      .from("deals")
      .insert(deals.map((d, i) => ({
        ...d,
        tenant_id,
        lead_id: insertedLeads?.[i]?.id || null,
      })));

    if (dealsError) {
      console.error("Error inserting deals:", dealsError);
    }

    // Generate timeline events
    const timelineEvents = generateTimelineEvents(tenant_id, simulationRun.id, scenario, lead_count);
    const { error: timelineError } = await supabase
      .from("simulation_timeline")
      .insert(timelineEvents);

    if (timelineError) {
      console.error("Error inserting timeline events:", timelineError);
    }

    // Update business_profile with scenario data
    await supabase
      .from("business_profile")
      .update({
        business_name: scenario.business_name,
        industry: scenario.industry,
        avg_job_value: scenario.average_deal_value,
        brand_voice: scenario.brand_voice,
      })
      .eq("tenant_id", tenant_id);

    return new Response(
      JSON.stringify({
        success: true,
        simulation_id: simulationRun.id,
        scenario: scenario_key,
        business_name: scenario.business_name,
        stats: {
          leads_created: leads.length,
          deals_created: deals.length,
          timeline_events: timelineEvents.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Seed mock tenant error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
