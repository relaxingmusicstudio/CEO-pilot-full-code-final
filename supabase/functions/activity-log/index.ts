import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ActivityLogEntry {
  agent: string;
  action: string;
  details?: Record<string, unknown>;
  status: "success" | "error" | "pending";
  metadata?: Record<string, unknown>;
}

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
    const { action, ...params } = await req.json();

    switch (action) {
      case "log": {
        // Log a new activity
        const { agent, actionType, details, status, metadata } = params as {
          agent: string;
          actionType: string;
          details?: Record<string, unknown>;
          status: "success" | "error" | "pending";
          metadata?: Record<string, unknown>;
        };

        const { data, error } = await supabase.from("automation_logs").insert({
          function_name: agent,
          status: status === "success" ? "completed" : status === "error" ? "failed" : "running",
          metadata: { action: actionType, ...details, ...metadata },
          started_at: new Date().toISOString(),
          completed_at: status !== "pending" ? new Date().toISOString() : null,
        }).select().single();

        if (error) throw error;

        return new Response(JSON.stringify({ success: true, id: data.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get": {
        // Get activity logs with filters
        const { timeRange = "24h", agent, status: filterStatus, limit = 50 } = params;

        const hoursAgo = parseInt(timeRange) || 24;
        const startDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

        let query = supabase
          .from("automation_logs")
          .select("*")
          .gte("started_at", startDate.toISOString())
          .order("started_at", { ascending: false })
          .limit(limit);

        if (agent) {
          query = query.eq("function_name", agent);
        }

        if (filterStatus) {
          const dbStatus = filterStatus === "success" ? "completed" : filterStatus === "error" ? "failed" : "running";
          query = query.eq("status", dbStatus);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Transform to activity log format
        const activities = (data || []).map(log => ({
          id: log.id,
          agent: log.function_name,
          action: log.metadata?.action || log.status,
          status: log.status === "completed" ? "success" : log.status === "failed" ? "error" : "pending",
          timestamp: log.started_at,
          completedAt: log.completed_at,
          details: log.metadata,
          itemsProcessed: log.items_processed || 0,
          itemsCreated: log.items_created || 0,
          errorMessage: log.error_message,
        }));

        return new Response(JSON.stringify({ activities }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "summary": {
        // Get activity summary by agent
        const { timeRange = "24h" } = params;
        const hoursAgo = parseInt(timeRange) || 24;
        const startDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

        const { data, error } = await supabase
          .from("automation_logs")
          .select("*")
          .gte("started_at", startDate.toISOString());

        if (error) throw error;

        const logs = data || [];

        // Group by agent
        const byAgent: Record<string, { total: number; success: number; failed: number; pending: number }> = {};
        
        logs.forEach(log => {
          const agent = log.function_name;
          if (!byAgent[agent]) {
            byAgent[agent] = { total: 0, success: 0, failed: 0, pending: 0 };
          }
          byAgent[agent].total++;
          if (log.status === "completed") byAgent[agent].success++;
          else if (log.status === "failed") byAgent[agent].failed++;
          else byAgent[agent].pending++;
        });

        const summary = {
          totalActions: logs.length,
          successful: logs.filter(l => l.status === "completed").length,
          failed: logs.filter(l => l.status === "failed").length,
          pending: logs.filter(l => l.status === "running").length,
          byAgent: Object.entries(byAgent).map(([agent, stats]) => ({
            agent,
            ...stats,
          })),
          recentErrors: logs
            .filter(l => l.status === "failed")
            .slice(0, 5)
            .map(l => ({
              agent: l.function_name,
              error: l.error_message,
              timestamp: l.started_at,
            })),
        };

        return new Response(JSON.stringify(summary), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action. Use: log, get, summary" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Activity log error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
