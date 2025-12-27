import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ConvertRequest {
  prospect_ids: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body: ConvertRequest = await req.json();
    const { prospect_ids } = body;

    if (!prospect_ids || prospect_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "prospect_ids required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[convert-prospect-to-lead] Converting ${prospect_ids.length} prospects`);

    // Fetch the prospects
    const { data: prospects, error: fetchError } = await supabase
      .from("scraped_prospects")
      .select("*")
      .in("id", prospect_ids)
      .is("converted_to_lead_id", null);

    if (fetchError) {
      console.error("[convert-prospect-to-lead] Fetch error:", fetchError);
      throw fetchError;
    }

    if (!prospects || prospects.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid prospects found", converted_count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[convert-prospect-to-lead] Found ${prospects.length} prospects to convert`);

    const convertedLeads: unknown[] = [];
    const errors: unknown[] = [];

    for (const prospect of prospects) {
      try {
        // Create lead from prospect
        const leadData = {
          name: prospect.business_name,
          email: null, // Scraped prospects don't have email
          phone: prospect.phone,
          company: prospect.business_name,
          source: "google_maps_scrape",
          status: "new",
          lead_score: prospect.priority_score || 50,
          lead_temperature: prospect.priority_score >= 70 ? "hot" : prospect.priority_score >= 50 ? "warm" : "cold",
          notes: `Scraped from Google Maps\nQuery: ${prospect.source_query}\nLocation: ${prospect.source_location}\nRating: ${prospect.rating || 'N/A'} (${prospect.review_count || 0} reviews)\nWebsite: ${prospect.website || 'None'}\nPhone Type: ${prospect.phone_type || 'Unknown'}\nSMS Capable: ${prospect.sms_capable ? 'Yes' : 'No'}`,
          metadata: {
            scraped_prospect_id: prospect.id,
            address: prospect.address,
            website: prospect.website,
            rating: prospect.rating,
            review_count: prospect.review_count,
            categories: prospect.categories,
            phone_type: prospect.phone_type,
            sms_capable: prospect.sms_capable,
            scraped_at: prospect.scraped_at
          }
        };

        const { data: lead, error: insertError } = await supabase
          .from("leads")
          .insert(leadData)
          .select()
          .single();

        if (insertError) {
          console.error(`[convert-prospect-to-lead] Insert error for ${prospect.id}:`, insertError);
          errors.push({ prospect_id: prospect.id, error: insertError.message });
          continue;
        }

        // Update prospect with lead reference
        const { error: updateError } = await supabase
          .from("scraped_prospects")
          .update({
            converted_to_lead_id: lead.id,
            status: "converted"
          })
          .eq("id", prospect.id);

        if (updateError) {
          console.error(`[convert-prospect-to-lead] Update error for ${prospect.id}:`, updateError);
          // Don't fail the whole operation, lead was created
        }

        convertedLeads.push(lead);
        console.log(`[convert-prospect-to-lead] Converted prospect ${prospect.id} to lead ${lead.id}`);

      } catch (err) {
        console.error(`[convert-prospect-to-lead] Error converting ${prospect.id}:`, err);
        errors.push({ prospect_id: prospect.id, error: String(err) });
      }
    }

    console.log(`[convert-prospect-to-lead] Completed: ${convertedLeads.length} converted, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        converted_count: convertedLeads.length,
        error_count: errors.length,
        leads: convertedLeads,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[convert-prospect-to-lead] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
