import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateDecisionCard, wrapWithDecisionCard, createSystemDecisionCard, logValidationFailure, type DecisionCard } from "../_shared/decisionSchema.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// MCP Server for Claude Desktop Integration
// Exposes business data and tools for CEO workflow automation
// Now includes Night Watchman capabilities for autonomous monitoring

interface MCPRequest {
  method: string;
  params?: Record<string, unknown>;
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

// Define available tools for Claude - includes Night Watchman action tools
const TOOLS: MCPTool[] = [
  // === MONITORING TOOLS ===
  {
    name: "get_recent_patterns",
    description: "Get detected patterns from user behavior and sales performance over the last N days",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Number of days to analyze (default: 7)" },
        pattern_type: { type: "string", enum: ["all", "user_behavior", "sales", "objection", "conversion"], description: "Type of patterns to retrieve" }
      }
    }
  },
  {
    name: "get_learning_history",
    description: "Get the AI learning history showing what the system has learned from successful interactions",
    inputSchema: {
      type: "object",
      properties: {
        agent_type: { type: "string", description: "Filter by agent type (e.g., 'ceo-agent', 'alex-chat')" },
        limit: { type: "number", description: "Number of entries to return (default: 20)" },
        min_success_score: { type: "number", description: "Minimum success score (0-1)" }
      }
    }
  },
  {
    name: "get_ceo_decisions",
    description: "Get recorded CEO decisions for analysis and pattern learning",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Number of days to look back" },
        decision_type: { type: "string", description: "Filter by decision type" }
      }
    }
  },
  {
    name: "get_business_metrics",
    description: "Get key business metrics including leads, conversions, and revenue data",
    inputSchema: {
      type: "object",
      properties: {
        timeRange: { type: "string", enum: ["1d", "7d", "30d", "90d"], description: "Time range for metrics" }
      }
    }
  },
  {
    name: "search_conversations",
    description: "Search through conversation transcripts for specific topics or objections",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results to return" }
      },
      required: ["query"]
    }
  },
  {
    name: "get_lead_pipeline",
    description: "Get current lead pipeline status and priority leads",
    inputSchema: {
      type: "object",
      properties: {
        status_filter: { type: "string", enum: ["all", "new", "qualified", "proposal_sent", "hot"], description: "Filter by status" }
      }
    }
  },
  {
    name: "analyze_objections",
    description: "Get analysis of common objections and how they're being handled",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Days to analyze" }
      }
    }
  },
  {
    name: "get_agent_performance",
    description: "Get AI agent performance metrics including accuracy and response times",
    inputSchema: {
      type: "object",
      properties: {
        agent_type: { type: "string", description: "Specific agent to analyze" },
        days: { type: "number", description: "Days to look back" }
      }
    }
  },
  
  // === NIGHT WATCHMAN MONITORING TOOLS ===
  {
    name: "get_system_anomalies",
    description: "Check for unusual patterns, errors, or anomalies in the system - use for proactive monitoring",
    inputSchema: {
      type: "object",
      properties: {
        check_types: { 
          type: "array", 
          items: { type: "string" },
          description: "Types of anomalies to check: 'lead_drops', 'failed_agents', 'low_conversions', 'system_errors'" 
        }
      }
    }
  },
  {
    name: "get_at_risk_clients",
    description: "Get clients showing churn signals or needing attention",
    inputSchema: {
      type: "object",
      properties: {
        risk_threshold: { type: "number", description: "Minimum risk score (0-100, default: 60)" }
      }
    }
  },
  {
    name: "get_stale_leads",
    description: "Get leads that haven't been contacted in a while and may be going cold",
    inputSchema: {
      type: "object",
      properties: {
        hours_stale: { type: "number", description: "Hours since last contact (default: 48)" },
        min_score: { type: "number", description: "Minimum lead score to consider (default: 50)" }
      }
    }
  },
  
  // === NIGHT WATCHMAN ACTION TOOLS ===
  {
    name: "queue_action",
    description: "Queue an action for CEO approval - Claude can suggest actions but they need human review",
    inputSchema: {
      type: "object",
      properties: {
        action_type: { type: "string", description: "Type: approve_content, update_lead, send_followup, trigger_sequence, escalate" },
        target_type: { type: "string", description: "What the action targets: lead, content, client, automation" },
        target_id: { type: "string", description: "ID of the target entity" },
        payload: { type: "object", description: "Action-specific data" },
        reasoning: { type: "string", description: "Why Claude recommends this action" },
        priority: { type: "string", enum: ["low", "normal", "high", "critical"], description: "Priority level" }
      },
      required: ["action_type", "reasoning"]
    }
  },
  {
    name: "get_pending_actions",
    description: "View actions Claude has queued that are awaiting CEO approval",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "approved", "rejected", "all"], description: "Filter by status" }
      }
    }
  },
  {
    name: "send_ceo_alert",
    description: "Send an urgent alert to the CEO via email/SMS for critical issues that need attention",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Alert title" },
        message: { type: "string", description: "Detailed message" },
        priority: { type: "string", enum: ["info", "warning", "critical"], description: "Alert priority" },
        metadata: { type: "object", description: "Additional context data" }
      },
      required: ["title", "message", "priority"]
    }
  },
  {
    name: "get_standing_orders",
    description: "Get pre-approved automation rules that Claude can execute without additional approval",
    inputSchema: {
      type: "object",
      properties: {
        active_only: { type: "boolean", description: "Only return active orders (default: true)" }
      }
    }
  },
  {
    name: "execute_standing_order",
    description: "Execute a pre-approved standing order if conditions are met",
    inputSchema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "ID of the standing order to execute" },
        context: { type: "object", description: "Context data to check conditions against" }
      },
      required: ["order_id"]
    }
  },
  {
    name: "log_activity",
    description: "Log Claude's monitoring activity for the morning briefing",
    inputSchema: {
      type: "object",
      properties: {
        activity_type: { type: "string", description: "Type: monitoring, analysis, alert, action_queued" },
        description: { type: "string", description: "What Claude did" },
        details: { type: "object", description: "Additional details" },
        result: { type: "string", description: "Outcome or result" }
      },
      required: ["activity_type", "description"]
    }
  },
  {
    name: "get_overnight_summary",
    description: "Get a summary of what happened overnight for the morning briefing",
    inputSchema: {
      type: "object",
      properties: {
        hours: { type: "number", description: "Hours to look back (default: 12)" }
      }
    }
  },
  
  // === CEO STYLE-MATCHING TOOLS ===
  {
    name: "get_ceo_style_profile",
    description: "Get the CEO's learned communication style, decision patterns, and preferences for mimicking their approach",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["all", "communication", "decisions", "priorities", "thresholds"], description: "Style category to retrieve" }
      }
    }
  },
  {
    name: "get_ceo_style_recommendation",
    description: "Get a recommendation for how the CEO would handle a specific situation based on learned patterns",
    inputSchema: {
      type: "object",
      properties: {
        situation_type: { type: "string", description: "Type of situation: lead_response, objection_handling, pricing, content_approval, escalation" },
        context: { type: "object", description: "Context about the situation (lead details, objection text, etc.)" },
        include_examples: { type: "boolean", description: "Include similar past decisions as examples (default: true)" }
      },
      required: ["situation_type", "context"]
    }
  },
  {
    name: "draft_as_ceo",
    description: "Generate a draft response/message in the CEO's learned style for their review",
    inputSchema: {
      type: "object",
      properties: {
        draft_type: { type: "string", enum: ["email", "response", "content", "decision"], description: "Type of draft to create" },
        context: { type: "object", description: "Context for the draft (recipient, topic, situation)" },
        tone_override: { type: "string", description: "Optional tone override (urgent, friendly, formal)" }
      },
      required: ["draft_type", "context"]
    }
  },
  {
    name: "submit_style_feedback",
    description: "Submit feedback when CEO approves, modifies, or rejects Claude's suggestion - helps improve style matching",
    inputSchema: {
      type: "object",
      properties: {
        action_id: { type: "string", description: "ID of the queued action or draft" },
        feedback_type: { type: "string", enum: ["approved", "modified", "rejected"], description: "What happened to the suggestion" },
        original_suggestion: { type: "string", description: "What Claude suggested" },
        ceo_response: { type: "string", description: "What the CEO actually said/did (if different)" },
        modification_notes: { type: "string", description: "Notes on what was changed and why" }
      },
      required: ["feedback_type", "original_suggestion"]
    }
  },
  {
    name: "update_style_profile",
    description: "Update a specific aspect of the CEO's style profile based on observed patterns",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["communication", "decisions", "priorities", "thresholds"], description: "Category to update" },
        key: { type: "string", description: "Specific key to update (e.g., 'tone', 'risk_tolerance')" },
        value: { type: "object", description: "New value for the key" },
        confidence_boost: { type: "number", description: "How much to increase confidence (0-0.1)" },
        example: { type: "string", description: "Example that led to this learning" }
      },
      required: ["category", "key", "value"]
    }
  },
  {
    name: "get_style_accuracy_report",
    description: "Get a report on how accurately Claude is matching the CEO's style based on feedback",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Days to analyze (default: 30)" }
      }
    }
  }
];

// Define available resources
const RESOURCES: MCPResource[] = [
  {
    uri: "ceo://decisions/recent",
    name: "Recent CEO Decisions",
    description: "The last 50 recorded CEO decisions and their rationale",
    mimeType: "application/json"
  },
  {
    uri: "ceo://patterns/active",
    name: "Active Patterns",
    description: "Currently detected patterns in user behavior and sales",
    mimeType: "application/json"
  },
  {
    uri: "ceo://knowledge/base",
    name: "Business Knowledge Base",
    description: "Stored business knowledge and best practices",
    mimeType: "application/json"
  },
  {
    uri: "ceo://prompts/current",
    name: "Current Prompts",
    description: "Current chatbot prompts and scripts",
    mimeType: "application/json"
  },
  {
    uri: "ceo://standing-orders",
    name: "Standing Orders",
    description: "Pre-approved automation rules Claude can execute",
    mimeType: "application/json"
  },
  {
    uri: "ceo://action-queue",
    name: "Action Queue",
    description: "Pending actions awaiting CEO approval",
    mimeType: "application/json"
  },
  {
    uri: "ceo://alerts/recent",
    name: "Recent Alerts",
    description: "Recent alerts sent to the CEO",
    mimeType: "application/json"
  },
  {
    uri: "ceo://style/profile",
    name: "CEO Style Profile",
    description: "The CEO's learned communication style, decision patterns, and preferences",
    mimeType: "application/json"
  },
  {
    uri: "ceo://style/feedback",
    name: "Style Feedback History",
    description: "History of approved/rejected suggestions for style learning",
    mimeType: "application/json"
  },
  {
    uri: "ceo://style/drafts",
    name: "Draft History",
    description: "History of AI drafts and CEO edits for style comparison",
    mimeType: "application/json"
  }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const request: MCPRequest = await req.json();
    console.log(`[MCP Server] Method: ${request.method}`, request.params);

    switch (request.method) {
      case 'initialize':
        return jsonResponse({
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: { listChanged: true },
            resources: { subscribe: false, listChanged: true }
          },
          serverInfo: {
            name: "ceo-in-a-box-mcp",
            version: "2.0.0",
            description: "MCP Server for AI CEO in a Box - Night Watchman Edition with action queue and monitoring"
          }
        });

      case 'tools/list':
        return jsonResponse({ tools: TOOLS });

      case 'resources/list':
        return jsonResponse({ resources: RESOURCES });

      case 'tools/call': {
        const result = await executeTool(supabase, request.params as { name: string; arguments?: Record<string, unknown> });
        return jsonResponse({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      }

      case 'resources/read': {
        const resourceData = await readResource(supabase, request.params as { uri: string });
        return jsonResponse({ contents: [{ uri: request.params?.uri, mimeType: "application/json", text: JSON.stringify(resourceData, null, 2) }] });
      }

      default:
        return jsonResponse({ error: { code: -32601, message: `Unknown method: ${request.method}` } }, 400);
    }
  } catch (error) {
    console.error('[MCP Server] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: { code: -32603, message } }, 500);
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function executeTool(supabase: unknown, params: { name: string; arguments?: Record<string, unknown> }) {
  const { name, arguments: args = {} } = params;
  const now = new Date();

  switch (name) {
    // === EXISTING MONITORING TOOLS ===
    case 'get_recent_patterns': {
      const days = (args.days as number) || 7;
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      
      let query = supabase
        .from('user_patterns')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('confidence_score', { ascending: false })
        .limit(50);
      
      if (args.pattern_type && args.pattern_type !== 'all') {
        query = query.eq('pattern_type', args.pattern_type);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return { patterns: data, count: data?.length || 0, period_days: days };
    }

    case 'get_learning_history': {
      const limit = (args.limit as number) || 20;
      
      let query = supabase
        .from('agent_memories')
        .select('*')
        .order('success_score', { ascending: false })
        .limit(limit);
      
      if (args.agent_type) {
        query = query.eq('agent_type', args.agent_type);
      }
      if (args.min_success_score) {
        query = query.gte('success_score', args.min_success_score);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return { memories: data, count: data?.length || 0 };
    }

    case 'get_ceo_decisions': {
      const days = (args.days as number) || 30;
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      
      const query = supabase
        .from('agent_memories')
        .select('*')
        .eq('agent_type', 'ceo-training')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });
      
      const { data, error } = await query;
      if (error) throw error;
      return { decisions: data, count: data?.length || 0, period_days: days };
    }

    case 'get_business_metrics': {
      const timeRange = (args.timeRange as string) || '7d';
      const days = parseInt(timeRange) || 7;
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      
      const [leads, conversations, visitors] = await Promise.all([
        supabase.from('leads').select('*', { count: 'exact' }).gte('created_at', startDate.toISOString()),
        supabase.from('conversations').select('*', { count: 'exact' }).gte('created_at', startDate.toISOString()),
        supabase.from('visitors').select('*', { count: 'exact' }).gte('created_at', startDate.toISOString())
      ]);
      
      return {
        leads: { count: leads.count || 0, data: leads.data?.slice(0, 10) },
        conversations: { count: conversations.count || 0 },
        visitors: { count: visitors.count || 0 },
        period: timeRange
      };
    }

    case 'search_conversations': {
      const query = args.query as string;
      const limit = (args.limit as number) || 20;
      
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .or(`transcript.ilike.%${query}%,summary.ilike.%${query}%`)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return { results: data, count: data?.length || 0, query };
    }

    case 'get_lead_pipeline': {
      let query = supabase
        .from('leads')
        .select('*')
        .order('score', { ascending: false })
        .limit(50);
      
      if (args.status_filter && args.status_filter !== 'all') {
        if (args.status_filter === 'hot') {
          query = query.gte('score', 70);
        } else {
          query = query.eq('status', args.status_filter);
        }
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      const pipeline = (data || []).reduce((acc: Record<string, unknown[]>, lead: unknown) => {
        const status = lead.status || 'new';
        if (!acc[status]) acc[status] = [];
        acc[status].push(lead);
        return acc;
      }, {});
      
      return { pipeline, total: data?.length || 0 };
    }

    case 'analyze_objections': {
      const days = (args.days as number) || 30;
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      
      const { data, error } = await supabase
        .from('conversations')
        .select('transcript, outcome')
        .gte('created_at', startDate.toISOString())
        .not('transcript', 'is', null);
      
      if (error) throw error;
      
      const objectionKeywords = ['price', 'cost', 'expensive', 'budget', 'competitor', 'think about it', 'not ready', 'call back'];
      const objectionCounts: Record<string, number> = {};
      
      (data || []).forEach((conv: unknown) => {
        const transcript = (conv.transcript || '').toLowerCase();
        objectionKeywords.forEach(keyword => {
          if (transcript.includes(keyword)) {
            objectionCounts[keyword] = (objectionCounts[keyword] || 0) + 1;
          }
        });
      });
      
      return { 
        objections: Object.entries(objectionCounts).map(([keyword, count]) => ({ keyword, count })).sort((a, b) => b.count - a.count),
        conversations_analyzed: data?.length || 0,
        period_days: days
      };
    }

    case 'get_agent_performance': {
      const days = (args.days as number) || 7;
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      
      let query = supabase
        .from('agent_performance')
        .select('*')
        .gte('date', startDate.toISOString().split('T')[0]);
      
      if (args.agent_type) {
        query = query.eq('agent_type', args.agent_type);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      return { performance: data, period_days: days };
    }

    // === NIGHT WATCHMAN MONITORING TOOLS ===
    case 'get_system_anomalies': {
      const checkTypes = (args.check_types as string[]) || ['lead_drops', 'failed_agents', 'low_conversions', 'system_errors'];
      const anomalies: unknown[] = [];
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      if (checkTypes.includes('lead_drops')) {
        const [todayLeads, yesterdayLeads] = await Promise.all([
          supabase.from('leads').select('*', { count: 'exact' }).gte('created_at', yesterday.toISOString()),
          supabase.from('leads').select('*', { count: 'exact' }).gte('created_at', twoDaysAgo.toISOString()).lt('created_at', yesterday.toISOString())
        ]);
        
        if ((yesterdayLeads.count || 0) > 0) {
          const dropPercent = ((yesterdayLeads.count - (todayLeads.count || 0)) / yesterdayLeads.count) * 100;
          if (dropPercent > 30) {
            anomalies.push({ type: 'lead_drops', severity: 'warning', message: `Lead generation dropped ${dropPercent.toFixed(0)}% compared to previous day`, value: dropPercent });
          }
        }
      }

      if (checkTypes.includes('failed_agents')) {
        const { data: failedLogs } = await supabase
          .from('automation_logs')
          .select('*')
          .eq('status', 'failed')
          .gte('started_at', yesterday.toISOString())
          .limit(10);
        
        if (failedLogs && failedLogs.length > 0) {
          anomalies.push({ type: 'failed_agents', severity: 'critical', message: `${failedLogs.length} automation failures in last 24h`, details: failedLogs });
        }
      }

      if (checkTypes.includes('system_errors')) {
        const { data: errors } = await supabase
          .from('api_logs')
          .select('*')
          .gte('response_status', 400)
          .gte('created_at', yesterday.toISOString())
          .limit(20);
        
        if (errors && errors.length > 5) {
          anomalies.push({ type: 'system_errors', severity: 'warning', message: `${errors.length} API errors in last 24h`, details: errors.slice(0, 5) });
        }
      }

      return { anomalies, checked_at: now.toISOString(), check_types: checkTypes };
    }

    case 'get_at_risk_clients': {
      const riskThreshold = (args.risk_threshold as number) || 60;
      
      const { data, error } = await supabase
        .from('clients')
        .select('*, client_interventions(*)')
        .lt('health_score', 100 - riskThreshold)
        .order('health_score', { ascending: true })
        .limit(20);
      
      if (error) throw error;
      return { at_risk_clients: data || [], count: data?.length || 0, risk_threshold: riskThreshold };
    }

    case 'get_stale_leads': {
      const hoursStale = (args.hours_stale as number) || 48;
      const minScore = (args.min_score as number) || 50;
      const staleDate = new Date(now.getTime() - hoursStale * 60 * 60 * 1000);
      
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .gte('score', minScore)
        .lt('updated_at', staleDate.toISOString())
        .not('status', 'in', '("converted","closed_lost")')
        .order('score', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return { stale_leads: data || [], count: data?.length || 0, hours_stale: hoursStale, min_score: minScore };
    }

    // === NIGHT WATCHMAN ACTION TOOLS ===
    case 'queue_action': {
      // GOVERNANCE: All queue inserts MUST have a valid decision_card
      let decisionCard: DecisionCard;
      const payload = (args.payload || {}) as Record<string, unknown>;
      const actionType = String(args.action_type || 'unknown_action');
      const reasoning = String(args.reasoning || '');
      
      if (args.decision_card) {
        const validation = validateDecisionCard(args.decision_card);
        if (!validation.isValid) {
          logValidationFailure('mcp-server:queue_action', args.decision_card, validation);
          return {
            success: false,
            error: 'Invalid decision_card',
            missing_fields: validation.missingFields,
            validation_errors: validation.errors
          };
        }
        decisionCard = validation.normalizedDecision!;
      } else {
        // Create system decision card
        decisionCard = createSystemDecisionCard(
          actionType,
          `MCP action: ${actionType}`,
          {
            why_now: reasoning || 'Queued via MCP server',
            expected_impact: (payload.expected_impact as string) || `Execute ${actionType}`,
            cost: (payload.cost as string) || 'Minimal',
            risk: (payload.risk as string) || 'low - MCP queued action',
            reversibility: (payload.reversibility as string) || 'easy',
            requires: ['Human approval'],
            confidence: (payload.confidence as number) ?? 0.6,
            proposed_payload: payload
          }
        );
      }

      const { data, error } = await supabase
        .from('ceo_action_queue')
        .insert({
          action_type: actionType,
          target_type: args.target_type || null,
          target_id: args.target_id || null,
          payload: wrapWithDecisionCard(decisionCard, payload),
          claude_reasoning: reasoning,
          priority: args.priority || 'normal',
          source: 'claude-mcp',
          status: 'pending_approval' // GOVERNANCE: Always pending_approval
        })
        .select()
        .single();
      
      if (error) throw error;

      console.log(`[MCP Server] Queued action ${data.id} with valid decision_card`);

      // Log activity
      await supabase.from('claude_activity_log').insert({
        activity_type: 'action_queued',
        description: `Queued ${actionType} action`,
        details: { action_id: data.id, reasoning, decision_card: decisionCard },
        result: 'pending_approval'
      });

      return { success: true, action_id: data.id, message: 'Action queued for CEO approval', action: data };
    }

    case 'get_pending_actions': {
      const statusFilter = (args.status as string) || 'pending';
      
      let query = supabase
        .from('ceo_action_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return { actions: data || [], count: data?.length || 0, status_filter: statusFilter };
    }

    case 'send_ceo_alert': {
      // Insert alert record
      const { data: alertData, error: alertError } = await supabase
        .from('ceo_alerts')
        .insert({
          alert_type: args.priority === 'critical' ? 'urgent' : 'notification',
          priority: args.priority,
          title: args.title,
          message: args.message,
          source: 'claude-mcp',
          metadata: args.metadata || {}
        })
        .select()
        .single();
      
      if (alertError) throw alertError;

      // Call the alert edge function to actually send the notification
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      try {
        await fetch(`${supabaseUrl}/functions/v1/claude-alert`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({
            alert_id: alertData.id,
            title: args.title,
            message: args.message,
            priority: args.priority
          })
        });
      } catch (e) {
        console.error('[MCP] Failed to send alert notification:', e);
      }

      // Log activity
      await supabase.from('claude_activity_log').insert({
        activity_type: 'alert',
        description: `Sent ${args.priority} alert: ${args.title}`,
        details: { alert_id: alertData.id, priority: args.priority },
        result: 'sent'
      });

      return { success: true, alert_id: alertData.id, message: `${args.priority} alert sent to CEO` };
    }

    case 'get_standing_orders': {
      const activeOnly = args.active_only !== false;
      
      let query = supabase
        .from('ceo_standing_orders')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (activeOnly) {
        query = query.eq('is_active', true);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return { standing_orders: data || [], count: data?.length || 0 };
    }

    case 'execute_standing_order': {
      const orderId = args.order_id as string;
      const context = (args.context as Record<string, unknown>) || {};

      // Get the standing order
      const { data: order, error: orderError } = await supabase
        .from('ceo_standing_orders')
        .select('*')
        .eq('id', orderId)
        .eq('is_active', true)
        .single();
      
      if (orderError || !order) {
        return { success: false, message: 'Standing order not found or inactive' };
      }

      // Check conditions (simplified - in production this would be more sophisticated)
      const conditions = order.conditions as Record<string, unknown>;
      let conditionsMet = true;
      
      for (const [key, value] of Object.entries(conditions)) {
        if (context[key] !== undefined && context[key] !== value) {
          conditionsMet = false;
          break;
        }
      }

      if (!conditionsMet) {
        return { success: false, message: 'Conditions not met for standing order execution' };
      }

      // Execute the action based on action_type
      // For now, we'll queue it as executed
      await supabase
        .from('ceo_standing_orders')
        .update({ 
          executions_count: order.executions_count + 1,
          last_executed_at: now.toISOString()
        })
        .eq('id', orderId);

      // Log activity
      await supabase.from('claude_activity_log').insert({
        activity_type: 'standing_order_executed',
        description: `Executed standing order: ${order.rule_name}`,
        details: { order_id: orderId, action_type: order.action_type, context },
        result: 'executed'
      });

      return { success: true, message: `Standing order '${order.rule_name}' executed`, action_type: order.action_type };
    }

    case 'log_activity': {
      const { data, error } = await supabase
        .from('claude_activity_log')
        .insert({
          activity_type: args.activity_type,
          description: args.description,
          details: args.details || {},
          result: args.result || null
        })
        .select()
        .single();
      
      if (error) throw error;
      return { success: true, activity_id: data.id };
    }

    case 'get_overnight_summary': {
      const hours = (args.hours as number) || 12;
      const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

      const [activities, alerts, queuedActions, newLeads, conversations] = await Promise.all([
        supabase.from('claude_activity_log').select('*').gte('created_at', startTime.toISOString()).order('created_at', { ascending: false }),
        supabase.from('ceo_alerts').select('*').gte('created_at', startTime.toISOString()).order('created_at', { ascending: false }),
        supabase.from('ceo_action_queue').select('*').eq('status', 'pending_approval').gte('created_at', startTime.toISOString()),
        supabase.from('leads').select('*', { count: 'exact' }).gte('created_at', startTime.toISOString()),
        supabase.from('conversations').select('*', { count: 'exact' }).gte('created_at', startTime.toISOString())
      ]);

      return {
        summary: {
          period_hours: hours,
          claude_activities: activities.data?.length || 0,
          alerts_sent: alerts.data?.length || 0,
          actions_pending_approval: queuedActions.data?.length || 0,
          new_leads: newLeads.count || 0,
          conversations: conversations.count || 0
        },
        activities: activities.data?.slice(0, 10) || [],
        alerts: alerts.data || [],
        pending_actions: queuedActions.data || [],
        generated_at: now.toISOString()
      };
    }

    // === CEO STYLE-MATCHING TOOLS ===
    case 'get_ceo_style_profile': {
      const category = (args.category as string) || 'all';
      
      let query = supabase
        .from('ceo_style_profile')
        .select('*')
        .order('confidence_score', { ascending: false });
      
      if (category !== 'all') {
        query = query.eq('category', category);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Group by category for easier consumption
      const grouped = (data || []).reduce((acc: Record<string, unknown>, item: unknown) => {
        if (!acc[item.category]) acc[item.category] = {};
        acc[item.category][item.key] = {
          value: item.value,
          confidence: item.confidence_score,
          learned_from: item.learned_from_count,
          examples: item.examples
        };
        return acc;
      }, {});
      
      return { style_profile: grouped, raw: data, count: data?.length || 0 };
    }

    case 'get_ceo_style_recommendation': {
      const situationType = args.situation_type as string;
      const context = (args.context as Record<string, unknown>) || {};
      const includeExamples = args.include_examples !== false;
      
      // Get style profile
      const { data: styleProfile } = await supabase
        .from('ceo_style_profile')
        .select('*')
        .order('confidence_score', { ascending: false });
      
      // Get similar past decisions
      let examples: unknown[] = [];
      if (includeExamples) {
        const { data: memories } = await supabase
          .from('agent_memories')
          .select('*')
          .eq('agent_type', 'ceo-training')
          .order('success_score', { ascending: false })
          .limit(5);
        
        examples = memories || [];
      }
      
      // Build recommendation based on style and situation
      const communication = styleProfile?.find((s: unknown) => s.category === 'communication' && s.key === 'tone');
      const decisions = styleProfile?.find((s: unknown) => s.category === 'decisions' && s.key === 'risk_tolerance');
      const priorities = styleProfile?.find((s: unknown) => s.category === 'priorities');
      
      return {
        situation_type: situationType,
        recommendation: {
          tone: communication?.value || { primary: 'professional', secondary: 'friendly' },
          risk_approach: decisions?.value || { level: 'moderate' },
          priority_guidance: priorities?.value || {},
          confidence: (communication?.confidence_score || 0.3 + (decisions?.confidence_score || 0.3)) / 2
        },
        similar_decisions: examples.map((e: unknown) => ({
          query: e.query,
          response: e.response,
          success_score: e.success_score
        })),
        context_received: context
      };
    }

    case 'draft_as_ceo': {
      const draftType = args.draft_type as string;
      const context = (args.context as Record<string, unknown>) || {};
      const toneOverride = args.tone_override as string | undefined;
      
      // Get style profile
      const { data: styleProfile } = await supabase
        .from('ceo_style_profile')
        .select('*');
      
      // Save the draft request for later comparison
      const { data: draft, error } = await supabase
        .from('ceo_draft_history')
        .insert({
          draft_type: draftType,
          context,
          ai_draft: `[Draft pending - Claude should generate based on style profile]`,
          style_adjustments: []
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Build style guidance for Claude
      const toneProfile = styleProfile?.find((s: unknown) => s.category === 'communication' && s.key === 'tone');
      const lengthProfile = styleProfile?.find((s: unknown) => s.category === 'communication' && s.key === 'response_length');
      
      return {
        draft_id: draft.id,
        draft_type: draftType,
        style_guidance: {
          tone: toneOverride || toneProfile?.value || { primary: 'professional' },
          length: lengthProfile?.value || { preference: 'concise', max_sentences: 3 },
          avoid: toneProfile?.value?.avoid || []
        },
        context,
        instruction: `Generate a ${draftType} for CEO review. Use the style guidance. Keep it ${lengthProfile?.value?.preference || 'concise'}. The draft will be saved and compared against CEO's final version for learning.`
      };
    }

    case 'submit_style_feedback': {
      const feedbackType = args.feedback_type as string;
      const originalSuggestion = args.original_suggestion as string;
      const ceoResponse = args.ceo_response as string | undefined;
      const modificationNotes = args.modification_notes as string | undefined;
      
      // Insert feedback record
      const { data: feedback, error } = await supabase
        .from('ceo_decision_feedback')
        .insert({
          action_queue_id: args.action_id || null,
          feedback_type: feedbackType,
          original_suggestion: originalSuggestion,
          ceo_response: ceoResponse || null,
          modification_notes: modificationNotes || null,
          style_learnings: {}
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // If approved without modification, boost confidence
      if (feedbackType === 'approved') {
        await supabase.rpc('increment_style_confidence', { boost: 0.05 }).catch(() => {
          // RPC might not exist, that's okay
        });
      }
      
      // Log the learning activity
      await supabase.from('claude_activity_log').insert({
        activity_type: 'style_feedback',
        description: `Received ${feedbackType} feedback on suggestion`,
        details: { feedback_id: feedback.id, feedback_type: feedbackType },
        result: feedbackType === 'approved' ? 'style_reinforced' : 'style_adjusted'
      });
      
      return { 
        success: true, 
        feedback_id: feedback.id, 
        message: `Feedback recorded. ${feedbackType === 'approved' ? 'Style pattern reinforced.' : 'Will adjust future suggestions.'}` 
      };
    }

    case 'update_style_profile': {
      const category = args.category as string;
      const key = args.key as string;
      const value = args.value as Record<string, unknown>;
      const confidenceBoost = Math.min((args.confidence_boost as number) || 0.02, 0.1);
      const example = args.example as string | undefined;
      
      // Get existing profile entry
      const { data: existing } = await supabase
        .from('ceo_style_profile')
        .select('*')
        .eq('category', category)
        .eq('key', key)
        .single();
      
      if (existing) {
        // Update existing
        const newConfidence = Math.min((existing.confidence_score || 0.5) + confidenceBoost, 1.0);
        const newExamples = example 
          ? [...(existing.examples || []), example].slice(-10) // Keep last 10 examples
          : existing.examples;
        
        const { error } = await supabase
          .from('ceo_style_profile')
          .update({
            value: { ...existing.value, ...value },
            confidence_score: newConfidence,
            learned_from_count: (existing.learned_from_count || 0) + 1,
            examples: newExamples
          })
          .eq('id', existing.id);
        
        if (error) throw error;
        return { success: true, action: 'updated', new_confidence: newConfidence };
      } else {
        // Insert new
        const { error } = await supabase
          .from('ceo_style_profile')
          .insert({
            category,
            key,
            value,
            confidence_score: 0.3 + confidenceBoost,
            learned_from_count: 1,
            examples: example ? [example] : []
          });
        
        if (error) throw error;
        return { success: true, action: 'created', new_confidence: 0.3 + confidenceBoost };
      }
    }

    case 'get_style_accuracy_report': {
      const days = (args.days as number) || 30;
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      
      // Get feedback history
      const { data: feedback } = await supabase
        .from('ceo_decision_feedback')
        .select('*')
        .gte('created_at', startDate.toISOString());
      
      // Get draft history with similarity scores
      const { data: drafts } = await supabase
        .from('ceo_draft_history')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .not('similarity_score', 'is', null);
      
      // Calculate metrics
      const feedbackCounts = (feedback || []).reduce((acc: Record<string, number>, f: unknown) => {
        acc[f.feedback_type] = (acc[f.feedback_type] || 0) + 1;
        return acc;
      }, {});
      
      const totalFeedback = feedback?.length || 0;
      const approvalRate = totalFeedback > 0 ? ((feedbackCounts.approved || 0) / totalFeedback * 100).toFixed(1) : 'N/A';
      
      const avgSimilarity = drafts && drafts.length > 0
        ? (drafts.reduce((sum: number, d: unknown) => sum + (d.similarity_score || 0), 0) / drafts.length * 100).toFixed(1)
        : 'N/A';
      
      return {
        period_days: days,
        metrics: {
          total_feedback: totalFeedback,
          approval_rate: `${approvalRate}%`,
          feedback_breakdown: feedbackCounts,
          avg_draft_similarity: `${avgSimilarity}%`,
          drafts_analyzed: drafts?.length || 0
        },
        recent_feedback: (feedback || []).slice(0, 10),
        improvement_areas: feedbackCounts.rejected > feedbackCounts.approved
          ? ['Review modification notes to understand style gaps']
          : ['Style matching is improving']
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function readResource(supabase: unknown, params: { uri: string }) {
  const { uri } = params;

  switch (uri) {
    case 'ceo://decisions/recent': {
      const { data } = await supabase
        .from('agent_memories')
        .select('*')
        .eq('agent_type', 'ceo-training')
        .order('created_at', { ascending: false })
        .limit(50);
      return { decisions: data };
    }

    case 'ceo://patterns/active': {
      const { data } = await supabase
        .from('user_patterns')
        .select('*')
        .eq('is_active', true)
        .order('confidence_score', { ascending: false })
        .limit(100);
      return { patterns: data };
    }

    case 'ceo://knowledge/base': {
      const { data } = await supabase
        .from('business_knowledge')
        .select('*')
        .eq('is_ai_accessible', true)
        .order('priority', { ascending: false });
      return { knowledge: data };
    }

    case 'ceo://prompts/current': {
      const { data } = await supabase
        .from('chatbot_prompts')
        .select('*')
        .eq('is_active', true);
      return { prompts: data };
    }

    case 'ceo://standing-orders': {
      const { data } = await supabase
        .from('ceo_standing_orders')
        .select('*')
        .eq('is_active', true);
      return { standing_orders: data };
    }

    case 'ceo://action-queue': {
      const { data } = await supabase
        .from('ceo_action_queue')
        .select('*')
        .eq('status', 'pending_approval')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });
      return { pending_actions: data };
    }

    case 'ceo://alerts/recent': {
      const { data } = await supabase
        .from('ceo_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      return { alerts: data };
    }

    case 'ceo://style/profile': {
      const { data } = await supabase
        .from('ceo_style_profile')
        .select('*')
        .order('confidence_score', { ascending: false });
      
      const grouped = (data || []).reduce((acc: Record<string, unknown>, item: unknown) => {
        if (!acc[item.category]) acc[item.category] = {};
        acc[item.category][item.key] = {
          value: item.value,
          confidence: item.confidence_score,
          learned_from: item.learned_from_count
        };
        return acc;
      }, {});
      
      return { style_profile: grouped };
    }

    case 'ceo://style/feedback': {
      const { data } = await supabase
        .from('ceo_decision_feedback')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      return { feedback_history: data };
    }

    case 'ceo://style/drafts': {
      const { data } = await supabase
        .from('ceo_draft_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      return { draft_history: data };
    }

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}
