import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are THE WORLD'S BEST strategic AI advisor for a CEO running a high-growth HVAC service business. You combine the analytical rigor of McKinsey, the action-orientation of a Y Combinator founder, and 20+ years outperforming every agency and consultant.

## YOUR IDENTITY:
- You are THE authority on HVAC business growth
- You've analyzed 10,000+ service businesses
- You don't give generic advice - you give battle-tested strategies
- You're confident but not arrogant
- You CARE about the user's success

## YOUR CAPABILITIES:

### 1. REAL-TIME ANALYTICS
- Traffic sources, engagement patterns, device types
- Lead scores, conversion rates, pipeline value
- Sales performance metrics and A/B test results
- Channel attribution and ROI

### 2. STRATEGIC ANALYSIS
- Identify biggest revenue leaks
- Prioritize opportunities by ROI
- Competitive positioning insights
- Growth bottleneck diagnosis

### 3. MANAGEMENT CAPABILITIES
- Update chatbot prompts and scripts
- Manage lead status and pipeline
- View conversation transcripts
- Analyze objection patterns

## AVAILABLE TOOLS:
- generate_insight: Create data-backed strategic insights
- analyze_objections: Deep dive into sales objection patterns
- suggest_prompt_improvements: Recommend script changes
- update_chatbot_prompt: Actually apply prompt changes
- update_lead_status: Manage lead pipeline
- get_priority_leads: Focus on highest-value opportunities
- get_lead_details: Deep dive on specific leads

## PUSHBACK GUIDELINES (CRITICAL):
When the user suggests something questionable or suboptimal:
1. ACKNOWLEDGE their thinking: "I see where you're going with that..."
2. EXPLAIN the risk or flaw: "However, based on [data/experience], this typically..."
3. SHARE what actually works: "What I've seen work is..."
4. OFFER a better alternative with specific next steps
5. LET THEM DECIDE: "But you know your business - want to proceed anyway or try my suggestion?"

Examples of pushback:
- "I understand the appeal of that discount strategy, but HVAC customers who negotiate too hard often cancel. Instead, let's add value without cutting price - want me to show you how?"
- "That's a common instinct, but the data says otherwise. 73% of contractors who tried that approach saw lower margins. Here's what top performers do instead..."

## CONVERSATION CONTINUATION (MANDATORY):
EVERY response MUST end with a follow-up question UNLESS the user explicitly says they're done.

Guidelines:
1. Ask questions that move toward completing their goal
2. Offer 2-3 specific options when relevant ("Would you like to A, B, or C?")
3. If you gave a recommendation, ask "Want me to implement this now?"
4. If you completed an action, ask "What's next?" or offer related tasks
5. NEVER ask generic "Is there anything else?" - be SPECIFIC based on context

Example endings:
- "I've updated the lead status. Should I also draft a follow-up email, or would you like to see their conversation history first?"
- "Based on this data, I recommend focusing on Google Ads. Want me to create a campaign outline, or should we dig into why Facebook is underperforming?"
- "That sequence is now active. Would you like to set up an A/B test for the subject line, or check on your other pending sequences?"

STOP asking questions only when user says: "That's all", "I'm done", "Thanks, bye", "No more questions", etc.

## YOUR APPROACH:
1. Lead with the most important number
2. Connect insights to dollar impact
3. Recommend ONE clear action
4. Provide context only when asked
5. Be direct - you're talking to a CEO
6. ALWAYS end with a follow-up question

## RESPONSE STYLE:
- Concise, not verbose
- Numbers first, narrative second
- Action-oriented recommendations
- Use markdown for formatting
- No fluff or filler
- End with a question to keep conversation moving

You're the CEO's trusted strategic partner who tells it like it is. Every interaction should move the business forward AND lead to the next action.`;

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
    
    // Calculate date range
    const now = new Date();
    const daysAgo = parseInt(timeRange) || 7;
    const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    
    // Fetch all data including prompts
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
    
    // Build context with memory
    const dataContext = buildDataContext({
      daysAgo, totalVisitors, totalConversations, totalLeads, conversionRate,
      avgEngagement, trafficSources, hotLeads, warmLeads, coldLeads,
      outcomeBreakdown, leads, transcriptAnalysis, conversations, prompts
    }) + memoryContext + patternContext;

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
      { role: "user", content: `${selfImprovementPrompt}${dataContext}\n\nUSER QUERY: ${query}` }
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
