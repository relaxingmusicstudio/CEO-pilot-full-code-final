import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat, parseAIError } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get today and yesterday dates
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch all relevant data
    const [
      leadsRes,
      clientsRes,
      contentRes,
      automationRes,
      conversationsRes,
      visitorsRes,
    ] = await Promise.all([
      supabase.from("leads").select("*").gte("created_at", weekAgo.toISOString()),
      supabase.from("clients").select("*").eq("status", "active"),
      supabase.from("content").select("*").eq("status", "pending"),
      supabase.from("automation_logs").select("*").gte("started_at", yesterday.toISOString()),
      supabase.from("conversations").select("*").gte("created_at", yesterday.toISOString()),
      supabase.from("visitors").select("*").gte("created_at", yesterday.toISOString()),
    ]);

    const leads = leadsRes.data || [];
    const clients = clientsRes.data || [];
    const pendingContent = contentRes.data || [];
    const automationLogs = automationRes.data || [];
    const conversations = conversationsRes.data || [];
    const visitors = visitorsRes.data || [];

    // Calculate metrics
    const todayLeads = leads.filter(l => new Date(l.created_at) >= today);
    const yesterdayLeads = leads.filter(l => {
      const date = new Date(l.created_at);
      return date >= yesterday && date < today;
    });

    const hotLeads = leads.filter(l => l.lead_score >= 70 || l.lead_temperature === "hot");
    const wonLeads = leads.filter(l => l.status === "won" || l.status === "converted");
    const revenue = wonLeads.reduce((sum, l) => sum + (l.revenue_value || 0), 0);

    const totalMRR = clients.reduce((sum, c) => sum + (c.mrr || 0), 0);
    const healthyClients = clients.filter(c => (c.health_score || 50) >= 70).length;
    const atRiskClients = clients.filter(c => (c.health_score || 50) < 40).length;

    const successfulAutomations = automationLogs.filter(l => l.status === "completed").length;
    const failedAutomations = automationLogs.filter(l => l.status === "failed").length;

    const leadConversions = conversations.filter(c => c.outcome === "lead_captured").length;

    // Generate time-based greeting
    const hour = now.getHours();
    let greeting = "Good morning";
    if (hour >= 12 && hour < 17) greeting = "Good afternoon";
    if (hour >= 17) greeting = "Good evening";

    // Build the brief
    const brief: {
      greeting: string;
      timestamp: string;
      snapshot: unknown;
      pendingApprovals: unknown;
      aiActivity: unknown;
      systemHealth: string;
      recommendedActions: string[];
      summary?: string;
    } = {
      greeting: `${greeting}, CEO!`,
      timestamp: now.toISOString(),
      
      snapshot: {
        revenue: {
          total: revenue,
          mrr: totalMRR,
          trend: todayLeads.length > yesterdayLeads.length ? "up" : "down",
        },
        leads: {
          today: todayLeads.length,
          yesterday: yesterdayLeads.length,
          hot: hotLeads.length,
          total: leads.length,
        },
        clients: {
          active: clients.length,
          healthy: healthyClients,
          atRisk: atRiskClients,
        },
        visitors: {
          today: visitors.length,
          conversations: conversations.length,
          conversions: leadConversions,
        },
      },

      pendingApprovals: {
        count: pendingContent.length,
        items: pendingContent.slice(0, 5).map(c => ({
          id: c.id,
          type: c.content_type || "content",
          title: c.title || "Untitled",
          createdAt: c.created_at,
        })),
      },

      aiActivity: {
        total: automationLogs.length,
        successful: successfulAutomations,
        failed: failedAutomations,
        recentActions: automationLogs.slice(0, 10).map(l => ({
          agent: l.function_name,
          status: l.status,
          timestamp: l.started_at,
          itemsProcessed: l.items_processed || 0,
        })),
      },

      systemHealth: failedAutomations > successfulAutomations * 0.1 ? "warning" : "healthy",

      recommendedActions: [] as string[],
    };

    // Generate recommended actions
    if (hotLeads.length > 0) {
      brief.recommendedActions.push(`Follow up with ${hotLeads.length} hot leads`);
    }
    if (pendingContent.length > 0) {
      brief.recommendedActions.push(`Approve ${pendingContent.length} pending content items`);
    }
    if (atRiskClients > 0) {
      brief.recommendedActions.push(`Check on ${atRiskClients} at-risk clients`);
    }
    if (failedAutomations > 0) {
      brief.recommendedActions.push(`Review ${failedAutomations} failed automations`);
    }
    if (todayLeads.length < yesterdayLeads.length * 0.5) {
      brief.recommendedActions.push("Lead flow is down - review marketing campaigns");
    }

    // Generate natural language summary using AI
    let summary = "";
    try {
      const result = await aiChat({
        messages: [
          {
            role: "system",
            content: "You are a concise CEO assistant. Generate a brief, natural morning summary in 3-4 sentences based on the data. Be direct and action-oriented. Use markdown for emphasis.",
          },
          {
            role: "user",
            content: `Generate morning brief summary from: ${JSON.stringify(brief.snapshot)}. Pending: ${brief.pendingApprovals.count}. Hot leads: ${hotLeads.length}. AI ran ${brief.aiActivity.total} tasks.`,
          },
        ],
        purpose: "daily_brief",
      });
      summary = result.text;
    } catch (error) {
      console.error("[daily-brief] AI summary error:", parseAIError(error));
    }

    // Fallback summary if AI fails
    if (!summary) {
      summary = `**${brief.greeting}** Today you have ${hotLeads.length} hot leads ready for follow-up and ${pendingContent.length} items awaiting approval. Revenue is tracking at $${revenue.toLocaleString()} with ${clients.length} active clients. ${brief.systemHealth === "healthy" ? "All systems running smoothly." : "⚠️ Some systems need attention."}`;
    }

    brief.summary = summary;

    console.log("[daily-brief] generated successfully");

    return new Response(JSON.stringify(brief), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[daily-brief] error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
