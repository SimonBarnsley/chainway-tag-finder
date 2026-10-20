import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions, type PermissionKey } from "@/hooks/use-permissions";
import { supabase } from "@/integrations/supabase/client";

interface AuthGuardProps {
  children: React.ReactNode;
  /** If true, only admins/super_admins can access */
  adminOnly?: boolean;
  /** If true, only super_admins can access */
  superAdminOnly?: boolean;
  /** Require a specific permission (checked against role_permissions) */
  requirePermission?: PermissionKey;
}

export function AuthGuard({
  children,
  adminOnly = false,
  superAdminOnly = false,
  requirePermission,
}: AuthGuardProps) {
  const { isAuthenticated, isAdmin, isSuperAdmin, isLoading } = useAuth();
  const { loading: permLoading, has } = usePermissions();
  const navigate = useNavigate();
  // Admin and super admin accounts must complete two-step sign-in (aal2).
  const [mfaOk, setMfaOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (!isAdmin) { setMfaOk(true); return; }
    let cancelled = false;
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (cancelled) return;
      const ok = data?.currentLevel === "aal2";
      setMfaOk(ok);
      if (!ok) navigate({ to: "/mfa" });
    });
    return () => { cancelled = true; };
  }, [isLoading, isAuthenticated, isAdmin, navigate]);

  if (isLoading || (requirePermission && permLoading) || (isAuthenticated && !mfaOk)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    navigate({ to: "/login" });
    return null;
  }

  if (superAdminOnly && !isSuperAdmin) {
    return <Denied message="You need super admin privileges to access this page." />;
  }

  if (adminOnly && !isAdmin) {
    return <Denied message="You need admin privileges to access this page." />;
  }

  if (requirePermission && !has(requirePermission)) {
    return (
      <Denied message="You don't have permission to access this page. Ask an admin to grant you access in Roles & Permissions." />
    );
  }

  return <>{children}</>;
}

function Denied({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
