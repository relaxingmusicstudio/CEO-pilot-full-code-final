import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * CEO Actionize Brief - Internal-only function
 * 
 * Converts cached daily brief into actionable items in ceo_action_queue.
 * Auth: X-Internal-Secret header (same pattern as ceo-scheduler)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

interface BriefDataSnapshot {
  leads_24h: number;
  lead_temperature: Record<string, number>;
  missed_calls_24h: number;
  total_calls_24h: number;
  active_clients: number;
  mrr_cents: number;
  revenue_invoiced_this_month_cents: number;
  ai_cost_24h_cents: number;
  ai_cost_30d_avg_cents: number;
  top_lead_sources: Array<{ source: string; count: number }>;
  pending_actions: number;
}

interface CachedBrief {
  generated_at: string;
  tenant_id: string;
  bullets: string[];
  risk_alert: string | null;
  opportunity: string | null;
  data_snapshot: BriefDataSnapshot;
}

interface ActionToCreate {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  action_type: string;
  triggering_metric: string;
}

class MissingSecretError extends Error {
  secretName: string;
  constructor(secretName: string) {
    super(`Missing required secret: ${secretName}`);
    this.secretName = secretName;
  }
}

class UnauthorizedInternalError extends Error {
  constructor() {
    super("Invalid or missing internal authentication");
  }
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new MissingSecretError(name);
  return value;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function requireInternalAuth(req: Request): void {
  const expected = requireEnv("INTERNAL_SCHEDULER_SECRET");
  const provided = req.headers.get("x-internal-secret") || req.headers.get("X-Internal-Secret");
  if (!provided || provided !== expected) throw new UnauthorizedInternalError();
}

/**
 * Generate deterministic actions based on brief metrics
 */
function generateDeterministicActions(briefData: BriefDataSnapshot): ActionToCreate[] {
  const actions: ActionToCreate[] = [];

  // Rule 1: Missed calls > 0 -> action about follow-up
  if (briefData.missed_calls_24h > 0) {
    const priority = briefData.missed_calls_24h > 5 ? "high" : briefData.missed_calls_24h > 2 ? "medium" : "low";
    actions.push({
      title: `Follow up on ${briefData.missed_calls_24h} missed calls`,
      description: `${briefData.missed_calls_24h} calls were missed in the last 24h. Review call logs and ensure follow-up with potential customers. Consider routing improvements if this is recurring.`,
      priority,
      action_type: "missed_call_followup",
      triggering_metric: `missed_calls_24h: ${briefData.missed_calls_24h}`,
    });
  }

  // Rule 2: Hot leads > 0 -> immediate follow-up action
  const hotLeads = briefData.lead_temperature?.hot || 0;
  if (hotLeads > 0) {
    actions.push({
      title: `${hotLeads} hot leads need immediate attention`,
      description: `You have ${hotLeads} hot leads ready for immediate follow-up. These are your highest-priority conversion opportunities. Schedule calls or send personalized outreach today.`,
      priority: "high",
      action_type: "hot_lead_followup",
      triggering_metric: `hot_leads: ${hotLeads}`,
    });
  }

  // Rule 3: High pending actions -> queue management
  if (briefData.pending_actions > 10) {
    actions.push({
      title: `Clear action queue (${briefData.pending_actions} pending)`,
      description: `Your action queue has ${briefData.pending_actions} pending items. Review and either approve, delegate, or dismiss items to maintain operational efficiency.`,
      priority: briefData.pending_actions > 20 ? "high" : "medium",
      action_type: "queue_management",
      triggering_metric: `pending_actions: ${briefData.pending_actions}`,
    });
  }

  // Rule 4: Zero leads in 24h -> lead gen check
  if (briefData.leads_24h === 0) {
    actions.push({
      title: "No new leads in 24h - check lead generation",
      description: "Zero new leads were captured in the last 24 hours. Review your marketing campaigns, website forms, and call tracking to ensure lead capture is working correctly.",
      priority: "medium",
      action_type: "lead_gen_check",
      triggering_metric: "leads_24h: 0",
    });
  }

  // Rule 5: AI cost spike (2x average)
  if (briefData.ai_cost_24h_cents > 0 && briefData.ai_cost_30d_avg_cents > 0) {
    if (briefData.ai_cost_24h_cents > briefData.ai_cost_30d_avg_cents * 2) {
      actions.push({
        title: "AI cost spike detected",
        description: `AI costs in the last 24h ($${(briefData.ai_cost_24h_cents / 100).toFixed(2)}) are more than double your 30-day average ($${(briefData.ai_cost_30d_avg_cents / 100).toFixed(2)}/day). Review AI usage patterns and consider optimization.`,
        priority: "medium",
        action_type: "cost_review",
        triggering_metric: `ai_cost_24h: ${briefData.ai_cost_24h_cents}, avg: ${briefData.ai_cost_30d_avg_cents}`,
      });
    }
  }

  return actions;
}

/**
 * Check for duplicate actions within 24h
 */
async function isDuplicateAction(
  supabase: SupabaseClient,
  tenantId: string,
  title: string,
  source: string
): Promise<boolean> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("ceo_action_queue")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("source", source)
    .ilike("action_type", title.substring(0, 50)) // Check action_type prefix match
    .gte("created_at", yesterday);

  if (error) {
    console.error("[ceo-actionize-brief] Duplicate check failed", { tenant_id: tenantId, message: error.message });
    return false; // On error, allow action creation
  }

  return (count || 0) > 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requireInternalAuth(req);

    const { tenant_id, max_actions = 3 } = await req.json().catch(() => ({}));

    // Validate tenant_id
    if (!tenant_id || typeof tenant_id !== "string") {
      return jsonResponse({ error: "Bad request", message: "tenant_id is required" }, 400);
    }

    if (!isValidUUID(tenant_id)) {
      return jsonResponse({ error: "Bad request", message: "tenant_id must be a valid UUID" }, 400);
    }

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    );

    // Read cached brief
    const cacheKey = `ceo_daily_brief_${tenant_id}`;
    const { data: cached, error: cacheError } = await supabase
      .from("agent_shared_state")
      .select("value, expires_at")
      .eq("key", cacheKey)
      .maybeSingle();

    if (cacheError) {
      console.error("[ceo-actionize-brief] Cache read failed", { tenant_id, message: cacheError.message });
      return jsonResponse({ error: "Internal error", message: "Failed to read brief cache" }, 500);
    }

    if (!cached) {
      return jsonResponse({ error: "No fresh brief", message: "Daily brief cache missing or expired" }, 409);
    }

    // Check expiry
    if (cached.expires_at) {
      const expiresAt = new Date(cached.expires_at as string).getTime();
      if (Date.now() > expiresAt) {
        return jsonResponse({ error: "No fresh brief", message: "Daily brief cache missing or expired" }, 409);
      }
    }

    const briefValue = cached.value as CachedBrief;
    if (!briefValue?.data_snapshot) {
      return jsonResponse({ error: "No fresh brief", message: "Daily brief cache missing or expired" }, 409);
    }

    // Generate actions
    const allActions = generateDeterministicActions(briefValue.data_snapshot);
    const actionsToCreate: ActionToCreate[] = [];

    for (const action of allActions) {
      if (actionsToCreate.length >= max_actions) break;

      // Check for duplicates
      const isDupe = await isDuplicateAction(supabase, tenant_id, action.action_type, "daily_brief");
      if (!isDupe) {
        actionsToCreate.push(action);
      }
    }

    // Insert actions
    const createdActions: Array<{ id: string; title: string; priority: string }> = [];

    for (const action of actionsToCreate) {
      const { data: inserted, error: insertError } = await supabase
        .from("ceo_action_queue")
        .insert({
          tenant_id,
          action_type: action.action_type,
          target_type: "brief_insight",
          target_id: tenant_id,
          status: "pending",
          priority: action.priority === "high" ? 1 : action.priority === "medium" ? 2 : 3,
          source: "daily_brief",
          action_payload: {
            title: action.title,
            description: action.description,
            triggering_metric: action.triggering_metric,
          },
          claude_reasoning: action.description,
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("[ceo-actionize-brief] Insert failed", { tenant_id, action_type: action.action_type, message: insertError.message });
        continue;
      }

      if (inserted) {
        createdActions.push({
          id: inserted.id,
          title: action.title,
          priority: action.priority,
        });
      }
    }

    console.log("[ceo-actionize-brief] Complete", {
      tenant_id,
      attempted: actionsToCreate.length,
      created: createdActions.length,
    });

    return jsonResponse({
      tenant_id,
      created: createdActions.length,
      skipped: allActions.length - actionsToCreate.length,
      actions: createdActions,
      brief_generated_at: briefValue.generated_at,
    });
  } catch (error) {
    if (error instanceof MissingSecretError) {
      return jsonResponse({ error: `Missing required secret: ${error.secretName}` }, 500);
    }
    if (error instanceof UnauthorizedInternalError) {
      return jsonResponse({ error: "Unauthorized", message: "Invalid or missing internal authentication" }, 401);
    }

    console.error("[ceo-actionize-brief] Unhandled error", { message: error instanceof Error ? error.message : String(error) });
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
