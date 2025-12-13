import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are the CEO Agent for ApexLocal360 - an AI-powered analytics and business intelligence assistant. You have access to real-time data about:

1. VISITOR ANALYTICS: Traffic sources, engagement patterns, device types, scroll depth, time on site
2. CONVERSATION DATA: Chatbot transcripts, drop-off points, objection patterns
3. LEAD INTELLIGENCE: Lead scores, conversion rates, pipeline value, follow-up effectiveness
4. SALES PERFORMANCE: What scripts work, which objections lose deals, optimal follow-up timing

Your role is to:
- Provide actionable business insights based on data
- Identify patterns in successful vs failed conversions
- Suggest optimizations for sales scripts and messaging
- Analyze traffic quality by source
- Recommend A/B tests based on data patterns
- Generate executive summaries on demand

Always provide specific, data-backed recommendations. Be concise but thorough.
Format responses with clear headers and bullet points where appropriate.`;

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
            enum: ["traffic_analysis", "conversion_optimization", "lead_quality", "sales_script", "objection_handling", "ab_test_recommendation", "executive_summary"],
            description: "Type of insight being generated"
          },
          title: { type: "string", description: "Brief title for the insight" },
          summary: { type: "string", description: "Main insight or finding" },
          data_points: {
            type: "array",
            items: { type: "string" },
            description: "Key data points supporting the insight"
          },
          recommendations: {
            type: "array",
            items: { type: "string" },
            description: "Specific actionable recommendations"
          },
          priority: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "Priority level of this insight"
          }
        },
        required: ["insight_type", "title", "summary", "recommendations", "priority"]
      }
    }
  }
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, timeRange = "7d" } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }
    
    // Create Supabase client for data access
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    // Calculate date range
    const now = new Date();
    const daysAgo = parseInt(timeRange) || 7;
    const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    
    // Fetch analytics data
    const [visitorsResult, conversationsResult, leadsResult, eventsResult] = await Promise.all([
      supabase.from("visitors").select("*").gte("created_at", startDate.toISOString()).order("created_at", { ascending: false }).limit(500),
      supabase.from("conversations").select("*").gte("created_at", startDate.toISOString()).order("created_at", { ascending: false }).limit(200),
      supabase.from("leads").select("*").gte("created_at", startDate.toISOString()).order("created_at", { ascending: false }).limit(200),
      supabase.from("analytics_events").select("*").gte("created_at", startDate.toISOString()).order("created_at", { ascending: false }).limit(1000),
    ]);
    
    const visitors = visitorsResult.data || [];
    const conversations = conversationsResult.data || [];
    const leads = leadsResult.data || [];
    const events = eventsResult.data || [];
    
    // Calculate key metrics
    const totalVisitors = visitors.length;
    const totalConversations = conversations.length;
    const totalLeads = leads.length;
    const conversionRate = totalVisitors > 0 ? ((totalLeads / totalVisitors) * 100).toFixed(2) : "0";
    
    // Traffic source breakdown
    const trafficSources: Record<string, number> = {};
    visitors.forEach(v => {
      const source = v.utm_source || "Direct";
      trafficSources[source] = (trafficSources[source] || 0) + 1;
    });
    
    // Lead score distribution
    const hotLeads = leads.filter(l => l.lead_score >= 75).length;
    const warmLeads = leads.filter(l => l.lead_score >= 50 && l.lead_score < 75).length;
    const coldLeads = leads.filter(l => l.lead_score < 50).length;
    
    // Conversation outcomes
    const outcomeBreakdown: Record<string, number> = {};
    conversations.forEach(c => {
      const outcome = c.outcome || "unknown";
      outcomeBreakdown[outcome] = (outcomeBreakdown[outcome] || 0) + 1;
    });
    
    // Average engagement score
    const avgEngagement = visitors.length > 0
      ? Math.round(visitors.reduce((sum, v) => sum + (v.engagement_score || 0), 0) / visitors.length)
      : 0;
    
    // Build context for AI
    const dataContext = `
ANALYTICS DATA (Last ${daysAgo} days):

TRAFFIC OVERVIEW:
- Total Visitors: ${totalVisitors}
- Total Conversations: ${totalConversations}  
- Total Leads: ${totalLeads}
- Visitor-to-Lead Rate: ${conversionRate}%
- Avg Engagement Score: ${avgEngagement}/100

TRAFFIC SOURCES:
${Object.entries(trafficSources).map(([source, count]) => `- ${source}: ${count} visitors`).join("\n")}

LEAD QUALITY:
- Hot Leads (75+): ${hotLeads}
- Warm Leads (50-74): ${warmLeads}
- Cold Leads (<50): ${coldLeads}

CONVERSATION OUTCOMES:
${Object.entries(outcomeBreakdown).map(([outcome, count]) => `- ${outcome}: ${count}`).join("\n")}

RECENT LEADS SAMPLE:
${leads.slice(0, 5).map(l => `- ${l.name || "Unknown"} | Score: ${l.lead_score || "N/A"} | Status: ${l.status || "new"} | Trade: ${l.trade || "N/A"}`).join("\n")}
`;

    console.log("CEO Agent query:", query);
    console.log("Data context:", dataContext);
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `${dataContext}\n\nUSER QUERY: ${query}` }
        ],
        tools: analysisTools,
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    console.log("CEO Agent AI response:", JSON.stringify(aiResponse).slice(0, 500));
    
    let result: any = {
      response: "",
      insights: [],
      metrics: {
        totalVisitors,
        totalConversations,
        totalLeads,
        conversionRate: parseFloat(conversionRate),
        avgEngagement,
        hotLeads,
        warmLeads,
        coldLeads,
        trafficSources,
        outcomeBreakdown
      }
    };
    
    const choice = aiResponse.choices?.[0];
    if (choice?.message?.tool_calls?.length > 0) {
      const toolCall = choice.message.tool_calls[0];
      if (toolCall.function.name === "generate_insight") {
        result.insights = [JSON.parse(toolCall.function.arguments)];
        result.response = result.insights[0].summary;
      }
    } else if (choice?.message?.content) {
      result.response = choice.message.content;
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("CEO Agent error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      response: "I'm having trouble accessing the analytics data right now. Please try again."
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
