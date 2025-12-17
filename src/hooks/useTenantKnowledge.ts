import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";

export interface TenantKnowledge {
  id: string;
  tenant_id: string;
  category: string;
  title: string;
  content: string;
  source: string;
  priority: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export const useTenantKnowledge = () => {
  const { tenant } = useTenant();
  const [isLoading, setIsLoading] = useState(false);
  const [knowledge, setKnowledge] = useState<TenantKnowledge[]>([]);

  // Fetch all knowledge for current tenant
  const fetchKnowledge = useCallback(async (category?: string) => {
    if (!tenant?.id) return [];

    setIsLoading(true);
    try {
      let query = supabase
        .from("tenant_knowledge")
        .select("*")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true)
        .order("priority", { ascending: true });

      if (category) {
        query = query.eq("category", category);
      }

      const { data, error } = await query;

      if (error) throw error;
      const typedData = (data as unknown as TenantKnowledge[]) || [];
      setKnowledge(typedData);
      return typedData;
    } catch (error) {
      console.error("Error fetching tenant knowledge:", error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [tenant?.id]);

  // Add new knowledge from CEO conversation
  const addKnowledge = useCallback(async (
    category: string,
    title: string,
    content: string,
    metadata?: Record<string, unknown>
  ) => {
    if (!tenant?.id) return null;

    try {
      const { data, error } = await supabase
        .from("tenant_knowledge")
        .upsert({
          tenant_id: tenant.id,
          category,
          title,
          content,
          source: "ceo_conversation",
          metadata: (metadata || {}) as Record<string, never>,
        })
        .select()
        .single();

      if (error) throw error;
      return data as unknown as TenantKnowledge;
    } catch (error) {
      console.error("Error adding tenant knowledge:", error);
      return null;
    }
  }, [tenant?.id]);

  // Update existing knowledge
  const updateKnowledge = useCallback(async (
    id: string,
    updates: Partial<Pick<TenantKnowledge, "content" | "priority" | "is_active">> & { metadata?: Record<string, never> }
  ) => {
    try {
      const updateData = { 
        ...updates, 
        updated_at: new Date().toISOString() 
      };

      const { data, error } = await supabase
        .from("tenant_knowledge")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as TenantKnowledge;
    } catch (error) {
      console.error("Error updating tenant knowledge:", error);
      return null;
    }
  }, []);

  // Get knowledge for CEO context
  const getKnowledgeContext = useCallback(async () => {
    if (!tenant?.id) return "";

    const allKnowledge = await fetchKnowledge();
    
    if (!allKnowledge.length) {
      return "No business knowledge has been gathered yet. Please ask the user about their business.";
    }

    // Format knowledge into a context string for CEO
    const contextParts = allKnowledge.map(k => 
      `[${k.category.toUpperCase()}] ${k.title}: ${k.content}`
    );

    return contextParts.join("\n\n");
  }, [tenant?.id, fetchKnowledge]);

  // Merge user responses with template knowledge
  const mergeWithUserResponse = useCallback(async (
    category: string,
    title: string,
    userResponse: string,
    existingContent?: string
  ) => {
    const mergedContent = existingContent
      ? `${existingContent}\n\nUser Update: ${userResponse}`
      : userResponse;

    return addKnowledge(category, title, mergedContent, {
      merged_at: new Date().toISOString(),
      source_type: existingContent ? "merged" : "user_provided",
    } as Record<string, unknown>);
  }, [addKnowledge]);

  return {
    knowledge,
    isLoading,
    fetchKnowledge,
    addKnowledge,
    updateKnowledge,
    getKnowledgeContext,
    mergeWithUserResponse,
  };
};
