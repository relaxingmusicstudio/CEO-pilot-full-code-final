import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ForecastData {
  period: string;
  predicted_revenue: number;
  confidence: number;
  deals_expected: number;
}

interface DealData {
  id: string;
  value: number;
  probability: number;
  expected_close_date: string | null;
  stage: string;
  days_in_stage: number | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { forecast_months = 3 } = await req.json();

    // 1. Fetch all active deals
    const { data: deals, error: dealsError } = await supabase
      .from("deal_pipeline")
      .select("*")
      .not("stage", "eq", "closed_lost")
      .order("value", { ascending: false });

    if (dealsError) throw dealsError;

    // 2. Calculate weighted pipeline value
    const weightedPipeline = (deals || []).reduce((sum: number, deal: DealData) => {
      return sum + (deal.value * deal.probability);
    }, 0);

    // 3. Fetch historical conversion rates by stage
    const stageConversions: Record<string, number> = {
      lead: 0.15,
      qualified: 0.30,
      proposal: 0.50,
      negotiation: 0.70,
      closed_won: 1.0,
      closed_lost: 0,
    };

    // 4. Fetch current MRR from clients
    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("mrr, status")
      .eq("status", "active");

    if (clientsError) throw clientsError;

    const currentMRR = (clients || []).reduce((sum: number, c: { mrr: number }) => sum + c.mrr, 0);

    // 5. Generate monthly forecasts
    const forecasts: ForecastData[] = [];
    const now = new Date();

    for (let i = 1; i <= forecast_months; i++) {
      const forecastDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const periodKey = forecastDate.toISOString().substring(0, 7);

      // Calculate expected closes for this month
      const monthDeals = (deals || []).filter((deal: DealData) => {
        if (!deal.expected_close_date) return false;
        const closeDate = new Date(deal.expected_close_date);
        return closeDate.getMonth() === forecastDate.getMonth() &&
               closeDate.getFullYear() === forecastDate.getFullYear();
      });

      const expectedRevenue = monthDeals.reduce((sum: number, deal: DealData) => {
        const stageProb = stageConversions[deal.stage] || deal.probability;
        return sum + (deal.value * stageProb);
      }, 0);

      // Factor in churn (assume 5% monthly churn)
      const projectedMRR = currentMRR * Math.pow(0.95, i);

      // Confidence decreases with time
      const confidence = Math.max(0.3, 1 - (i * 0.15));

      forecasts.push({
        period: periodKey,
        predicted_revenue: projectedMRR + expectedRevenue,
        confidence,
        deals_expected: monthDeals.length,
      });
    }

    // 6. Calculate deal velocity metrics
    const avgDealSize = deals && deals.length > 0
      ? deals.reduce((sum: number, d: DealData) => sum + d.value, 0) / deals.length
      : 0;

    const avgDaysInStage = deals && deals.length > 0
      ? deals.reduce((sum: number, d: DealData) => sum + (d.days_in_stage || 0), 0) / deals.length
      : 0;

    // 7. Identify at-risk deals (stalled > 14 days)
    const stalledDeals = (deals || []).filter((d: DealData) => (d.days_in_stage || 0) > 14);

    // 8. Calculate pipeline health score
    const pipelineHealth = Math.min(100, Math.round(
      (weightedPipeline / (currentMRR * 3 || 1)) * 100
    ));

    const response = {
      current_state: {
        mrr: currentMRR,
        arr: currentMRR * 12,
        active_clients: clients?.length || 0,
        pipeline_value: deals?.reduce((sum: number, d: DealData) => sum + d.value, 0) || 0,
        weighted_pipeline: weightedPipeline,
        pipeline_health: pipelineHealth,
      },
      forecasts,
      velocity: {
        avg_deal_size: avgDealSize,
        avg_days_in_stage: avgDaysInStage,
        stalled_deals: stalledDeals.length,
        deals_by_stage: Object.entries(
          (deals || []).reduce((acc: Record<string, number>, d: DealData) => {
            acc[d.stage] = (acc[d.stage] || 0) + 1;
            return acc;
          }, {})
        ).map(([stage, count]) => ({ stage, count })),
      },
      recommendations: generateRecommendations(stalledDeals, pipelineHealth, avgDaysInStage),
    };

    console.log(`Forecast generated: ${forecast_months} months, ${deals?.length || 0} deals`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Forecast error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateRecommendations(
  stalledDeals: DealData[],
  pipelineHealth: number,
  avgDaysInStage: number
): string[] {
  const recommendations: string[] = [];

  if (stalledDeals.length > 0) {
    recommendations.push(
      `${stalledDeals.length} deals stalled >14 days. Prioritize outreach.`
    );
  }

  if (pipelineHealth < 50) {
    recommendations.push(
      "Pipeline coverage below target. Focus on lead generation."
    );
  }

  if (avgDaysInStage > 21) {
    recommendations.push(
      "Average deal velocity slow. Review sales process bottlenecks."
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("Pipeline healthy. Continue current activities.");
  }

  return recommendations;
}
