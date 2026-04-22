import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users as UsersIcon, Search, Trash2, MailCheck, Mail, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  listPendingUsers,
  approveUserSignup,
  resendConfirmationEmail,
  type PendingUser,
} from "@/lib/admin-users.functions";

export const Route = createFileRoute("/$company/users")({
  component: UsersPage,
  head: () => ({
    meta: [{ title: "Admin — Users" }],
  }),
});

type UiRole = "admin" | "supervisor" | "basic";

interface UserRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role_id: string | null;
  role: string | null; // raw db role
}

const dbToUi = (r: string | null): UiRole => {
  if (r === "admin" || r === "super_admin") return "admin";
  if (r === "supervisor") return "supervisor";
  return "basic";
};

const uiToDb = (r: UiRole): "admin" | "supervisor" | "user" => {
  if (r === "admin") return "admin";
  if (r === "supervisor") return "supervisor";
  return "user";
};

function UsersPage() {
  return (
    <AuthGuard adminOnly>
      <UsersContent />
    </AuthGuard>
  );
}

function UsersContent() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingBusy, setPendingBusy] = useState<string | null>(null);

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Not authenticated");
    return { Authorization: `Bearer ${token}` };
  };

  const fetchPending = async () => {
    setPendingLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await listPendingUsers({ headers });
      if (!res?.ok) {
        toast.error(res?.error || "Failed to load pending users");
        setPending([]);
        return;
      }
      setPending(Array.isArray(res.users) ? res.users : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load pending users");
      setPending([]);
    } finally {
      setPendingLoading(false);
    }
  };

  const handleApprove = async (u: PendingUser) => {
    setPendingBusy(u.id);
    try {
      const headers = await getAuthHeaders();
      await approveUserSignup({ data: { userId: u.id }, headers });
      toast.success(`Approved ${u.email ?? u.id}`);
      await Promise.all([fetchPending(), fetchUsers()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve user");
    } finally {
      setPendingBusy(null);
    }
  };

  const handleResend = async (u: PendingUser) => {
    if (!u.email) return;
    setPendingBusy(u.id);
    try {
      const headers = await getAuthHeaders();
      await resendConfirmationEmail({ data: { email: u.email }, headers });
      toast.success(`Sent confirmation email to ${u.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to resend email");
    } finally {
      setPendingBusy(null);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, email, display_name");
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("id, user_id, role");
      if (rErr) throw rErr;

      const roleMap = new Map<string, { id: string; role: string }>();
      for (const r of roles ?? []) {
        // Prefer highest role: super_admin > admin > supervisor > user
        const rank = (x: string) =>
          x === "super_admin" ? 4 : x === "admin" ? 3 : x === "supervisor" ? 2 : 1;
        const existing = roleMap.get(r.user_id);
        if (!existing || rank(r.role) > rank(existing.role)) {
          roleMap.set(r.user_id, { id: r.id, role: r.role });
        }
      }

      const rows: UserRow[] = (profiles ?? []).map((p) => {
        const r = roleMap.get(p.user_id);
        return {
          user_id: p.user_id,
          email: p.email,
          display_name: p.display_name,
          role_id: r?.id ?? null,
          role: r?.role ?? null,
        };
      });
      setUsers(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchPending();
  }, []);

  const handleRoleChange = async (user: UserRow, newUi: UiRole) => {
    if (user.role === "super_admin") {
      toast.error("Cannot change a super admin's role");
      return;
    }
    setUpdating(user.user_id);
    try {
      const newDb = uiToDb(newUi);
      // Remove all non-super_admin roles for the user, then insert the new one
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", user.user_id)
        .neq("role", "super_admin");

      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: user.user_id, role: newDb });
      if (error) throw error;
      toast.success("Role updated");
      await fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setUpdating(null);
    }
  };

  const handleRemove = async (user: UserRow) => {
    if (!user.role_id || user.role === "super_admin") return;
    try {
      const { error } = await supabase.from("user_roles").delete().eq("id", user.role_id);
      if (error) throw error;
      toast.success("Role removed");
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove role");
    }
  };

  const filtered = users.filter(
    (u) =>
      !search ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="flex-1 px-4 py-4 space-y-4 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <UsersIcon className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">Users</h1>
          <span className="text-xs text-muted-foreground ml-2">
            Allocate roles to signed-up users
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Pending email confirmations */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Clock className="h-4 w-4 text-warning" />
            <h2 className="text-sm font-semibold text-foreground">
              Pending email confirmation
            </h2>
            <span className="text-xs text-muted-foreground">
              Approve users who didn't receive the verification email
            </span>
          </div>
          {pendingLoading ? (
            <p className="text-xs text-muted-foreground">Checking...</p>
          ) : pending.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No pending sign-ups — all users have confirmed their email.
            </p>
          ) : (
            <div className="space-y-2">
              {pending.map((u) => (
                <Card key={u.id} className="border-warning/40">
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {u.display_name || u.email || u.id}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {u.email} · signed up{" "}
                        {new Date(u.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResend(u)}
                        disabled={pendingBusy === u.id || !u.email}
                      >
                        <Mail className="h-4 w-4 mr-1" />
                        Resend
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(u)}
                        disabled={pendingBusy === u.id}
                      >
                        <MailCheck className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading users...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users found</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((u) => {
              const uiRole = dbToUi(u.role);
              const isSuper = u.role === "super_admin";
              return (
                <Card key={u.user_id}>
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {u.display_name || u.email || u.user_id}
                      </p>
                      {u.email && (
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isSuper ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-warning/20 text-warning-foreground">
                          Super Admin
                        </span>
                      ) : (
                        <Select
                          value={uiRole}
                          onValueChange={(v) => handleRoleChange(u, v as UiRole)}
                          disabled={updating === u.user_id}
                        >
                          <SelectTrigger className="w-[140px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">ADMIN</SelectItem>
                            <SelectItem value="supervisor">SUPERVISOR</SelectItem>
                            <SelectItem value="basic">BASIC</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      {!isSuper && u.role_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove(u)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
