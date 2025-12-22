// src/hooks/useAuth.ts
/**
 * PHASE 1 LOCK ✅
 * - [LOCKED] signIn/signUp/signOut are ALWAYS functions
 * - [LOCKED] Auth state initializes once and updates on Supabase events
 * - [LOCKED] Role checking:
 *    - Never blocks login
 *    - Never loops/spams
 *    - Caches results per session
 * - [TODO-P2] Fix PGRST203 at DB layer (duplicate has_role overloads)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "owner" | "user";

type AuthState = {
  userId: string | null;
  email: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  role: Role;
};

type Credentials = {
  email: string;
  password: string;
};

const DEFAULT_STATE: AuthState = {
  userId: null,
  email: null,
  isAuthenticated: false,
  isLoading: true,
  role: "user",
};

const DEFAULT_MOCK_STATE: AuthState = {
  ...DEFAULT_STATE,
  isLoading: false,
};

let mockAuthState: AuthState = DEFAULT_MOCK_STATE;
const mockAuthSubscribers = new Set<(state: AuthState) => void>();

const notifyMockAuth = () => {
  mockAuthSubscribers.forEach((listener) => listener(mockAuthState));
};

export function useAuth() {
  const [state, setState] = useState<AuthState>(DEFAULT_STATE);
  const isMockAuth =
    import.meta.env.VITE_MOCK_AUTH === "true" ||
    (typeof window !== "undefined" && window.localStorage.getItem("VITE_MOCK_AUTH") === "true");

  // Loop-killer: prevent repeated noisy logging + repeated RPC calls
  const roleCheckedForUserRef = useRef<string | null>(null);
  const hasRoleErrorLoggedRef = useRef(false);

  const hydrateFromSession = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true }));

    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) {
      setState({ ...DEFAULT_STATE, isLoading: false });
      return;
    }

    const user = data.session.user;
    setState((s) => ({
      ...s,
      userId: user.id,
      email: user.email ?? null,
      isAuthenticated: true,
      isLoading: false,
    }));
  }, []);

  // Non-blocking best-effort role check (loop-safe)
  const checkRole = useCallback(async (userId: string) => {
    if (roleCheckedForUserRef.current === userId) return;
    roleCheckedForUserRef.current = userId;

    try {
      // If your DB has has_role overload conflicts, this can error (PGRST203).
      // We do NOT block the app on it.
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });

      if (error) throw error;
      const isAdmin = Boolean(data);

      setState((s) => ({ ...s, role: isAdmin ? "admin" : "user" }));
    } catch (err: any) {
      if (!hasRoleErrorLoggedRef.current) {
        hasRoleErrorLoggedRef.current = true;
        console.warn("[useAuth] has_role error (non-fatal)", err);
      }
      // Default to user role without blocking
      setState((s) => ({ ...s, role: "user" }));
    }
  }, []);

  useEffect(() => {
    if (isMockAuth) {
      setState(mockAuthState);
      const listener = (nextState: AuthState) => setState(nextState);
      mockAuthSubscribers.add(listener);
      return () => {
        mockAuthSubscribers.delete(listener);
      };
    }

    let mounted = true;

    (async () => {
      if (!mounted) return;
      await hydrateFromSession();

      const session = (await supabase.auth.getSession()).data.session;
      const uid = session?.user?.id;
      if (uid) void checkRole(uid);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const uid = session?.user?.id ?? null;

      setState((s) => ({
        ...s,
        userId: uid,
        email: session?.user?.email ?? null,
        isAuthenticated: Boolean(uid),
        isLoading: false,
        role: "user",
      }));

      if (uid) {
        // reset loop-killer for new session/user
        roleCheckedForUserRef.current = null;
        hasRoleErrorLoggedRef.current = false;
        void checkRole(uid);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [hydrateFromSession, checkRole, isMockAuth]);

  const applyMockAuth = useCallback((email: string) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("mock-signed-out");
    }
    mockAuthState = {
      ...mockAuthState,
      userId: "mock-user",
      email,
      isAuthenticated: true,
      isLoading: false,
      role: "user",
    };
    notifyMockAuth();
    return { data: { user: { id: "mock-user", email } }, error: null };
  }, []);

  const signIn = useCallback(
    async ({ email, password }: Credentials) => {
      if (isMockAuth) {
        return applyMockAuth(email);
      }
      return supabase.auth.signInWithPassword({ email, password });
    },
    [applyMockAuth, isMockAuth]
  );

  const signUp = useCallback(
    async ({ email, password }: Credentials) => {
      if (isMockAuth) {
        return applyMockAuth(email);
      }
      return supabase.auth.signUp({ email, password });
    },
    [applyMockAuth, isMockAuth]
  );

  const signOut = useCallback(async () => {
    if (isMockAuth) {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("mock-signed-out", "true");
      }
      mockAuthState = DEFAULT_MOCK_STATE;
      notifyMockAuth();
      return { error: null };
    }
    return supabase.auth.signOut();
  }, [isMockAuth]);

  return useMemo(
    () => ({
      ...state,
      signIn,
      signUp,
      signOut,
    }),
    [state, signIn, signUp, signOut]
  );
}

export default useAuth;
