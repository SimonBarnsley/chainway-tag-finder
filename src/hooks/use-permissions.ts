import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type PermissionKey =
  | "scanner.use"
  | "items.view"
  | "items.edit"
  | "locations.view"
  | "locations.edit"
  | "history.view"
  | "bulk_upload.use"
  | "readers.manage"
  | "dashboard.admin";

interface PermState {
  loading: boolean;
  permissions: Set<string>;
}

/**
 * Loads the current user's effective permissions from the role_permissions
 * table based on their highest role. Super admins always have all permissions.
 */
export function usePermissions() {
  const { role, isSuperAdmin, isLoading: authLoading } = useAuth();
  const [state, setState] = useState<PermState>({
    loading: true,
    permissions: new Set(),
  });

  useEffect(() => {
    if (authLoading) return;

    // Super admin bypasses the permission table entirely.
    if (isSuperAdmin) {
      setState({ loading: false, permissions: new Set(["*"]) });
      return;
    }

    // Map UI role to db role: 'super_admin' handled above.
    const dbRole = role === "admin" ? "admin" : role === "user" ? "user" : role;
    if (!dbRole) {
      setState({ loading: false, permissions: new Set() });
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("permission, enabled")
        .eq("role", dbRole as "admin" | "user" | "super_admin" | "supervisor");
      if (cancelled) return;
      if (error) {
        setState({ loading: false, permissions: new Set() });
        return;
      }
      const enabled = new Set(
        (data ?? []).filter((r) => r.enabled).map((r) => r.permission)
      );
      setState({ loading: false, permissions: enabled });
    })();

    return () => {
      cancelled = true;
    };
  }, [role, isSuperAdmin, authLoading]);

  const has = (perm: PermissionKey): boolean =>
    state.permissions.has("*") || state.permissions.has(perm);

  return { ...state, has };
}
