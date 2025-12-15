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
    const { action, ...params } = await req.json();
    
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    let result: any;
    
    switch (action) {
      case "get_all_knowledge":
        result = await getAllKnowledge(supabase, params);
        break;
        
      case "search_knowledge":
        result = await searchKnowledge(supabase, params);
        break;
        
      case "get_for_ai":
        result = await getKnowledgeForAI(supabase, params);
        break;
        
      case "upsert_knowledge":
        result = await upsertKnowledge(supabase, params);
        break;
        
      case "delete_knowledge":
        result = await deleteKnowledge(supabase, params);
        break;
        
      case "get_profile":
        result = await getBusinessProfile(supabase);
        break;
        
      case "upsert_profile":
        result = await upsertBusinessProfile(supabase, params);
        break;
        
      case "get_categories":
        result = await getCategories(supabase);
        break;
        
      case "bulk_import":
        result = await bulkImportKnowledge(supabase, params);
        break;
        
      case "export_all":
        result = await exportAll(supabase);
        break;
        
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    
  } catch (error) {
    console.error("Knowledge base error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Get all knowledge entries with optional filtering
async function getAllKnowledge(supabase: any, params: { category?: string; search?: string }) {
  let query = supabase
    .from("business_knowledge")
    .select("*")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });
  
  if (params.category && params.category !== "all") {
    query = query.eq("category", params.category);
  }
  
  if (params.search) {
    query = query.or(`title.ilike.%${params.search}%,content.ilike.%${params.search}%`);
  }
  
  const { data, error } = await query;
  
  if (error) throw error;
  return { knowledge: data };
}

// Search knowledge by keywords
async function searchKnowledge(supabase: any, params: { query: string; limit?: number }) {
  const { data, error } = await supabase
    .from("business_knowledge")
    .select("*")
    .or(`title.ilike.%${params.query}%,content.ilike.%${params.query}%,keywords.cs.{${params.query}}`)
    .eq("is_ai_accessible", true)
    .order("priority", { ascending: true })
    .limit(params.limit || 10);
  
  if (error) throw error;
  return { results: data };
}

// Get knowledge formatted for AI context injection
async function getKnowledgeForAI(supabase: any, params: { category?: string; keywords?: string[] }) {
  let query = supabase
    .from("business_knowledge")
    .select("title, content, category, priority")
    .eq("is_ai_accessible", true)
    .order("priority", { ascending: true });
  
  if (params.category) {
    query = query.eq("category", params.category);
  }
  
  const { data: knowledge, error: knowledgeError } = await query;
  if (knowledgeError) throw knowledgeError;
  
  // Also get business profile
  const { data: profileData, error: profileError } = await supabase
    .from("business_profile")
    .select("*")
    .limit(1)
    .maybeSingle();
  
  if (profileError) throw profileError;
  
  // Format for AI consumption
  let aiContext = "\n═══ BUSINESS KNOWLEDGE BASE ═══\n";
  
  if (profileData) {
    aiContext += `\nBUSINESS PROFILE:\n`;
    if (profileData.business_name) aiContext += `- Name: ${profileData.business_name}\n`;
    if (profileData.phone) aiContext += `- Phone: ${profileData.phone}\n`;
    if (profileData.email) aiContext += `- Email: ${profileData.email}\n`;
    if (profileData.address) aiContext += `- Address: ${profileData.address}\n`;
    if (profileData.website) aiContext += `- Website: ${profileData.website}\n`;
    if (profileData.service_area) aiContext += `- Service Area: ${profileData.service_area}\n`;
    if (profileData.services?.length > 0) aiContext += `- Services: ${profileData.services.join(", ")}\n`;
    if (profileData.avg_job_value) aiContext += `- Avg Job Value: $${profileData.avg_job_value}\n`;
    if (profileData.business_hours) {
      const hours = profileData.business_hours;
      aiContext += `- Business Hours: ${hours.start || "08:00"}-${hours.end || "18:00"} (${hours.days?.join(", ") || "Mon-Fri"})\n`;
    }
  }
  
  if (knowledge && knowledge.length > 0) {
    // Group by category
    const byCategory: Record<string, any[]> = {};
    knowledge.forEach((item: any) => {
      if (!byCategory[item.category]) byCategory[item.category] = [];
      byCategory[item.category].push(item);
    });
    
    for (const [category, items] of Object.entries(byCategory)) {
      aiContext += `\n${category.toUpperCase()}:\n`;
      items.forEach((item: any) => {
        aiContext += `• ${item.title}: ${item.content}\n`;
      });
    }
  }
  
  aiContext += "\n═══════════════════════════════\n";
  
  return { 
    context: aiContext, 
    profile: profileData,
    knowledgeCount: knowledge?.length || 0 
  };
}

// Create or update knowledge entry
async function upsertKnowledge(supabase: any, params: {
  id?: string;
  title: string;
  content: string;
  category: string;
  keywords?: string[];
  is_ai_accessible?: boolean;
  priority?: number;
}) {
  const data: any = {
    title: params.title,
    content: params.content,
    category: params.category,
    keywords: params.keywords || [],
    is_ai_accessible: params.is_ai_accessible ?? true,
    priority: params.priority || 5,
  };
  
  if (params.id) {
    data.id = params.id;
    data.updated_at = new Date().toISOString();
  }
  
  const { data: result, error } = await supabase
    .from("business_knowledge")
    .upsert(data)
    .select()
    .single();
  
  if (error) throw error;
  return { knowledge: result };
}

// Delete knowledge entry
async function deleteKnowledge(supabase: any, params: { id: string }) {
  const { error } = await supabase
    .from("business_knowledge")
    .delete()
    .eq("id", params.id);
  
  if (error) throw error;
  return { success: true };
}

// Get business profile
async function getBusinessProfile(supabase: any) {
  const { data, error } = await supabase
    .from("business_profile")
    .select("*")
    .limit(1)
    .maybeSingle();
  
  if (error) throw error;
  return { profile: data };
}

// Create or update business profile
async function upsertBusinessProfile(supabase: any, params: {
  id?: string;
  business_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
  service_area?: string;
  services?: string[];
  avg_job_value?: number;
  monthly_call_volume?: number;
  business_hours?: any;
  timezone?: string;
  ai_preferences?: any;
  notification_settings?: any;
}) {
  // First check if profile exists
  const { data: existing } = await supabase
    .from("business_profile")
    .select("id")
    .limit(1)
    .maybeSingle();
  
  const data: any = {
    ...params,
    updated_at: new Date().toISOString(),
  };
  
  if (existing?.id) {
    data.id = existing.id;
  }
  
  const { data: result, error } = await supabase
    .from("business_profile")
    .upsert(data)
    .select()
    .single();
  
  if (error) throw error;
  return { profile: result };
}

// Get unique categories
async function getCategories(supabase: any) {
  const { data, error } = await supabase
    .from("business_knowledge")
    .select("category");
  
  if (error) throw error;
  
  const categories = [...new Set(data?.map((d: any) => d.category) || [])];
  return { categories };
}

// Bulk import knowledge entries
async function bulkImportKnowledge(supabase: any, params: { entries: any[] }) {
  const { data, error } = await supabase
    .from("business_knowledge")
    .insert(params.entries.map((entry: any) => ({
      title: entry.title,
      content: entry.content,
      category: entry.category || "general",
      keywords: entry.keywords || [],
      is_ai_accessible: entry.is_ai_accessible ?? true,
      priority: entry.priority || 5,
    })))
    .select();
  
  if (error) throw error;
  return { imported: data?.length || 0, entries: data };
}

// Export all data
async function exportAll(supabase: any) {
  const [knowledgeResult, profileResult] = await Promise.all([
    supabase.from("business_knowledge").select("*"),
    supabase.from("business_profile").select("*").limit(1).maybeSingle(),
  ]);
  
  if (knowledgeResult.error) throw knowledgeResult.error;
  
  return {
    knowledge: knowledgeResult.data,
    profile: profileResult.data,
    exportedAt: new Date().toISOString(),
  };
}
