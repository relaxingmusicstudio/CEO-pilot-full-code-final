import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UsageData {
  api_calls: number;
  conversations_handled: number;
  appointments_booked: number;
  leads_captured: number;
  login_count: number;
}

interface TicketData {
  open_count: number;
  urgent_count: number;
  avg_resolution_days: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { client_id, calculate_all } = await req.json();

    console.log("Calculating health score", { client_id, calculate_all });

    if (calculate_all) {
      // Calculate health scores for all active clients
      const { data: clients, error: clientsError } = await supabase
        .from("clients")
        .select("id")
        .eq("status", "active");

      if (clientsError) throw clientsError;

      const results = [];
      for (const client of clients || []) {
        const score = await calculateHealthScore(supabase, client.id);
        results.push({ client_id: client.id, health_score: score });
      }

      console.log(`Updated health scores for ${results.length} clients`);

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!client_id) {
      throw new Error("client_id is required");
    }

    const score = await calculateHealthScore(supabase, client_id);

    return new Response(
      JSON.stringify({ success: true, client_id, health_score: score }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error calculating health score:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function calculateHealthScore(supabase: unknown, clientId: string): Promise<number> {
  // Get client data
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    console.error("Client not found:", clientId);
    return 0;
  }

  // Get usage data for last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: usageData, error: usageError } = await supabase
    .from("client_usage")
    .select("*")
    .eq("client_id", clientId)
    .gte("date", thirtyDaysAgo.toISOString().split("T")[0]);

  // Get open tickets
  const { data: tickets, error: ticketsError } = await supabase
    .from("client_tickets")
    .select("*")
    .eq("client_id", clientId)
    .in("status", ["open", "in_progress"]);

  // Calculate usage metrics
  const usage: UsageData = (usageData || []).reduce(
    (acc: UsageData, day: unknown) => ({
      api_calls: acc.api_calls + (day.api_calls || 0),
      conversations_handled: acc.conversations_handled + (day.conversations_handled || 0),
      appointments_booked: acc.appointments_booked + (day.appointments_booked || 0),
      leads_captured: acc.leads_captured + (day.leads_captured || 0),
      login_count: acc.login_count + (day.login_count || 0),
    }),
    { api_calls: 0, conversations_handled: 0, appointments_booked: 0, leads_captured: 0, login_count: 0 }
  );

  // Calculate ticket metrics
  const ticketData: TicketData = {
    open_count: (tickets || []).length,
    urgent_count: (tickets || []).filter((t: unknown) => t.priority === "urgent").length,
    avg_resolution_days: 0,
  };

  // Score components (each out of 25, total 100)
  let score = 0;

  // 1. Engagement Score (25 points) - based on logins and activity
  const loginScore = Math.min(usage.login_count / 10, 1) * 25; // 10+ logins = full score
  score += loginScore;

  // 2. Usage Score (25 points) - based on feature utilization
  const featuresUsed = [
    usage.api_calls > 0,
    usage.conversations_handled > 0,
    usage.appointments_booked > 0,
    usage.leads_captured > 0,
  ].filter(Boolean).length;
  const usageScore = (featuresUsed / 4) * 25;
  score += usageScore;

  // 3. Value Score (25 points) - based on conversions and results
  const conversionsScore = Math.min(
    ((usage.appointments_booked + usage.leads_captured) / 20) * 25,
    25
  ); // 20+ conversions = full score
  score += conversionsScore;

  // 4. Support Score (25 points) - fewer tickets = better
  let supportScore = 25;
  supportScore -= ticketData.open_count * 3; // -3 for each open ticket
  supportScore -= ticketData.urgent_count * 5; // -5 extra for urgent tickets
  supportScore = Math.max(supportScore, 0);
  score += supportScore;

  // Recency bonus/penalty
  const daysSinceContact = Math.floor(
    (Date.now() - new Date(client.last_contact).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceContact > 30) {
    score -= 10; // Penalty for no contact in 30+ days
  }
  if (daysSinceContact > 60) {
    score -= 15; // Additional penalty for 60+ days
  }

  // Ensure score is within bounds
  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  // Update the client's health score
  await supabase
    .from("clients")
    .update({ health_score: finalScore })
    .eq("id", clientId);

  console.log(`Client ${clientId} health score: ${finalScore}`, {
    loginScore,
    usageScore,
    conversionsScore,
    supportScore,
    daysSinceContact,
  });

  return finalScore;
}
