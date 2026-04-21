import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/$company/roles")({
  component: RolesPage,
  head: () => ({
    meta: [{ title: "Admin — Roles & Permissions" }],
  }),
});

type UiRole = "admin" | "supervisor" | "basic";
const UI_ROLES: UiRole[] = ["admin", "supervisor", "basic"];
const uiToDb = (r: UiRole): "admin" | "supervisor" | "user" =>
  r === "basic" ? "user" : r;

// Permission catalog — features that can be gated
const PERMISSIONS: { key: string; label: string; description: string }[] = [
  { key: "scanner.use", label: "Use Scanner", description: "Access the RFID scanner screen" },
  { key: "items.view", label: "View Items", description: "Browse the items catalog" },
  { key: "items.edit", label: "Edit Items", description: "Create, update, delete items" },
  { key: "locations.view", label: "View Locations", description: "View warehouse locations" },
  { key: "locations.edit", label: "Edit Locations", description: "Manage warehouse locations" },
  { key: "history.view", label: "View History", description: "View scan history" },
  { key: "bulk_upload.use", label: "Bulk Upload", description: "Upload bulk item data" },
  { key: "readers.manage", label: "Manage Readers", description: "Configure fixed RFID readers" },
  { key: "dashboard.admin", label: "Admin Dashboard", description: "Access the admin dashboard" },
];

interface RolePermRow {
  id: string;
  role: string;
  permission: string;
  enabled: boolean;
}

function RolesPage() {
  return (
    <AuthGuard adminOnly>
      <RolesContent />
    </AuthGuard>
  );
}

function RolesContent() {
  const { isAdmin } = useAuth();
  const canEdit = isAdmin;
  const [rows, setRows] = useState<RolePermRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchPermissions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("id, role, permission, enabled");
      if (error) throw error;
      setRows((data ?? []) as RolePermRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load permissions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, []);

  const lookup = useMemo(() => {
    const m = new Map<string, RolePermRow>();
    for (const r of rows) m.set(`${r.role}:${r.permission}`, r);
    return m;
  }, [rows]);

  const isEnabled = (role: UiRole, perm: string) => {
    const dbRole = uiToDb(role);
    return lookup.get(`${dbRole}:${perm}`)?.enabled ?? false;
  };

  const toggle = async (role: UiRole, perm: string) => {
    if (!canEdit) {
      toast.error("You don't have permission to edit");
      return;
    }
    const dbRole = uiToDb(role);
    const key = `${dbRole}:${perm}`;
    const existing = lookup.get(key);
    setSaving(key);
    try {
      if (existing) {
        const { error } = await supabase
          .from("role_permissions")
          .update({ enabled: !existing.enabled })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("role_permissions")
          .insert({ role: dbRole, permission: perm, enabled: true });
        if (error) throw error;
      }
      await fetchPermissions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="flex-1 px-4 py-4 space-y-4 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">Roles & Permissions</h1>
          <span className="text-xs text-muted-foreground ml-2">
            {canEdit ? "Click cells to toggle access" : "Read-only view"}
          </span>
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading...</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      Permission
                    </th>
                    {UI_ROLES.map((r) => (
                      <th
                        key={r}
                        className="px-4 py-3 font-medium text-center text-muted-foreground uppercase text-xs"
                      >
                        {r}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSIONS.map((p) => (
                    <tr key={p.key} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{p.label}</div>
                        <div className="text-xs text-muted-foreground">{p.description}</div>
                      </td>
                      {UI_ROLES.map((r) => {
                        const enabled = isEnabled(r, p.key);
                        const cellKey = `${uiToDb(r)}:${p.key}`;
                        const isSaving = saving === cellKey;
                        return (
                          <td key={r} className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => toggle(r, p.key)}
                              disabled={!canEdit || isSaving}
                              className={`inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                enabled ? "bg-primary" : "bg-muted"
                              } ${
                                canEdit
                                  ? "cursor-pointer hover:opacity-80"
                                  : "cursor-not-allowed opacity-60"
                              }`}
                              aria-label={`${enabled ? "Disable" : "Enable"} ${p.label} for ${r}`}
                            >
                              <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-background transition-transform ${
                                  enabled ? "translate-x-5" : "translate-x-0.5"
                                }`}
                              />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Note: ADMIN maps to the internal admin role, SUPERVISOR is a new mid-tier role, and
          BASIC maps to the standard user role. Super admins always have full access regardless
          of these settings.
        </p>
      </main>
    </div>
  );
}
