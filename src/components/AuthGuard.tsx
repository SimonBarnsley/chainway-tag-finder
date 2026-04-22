import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions, type PermissionKey } from "@/hooks/use-permissions";

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

  if (isLoading || (requirePermission && permLoading)) {
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
