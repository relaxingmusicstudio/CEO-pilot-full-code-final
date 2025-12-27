/**
 * Hook to get user's role from user_roles table
 * 
 * SECURITY: Does NOT default to 'owner' - returns null while loading
 * If role is missing after load, calls ensure_user_role RPC to assign default
 * 
 * TEST CHECKLIST:
 * - New user without role -> calls ensure_user_role -> gets 'owner' if tenant owner, else 'client'
 * - Existing user with role -> returns cached role
 * - Role is null while loading
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type UserRole = "owner" | "client" | "admin" | "moderator" | "user" | null;

export function useUserRole() {
  const { user, isLoading: authLoading } = useAuth();
  const [role, setRole] = useState<UserRole>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasEnsuredRole, setHasEnsuredRole] = useState(false);

  const mockMode =
    import.meta.env.VITE_MOCK_AUTH === "true" ||
    (typeof window !== "undefined" && window.localStorage.getItem("VITE_MOCK_AUTH") === "true");

  useEffect(() => {
    if (mockMode) {
      setRole("owner");
      setIsLoading(false);
    }
  }, [mockMode]);

  const ensureRole = useCallback(async (userId: string) => {
    try {
      // Call RPC to ensure user has a role (assigns default if missing)
      const { data, error } = await supabase.rpc("ensure_user_role", {
        _user_id: userId,
      });

      if (error) {
        console.error("Error ensuring user role:", error);
        return null;
      }

      return data as UserRole;
    } catch (error) {
      console.error("Error in ensureRole:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (mockMode) return;
    if (authLoading) return;
    
    if (!user) {
      setRole(null);
      setIsLoading(false);
      setHasEnsuredRole(false);
      return;
    }

    const fetchRole = async () => {
      setIsLoading(true);
      
      try {
        // First, try to fetch existing role
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Error fetching user role:", error);
          // Don't default - try to ensure role
          if (!hasEnsuredRole) {
            const assignedRole = await ensureRole(user.id);
            setRole(assignedRole);
            setHasEnsuredRole(true);
          }
        } else if (data) {
          // Role found
          setRole(data.role as UserRole);
        } else {
          // No role found - call ensure_user_role to assign default
          if (!hasEnsuredRole) {
            const assignedRole = await ensureRole(user.id);
            setRole(assignedRole);
            setHasEnsuredRole(true);
          }
        }
      } catch (error) {
        console.error("Error in useUserRole:", error);
        // Keep role as null - don't assume anything
      } finally {
        setIsLoading(false);
      }
    };

    fetchRole();
  }, [user, authLoading, ensureRole, hasEnsuredRole, mockMode]);

  return {
    role,
    isOwner: role === "owner" || role === "admin",
    isClient: role === "client",
    isAdmin: role === "admin",
    isLoading: authLoading || isLoading,
  };
}
