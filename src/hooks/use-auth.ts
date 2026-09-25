import { useState, useEffect, useCallback } from "react";
import { useParams } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "user" | "super_admin" | "supervisor";

interface AuthState {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  companySlug: string | null;
  companyName: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    role: null,
    companySlug: null,
    companyName: null,
    isLoading: true,
    isAuthenticated: false,
    isAdmin: false,
    isSuperAdmin: false,
  });

  const fetchRole = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles = (data ?? []).map(r => r.role as AppRole);
    if (roles.includes("super_admin")) return "super_admin" as AppRole;
    if (roles.includes("admin")) return "admin" as AppRole;
    if (roles.includes("supervisor")) return "supervisor" as AppRole;
    return "user" as AppRole;
  }, []);

  const fetchCompanySlug = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("company_slug, company_name")
      .eq("user_id", userId)
      .single();
    return {
      companySlug: data?.company_slug ?? null,
      companyName: data?.company_name ?? null,
    };
  }, []);

  const loadUserData = useCallback(async (session: Session) => {
    const [role, profile] = await Promise.all([
      fetchRole(session.user.id),
      fetchCompanySlug(session.user.id),
    ]);
    setState({
      user: session.user,
      session,
      role,
      companySlug: profile.companySlug,
      companyName: profile.companyName,
      isLoading: false,
      isAuthenticated: true,
      isAdmin: role === "admin" || role === "super_admin",
      isSuperAdmin: role === "super_admin",
    });
  }, [fetchRole, fetchCompanySlug]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setTimeout(() => loadUserData(session), 0);
        } else {
          setState({
            user: null,
            session: null,
            role: null,
            companySlug: null,
            companyName: null,
            isLoading: false,
            isAuthenticated: false,
            isAdmin: false,
            isSuperAdmin: false,
          });
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await loadUserData(session);
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    });

    return () => subscription.unsubscribe();
  }, [loadUserData]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName?: string, companyName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName, company_name: companyName },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // Super admins act on whichever company is open in the address bar,
  // so they can view and change any company's data.
  const params = useParams({ strict: false }) as { company?: string };
  const homeCompanySlug = state.companySlug;
  const companySlug =
    state.isSuperAdmin && params.company && params.company !== "default"
      ? params.company
      : state.companySlug;

  return { ...state, companySlug, homeCompanySlug, signIn, signUp, signOut };
}
