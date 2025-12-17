/**
 * Action Rollback Function
 * #9: Minimal rollback mechanism for executed actions
 * 
 * Captures previous_state + new_state and allows rollback to previous_state
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RollbackRequest {
  action: "record" | "rollback" | "get_history";
  action_id?: string;
  action_table?: string;
  action_type?: string;
  target_type?: string;
  target_id?: string;
  previous_state?: Record<string, unknown>;
  new_state?: Record<string, unknown>;
  executed_by?: string;
  rolled_back_by?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: RollbackRequest = await req.json();
    const { action } = body;

    switch (action) {
      case "record": {
        // Record action history before execution
        const { action_id, action_table, action_type, target_type, target_id, previous_state, new_state, executed_by } = body;
        
        if (!action_id || !action_table) {
          return new Response(JSON.stringify({ error: "action_id and action_table required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data, error } = await supabase
          .from("action_history")
          .insert({
            action_id,
            action_table,
            action_type: action_type || "unknown",
            target_type,
            target_id,
            previous_state,
            new_state,
            executed_by,
          })
          .select()
          .single();

        if (error) throw error;

        console.log(`[ActionRollback] Recorded history for action ${action_id}`);
        return new Response(JSON.stringify({ success: true, history: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "rollback": {
        // Rollback an action to its previous state
        const { action_id, rolled_back_by } = body;
        
        if (!action_id) {
          return new Response(JSON.stringify({ error: "action_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get the action history
        const { data: history, error: historyError } = await supabase
          .from("action_history")
          .select("*")
          .eq("action_id", action_id)
          .eq("rolled_back", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (historyError || !history) {
          return new Response(JSON.stringify({ error: "No rollback history found for this action" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Restore previous state based on target
        const { action_table, target_type, target_id, previous_state } = history;
        
        if (previous_state && target_id) {
          // Attempt to restore the target to previous state
          const targetTable = target_type === "lead" ? "leads" :
                             target_type === "client" ? "clients" :
                             target_type === "campaign" ? "ad_campaigns" :
                             target_type === "content" ? "content" :
                             target_type === "deal" ? "deal_pipeline" : null;

          if (targetTable) {
            const { error: restoreError } = await supabase
              .from(targetTable)
              .update(previous_state)
              .eq("id", target_id);

            if (restoreError) {
              console.error(`[ActionRollback] Failed to restore ${targetTable}:`, restoreError);
            }
          }
        }

        // Mark the action as rolled back
        if (action_table === "action_queue") {
          await supabase
            .from("action_queue")
            .update({ status: "rolled_back" })
            .eq("id", action_id);
        } else if (action_table === "ceo_action_queue") {
          await supabase
            .from("ceo_action_queue")
            .update({ status: "rolled_back" })
            .eq("id", action_id);
        }

        // Mark history as rolled back
        await supabase
          .from("action_history")
          .update({
            rolled_back: true,
            rolled_back_at: new Date().toISOString(),
            rolled_back_by,
          })
          .eq("id", history.id);

        // Log to audit
        await supabase.from("platform_audit_log").insert({
          timestamp: new Date().toISOString(),
          agent_name: "action-rollback",
          action_type: "rollback_executed",
          entity_type: target_type,
          entity_id: target_id,
          description: `Rolled back action ${action_id} to previous state`,
          success: true,
          request_snapshot: JSON.stringify({ action_id, rolled_back_by }),
        });

        console.log(`[ActionRollback] Rolled back action ${action_id}`);
        return new Response(JSON.stringify({ 
          success: true, 
          message: "Action rolled back successfully",
          restored_state: previous_state 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get_history": {
        // Get rollback history for an action or target
        const { action_id, target_type, target_id } = body;
        
        let query = supabase.from("action_history").select("*");
        
        if (action_id) {
          query = query.eq("action_id", action_id);
        } else if (target_type && target_id) {
          query = query.eq("target_type", target_type).eq("target_id", target_id);
        } else {
          // Get recent history
          query = query.order("created_at", { ascending: false }).limit(50);
        }

        const { data, error } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({ history: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action. Use: record, rollback, get_history" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("[ActionRollback] Error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
