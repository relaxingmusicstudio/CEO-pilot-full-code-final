import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Audit logging helper
async function logAudit(supabase: any, entry: {
  agent_name: string;
  action_type: string;
  entity_type?: string;
  entity_id?: string;
  description: string;
  success: boolean;
  request_snapshot?: any;
  response_snapshot?: any;
}) {
  try {
    await supabase.from('platform_audit_log').insert({
      timestamp: new Date().toISOString(),
      ...entry,
      request_snapshot: entry.request_snapshot ? JSON.stringify(entry.request_snapshot) : null,
      response_snapshot: entry.response_snapshot ? JSON.stringify(entry.response_snapshot) : null,
    });
  } catch (err) {
    console.error('[AuditLog] Failed to log:', err);
  }
}

const SYSTEM_PROMPT = `You are the CEO's AI business partner - not just an advisor, but an active co-pilot who runs systems and builds their business 24/7. Think of yourself as their strategic co-founder with perfect memory and tireless execution.

## YOUR CORE IDENTITY
- You're not waiting for questions - you're ALWAYS working on a 2-week strategic plan
- Every conversation continues from where you left off (never reset, never say "How can I help you today?")
- You delegate tasks to specialized agents and show the user when you do
- Your conversation style is warm, direct, and action-oriented (Lovable style)
- You genuinely care about their success and celebrate wins with them
- You are THE authority on HVAC business growth with 20+ years outperforming every agency

## YOUR OPERATING MODE

### 1. PROACTIVE BUSINESS BUILDER
When the conversation has history, be proactive:
- Reference what you discussed before
- Share progress on assigned tasks
- Highlight what's working and what needs attention
- Propose next priorities based on data

Example opening for returning user:
"Hey! Since we last talked, I've been working on the content calendar we discussed. 📈 Also noticed John from Heritage HVAC opened our follow-up email - want me to bump his priority?

Quick plan status:
✅ Content calendar: Complete
🔄 Google Ads A/B test: Day 4 of 7
📋 Up next: Customer re-engagement sequence

What should we tackle today?"

### 2. 2-WEEK ROLLING STRATEGIC PLAN
You ALWAYS maintain and reference a 14-day plan including:
- Weekly objectives with assigned agents
- Daily focus areas and key tasks
- Agent workloads (Content, Ads, Sequences, Inbox, Social)
- Milestones and success metrics
- Blockers and how you're addressing them

### 3. AGENT DELEGATION (VISIBLE TO USER)
When you need specialized help, delegate and SHOW IT in your response:
- **Content Agent**: Blog posts, social content, video scripts
- **Ads Agent**: Campaign creation, optimization, budget allocation  
- **Sequences Agent**: Email/SMS automation, nurture flows
- **Inbox Agent**: Response templates, lead qualification
- **Social Agent**: Community management, engagement

Format delegations like this in your response:
🤖 **Delegating to Content Agent**: Creating 3 blog posts for HVAC seasonal maintenance...

### 4. CONVERSATION CONTINUITY
- NEVER say "How can I help you today?" to returning users
- Pick up exactly where you left off
- Reference past decisions and their outcomes
- Build on previous strategies

### 5. LOVABLE CONVERSATION STYLE
- Warm and direct, like a trusted business partner
- Use emojis sparingly: 🎯 goals, 📈 wins, ⚠️ alerts, ✅ done, 🔄 in progress
- Be concise but not robotic
- Celebrate progress genuinely
- Push back constructively when needed

## PUSHBACK GUIDELINES (CRITICAL):
When the user suggests something suboptimal:
1. ACKNOWLEDGE: "I see where you're going with that..."
2. EXPLAIN with data: "However, based on [experience], this typically..."
3. OFFER better alternative with specific next steps
4. LET THEM DECIDE: "Want to proceed anyway or try my suggestion?"

## RESPONSE PATTERN
Every response should:
1. Acknowledge context (what you know, what's happened)
2. Take or propose action
3. Show agent delegations if any (using the 🤖 format)
4. End with a forward-looking question or next step

## AVAILABLE TOOLS:
- generate_insight: Create data-backed strategic insights
- update_strategic_plan: Modify the 2-week rolling plan
- delegate_to_agent: Assign task to specialized agent
- get_current_plan: View current plan status
- analyze_objections: Deep dive into sales objection patterns
- update_chatbot_prompt: Apply prompt changes
- update_lead_status: Manage lead pipeline
- get_priority_leads: Focus on highest-value opportunities

STOP asking questions only when user says: "That's all", "I'm done", "Thanks, bye", etc.

You're the CEO's trusted co-pilot. Every interaction moves the business forward.`;

const analysisTools = [
  {
    type: "function",
    function: {
      name: "generate_insight",
      description: "Generate a business insight or recommendation based on data analysis",
      parameters: {
        type: "object",
        properties: {
          insight_type: {
            type: "string",
            enum: ["traffic_analysis", "conversion_optimization", "lead_quality", "sales_script", "objection_handling", "transcript_analysis", "prompt_optimization", "ab_test_recommendation", "executive_summary"],
            description: "Type of insight being generated"
          },
          title: { type: "string", description: "Brief title for the insight" },
          summary: { type: "string", description: "Main insight or finding" },
          data_points: { type: "array", items: { type: "string" }, description: "Key data points" },
          recommendations: { type: "array", items: { type: "string" }, description: "Actionable recommendations" },
          priority: { type: "string", enum: ["high", "medium", "low"], description: "Priority level" }
        },
        required: ["insight_type", "title", "summary", "recommendations", "priority"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_objections",
      description: "Analyze objection patterns from conversation transcripts",
      parameters: {
        type: "object",
        properties: {
          objections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                objection: { type: "string" },
                frequency: { type: "number" },
                current_response: { type: "string" },
                success_rate: { type: "number" },
                suggested_response: { type: "string" }
              }
            }
          },
          total_conversations_analyzed: { type: "number" }
        },
        required: ["objections", "total_conversations_analyzed"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "suggest_prompt_improvements",
      description: "Suggest specific improvements to chatbot prompts (without applying them)",
      parameters: {
        type: "object",
        properties: {
          improvements: {
            type: "array",
            items: {
              type: "object",
              properties: {
                prompt_key: { type: "string", description: "Key of the prompt to update (e.g., opener, pricing_objection)" },
                current_approach: { type: "string" },
                suggested_approach: { type: "string" },
                rationale: { type: "string" },
                expected_impact: { type: "string" }
              }
            }
          }
        },
        required: ["improvements"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_chatbot_prompt",
      description: "Actually UPDATE a chatbot prompt in the database. Use this when user confirms they want to apply a change.",
      parameters: {
        type: "object",
        properties: {
          prompt_key: { type: "string", description: "Key of prompt to update (opener, pricing_objection, whats_the_catch, closing_cta, ai_agent_description)" },
          new_value: { type: "string", description: "The new prompt text" },
          reason: { type: "string", description: "Reason for the change" }
        },
        required: ["prompt_key", "new_value", "reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_lead_status",
      description: "Update a lead's status in the database",
      parameters: {
        type: "object",
        properties: {
          lead_identifier: { type: "string", description: "Lead name, email, or ID to identify the lead" },
          new_status: { type: "string", enum: ["new", "contacted", "qualified", "proposal_sent", "won", "lost"], description: "New status for the lead" },
          notes: { type: "string", description: "Optional notes about the status change" },
          revenue_value: { type: "number", description: "Optional: revenue value if won" }
        },
        required: ["lead_identifier", "new_status"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "add_lead_note",
      description: "Add a note to a lead's record",
      parameters: {
        type: "object",
        properties: {
          lead_identifier: { type: "string", description: "Lead name, email, or ID" },
          note: { type: "string", description: "Note to add" }
        },
        required: ["lead_identifier", "note"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_lead_details",
      description: "Get detailed information about a specific lead",
      parameters: {
        type: "object",
        properties: {
          lead_identifier: { type: "string", description: "Lead name, email, or ID" }
        },
        required: ["lead_identifier"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_priority_leads",
      description: "Get the top priority leads to focus on",
      parameters: {
        type: "object",
        properties: {
          count: { type: "number", description: "Number of leads to return (default 5)" },
          filter: { type: "string", enum: ["hot", "today", "follow_up", "all"], description: "Filter type" }
        },
        required: []
      }
    }
  },
  // Integration Management Tools
  {
    type: "function",
    function: {
      name: "check_integration_status",
      description: "Check which services are connected and their health status",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_integration_suggestions",
      description: "Get smart recommendations for which services to connect next based on current setup and business type",
      parameters: {
        type: "object",
        properties: {
          business_type: { type: "string", enum: ["hvac_basic", "hvac_advanced", "ecommerce_starter", "agency_growth", "consulting_pro"], description: "Business type for tailored suggestions" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "initiate_connection",
      description: "Get setup instructions for connecting a specific service",
      parameters: {
        type: "object",
        properties: {
          service_key: { type: "string", description: "Service to connect (e.g., 'stripe', 'google_analytics', 'twilio')" }
        },
        required: ["service_key"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "save_credential",
      description: "Store an API key or credential that the user provides",
      parameters: {
        type: "object",
        properties: {
          service_key: { type: "string", description: "Service this credential is for" },
          api_key: { type: "string", description: "The API key or token" },
          additional_fields: { type: "object", description: "Any additional credential fields (e.g., account_sid for Twilio)" }
        },
        required: ["service_key", "api_key"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "test_connection",
      description: "Test if a service connection is working properly",
      parameters: {
        type: "object",
        properties: {
          service_key: { type: "string", description: "Service to test" }
        },
        required: ["service_key"]
      }
    }
  },
  // Strategic Planning Tools
  {
    type: "function",
    function: {
      name: "update_strategic_plan",
      description: "Update the 2-week rolling strategic plan with objectives, focus areas, and milestones",
      parameters: {
        type: "object",
        properties: {
          current_phase: { type: "string", enum: ["foundation", "growth", "optimization", "expansion"], description: "Current business phase" },
          weekly_objectives: { 
            type: "array", 
            items: { 
              type: "object",
              properties: {
                week: { type: "number" },
                objectives: { type: "array", items: { type: "string" } },
                assigned_agents: { type: "array", items: { type: "string" } }
              }
            },
            description: "Objectives for week 1 and 2" 
          },
          milestones: { 
            type: "array", 
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                due_date: { type: "string" },
                status: { type: "string", enum: ["pending", "in_progress", "completed"] }
              }
            },
            description: "Key milestones" 
          },
          blockers: { 
            type: "array", 
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                severity: { type: "string", enum: ["low", "medium", "high"] }
              }
            },
            description: "Current blockers" 
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delegate_to_agent",
      description: "Delegate a task to a specialized agent (content, ads, sequences, inbox, social). Always show delegation in response.",
      parameters: {
        type: "object",
        properties: {
          agent: { type: "string", enum: ["content", "ads", "sequences", "inbox", "social"], description: "Agent to delegate to" },
          task: { type: "string", description: "Task description" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Task priority" },
          context: { type: "object", description: "Additional context for the agent" }
        },
        required: ["agent", "task"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_current_plan",
      description: "Get the current 2-week strategic plan status including objectives, milestones, and agent workloads",
      parameters: { type: "object", properties: {}, required: [] }
    }
  }
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, timeRange = "7d", conversationHistory = [], stream = false, visitorId, correctionContext } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    // ═══ MEMORY RECALL: Search for relevant past discussions ═══
    let relevantMemories: any[] = [];
    let userPatterns: any[] = [];
    
    try {
      // Search agent memory for similar past queries
      const memoryResponse = await fetch(
        `${SUPABASE_URL}/functions/v1/agent-memory`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            action: 'search',
            agent_type: 'ceo-agent',
            query: query,
            threshold: 0.7,
            limit: 3
          }),
        }
      );
      
      if (memoryResponse.ok) {
        const memoryData = await memoryResponse.json();
        relevantMemories = memoryData.memories || [];
        console.log(`CEO Agent: Found ${relevantMemories.length} relevant memories`);
      }
      
      // Fetch user patterns if visitor ID is provided
      if (visitorId) {
        const { data: patterns } = await supabase
          .from('user_patterns')
          .select('*')
          .eq('visitor_id', visitorId)
          .eq('is_active', true)
          .gte('confidence_score', 0.7)
          .order('confidence_score', { ascending: false })
          .limit(5);
        
        userPatterns = patterns || [];
        console.log(`CEO Agent: Found ${userPatterns.length} user patterns for visitor ${visitorId}`);
      }
    } catch (memErr) {
      console.error('Memory recall error (non-fatal):', memErr);
    }
    
    // ═══ CHECK USER DIRECTIVES: Get pending user commands ═══
    let userDirectives: any[] = [];
    let directivesContext = '';
    try {
      const { data: directives } = await supabase
        .from('user_directives')
        .select('*')
        .eq('action_required', true)
        .eq('action_taken', false)
        .order('created_at', { ascending: false })
        .limit(10);
      
      userDirectives = directives || [];
      
      if (userDirectives.length > 0) {
        directivesContext = `\n\n## PENDING USER DIRECTIVES (Human-in-the-Loop):\n`;
        directivesContext += `The user has ${userDirectives.length} pending command(s) that may affect your response:\n`;
        userDirectives.forEach((d, i) => {
          directivesContext += `${i + 1}. [${d.intent?.toUpperCase() || 'DIRECTIVE'}] (${d.source}): "${d.content}" - Priority: ${d.priority}\n`;
        });
        directivesContext += `\nConsider these directives when providing recommendations. If a user said "pause outreach", acknowledge that outreach is paused.\n`;
        console.log(`CEO Agent: Found ${userDirectives.length} pending user directives`);
      }
    } catch (dirErr) {
      console.error('Directive check error (non-fatal):', dirErr);
    }
    
    // Calculate date range
    const now = new Date();
    const daysAgo = parseInt(timeRange) || 7;
    const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    
    // Fetch all data including prompts and business knowledge
    let businessKnowledgeContext = '';
    try {
      const knowledgeResponse = await fetch(`${SUPABASE_URL}/functions/v1/knowledge-base`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'get_for_ai' }),
      });
      if (knowledgeResponse.ok) {
        const knowledgeData = await knowledgeResponse.json();
        businessKnowledgeContext = knowledgeData.context || '';
        console.log(`CEO Agent: Loaded ${knowledgeData.knowledgeCount} knowledge entries`);
      }
    } catch (e) { console.error('Knowledge fetch error (non-fatal):', e); }

    const [visitorsResult, conversationsResult, leadsResult, eventsResult, promptsResult] = await Promise.all([
      supabase.from("visitors").select("*").gte("created_at", startDate.toISOString()).order("created_at", { ascending: false }).limit(500),
      supabase.from("conversations").select("*").gte("created_at", startDate.toISOString()).order("created_at", { ascending: false }).limit(100),
      supabase.from("leads").select("*").gte("created_at", startDate.toISOString()).order("created_at", { ascending: false }).limit(200),
      supabase.from("analytics_events").select("*").gte("created_at", startDate.toISOString()).order("created_at", { ascending: false }).limit(1000),
      supabase.from("chatbot_prompts").select("*").eq("is_active", true),
    ]);
    
    const visitors = visitorsResult.data || [];
    const conversations = conversationsResult.data || [];
    const leads = leadsResult.data || [];
    const prompts = promptsResult.data || [];
    
    // Calculate metrics
    const totalVisitors = visitors.length;
    const totalConversations = conversations.length;
    const totalLeads = leads.length;
    const conversionRate = totalVisitors > 0 ? ((totalLeads / totalVisitors) * 100).toFixed(2) : "0";
    
    const trafficSources: Record<string, number> = {};
    visitors.forEach((v: any) => {
      const source = v.utm_source || "Direct";
      trafficSources[source] = (trafficSources[source] || 0) + 1;
    });
    
    const hotLeads = leads.filter((l: any) => l.lead_score >= 75).length;
    const warmLeads = leads.filter((l: any) => l.lead_score >= 50 && l.lead_score < 75).length;
    const coldLeads = leads.filter((l: any) => l.lead_score < 50).length;
    
    const outcomeBreakdown: Record<string, number> = {};
    conversations.forEach((c: any) => {
      const outcome = c.outcome || "unknown";
      outcomeBreakdown[outcome] = (outcomeBreakdown[outcome] || 0) + 1;
    });
    
    const avgEngagement = visitors.length > 0
      ? Math.round(visitors.reduce((sum: number, v: any) => sum + (v.engagement_score || 0), 0) / visitors.length)
      : 0;
    
    // Analyze transcripts
    const transcriptAnalysis = analyzeTranscripts(conversations);
    
    // Build memory context for injection into prompt
    let memoryContext = '';
    if (relevantMemories.length > 0) {
      memoryContext = `\n═══ RELEVANT PAST DISCUSSIONS (from your memory) ═══\n`;
      relevantMemories.forEach((mem: any, i: number) => {
        memoryContext += `${i + 1}. [${new Date(mem.created_at).toLocaleDateString()}] Q: "${mem.query.slice(0, 100)}..."\n   A: "${mem.response.slice(0, 150)}..."\n   (Similarity: ${Math.round(mem.similarity * 100)}%, Used ${mem.usage_count}x)\n`;
      });
    }
    
    // Build pattern-based suggestions
    let patternContext = '';
    if (userPatterns.length > 0) {
      patternContext = `\n═══ USER BEHAVIOR PATTERNS (proactive suggestions) ═══\n`;
      userPatterns.forEach((pat: any, i: number) => {
        patternContext += `${i + 1}. ${pat.trigger_type}: ${JSON.stringify(pat.action_payload)} (Confidence: ${Math.round(pat.confidence_score * 100)}%)\n`;
      });
    }
    
    // Build context with memory and business knowledge
    const dataContext = buildDataContext({
      daysAgo, totalVisitors, totalConversations, totalLeads, conversionRate,
      avgEngagement, trafficSources, hotLeads, warmLeads, coldLeads,
      outcomeBreakdown, leads, transcriptAnalysis, conversations, prompts
    }) + businessKnowledgeContext + memoryContext + patternContext;

    console.log("CEO Agent query:", query);
    
    // Build self-improvement context if user provided correction feedback
    let selfImprovementPrompt = '';
    if (correctionContext) {
      selfImprovementPrompt = `
═══ SELF-IMPROVEMENT CONTEXT ═══
Your previous response was rated unhelpful by the user. Learn from this:

PREVIOUS EXCHANGE:
User asked: "${correctionContext.previousQuery}"
Your response: "${correctionContext.previousResponse?.slice(0, 300)}..."

User's follow-up (correction): "${correctionContext.userCorrection}"

INSTRUCTIONS:
1. Analyze what went wrong with your previous response
2. Consider: Was it too vague? Wrong data? Missed the point? Poor recommendations?
3. Adjust your approach for this new query
4. Be more precise and actionable this time
═══════════════════════════════

`;
      console.log('CEO Agent: Self-improvement mode activated due to negative feedback');
    }
    
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...conversationHistory.slice(-10).map((msg: any) => ({
        role: msg.role === "ceo" ? "assistant" : msg.role,
        content: msg.content
      })),
      { role: "user", content: `${selfImprovementPrompt}${dataContext}${directivesContext}\n\nUSER QUERY: ${query}` }
    ];

    if (stream) {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, stream: true }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "Usage limit reached" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`AI API error: ${status}`);
      }

      const metricsData = JSON.stringify({
        type: "metrics",
        metrics: { totalVisitors, totalConversations, totalLeads, conversionRate: parseFloat(conversionRate), avgEngagement, hotLeads, warmLeads, coldLeads, trafficSources, outcomeBreakdown }
      });

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const reader = response.body!.getReader();

      (async () => {
        try {
          await writer.write(new TextEncoder().encode(`data: ${metricsData}\n\n`));
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await writer.write(value);
          }
        } finally {
          await writer.close();
        }
      })();

      return new Response(readable, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }
    
    // Non-streaming with tool execution
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, tools: analysisTools, tool_choice: "auto" }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Usage limit reached" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI API error: ${status}`);
    }

    const aiResponse = await response.json();
    console.log("CEO Agent response:", JSON.stringify(aiResponse).slice(0, 500));
    
    let result: any = {
      response: "",
      insights: [],
      actions: [],
      metrics: { totalVisitors, totalConversations, totalLeads, conversionRate: parseFloat(conversionRate), avgEngagement, hotLeads, warmLeads, coldLeads, trafficSources, outcomeBreakdown }
    };
    
    const choice = aiResponse.choices?.[0];
    if (choice?.message?.tool_calls?.length > 0) {
      for (const toolCall of choice.message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        const toolName = toolCall.function.name;
        
        // Execute the tool
        const toolResult = await executeToolCall(supabase, toolName, args, leads);
        result.actions.push({ tool: toolName, args, result: toolResult });
        
        if (toolName === "generate_insight") {
          result.insights.push(args);
          if (!result.response) result.response = args.summary;
        } else if (toolName === "update_chatbot_prompt") {
          result.response = toolResult.message;
        } else if (toolName === "update_lead_status") {
          result.response = toolResult.message;
        } else if (toolName === "get_lead_details") {
          result.response = formatLeadDetails(toolResult.lead);
        } else if (toolName === "get_priority_leads") {
          result.response = formatPriorityLeads(toolResult.leads);
        } else if (toolName === "suggest_prompt_improvements") {
          result.response = formatPromptImprovements(args);
        } else if (toolName === "analyze_objections") {
          result.response = formatObjectionAnalysis(args);
        }
      }
    } else if (choice?.message?.content) {
      result.response = choice.message.content;
    }

    // ═══ MEMORY SAVE: Store successful exchange for future recall ═══
    if (result.response && result.response.length > 50) {
      try {
        await fetch(
          `${SUPABASE_URL}/functions/v1/agent-memory`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              action: 'save',
              agent_type: 'ceo-agent',
              query: query,
              response: result.response.slice(0, 500), // Truncate for storage
              metadata: {
                visitor_id: visitorId || null,
                time_range: timeRange,
                metrics_snapshot: {
                  visitors: totalVisitors,
                  leads: totalLeads,
                  conversion: conversionRate
                },
                tools_used: result.actions?.map((a: any) => a.tool) || [],
                timestamp: new Date().toISOString()
              }
            }),
          }
        );
        console.log('CEO Agent: Saved exchange to memory');
        
        // Increment usage count for any memories that were used
        for (const mem of relevantMemories) {
          if (mem.id) {
            await fetch(
              `${SUPABASE_URL}/functions/v1/agent-memory`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify({
                  action: 'increment_usage',
                  memory_id: mem.id
                }),
              }
            );
          }
        }
      } catch (saveErr) {
        console.error('Memory save error (non-fatal):', saveErr);
      }
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("CEO Agent error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      response: "I'm having trouble right now. Please try again."
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// Execute tool calls
async function executeToolCall(supabase: any, toolName: string, args: any, allLeads: any[]): Promise<any> {
  console.log(`Executing tool: ${toolName}`, args);
  
  switch (toolName) {
    case "update_chatbot_prompt": {
      const { prompt_key, new_value, reason } = args;
      
      // Get current value
      const { data: current } = await supabase
        .from("chatbot_prompts")
        .select("*")
        .eq("prompt_key", prompt_key)
        .single();
      
      if (!current) {
        return { success: false, message: `Prompt "${prompt_key}" not found` };
      }
      
      // Update prompt
      const { error: updateError } = await supabase
        .from("chatbot_prompts")
        .update({ 
          prompt_value: new_value, 
          version: (current.version || 1) + 1,
          updated_by: "CEO Agent"
        })
        .eq("prompt_key", prompt_key);
      
      if (updateError) {
        console.error("Update prompt error:", updateError);
        return { success: false, message: `Failed to update: ${updateError.message}` };
      }
      
      // Log to history
      await supabase.from("chatbot_prompt_history").insert({
        prompt_id: current.id,
        prompt_key,
        old_value: current.prompt_value,
        new_value,
        changed_by: "CEO Agent",
        change_reason: reason
      });
      
      return { 
        success: true, 
        message: `✅ Updated "${prompt_key}" prompt!\n\n**Before:** ${current.prompt_value.slice(0, 100)}...\n\n**After:** ${new_value.slice(0, 100)}...\n\n**Reason:** ${reason}\n\nThis change is now live in the chatbot.`
      };
    }
    
    case "update_lead_status": {
      const { lead_identifier, new_status, notes, revenue_value } = args;
      
      // Find lead by name, email, or ID
      const lead = findLead(allLeads, lead_identifier);
      if (!lead) {
        return { success: false, message: `Lead "${lead_identifier}" not found` };
      }
      
      const updateData: any = { status: new_status };
      if (notes) updateData.notes = (lead.notes || "") + `\n[${new Date().toLocaleDateString()}] ${notes}`;
      if (revenue_value) updateData.revenue_value = revenue_value;
      if (new_status === "won") updateData.converted_at = new Date().toISOString();
      
      const { error } = await supabase
        .from("leads")
        .update(updateData)
        .eq("id", lead.id);
      
      if (error) {
        return { success: false, message: `Failed to update: ${error.message}` };
      }
      
      return { 
        success: true, 
        message: `✅ Updated **${lead.name || lead.email}** to status: **${new_status}**${revenue_value ? ` (Value: $${revenue_value})` : ""}${notes ? `\nNote added: "${notes}"` : ""}`
      };
    }
    
    case "add_lead_note": {
      const { lead_identifier, note } = args;
      const lead = findLead(allLeads, lead_identifier);
      if (!lead) return { success: false, message: `Lead "${lead_identifier}" not found` };
      
      const newNotes = (lead.notes || "") + `\n[${new Date().toLocaleDateString()}] ${note}`;
      
      const { error } = await supabase
        .from("leads")
        .update({ notes: newNotes })
        .eq("id", lead.id);
      
      if (error) return { success: false, message: `Failed: ${error.message}` };
      
      return { success: true, message: `✅ Added note to **${lead.name || lead.email}**: "${note}"` };
    }
    
    case "get_lead_details": {
      const { lead_identifier } = args;
      const lead = findLead(allLeads, lead_identifier);
      if (!lead) return { success: false, message: `Lead "${lead_identifier}" not found`, lead: null };
      return { success: true, lead };
    }
    
    case "get_priority_leads": {
      const { count = 5, filter = "hot" } = args;
      let filtered = [...allLeads];
      
      if (filter === "hot") {
        filtered = filtered.filter((l: any) => l.lead_score >= 70);
      } else if (filter === "follow_up") {
        filtered = filtered.filter((l: any) => l.status === "contacted" || l.status === "qualified");
      }
      
      filtered.sort((a: any, b: any) => (b.lead_score || 0) - (a.lead_score || 0));
      
      return { success: true, leads: filtered.slice(0, count) };
    }
    
    // Strategic Planning Tools
    case "update_strategic_plan": {
      const { current_phase, weekly_objectives, milestones, blockers } = args;
      
      const updateData: any = { updated_at: new Date().toISOString() };
      if (current_phase) updateData.current_phase = current_phase;
      if (weekly_objectives) updateData.weekly_objectives = weekly_objectives;
      if (milestones) updateData.milestones = milestones;
      if (blockers) updateData.blockers = blockers;
      
      // Upsert the plan
      const { data: existing } = await supabase.from('ceo_strategic_plan').select('id').limit(1).single();
      
      if (existing) {
        await supabase.from('ceo_strategic_plan').update(updateData).eq('id', existing.id);
      } else {
        await supabase.from('ceo_strategic_plan').insert({ ...updateData, plan_horizon_days: 14 });
      }
      
      return { success: true, message: `✅ Strategic plan updated! Phase: ${current_phase || 'unchanged'}` };
    }
    
    case "delegate_to_agent": {
      const { agent, task, priority = 'medium', context } = args;
      
      // Log the delegation
      await supabase.from('ceo_agent_delegations').insert({
        delegated_to: agent,
        task_description: task,
        priority,
        input_context: context || {},
        status: 'in_progress'
      });
      
      // Update agent workload in strategic plan
      const { data: plan } = await supabase.from('ceo_strategic_plan').select('agent_workloads').limit(1).single();
      const workloads = (plan?.agent_workloads as any) || {};
      workloads[agent] = workloads[agent] || { active_tasks: 0, completed_today: 0, pending: 0 };
      workloads[agent].active_tasks += 1;
      
      await supabase.from('ceo_strategic_plan').update({ agent_workloads: workloads }).not('id', 'is', null);
      
      return { success: true, message: `🤖 **Delegating to ${agent.charAt(0).toUpperCase() + agent.slice(1)} Agent**: ${task}` };
    }
    
    case "get_current_plan": {
      const { data: plan } = await supabase.from('ceo_strategic_plan').select('*').limit(1).single();
      
      if (!plan) {
        return { success: true, message: "No strategic plan created yet. Want me to create a 2-week plan based on your current business data?" };
      }
      
      const objectives = (plan.weekly_objectives as any[]) || [];
      const milestones = (plan.milestones as any[]) || [];
      const blockers = (plan.blockers as any[]) || [];
      
      let msg = `📋 **2-Week Strategic Plan** (Phase: ${plan.current_phase})\n\n`;
      
      if (objectives.length > 0) {
        msg += `**This Week:**\n`;
        objectives[0]?.objectives?.forEach((o: string) => { msg += `• ${o}\n`; });
      }
      
      if (milestones.length > 0) {
        const completed = milestones.filter((m: any) => m.status === 'completed').length;
        msg += `\n**Milestones:** ${completed}/${milestones.length} complete\n`;
      }
      
      if (blockers.length > 0) {
        msg += `\n⚠️ **Blockers:** ${blockers.length}\n`;
      }
      
      return { success: true, message: msg, plan };
    }
    
    // Integration Management Tools
    case "check_integration_status": {
      try {
        const vaultResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/credential-vault`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
          body: JSON.stringify({ action: 'list' }),
        });
        const vaultData = await vaultResponse.json();
        const credentials = vaultData.credentials || [];
        
        if (credentials.length === 0) {
          return { success: true, message: "📊 **Integration Status**\n\nNo integrations connected yet. Ask me 'What should I connect?' for recommendations!" };
        }
        
        let statusMsg = `📊 **Integration Status** (${credentials.length} connected)\n\n`;
        const byStatus: Record<string, any[]> = { healthy: [], degraded: [], expired: [], unknown: [] };
        credentials.forEach((c: any) => byStatus[c.connection_status || 'unknown'].push(c));
        
        if (byStatus.healthy.length > 0) statusMsg += `✅ **Healthy:** ${byStatus.healthy.map((c: any) => `${c.icon_emoji} ${c.display_name}`).join(', ')}\n`;
        if (byStatus.degraded.length > 0) statusMsg += `⚠️ **Degraded:** ${byStatus.degraded.map((c: any) => `${c.icon_emoji} ${c.display_name}`).join(', ')}\n`;
        if (byStatus.expired.length > 0) statusMsg += `❌ **Expired:** ${byStatus.expired.map((c: any) => `${c.icon_emoji} ${c.display_name}`).join(', ')}\n`;
        if (byStatus.unknown.length > 0) statusMsg += `❓ **Unknown:** ${byStatus.unknown.map((c: any) => `${c.icon_emoji} ${c.display_name}`).join(', ')}\n`;
        
        return { success: true, message: statusMsg };
      } catch (err) {
        return { success: false, message: `Failed to check integrations: ${err}` };
      }
    }
    
    case "get_integration_suggestions": {
      const { business_type } = args;
      try {
        const regResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/service-registry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
          body: JSON.stringify({ action: 'suggest', business_type }),
        });
        const regData = await regResponse.json();
        const suggestions = regData.suggestions || [];
        
        if (suggestions.length === 0) {
          return { success: true, message: "🎉 You have all recommended integrations connected! Your setup is complete." };
        }
        
        let msg = `💡 **Recommended Integrations**\n\n`;
        suggestions.slice(0, 5).forEach((s: any, i: number) => {
          msg += `${i + 1}. ${s.icon_emoji} **${s.display_name}** (${s.category})\n   _${s.reason}_\n\n`;
        });
        msg += `\nSay "Connect [service name]" to get started!`;
        
        return { success: true, message: msg };
      } catch (err) {
        return { success: false, message: `Failed to get suggestions: ${err}` };
      }
    }
    
    case "initiate_connection": {
      const { service_key } = args;
      try {
        const regResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/service-registry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
          body: JSON.stringify({ action: 'get', service_key }),
        });
        const regData = await regResponse.json();
        const service = regData.service;
        
        if (!service) return { success: false, message: `Service "${service_key}" not found. Try: stripe, twilio, google_analytics, etc.` };
        
        let msg = `${service.icon_emoji} **Connect ${service.display_name}**\n\n`;
        msg += `${service.description}\n\n`;
        msg += `**Setup Steps:**\n`;
        (service.setup_instructions || []).forEach((step: any) => {
          msg += `${step.step}. **${step.title}**: ${step.description}\n`;
        });
        
        if (service.credential_fields?.length > 0) {
          msg += `\n**What I need from you:**\n`;
          service.credential_fields.forEach((f: any) => msg += `- ${f.label}${f.placeholder ? ` (e.g., ${f.placeholder})` : ''}\n`);
          msg += `\nOnce you have these, just paste them here and I'll securely store them!`;
        } else if (service.auth_method === 'oauth2') {
          msg += `\n_This service uses OAuth. I'll guide you through the connection process._`;
        }
        
        if (service.documentation_url) msg += `\n\n📚 [Documentation](${service.documentation_url})`;
        
        return { success: true, message: msg };
      } catch (err) {
        return { success: false, message: `Failed to get service info: ${err}` };
      }
    }
    
    case "save_credential": {
      const { service_key, api_key, additional_fields } = args;
      try {
        const credentialData = { api_key, type: 'api_key', ...additional_fields };
        const vaultResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/credential-vault`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
          body: JSON.stringify({ action: 'store', service_key, agent_name: 'ceo-agent', credential_data: credentialData }),
        });
        const vaultData = await vaultResponse.json();
        
        if (!vaultData.success) return { success: false, message: `Failed to save: ${vaultData.error}` };
        
        return { success: true, message: `✅ **${service_key} credential saved!**\n\nI've securely encrypted and stored your API key. Would you like me to test the connection?` };
      } catch (err) {
        return { success: false, message: `Failed to save credential: ${err}` };
      }
    }
    
    case "test_connection": {
      const { service_key } = args;
      try {
        const vaultResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/credential-vault`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
          body: JSON.stringify({ action: 'test', service_key, agent_name: 'ceo-agent' }),
        });
        const vaultData = await vaultResponse.json();
        
        const statusEmoji = vaultData.status === 'healthy' ? '✅' : vaultData.status === 'degraded' ? '⚠️' : '❌';
        return { success: true, message: `${statusEmoji} **${service_key} Connection Test**\n\nStatus: **${vaultData.status}**\n${vaultData.message}` };
      } catch (err) {
        return { success: false, message: `Failed to test connection: ${err}` };
      }
    }
    
    default:
      return { success: true, message: "Analysis complete" };
  }
}

function findLead(leads: any[], identifier: string): any {
  const searchLower = identifier.toLowerCase();
  return leads.find((l: any) => 
    l.id === identifier ||
    l.email?.toLowerCase().includes(searchLower) ||
    l.name?.toLowerCase().includes(searchLower) ||
    l.business_name?.toLowerCase().includes(searchLower)
  );
}

function analyzeTranscripts(conversations: any[]) {
  const analysis = {
    totalMessages: 0,
    avgMessagesPerConversation: 0,
    dropOffPhases: {} as Record<string, number>,
    convertedVsAbandoned: { converted: 0, abandoned: 0 },
    objectionPatterns: [] as string[]
  };

  let totalMsgCount = 0;
  
  conversations.forEach((conv: any) => {
    const messages = Array.isArray(conv.messages) ? conv.messages : [];
    totalMsgCount += messages.length;
    
    if (conv.outcome === "converted" || conv.outcome === "qualified") {
      analysis.convertedVsAbandoned.converted++;
    } else {
      analysis.convertedVsAbandoned.abandoned++;
    }
    
    const phase = conv.conversation_phase || "unknown";
    analysis.dropOffPhases[phase] = (analysis.dropOffPhases[phase] || 0) + 1;
    
    messages.forEach((msg: any) => {
      const content = (msg.content || msg.text || "").toLowerCase();
      if (content.includes("expensive") || content.includes("cost") || content.includes("price")) {
        if (!analysis.objectionPatterns.includes("pricing")) analysis.objectionPatterns.push("pricing");
      }
      if (content.includes("think about it") || content.includes("not sure")) {
        if (!analysis.objectionPatterns.includes("hesitation")) analysis.objectionPatterns.push("hesitation");
      }
    });
  });
  
  analysis.totalMessages = totalMsgCount;
  analysis.avgMessagesPerConversation = conversations.length > 0 ? Math.round(totalMsgCount / conversations.length) : 0;
    
  return analysis;
}

function buildDataContext(data: any) {
  const { daysAgo, totalVisitors, totalConversations, totalLeads, conversionRate, avgEngagement, trafficSources, hotLeads, warmLeads, coldLeads, outcomeBreakdown, leads, transcriptAnalysis, conversations, prompts } = data;
  
  // Sample transcripts
  interface TranscriptMessage { role: string; content: string; }
  interface SampleTranscript { outcome: string; phase: string; messageCount: number; messages: TranscriptMessage[]; }
  
  const sampleTranscripts: SampleTranscript[] = conversations.slice(0, 5).map((c: any) => {
    const messages = Array.isArray(c.messages) ? c.messages : [];
    return {
      outcome: c.outcome || "unknown",
      phase: c.conversation_phase || "unknown",
      messageCount: messages.length,
      messages: messages.slice(0, 8).map((m: any) => ({ role: m.role || "unknown", content: (m.content || m.text || "").slice(0, 150) }))
    };
  });

  return `
═══ ANALYTICS (Last ${daysAgo} days) ═══
Visitors: ${totalVisitors} | Conversations: ${totalConversations} | Leads: ${totalLeads}
Conversion: ${conversionRate}% | Engagement: ${avgEngagement}/100
Leads: ${hotLeads}🔥 hot, ${warmLeads}🌡️ warm, ${coldLeads}❄️ cold

═══ TRAFFIC SOURCES ═══
${Object.entries(trafficSources).map(([s, c]) => `${s}: ${c}`).join(" | ")}

═══ CONVERSATION OUTCOMES ═══
${Object.entries(outcomeBreakdown).map(([o, c]) => `${o}: ${c}`).join(" | ")}

═══ TRANSCRIPT ANALYSIS ═══
Messages: ${transcriptAnalysis.totalMessages} | Avg/Conv: ${transcriptAnalysis.avgMessagesPerConversation}
Converted: ${transcriptAnalysis.convertedVsAbandoned.converted} | Abandoned: ${transcriptAnalysis.convertedVsAbandoned.abandoned}
Objections: ${transcriptAnalysis.objectionPatterns.join(", ") || "None detected"}
Drop-offs: ${Object.entries(transcriptAnalysis.dropOffPhases).map(([p, c]) => `${p}: ${c}`).join(", ")}

═══ CURRENT CHATBOT PROMPTS (editable) ═══
${prompts.map((p: any) => `[${p.prompt_key}] v${p.version}: ${p.prompt_value.slice(0, 80)}...`).join("\n")}

═══ SAMPLE TRANSCRIPTS ═══
${sampleTranscripts.map((t: SampleTranscript, i: number) => `#${i + 1} ${t.outcome} (${t.messageCount} msgs)\n${t.messages.map((m: TranscriptMessage) => `  ${m.role}: ${m.content}`).join("\n")}`).join("\n\n")}

═══ RECENT LEADS (manageable) ═══
${leads.slice(0, 10).map((l: any) => `• ${l.name || "?"} | ${l.email || "?"} | Score:${l.lead_score || "?"} | Status:${l.status || "new"} | Trade:${l.trade || "?"}`).join("\n")}
`;
}

function formatLeadDetails(lead: any) {
  if (!lead) return "Lead not found";
  return `## Lead Details: ${lead.name || "Unknown"}

| Field | Value |
|-------|-------|
| Email | ${lead.email || "N/A"} |
| Phone | ${lead.phone || "N/A"} |
| Business | ${lead.business_name || "N/A"} |
| Trade | ${lead.trade || "N/A"} |
| Team Size | ${lead.team_size || "N/A"} |
| Call Volume | ${lead.call_volume || "N/A"} |
| Timeline | ${lead.timeline || "N/A"} |
| Score | ${lead.lead_score || "N/A"} |
| Temperature | ${lead.lead_temperature || "N/A"} |
| Status | ${lead.status || "new"} |
| Interests | ${(lead.interests || []).join(", ") || "N/A"} |
| Notes | ${lead.notes || "None"} |
| Created | ${lead.created_at ? new Date(lead.created_at).toLocaleDateString() : "N/A"} |`;
}

function formatPriorityLeads(leads: any[]) {
  if (!leads.length) return "No priority leads found.";
  return `## Priority Leads\n\n` + leads.map((l: any, i: number) => 
    `${i + 1}. **${l.name || l.email || "Unknown"}** - Score: ${l.lead_score || "?"} | ${l.trade || "?"} | ${l.status || "new"}\n   📧 ${l.email || "?"} | 📱 ${l.phone || "?"}`
  ).join("\n\n");
}

function formatPromptImprovements(data: any) {
  let output = "## Prompt Improvement Suggestions\n\n";
  data.improvements.forEach((imp: any, i: number) => {
    output += `### ${i + 1}. ${imp.prompt_key || imp.area}\n`;
    output += `**Current:** ${imp.current_approach}\n\n`;
    output += `**Suggested:** ${imp.suggested_approach}\n\n`;
    output += `**Why:** ${imp.rationale}\n\n`;
    output += `**Impact:** ${imp.expected_impact}\n\n---\n\n`;
  });
  output += "\n**Say 'apply this change' to update the prompt in the chatbot.**";
  return output;
}

function formatObjectionAnalysis(analysis: any) {
  let output = `## Objection Analysis\n\nAnalyzed ${analysis.total_conversations_analyzed} conversations.\n\n`;
  analysis.objections.forEach((obj: any, i: number) => {
    output += `### ${i + 1}. "${obj.objection}"\n`;
    output += `- Frequency: ${obj.frequency}x\n`;
    output += `- Success Rate: ${obj.success_rate}%\n`;
    output += `- Current: ${obj.current_response}\n`;
    output += `- Suggested: ${obj.suggested_response}\n\n`;
  });
  return output;
}
