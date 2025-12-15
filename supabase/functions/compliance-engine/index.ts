import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAuditContext } from '../_shared/auditLogger.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ComplianceCheckRequest {
  agent_name: string;
  action_type: string; // scrape, outreach, data_collection, api_call
  resource_url?: string;
  data_source?: string;
  target_phone?: string;
  target_email?: string;
  spend_amount?: number;
  metadata?: Record<string, unknown>;
}

interface ComplianceResult {
  approved: boolean;
  enforcement: "block" | "warn" | "log";
  reason?: string;
  rules_checked: string[];
  risk_score: number;
  recommendations?: string[];
  lockdown_triggered?: boolean;
}

interface LockdownRule {
  id: string;
  rule_name: string;
  agent_type: string | null;
  action_type: string | null;
  threshold_value: number;
  threshold_window_minutes: number;
  lockdown_action: string;
  is_active: boolean;
  trigger_count: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const audit = createAuditContext(supabase, 'compliance-engine', 'compliance_check');

  try {
    const body: ComplianceCheckRequest = await req.json();
    const { agent_name, action_type, resource_url, data_source, target_phone, target_email, spend_amount, metadata } = body;

    console.log(`[Compliance Engine] Checking: ${agent_name} -> ${action_type}`);
    await audit.logStart(`Compliance check for ${agent_name}/${action_type}`, body);

    // Check for active lockdowns first
    const { data: activeLockdowns } = await supabase
      .from("security_lockdowns")
      .select("agent_type, reason")
      .eq("status", "active");

    const isLocked = activeLockdowns?.some(
      (l: { agent_type: string }) => l.agent_type === agent_name || l.agent_type === 'all'
    );

    if (isLocked) {
      const lockdown = activeLockdowns?.find(
        (l: { agent_type: string }) => l.agent_type === agent_name || l.agent_type === 'all'
      ) as { reason: string } | undefined;
      
      await audit.logSuccess(`Blocked by lockdown: ${lockdown?.reason}`, 'agent', agent_name, { lockdown: true });

      return new Response(JSON.stringify({
        approved: false,
        enforcement: "block",
        reason: `Agent is locked down: ${lockdown?.reason}`,
        rules_checked: ["LOCKDOWN_CHECK"],
        risk_score: 100,
        lockdown_triggered: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all active compliance rules
    const { data: rules, error: rulesError } = await supabase
      .from("compliance_rules")
      .select("*")
      .eq("is_active", true);

    if (rulesError) throw rulesError;

    const rulesMap = new Map((rules || []).map((r: { rule_key: string }) => [r.rule_key, r]));
    const rulesChecked: string[] = [];
    let approved = true;
    let enforcement: "block" | "warn" | "log" = "log";
    let reason = "";
    let riskScore = 0;
    const recommendations: string[] = [];
    let lockdownTriggered = false;

    // ============================================
    // LOCKDOWN RULE CHECKS
    // ============================================
    const { data: lockdownRules } = await supabase
      .from("lockdown_rules")
      .select("*")
      .eq("is_active", true);

    if (lockdownRules?.length) {
      for (const rule of lockdownRules as LockdownRule[]) {
        // Check if rule applies to this agent/action
        const agentMatches = !rule.agent_type || rule.agent_type === agent_name;
        const actionMatches = !rule.action_type || rule.action_type === action_type;

        if (agentMatches && actionMatches) {
          const windowStart = new Date(Date.now() - rule.threshold_window_minutes * 60000).toISOString();
          
          // Count recent actions
          let query = supabase
            .from("platform_audit_log")
            .select("*", { count: "exact", head: true })
            .gte("timestamp", windowStart);

          if (rule.agent_type) {
            query = query.eq("agent_name", rule.agent_type);
          }
          if (rule.action_type) {
            query = query.eq("action_type", rule.action_type);
          }

          const { count } = await query;

          if ((count || 0) >= rule.threshold_value) {
            console.log(`[Compliance] Lockdown rule triggered: ${rule.rule_name}`);
            
            if (rule.lockdown_action === "pause_agent") {
              // Create lockdown
              await supabase.from("security_lockdowns").insert({
                rule_id: rule.id,
                agent_type: rule.agent_type || agent_name,
                reason: `${rule.rule_name}: ${count}/${rule.threshold_value} actions in ${rule.threshold_window_minutes}min`,
                triggered_value: count,
                status: "active",
              });

              // Update rule trigger stats
              await supabase
                .from("lockdown_rules")
                .update({
                  last_triggered_at: new Date().toISOString(),
                  trigger_count: rule.trigger_count + 1,
                })
                .eq("id", rule.id);

              approved = false;
              enforcement = "block";
              reason = `Security lockdown triggered: ${rule.rule_name}`;
              riskScore = 100;
              lockdownTriggered = true;
              rulesChecked.push(`LOCKDOWN:${rule.rule_name}`);
            } else if (rule.lockdown_action === "alert_only") {
              rulesChecked.push(`ALERT:${rule.rule_name}`);
              recommendations.push(`High activity detected: ${count} actions in ${rule.threshold_window_minutes}min`);
              riskScore += 25;
            }
          }
        }
      }
    }

    // Skip other checks if lockdown was triggered
    if (!lockdownTriggered) {
      // ============================================
      // SCRAPING COMPLIANCE CHECKS
      // ============================================
      if (action_type === "scrape") {
        // Check robots.txt rule
        const robotsRule = rulesMap.get("RESPECT_ROBOTS_TXT") as { rule_value: string } | undefined;
        if (robotsRule && robotsRule.rule_value === "true" && resource_url) {
          rulesChecked.push("RESPECT_ROBOTS_TXT");
          console.log(`[Compliance] Would check robots.txt for: ${resource_url}`);
        }

        // Check scraping rate limit
        const rateRule = rulesMap.get("MAX_SCRAPING_RATE_PER_MINUTE") as { rule_value: string; enforcement_level: string } | undefined;
        if (rateRule) {
          rulesChecked.push("MAX_SCRAPING_RATE_PER_MINUTE");
          const maxRate = parseInt(rateRule.rule_value);
          
          const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
          const { count } = await supabase
            .from("compliance_audit_log")
            .select("*", { count: "exact", head: true })
            .eq("action_type", "scrape")
            .gte("created_at", oneMinuteAgo);

          if ((count || 0) >= maxRate) {
            approved = false;
            enforcement = rateRule.enforcement_level as "block" | "warn" | "log";
            reason = `Rate limit exceeded: ${count}/${maxRate} scrapes per minute`;
            riskScore += 30;
          }
        }

        // Check non-API source approval
        const nonApiRule = rulesMap.get("REQUIRE_CEO_APPROVAL_FOR_NON_API") as { rule_value: string } | undefined;
        if (nonApiRule && nonApiRule.rule_value === "true" && data_source !== "official_api") {
          rulesChecked.push("REQUIRE_CEO_APPROVAL_FOR_NON_API");
          enforcement = "warn";
          recommendations.push("Consider using official API if available");
          riskScore += 15;
        }
      }

      // ============================================
      // OUTREACH COMPLIANCE CHECKS
      // ============================================
      if (action_type === "outreach") {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

        // Check calling hours
        const beforeRule = rulesMap.get("DO_NOT_CALL_BEFORE") as { rule_value: string; enforcement_level: string } | undefined;
        const afterRule = rulesMap.get("DO_NOT_CALL_AFTER") as { rule_value: string; enforcement_level: string } | undefined;
        
        if (beforeRule) {
          rulesChecked.push("DO_NOT_CALL_BEFORE");
          if (currentTime < beforeRule.rule_value) {
            approved = false;
            enforcement = beforeRule.enforcement_level as "block" | "warn" | "log";
            reason = `Cannot call before ${beforeRule.rule_value}. Current time: ${currentTime}`;
            riskScore += 40;
          }
        }

        if (afterRule) {
          rulesChecked.push("DO_NOT_CALL_AFTER");
          if (currentTime > afterRule.rule_value) {
            approved = false;
            enforcement = afterRule.enforcement_level as "block" | "warn" | "log";
            reason = `Cannot call after ${afterRule.rule_value}. Current time: ${currentTime}`;
            riskScore += 40;
          }
        }

        // Check email rate limit
        const emailRule = rulesMap.get("MAX_EMAILS_PER_HOUR") as { rule_value: string; enforcement_level: string } | undefined;
        if (emailRule && target_email) {
          rulesChecked.push("MAX_EMAILS_PER_HOUR");
          const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
          const { count } = await supabase
            .from("compliance_audit_log")
            .select("*", { count: "exact", head: true })
            .eq("action_type", "outreach")
            .ilike("metadata->target_type", "email")
            .gte("created_at", oneHourAgo);

          if ((count || 0) >= parseInt(emailRule.rule_value)) {
            approved = false;
            enforcement = emailRule.enforcement_level as "block" | "warn" | "log";
            reason = `Email rate limit exceeded: ${count}/${emailRule.rule_value} per hour`;
            riskScore += 25;
          }
        }

        // Check SMS rate limit
        const smsRule = rulesMap.get("MAX_SMS_PER_DAY") as { rule_value: string; enforcement_level: string } | undefined;
        if (smsRule && target_phone) {
          rulesChecked.push("MAX_SMS_PER_DAY");
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const { count } = await supabase
            .from("compliance_audit_log")
            .select("*", { count: "exact", head: true })
            .eq("action_type", "outreach")
            .ilike("metadata->target_type", "sms")
            .gte("created_at", today.toISOString());

          if ((count || 0) >= parseInt(smsRule.rule_value)) {
            approved = false;
            enforcement = smsRule.enforcement_level as "block" | "warn" | "log";
            reason = `SMS rate limit exceeded: ${count}/${smsRule.rule_value} per day`;
            riskScore += 25;
          }
        }

        // Check consent requirement
        const consentRule = rulesMap.get("REQUIRE_CONSENT_FOR_MARKETING") as { rule_value: string } | undefined;
        if (consentRule && consentRule.rule_value === "true") {
          rulesChecked.push("REQUIRE_CONSENT_FOR_MARKETING");
          recommendations.push("Ensure lead has opted-in to marketing communications");
          riskScore += 10;
        }
      }

      // ============================================
      // PRIVACY COMPLIANCE CHECKS
      // ============================================
      if (target_phone) {
        const euRule = rulesMap.get("FLAG_EU_PHONE_NUMBERS") as { rule_value: string } | undefined;
        if (euRule && euRule.rule_value === "true") {
          rulesChecked.push("FLAG_EU_PHONE_NUMBERS");
          const euCodes = ["+33", "+49", "+39", "+34", "+31", "+32", "+43", "+351", "+353", "+358", "+46", "+45", "+372", "+371", "+370", "+48", "+420", "+421", "+386", "+385", "+359", "+40", "+30", "+357", "+356"];
          const isEU = euCodes.some(code => target_phone.startsWith(code));
          if (isEU) {
            enforcement = "warn";
            recommendations.push("GDPR applies: Ensure proper consent and data handling");
            riskScore += 20;
          }
        }
      }

      // ============================================
      // SPEND COMPLIANCE CHECKS
      // ============================================
      if (spend_amount !== undefined) {
        const spendRule = rulesMap.get("MAX_DAILY_AD_SPEND") as { rule_value: string; enforcement_level: string } | undefined;
        if (spendRule) {
          rulesChecked.push("MAX_DAILY_AD_SPEND");
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          const { data: todaySpend } = await supabase
            .from("compliance_audit_log")
            .select("metadata")
            .eq("action_type", "ad_spend")
            .gte("created_at", today.toISOString());

          const totalSpent = (todaySpend || []).reduce((sum: number, log: { metadata: { amount?: number } | null }) => {
            const amount = log.metadata?.amount || 0;
            return sum + amount;
          }, 0);

          if (totalSpent + spend_amount > parseFloat(spendRule.rule_value)) {
            approved = false;
            enforcement = spendRule.enforcement_level as "block" | "warn" | "log";
            reason = `Ad spend limit would be exceeded: $${totalSpent + spend_amount} > $${spendRule.rule_value}`;
            riskScore += 35;
          }
        }
      }
    }

    // ============================================
    // LOG THE COMPLIANCE CHECK
    // ============================================
    const complianceStatus = approved ? "approved" : (enforcement === "block" ? "blocked" : "flagged");
    
    await supabase.from("compliance_audit_log").insert({
      agent_name,
      action_type,
      resource_url,
      data_source,
      consent_basis: "legitimate_interest",
      compliance_status: complianceStatus,
      risk_score: riskScore,
      rule_checked: rulesChecked.join(", "),
      metadata: {
        ...metadata,
        target_phone,
        target_email,
        spend_amount,
        enforcement,
        reason,
        recommendations,
        lockdown_triggered: lockdownTriggered,
      },
    });

    // Also log to platform audit log
    await supabase.from("platform_audit_log").insert({
      agent_name: "compliance-engine",
      action_type: "compliance_check",
      entity_type: "agent",
      entity_id: agent_name,
      description: `Compliance check for ${agent_name}/${action_type}: ${complianceStatus}`,
      request_snapshot: body,
      response_snapshot: { approved, enforcement, riskScore },
      success: true,
    });

    const result: ComplianceResult = {
      approved,
      enforcement,
      reason: reason || undefined,
      rules_checked: rulesChecked,
      risk_score: riskScore,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      lockdown_triggered: lockdownTriggered,
    };

    console.log(`[Compliance Engine] Result:`, result);
    await audit.logSuccess(`Compliance check: ${complianceStatus}`, 'agent', agent_name, { 
      approved, 
      risk_score: riskScore,
      rules_checked: rulesChecked.length 
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Compliance Engine] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    await audit.logError('Compliance check failed', error instanceof Error ? error : new Error(message));
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});