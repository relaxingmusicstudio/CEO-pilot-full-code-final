import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { recipientEmail, generateOnly } = await req.json();

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Fetch data
    const [visitorsRes, leadsRes, clientsRes, conversationsRes] = await Promise.all([
      supabase.from("visitors").select("*").gte("created_at", weekAgo.toISOString()),
      supabase.from("leads").select("*").gte("created_at", weekAgo.toISOString()),
      supabase.from("clients").select("*"),
      supabase.from("conversations").select("*").gte("created_at", weekAgo.toISOString()),
    ]);

    const visitors = visitorsRes.data || [];
    const leads = leadsRes.data || [];
    const clients = clientsRes.data || [];
    const conversations = conversationsRes.data || [];

    // Calculate metrics
    const todayVisitors = visitors.filter(v => new Date(v.created_at || "") >= yesterday).length;
    const todayLeads = leads.filter(l => new Date(l.created_at || "") >= yesterday).length;
    const weekLeads = leads.length;
    const hotLeads = leads.filter(l => l.lead_temperature === "hot" || (l.lead_score && l.lead_score >= 70)).length;
    const totalRevenue = leads.reduce((sum, l) => sum + (l.revenue_value || 0), 0);
    const todayRevenue = leads.filter(l => new Date(l.created_at || "") >= yesterday)
      .reduce((sum, l) => sum + (l.revenue_value || 0), 0);
    
    const activeClients = clients.filter(c => c.status === "active").length;
    const totalMRR = clients.filter(c => c.status === "active").reduce((sum, c) => sum + (c.mrr || 0), 0);
    
    const conversionsThisWeek = leads.filter(l => l.status === "converted" || l.status === "won").length;
    const conversionRate = weekLeads > 0 ? ((conversionsThisWeek / weekLeads) * 100).toFixed(1) : "0";

    // Identify anomalies
    const anomalies: string[] = [];
    const avgDailyLeads = weekLeads / 7;
    if (todayLeads > avgDailyLeads * 1.5) {
      anomalies.push(`🚀 Lead spike: ${todayLeads} leads today (${((todayLeads / avgDailyLeads - 1) * 100).toFixed(0)}% above average)`);
    }
    if (todayLeads < avgDailyLeads * 0.5 && avgDailyLeads > 1) {
      anomalies.push(`⚠️ Lead drop: Only ${todayLeads} leads today (${((1 - todayLeads / avgDailyLeads) * 100).toFixed(0)}% below average)`);
    }

    // At-risk clients
    const atRiskClients = clients.filter(c => (c.health_score || 100) < 50 && c.status === "active");

    // Generate AI summary
    let aiSummary = "";
    if (lovableApiKey) {
      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: "You are a CEO briefing assistant. Write a concise 2-3 sentence executive summary of the business metrics provided. Focus on what's most important for a CEO to know today. Be direct and actionable."
              },
              {
                role: "user",
                content: `Yesterday's metrics:
- Visitors: ${todayVisitors}
- New Leads: ${todayLeads}
- Revenue: $${todayRevenue.toLocaleString()}
- Hot Leads: ${hotLeads}
- Conversion Rate: ${conversionRate}%
- Total MRR: $${totalMRR.toLocaleString()}
- Active Clients: ${activeClients}
- At-Risk Clients: ${atRiskClients.length}
${anomalies.length > 0 ? `Anomalies: ${anomalies.join(", ")}` : ""}`
              }
            ],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          aiSummary = aiData.choices?.[0]?.message?.content || "";
        }
      } catch (e) {
        console.error("AI summary error:", e);
      }
    }

    const briefingData: {
      date: string;
      summary: string;
      metrics: Record<string, unknown>;
      anomalies: string[];
      atRiskClients: Array<{ name: string; healthScore: number | null; mrr: number }>;
      topLeads: Array<{ name: string; score: number | null; temperature: string | null; value: number | null }>;
      patterns?: Array<unknown>;
      proactiveSuggestions?: Array<{ type: string; message: string; confidence: number | null }>;
    } = {
      date: today.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
      summary: aiSummary,
      metrics: {
        todayVisitors,
        todayLeads,
        todayRevenue,
        weekLeads,
        hotLeads,
        conversionRate,
        totalMRR,
        activeClients,
      },
      anomalies,
      atRiskClients: atRiskClients.map(c => ({
        name: c.name,
        healthScore: c.health_score,
        mrr: c.mrr,
      })),
      topLeads: leads
        .filter(l => l.lead_score && l.lead_score >= 60)
        .sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0))
        .slice(0, 5)
        .map(l => ({
          name: l.name || l.business_name || "Unknown",
          score: l.lead_score,
          temperature: l.lead_temperature,
          value: l.revenue_value,
        })),
    };

    // Run pattern detector to refresh user patterns
    try {
      console.log("[CEO Briefing] Running pattern detector...");
      const patternResponse = await fetch(`${supabaseUrl}/functions/v1/pattern-detector`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'analyze', daysBack: 30 }),
      });
      
      if (patternResponse.ok) {
        const patternData = await patternResponse.json();
        console.log(`[CEO Briefing] Pattern detector found ${patternData.patternsCount || 0} patterns`);
        briefingData.patterns = patternData.patterns || [];
      }
    } catch (patternError) {
      console.error("[CEO Briefing] Pattern detector error:", patternError);
    }

    // Fetch active user patterns for proactive suggestions
    try {
      const { data: activePatterns } = await supabase
        .from('user_patterns')
        .select('*')
        .eq('is_active', true)
        .gte('confidence_score', 0.5)
        .order('confidence_score', { ascending: false })
        .limit(5);

      if (activePatterns && activePatterns.length > 0) {
        briefingData.proactiveSuggestions = activePatterns.map(p => ({
          type: p.trigger_type,
          message: String((p.action_payload as Record<string, unknown>)?.message || 'Pattern detected'),
          confidence: p.confidence_score,
        }));
      }
    } catch (patternsError) {
      console.error("[CEO Briefing] Error fetching patterns:", patternsError);
    }

    if (generateOnly) {
      return new Response(JSON.stringify(briefingData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send email if RESEND_API_KEY is configured
    if (resendApiKey && recipientEmail) {
      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; }
    .metric-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 20px 0; }
    .metric { background: #f8fafc; padding: 16px; border-radius: 8px; text-align: center; }
    .metric-value { font-size: 24px; font-weight: 700; color: #1e293b; }
    .metric-label { font-size: 12px; color: #64748b; text-transform: uppercase; }
    .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 12px 0; border-radius: 4px; }
    .risk { background: #fee2e2; border-left: 4px solid #ef4444; padding: 12px; margin: 12px 0; border-radius: 4px; }
    .summary { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin: 20px 0; border-radius: 8px; }
    .lead-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0;">☀️ Good Morning, CEO</h1>
    <p style="margin: 8px 0 0; opacity: 0.9;">${briefingData.date}</p>
  </div>

  ${aiSummary ? `<div class="summary"><strong>AI Summary:</strong> ${aiSummary}</div>` : ""}

  <div class="metric-grid">
    <div class="metric">
      <div class="metric-value">${todayLeads}</div>
      <div class="metric-label">New Leads</div>
    </div>
    <div class="metric">
      <div class="metric-value">$${todayRevenue.toLocaleString()}</div>
      <div class="metric-label">Revenue</div>
    </div>
    <div class="metric">
      <div class="metric-value">${hotLeads}</div>
      <div class="metric-label">Hot Leads</div>
    </div>
    <div class="metric">
      <div class="metric-value">${conversionRate}%</div>
      <div class="metric-label">Conversion</div>
    </div>
    <div class="metric">
      <div class="metric-value">$${totalMRR.toLocaleString()}</div>
      <div class="metric-label">Total MRR</div>
    </div>
    <div class="metric">
      <div class="metric-value">${activeClients}</div>
      <div class="metric-label">Active Clients</div>
    </div>
  </div>

  ${anomalies.length > 0 ? `
    <h3>📊 Anomalies Detected</h3>
    ${anomalies.map(a => `<div class="alert">${a}</div>`).join("")}
  ` : ""}

  ${atRiskClients.length > 0 ? `
    <h3>⚠️ At-Risk Clients (${atRiskClients.length})</h3>
    ${atRiskClients.slice(0, 3).map(c => `
      <div class="risk">
        <strong>${c.name}</strong> - Health Score: ${c.health_score || "N/A"} | MRR: $${(c.mrr || 0).toLocaleString()}
      </div>
    `).join("")}
  ` : ""}

  ${briefingData.topLeads.length > 0 ? `
    <h3>🔥 Top Leads to Close</h3>
    ${briefingData.topLeads.map(l => `
      <div class="lead-row">
        <span>${l.name}</span>
        <span>Score: ${l.score} | $${(l.value || 0).toLocaleString()}</span>
      </div>
    `).join("")}
  ` : ""}

  <p style="color: #64748b; font-size: 12px; margin-top: 30px; text-align: center;">
    Sent by your CEO Dashboard • <a href="#">View Full Dashboard</a>
  </p>
</body>
</html>`;

      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "CEO Dashboard <onboarding@resend.dev>",
          to: [recipientEmail],
          subject: `☀️ Daily CEO Briefing - ${briefingData.date}`,
          html: emailHtml,
        }),
      });

      if (!emailResponse.ok) {
        const err = await emailResponse.text();
        console.error("Email send error:", err);
        throw new Error("Failed to send email");
      }

      console.log("Daily briefing email sent to:", recipientEmail);
    }

    return new Response(JSON.stringify({ success: true, briefing: briefingData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("CEO briefing error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
