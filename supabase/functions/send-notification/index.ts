import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { channel, message, webhookUrl, type = "slack" } = await req.json();

    if (!webhookUrl) {
      throw new Error("Webhook URL is required");
    }

    let payload: Record<string, unknown>;
    
    if (type === "slack") {
      // Slack message format
      const blocks: Record<string, unknown>[] = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: message.title || "📊 CEO Dashboard Alert",
            emoji: true
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: message.body || message.text || ""
          }
        }
      ];

      // Add metrics if provided
      if (message.metrics) {
        const metricsText = Object.entries(message.metrics)
          .map(([key, value]) => `*${key}:* ${value}`)
          .join("\n");
        
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: metricsText
          }
        });
      }

      // Add action button if provided
      if (message.actionUrl) {
        blocks.push({
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: message.actionLabel || "View Dashboard",
                emoji: true
              },
              url: message.actionUrl,
              style: "primary"
            }
          ]
        });
      }

      payload = {
        channel: channel || "#ceo-alerts",
        username: "CEO Dashboard",
        icon_emoji: ":chart_with_upwards_trend:",
        text: message.title || "CEO Dashboard Alert",
        blocks
      };
    } else {
      // Discord message format (default for non-slack)
      payload = {
        username: "CEO Dashboard",
        avatar_url: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
        embeds: [
          {
            title: message.title || "📊 CEO Dashboard Alert",
            description: message.body || message.text || "",
            color: message.color || 5793266,
            fields: message.metrics ? Object.entries(message.metrics).map(([name, value]) => ({
              name,
              value: String(value),
              inline: true
            })) : [],
            timestamp: new Date().toISOString(),
            footer: {
              text: "CEO Dashboard Notification"
            }
          }
        ]
      };
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`${type} webhook error:`, error);
      throw new Error(`Failed to send ${type} notification`);
    }

    console.log(`${type} notification sent successfully`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Notification error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
