import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, service_key, category, business_type, include_connected } = await req.json();
    
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    console.log(`[ServiceRegistry] Action: ${action}`);

    switch (action) {
      case "list": {
        // List all available services
        let query = supabase
          .from('service_registry')
          .select('*')
          .eq('is_active', true)
          .order('priority_order', { ascending: true });
        
        if (category) {
          query = query.eq('category', category);
        }
        
        const { data: services, error } = await query;
        if (error) throw error;
        
        // If include_connected, also fetch credential status
        const connectedStatus: Record<string, unknown> = {};
        if (include_connected) {
          const { data: credentials } = await supabase
            .from('service_credentials')
            .select('service_key, connection_status, last_health_check');
          
          credentials?.forEach((c: unknown) => {
            connectedStatus[c.service_key] = {
              connected: true,
              status: c.connection_status,
              last_check: c.last_health_check,
            };
          });
        }
        
        const enrichedServices = services?.map((s: unknown) => ({
          ...s,
          is_connected: !!connectedStatus[s.service_key],
          connection_status: connectedStatus[s.service_key]?.status || null,
          last_health_check: connectedStatus[s.service_key]?.last_check || null,
        }));
        
        return new Response(
          JSON.stringify({ success: true, services: enrichedServices }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      case "get": {
        // Get details for a specific service
        if (!service_key) {
          return new Response(
            JSON.stringify({ error: "Missing service_key" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const { data: service, error } = await supabase
          .from('service_registry')
          .select('*')
          .eq('service_key', service_key)
          .single();
        
        if (error || !service) {
          return new Response(
            JSON.stringify({ error: `Service ${service_key} not found` }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Get relationships
        const { data: relationships } = await supabase
          .from('service_relationships')
          .select('target_service, relationship_type, priority, reason')
          .eq('source_service', service_key)
          .order('priority', { ascending: false });
        
        // Get credential status
        const { data: credential } = await supabase
          .from('service_credentials')
          .select('connection_status, last_health_check, last_used_at')
          .eq('service_key', service_key)
          .single();
        
        return new Response(
          JSON.stringify({
            success: true,
            service: {
              ...service,
              is_connected: !!credential,
              connection_status: credential?.connection_status || null,
              last_health_check: credential?.last_health_check || null,
              last_used_at: credential?.last_used_at || null,
              relationships: relationships || [],
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      case "suggest": {
        // Get smart suggestions based on current connections and business type
        
        // Get current connected services
        const { data: credentials } = await supabase
          .from('service_credentials')
          .select('service_key');
        
        const connectedKeys = credentials?.map((c: unknown) => c.service_key) || [];
        
        // Get suggestions based on relationships
        let suggestions: unknown[] = [];
        
        if (connectedKeys.length > 0) {
          const { data: relationships } = await supabase
            .from('service_relationships')
            .select('source_service, target_service, relationship_type, priority, reason')
            .in('source_service', connectedKeys)
            .order('priority', { ascending: false });
          
          // Filter to only show unconnected services
          const recommendedKeys = new Set<string>();
          relationships?.forEach((r: unknown) => {
            if (!connectedKeys.includes(r.target_service)) {
              recommendedKeys.add(r.target_service);
              suggestions.push({
                service_key: r.target_service,
                source_service: r.source_service,
                relationship_type: r.relationship_type,
                priority: r.priority,
                reason: r.reason,
              });
            }
          });
        }
        
        // Also check business type templates
        if (business_type) {
          const { data: template } = await supabase
            .from('integration_templates')
            .select('*')
            .eq('template_key', business_type)
            .single();
          
          if (template) {
            const recommended = template.recommended_services || [];
            const required = template.required_services || [];
            
            recommended.forEach((svc: string) => {
              if (!connectedKeys.includes(svc) && !suggestions.find(s => s.service_key === svc)) {
                suggestions.push({
                  service_key: svc,
                  source_service: 'template',
                  relationship_type: required.includes(svc) ? 'required' : 'recommended',
                  priority: required.includes(svc) ? 100 : 80,
                  reason: `Part of ${template.display_name} setup`,
                });
              }
            });
          }
        }
        
        // Sort by priority and deduplicate
        suggestions = suggestions
          .sort((a, b) => b.priority - a.priority)
          .filter((s, i, arr) => arr.findIndex(x => x.service_key === s.service_key) === i)
          .slice(0, 10);
        
        // Enrich with service details
        const suggestionKeys = suggestions.map(s => s.service_key);
        const { data: services } = await supabase
          .from('service_registry')
          .select('service_key, display_name, category, icon_emoji, description')
          .in('service_key', suggestionKeys);
        
        const serviceMap = new Map(services?.map((s: unknown) => [s.service_key, s]) || []);
        
        const enrichedSuggestions = suggestions.map(s => ({
          ...s,
          display_name: (serviceMap.get(s.service_key) as unknown)?.display_name || s.service_key,
          category: (serviceMap.get(s.service_key) as unknown)?.category || 'unknown',
          icon_emoji: (serviceMap.get(s.service_key) as unknown)?.icon_emoji || '🔌',
          description: (serviceMap.get(s.service_key) as unknown)?.description || '',
        }));
        
        return new Response(
          JSON.stringify({
            success: true,
            connected_count: connectedKeys.length,
            connected_services: connectedKeys,
            suggestions: enrichedSuggestions,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      case "templates": {
        // Get business type templates
        const { data: templates, error } = await supabase
          .from('integration_templates')
          .select('*')
          .eq('is_active', true)
          .order('template_key');
        
        if (error) throw error;
        
        return new Response(
          JSON.stringify({ success: true, templates }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      case "categories": {
        // Get service categories with counts
        const { data: services } = await supabase
          .from('service_registry')
          .select('category')
          .eq('is_active', true);
        
        const categoryCounts: Record<string, number> = {};
        services?.forEach((s: unknown) => {
          categoryCounts[s.category] = (categoryCounts[s.category] || 0) + 1;
        });
        
        const categories = Object.entries(categoryCounts).map(([category, count]) => ({
          category,
          count,
          icon: getCategoryIcon(category),
        }));
        
        return new Response(
          JSON.stringify({ success: true, categories }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("[ServiceRegistry] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    marketing: '📢',
    finance: '💰',
    communication: '💬',
    video: '🎬',
    crm: '👥',
    analytics: '📊',
    storage: '☁️',
    ecommerce: '🛒',
    productivity: '📅',
  };
  return icons[category] || '🔌';
}
