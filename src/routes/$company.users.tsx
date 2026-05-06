import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Users as UsersIcon, Search, Trash2, Building2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  listCompanies,
  updateUserCompany,
  createUser,
  type CompanyOption,
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
  company_slug: string | null;
  company_name: string | null;
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
  const [companyUpdating, setCompanyUpdating] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRole, setNewRole] = useState<UiRole>("basic");
  const [companyMode, setCompanyMode] = useState<"existing" | "new">("existing");
  const [newCompanySlug, setNewCompanySlug] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return undefined;
    return { Authorization: `Bearer ${token}` };
  };

  const fetchCompanies = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await listCompanies({ headers });
      if (res?.ok) setCompanies(res.companies);
    } catch {
      // non-fatal
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, email, display_name, company_slug, company_name");
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
          company_slug: p.company_slug,
          company_name: p.company_name,
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
    fetchCompanies();
  }, []);

  const handleCompanyChange = async (user: UserRow, newSlug: string) => {
    if (user.role === "super_admin") {
      toast.error("Cannot change a super admin's company");
      return;
    }
    setCompanyUpdating(user.user_id);
    try {
      const headers = await getAuthHeaders();
      await updateUserCompany({
        data: { userId: user.user_id, companySlug: newSlug },
        headers,
      });
      toast.success("Company updated");
      await fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update company");
    } finally {
      setCompanyUpdating(null);
    }
  };

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

  const resetCreateForm = () => {
    setNewEmail("");
    setNewPassword("");
    setNewDisplayName("");
    setNewRole("basic");
    setCompanyMode("existing");
    setNewCompanySlug("");
    setNewCompanyName("");
  };

  const handleCreate = async () => {
    if (!newEmail.trim() || !newPassword.trim()) {
      toast.error("Email and password are required");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (companyMode === "existing" && !newCompanySlug) {
      toast.error("Select a company");
      return;
    }
    if (companyMode === "new" && !newCompanyName.trim()) {
      toast.error("Enter a company name");
      return;
    }
    setCreating(true);
    try {
      const headers = await getAuthHeaders();
      await createUser({
        data: {
          email: newEmail.trim(),
          password: newPassword,
          displayName: newDisplayName.trim() || undefined,
          companySlug: companyMode === "existing" ? newCompanySlug : undefined,
          companyName: companyMode === "new" ? newCompanyName.trim() : undefined,
          role: uiToDb(newRole),
        },
        headers,
      });
      toast.success("User created");
      setCreateOpen(false);
      resetCreateForm();
      await Promise.all([fetchUsers(), fetchCompanies()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setCreating(false);
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
          <div className="ml-auto">
            <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetCreateForm(); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 gap-1">
                  <UserPlus className="h-3.5 w-3.5" /> Create User
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create User</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="cu-email">Email</Label>
                    <Input id="cu-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@example.com" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cu-name">Display name (optional)</Label>
                    <Input id="cu-name" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cu-pw">Temporary password</Label>
                    <Input id="cu-pw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
                  </div>
                  <div className="space-y-1">
                    <Label>Role</Label>
                    <Select value={newRole} onValueChange={(v) => setNewRole(v as UiRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">ADMIN</SelectItem>
                        <SelectItem value="supervisor">SUPERVISOR</SelectItem>
                        <SelectItem value="basic">BASIC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Company</Label>
                    <Select value={companyMode} onValueChange={(v) => setCompanyMode(v as "existing" | "new")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="existing">Use existing company</SelectItem>
                        <SelectItem value="new">Create new company</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {companyMode === "existing" ? (
                    <div className="space-y-1">
                      <Label>Select company</Label>
                      <Select value={newCompanySlug} onValueChange={setNewCompanySlug}>
                        <SelectTrigger>
                          <SelectValue placeholder={companies.length === 0 ? "No companies available" : "Choose..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {companies.map((c) => (
                            <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label htmlFor="cu-cname">New company name</Label>
                      <Input id="cu-cname" value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="Acme Inc." />
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating ? "Creating..." : "Create User"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
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
                      <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                        <Building2 className="h-3 w-3" />
                        {u.company_name || "No company"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isSuper && (
                        <Select
                          value={u.company_slug ?? ""}
                          onValueChange={(v) => handleCompanyChange(u, v)}
                          disabled={
                            companyUpdating === u.user_id || companies.length === 0
                          }
                        >
                          <SelectTrigger className="w-[160px] text-xs">
                            <SelectValue placeholder="Set company" />
                          </SelectTrigger>
                          <SelectContent>
                            {companies.map((c) => (
                              <SelectItem key={c.slug} value={c.slug}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
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
