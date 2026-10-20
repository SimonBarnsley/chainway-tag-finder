import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, UserPlus, Trash2, Search, Plus, Eye, EyeOff, Copy, Check, Radio, Filter, Download, ScrollText, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { CompaniesManager } from "@/components/CompaniesManager";
import { DataTransfer } from "@/components/DataTransfer";
import { exportMyData, deleteMyAccount, listAuditLog, logAudit, type AuditEntry } from "@/lib/account.functions";

export const Route = createFileRoute("/$company/admin")({
  component: AdminPage,
  head: () => ({
    meta: [{ title: "Admin — User Management" }],
  }),
});

interface UserRole {
  id: string;
  user_id: string;
  role: string;
  email?: string;
  display_name?: string;
}

function AdminPage() {
  return (
    <AuthGuard adminOnly>
      <AdminContent />
    </AuthGuard>
  );
}

function AdminContent() {
  const { company } = Route.useParams();
  const { isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createCompanyName, setCreateCompanyName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [tagPrefix, setTagPrefix] = useState("");
  const [tagPrefixLoaded, setTagPrefixLoaded] = useState(false);
  const [savingPrefix, setSavingPrefix] = useState(false);
  const [scanRetention, setScanRetention] = useState("365");
  const [alertRetention, setAlertRetention] = useState("90");
  const [retentionLoaded, setRetentionLoaded] = useState(false);
  const [savingRetention, setSavingRetention] = useState(false);
  const [myName, setMyName] = useState("");
  const [myEmail, setMyEmail] = useState("");
  const [myDetailsLoaded, setMyDetailsLoaded] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const runExport = useServerFn(exportMyData);
  const runDeleteAccount = useServerFn(deleteMyAccount);
  const fetchAuditLog = useServerFn(listAuditLog);
  const audit = useServerFn(logAudit);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("company_settings")
        .select("epc_tag_prefix, scan_retention_days, alert_retention_days")
        .eq("company_slug", company)
        .maybeSingle();
      if (cancelled) return;
      setTagPrefix((data?.epc_tag_prefix ?? "").toUpperCase());
      setTagPrefixLoaded(true);
      setScanRetention(String(data?.scan_retention_days ?? 365));
      setAlertRetention(String(data?.alert_retention_days ?? 90));
      setRetentionLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [company]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setMyName(data?.display_name ?? "");
      setMyEmail(data?.email ?? user.email ?? "");
      setMyDetailsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const handleSaveRetention = async () => {
    const scanDays = parseInt(scanRetention, 10);
    const alertDays = parseInt(alertRetention, 10);
    if (!Number.isFinite(scanDays) || scanDays < 1 || scanDays > 3650) {
      toast.error("Scan history retention must be between 1 and 3650 days");
      return;
    }
    if (!Number.isFinite(alertDays) || alertDays < 1 || alertDays > 3650) {
      toast.error("Alert retention must be between 1 and 3650 days");
      return;
    }
    setSavingRetention(true);
    try {
      const { error } = await supabase
        .from("company_settings")
        .upsert(
          { company_slug: company, scan_retention_days: scanDays, alert_retention_days: alertDays },
          { onConflict: "company_slug" }
        );
      if (error) throw error;
      toast.success("Retention settings saved — old data is cleared automatically each night");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingRetention(false);
    }
  };

  const handleSaveName = async () => {
    if (!user) return;
    setSavingName(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: myName.trim() || null })
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Name updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update name");
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveEmail = async () => {
    const email = myEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      toast.success("Confirmation sent — check the new address and click the link to finish the change");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to change email");
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSavePrefix = async () => {
    setSavingPrefix(true);
    try {
      const value = tagPrefix.trim().toUpperCase() || null;
      const { error } = await supabase
        .from("company_settings")
        .upsert(
          { company_slug: company, epc_tag_prefix: value },
          { onConflict: "company_slug" }
        );
      if (error) throw error;
      toast.success(value ? `Tag filter set to "${value}"` : "Tag filter cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingPrefix(false);
    }
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://uhf-tag-finder.lovable.app";
  const zebraEndpointUrl = `${baseUrl}/api/zebra-reader?company=${company}`;

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: roles, error } = await supabase.from("user_roles").select("id, user_id, role");
      if (error) throw error;
      if (roles && roles.length > 0) {
        const userIds = roles.map((r) => r.user_id);
        const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, email").in("user_id", userIds);
        const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
        setUsers(roles.map((r) => ({ ...r, email: profileMap.get(r.user_id)?.email ?? undefined, display_name: profileMap.get(r.user_id)?.display_name ?? undefined })));
      } else {
        setUsers([]);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const validateCreateForm = (): boolean => {
    const errors: Record<string, string> = {};
    const email = createEmail.trim();
    if (!email) errors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Invalid email format";
    else if (email.length > 255) errors.email = "Email must be under 255 characters";
    if (!createPassword) errors.password = "Password is required";
    else if (createPassword.length < 10) errors.password = "Password must be at least 10 characters";
    else if (createPassword.length > 128) errors.password = "Password must be under 128 characters";
    if (createDisplayName.length > 100) errors.displayName = "Display name must be under 100 characters";
    if (createCompanyName.length > 150) errors.companyName = "Company name must be under 150 characters";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCreateForm()) return;
    setCreating(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: createEmail.trim(),
        password: createPassword,
        options: {
          data: { display_name: createDisplayName.trim() || undefined, company_name: createCompanyName.trim() || undefined },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      toast.success("User created successfully! They will receive a confirmation email.");
      setCreateEmail(""); setCreatePassword(""); setCreateDisplayName(""); setCreateCompanyName("");
      setShowCreateForm(false); setFormErrors({});
      setTimeout(fetchUsers, 1000);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handlePromoteToAdmin = async () => {
    if (!newAdminEmail.trim()) return;
    setAdding(true);
    try {
      const { data: profile, error: profileError } = await supabase.from("profiles").select("user_id").eq("email", newAdminEmail.trim()).single();
      if (profileError || !profile) { toast.error("User not found with that email"); return; }
      const { error } = await supabase.from("user_roles").upsert({ user_id: profile.user_id, role: "admin" as const }, { onConflict: "user_id,role" });
      if (error) throw error;
      toast.success("User promoted to admin");
      setNewAdminEmail(""); fetchUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to promote user");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveRole = async (roleId: string) => {
    try {
      const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
      if (error) throw error;
      toast.success("Role removed"); fetchUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove role");
    }
  };

  const filteredUsers = users.filter((u) =>
    !search || u.email?.toLowerCase().includes(search.toLowerCase()) || u.display_name?.toLowerCase().includes(search.toLowerCase()) || u.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="flex-1 px-4 py-4 space-y-4 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">User Management</h1>
          </div>
          <Button size="sm" variant={showCreateForm ? "secondary" : "default"} className="gap-1" onClick={() => setShowCreateForm(!showCreateForm)}>
            <Plus className="h-4 w-4" /> {showCreateForm ? "Cancel" : "Create User"}
          </Button>
        </div>

        {isSuperAdmin && <CompaniesManager />}
        {isSuperAdmin && <DataTransfer company={company} />}

        {/* Zebra IoT Connector Endpoint */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Zebra FX Reader Endpoint</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure your Zebra IoT Connector to POST tag read events to this URL. Tags will be saved automatically to this company's database.
            </p>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Endpoint URL</Label>
              <div className="flex gap-2">
                <Input readOnly value={zebraEndpointUrl} className="font-mono text-xs bg-muted" />
                <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={() => handleCopy(zebraEndpointUrl, "url")}>
                  {copiedField === "url" ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Full URL with optional parameters</Label>
              <div className="flex gap-2">
                <Input readOnly value={`${zebraEndpointUrl}&location=DOCK-1&device=FX7500-01&key=YOUR_API_KEY`} className="font-mono text-xs bg-muted" />
                <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={() => handleCopy(`${zebraEndpointUrl}&location=DOCK-1&device=FX7500-01&key=YOUR_API_KEY`, "full")}>
                  {copiedField === "full" ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            <div className="rounded-md bg-muted p-3 space-y-1">
              <p className="text-xs font-medium text-foreground">Query Parameters:</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                <li><span className="font-mono text-foreground">company</span> — Company slug (auto-set)</li>
                <li><span className="font-mono text-foreground">location</span> — Reader location (optional)</li>
                <li><span className="font-mono text-foreground">device</span> — Device name (optional)</li>
                <li><span className="font-mono text-foreground">key</span> — API key for authentication (optional)</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Company-wide EPC Tag Prefix Filter */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">EPC Tag Prefix Filter</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Set a company-wide hex prefix (first 4 hex chars of the EPC). The decoder and RFID wedge scanner will only process tags that start with this prefix. Leave blank to accept all tags.
            </p>
            <div className="flex gap-2">
              <Input
                value={tagPrefix}
                onChange={(e) => setTagPrefix(e.target.value.toUpperCase().slice(0, 4))}
                placeholder="e.g. 3034"
                className="font-mono text-xs flex-1"
                maxLength={4}
                disabled={!tagPrefixLoaded}
              />
              <Button size="sm" onClick={handleSavePrefix} disabled={!tagPrefixLoaded || savingPrefix}>
                {savingPrefix ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* My details — every user can correct their own name and email */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">My Details</h2>
            <p className="text-xs text-muted-foreground">
              Correct your own name or email. Changing your email sends a confirmation link to the new address — the change only takes effect once you click it.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="my-name" className="text-xs text-muted-foreground">Display name</Label>
              <div className="flex gap-2">
                <Input id="my-name" value={myName} onChange={(e) => setMyName(e.target.value)} maxLength={100} disabled={!myDetailsLoaded} className="flex-1" />
                <Button size="sm" onClick={handleSaveName} disabled={!myDetailsLoaded || savingName}>
                  {savingName ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="my-email" className="text-xs text-muted-foreground">Email</Label>
              <div className="flex gap-2">
                <Input id="my-email" type="email" value={myEmail} onChange={(e) => setMyEmail(e.target.value)} maxLength={255} disabled={!myDetailsLoaded} className="flex-1" />
                <Button size="sm" onClick={handleSaveEmail} disabled={!myDetailsLoaded || savingEmail}>
                  {savingEmail ? "Sending..." : "Change"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data retention — automatic nightly clean-up of old data */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Data Retention</h2>
            <p className="text-xs text-muted-foreground">
              Old data for this company is deleted automatically every night. Contact enquiries are emailed to you and never stored, so there is nothing to clean up there.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ret-scan" className="text-xs text-muted-foreground">Keep scan history for (days)</Label>
                <Input id="ret-scan" type="number" min={1} max={3650} value={scanRetention} onChange={(e) => setScanRetention(e.target.value)} disabled={!retentionLoaded} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ret-alert" className="text-xs text-muted-foreground">Keep read alerts for (days)</Label>
                <Input id="ret-alert" type="number" min={1} max={3650} value={alertRetention} onChange={(e) => setAlertRetention(e.target.value)} disabled={!retentionLoaded} />
              </div>
            </div>
            <Button size="sm" onClick={handleSaveRetention} disabled={!retentionLoaded || savingRetention}>
              {savingRetention ? "Saving..." : "Save retention settings"}
            </Button>
          </CardContent>
        </Card>

        {showCreateForm && (
          <Card>
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3">Create New User</h2>
              <p className="text-xs text-muted-foreground mb-4">
                New users are assigned the <span className="font-semibold text-foreground">standard</span> role by default.
              </p>
              <form onSubmit={handleCreateUser} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="create-name" className="text-xs">Display Name</Label>
                  <Input id="create-name" type="text" value={createDisplayName} onChange={(e) => setCreateDisplayName(e.target.value)} placeholder="John Smith" maxLength={100} />
                  {formErrors.displayName && <p className="text-xs text-destructive">{formErrors.displayName}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-company" className="text-xs">Company Name</Label>
                  <Input id="create-company" type="text" value={createCompanyName} onChange={(e) => setCreateCompanyName(e.target.value)} placeholder="Acme Ltd" maxLength={150} />
                  {formErrors.companyName && <p className="text-xs text-destructive">{formErrors.companyName}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-email" className="text-xs">Email <span className="text-destructive">*</span></Label>
                  <Input id="create-email" type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="user@example.com" required maxLength={255} />
                  {formErrors.email && <p className="text-xs text-destructive">{formErrors.email}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-password" className="text-xs">Password <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Input id="create-password" type={showPassword ? "text" : "password"} value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} placeholder="Min. 10 characters" required minLength={10} maxLength={128} className="pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {formErrors.password && <p className="text-xs text-destructive">{formErrors.password}</p>}
                </div>
                <Button type="submit" disabled={creating} className="w-full gap-1">
                  <UserPlus className="h-4 w-4" /> {creating ? "Creating..." : "Create Standard User"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {isSuperAdmin && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Promote User to Admin</h2>
              <p className="text-xs text-muted-foreground">Enter the email of an existing user to grant them admin privileges.</p>
              <div className="flex gap-2">
                <Input placeholder="user@example.com" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} className="flex-1" maxLength={255} />
                <Button onClick={handlePromoteToAdmin} disabled={adding} size="sm" className="gap-1">
                  <Shield className="h-4 w-4" /> {adding ? "Adding..." : "Make Admin"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading users...</p>
        ) : filteredUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users found</p>
        ) : (
          <div className="space-y-2">
            {filteredUsers.map((u) => (
              <Card key={u.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{u.display_name || u.email || u.user_id}</p>
                    {u.email && <p className="text-xs text-muted-foreground">{u.email}</p>}
                    <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${u.role === "super_admin" ? "bg-warning/20 text-warning-foreground" : u.role === "admin" ? "bg-primary/20 text-primary" : "bg-secondary text-secondary-foreground"}`}>
                      {u.role === "super_admin" ? "Super Admin" : u.role}
                    </span>
                  </div>
                  {u.role !== "super_admin" && (
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveRole(u.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
