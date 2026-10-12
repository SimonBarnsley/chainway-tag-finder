import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Workflow, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/$company/rules")({
  component: () => (
    <AuthGuard adminOnly>
      <RulesPage />
    </AuthGuard>
  ),
  head: () => ({
    meta: [
      { title: "Rules & Alerts — ScanLoc8" },
      { name: "description", content: "Create rules that alert users when tags are seen at locations." },
      { property: "og:title", content: "Rules & Alerts — ScanLoc8" },
      { property: "og:description", content: "Create rules that alert users when tags are seen at locations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

// New tables are not yet in generated types.
const db = supabase as unknown as { from: (t: string) => any };

interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  location: string;
  target_type: "item" | "epc" | "all";
  item_id: string | null;
  epc: string | null;
  recipient_user_ids: string[];
  notify_email: boolean;
  cooldown_minutes: number;
}

function RulesPage() {
  const { company } = Route.useParams();
  const [rules, setRules] = useState<Rule[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ user_id: string; label: string }[]>([]);
  const [form, setForm] = useState({
    name: "",
    location: "",
    target_type: "item" as "item" | "epc" | "all",
    item_id: "",
    epc: "",
    recipients: [] as string[],
    notify_email: true,
    cooldown_minutes: 60,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [r, l, a, i, u] = await Promise.all([
      db.from("alert_rules").select("*").eq("company_slug", company).order("created_at", { ascending: false }),
      supabase.from("locations").select("name").eq("company_slug", company),
      supabase.from("reader_antennas").select("location").eq("company_slug", company),
      supabase.from("items").select("id, name").eq("company_slug", company).order("name"),
      supabase.from("profiles").select("user_id, display_name, email").eq("company_slug", company),
    ]);
    setRules((r.data ?? []) as Rule[]);
    const locs = new Set<string>();
    (l.data ?? []).forEach((x) => x.name && locs.add(x.name));
    (a.data ?? []).forEach((x) => x.location && locs.add(x.location));
    setLocations([...locs].sort());
    setItems(i.data ?? []);
    setUsers((u.data ?? []).map((p) => ({ user_id: p.user_id, label: p.display_name ? `${p.display_name} (${p.email})` : p.email ?? p.user_id })));
  }, [company]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.name.trim() || !form.location) return toast.error("Give the rule a name and pick a location.");
    if (form.target_type === "item" && !form.item_id) return toast.error("Pick an item.");
    if (form.target_type === "epc" && !form.epc.trim()) return toast.error("Enter a tag number.");
    if (form.recipients.length === 0) return toast.error("Pick at least one user to alert.");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db.from("alert_rules").insert({
      company_slug: company,
      name: form.name.trim(),
      location: form.location,
      target_type: form.target_type,
      item_id: form.target_type === "item" ? form.item_id : null,
      epc: form.target_type === "epc" ? form.epc.trim().toUpperCase() : null,
      recipient_user_ids: form.recipients,
      notify_email: form.notify_email,
      cooldown_minutes: Math.max(0, Number(form.cooldown_minutes) || 0),
      created_by: u.user?.id,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Rule created");
    setForm({ ...form, name: "", epc: "", item_id: "", recipients: [] });
    load();
  };

  const toggle = async (rule: Rule) => {
    await db.from("alert_rules").update({ enabled: !rule.enabled }).eq("id", rule.id);
    load();
  };
  const remove = async (rule: Rule) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    await db.from("alert_rules").delete().eq("id", rule.id);
    load();
  };

  const itemName = (id: string | null) => items.find((i) => i.id === id)?.name ?? "Unknown item";
  const userName = (id: string) => users.find((u) => u.user_id === id)?.label ?? "Unknown user";
  const sel = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <div className="flex items-center gap-2">
          <Workflow className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">Rules</h2>
        </div>

        <Card>
          <CardContent className="space-y-4 p-5">
            <h3 className="font-semibold text-foreground">New rule</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Rule name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Pallet left via dock door" />
              </div>
              <div className="space-y-1.5">
                <Label>When seen at location</Label>
                <select className={sel} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>
                  <option value="">Choose a location…</option>
                  {locations.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Watch</Label>
                <select className={sel} value={form.target_type} onChange={(e) => setForm({ ...form, target_type: e.target.value as "item" | "epc" | "all" })}>
                  <option value="all">ALL — any tag</option>
                  <option value="item">An item (any of its tags)</option>
                  <option value="epc">A specific tag</option>
                </select>
              </div>
              <div className="space-y-1.5">
                {form.target_type === "all" ? (
                  <p className="text-sm text-muted-foreground pt-6">This rule fires for every tag read at the chosen location.</p>
                ) : form.target_type === "item" ? (
                  <>
                    <Label>Item</Label>
                    <select className={sel} value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
                      <option value="">Choose an item…</option>
                      {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </>
                ) : (
                  <>
                    <Label>Tag number (EPC)</Label>
                    <Input className="font-mono" value={form.epc} onChange={(e) => setForm({ ...form, epc: e.target.value })} placeholder="3039…" />
                  </>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Don't repeat for the same tag within (minutes)</Label>
                <Input type="number" min={0} value={form.cooldown_minutes} onChange={(e) => setForm({ ...form, cooldown_minutes: Number(e.target.value) })} />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={form.notify_email} onCheckedChange={(v) => setForm({ ...form, notify_email: v })} />
                <Label>Also send email</Label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Alert these users</Label>
              <div className="grid gap-1.5 rounded-md border border-border p-3 sm:grid-cols-2">
                {users.length === 0 && <p className="text-sm text-muted-foreground">No users in this company.</p>}
                {users.map((u) => (
                  <label key={u.user_id} className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={form.recipients.includes(u.user_id)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          recipients: e.target.checked ? [...form.recipients, u.user_id] : form.recipients.filter((x) => x !== u.user_id),
                        })
                      }
                    />
                    <span className="truncate">{u.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Create rule"}</Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">Rules ({rules.length})</h3>
          {rules.length === 0 && <p className="text-sm text-muted-foreground">No rules yet.</p>}
          {rules.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-foreground">{r.name}</p>
                  <p className="text-sm text-muted-foreground">
                    When {r.target_type === "all" ? <b>any tag (ALL)</b> : r.target_type === "item" ? <b>{itemName(r.item_id)}</b> : <span className="font-mono">{r.epc}</span>} is seen at <b>{r.location}</b>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Alert: {r.recipient_user_ids.map(userName).join(", ")} {r.notify_email ? "· in-app + email" : "· in-app"} · repeat after {r.cooldown_minutes} min
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={r.enabled} onCheckedChange={() => toggle(r)} />
                  <Button variant="ghost" size="icon" onClick={() => remove(r)} aria-label="Delete rule">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
