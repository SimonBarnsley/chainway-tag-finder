import { useEffect, useState } from "react";
import { Building2, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Company {
  id: string;
  name: string;
  slug: string;
}

const nameSchema = z.string().trim().min(2, "Name is too short").max(150, "Name is too long");

function toSlug(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function CompaniesManager() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from("companies").select("id, name, slug").order("name");
    if (error) toast.error(error.message);
    else setCompanies(data ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    const slug = toSlug(parsed.data);
    if (!slug) return toast.error("Name needs letters or numbers");
    setSaving(true);
    const { error } = await supabase.from("companies").insert({ name: parsed.data, slug });
    setSaving(false);
    if (error) {
      toast.error(error.code === "23505" ? "That company already exists" : error.message);
      return;
    }
    toast.success(`"${parsed.data}" added — users can now sign up with this exact name`);
    setName("");
    load();
  };

  const remove = async (c: Company) => {
    if (!confirm(`Remove "${c.name}" from sign-up? Existing users and data are kept.`)) return;
    const { error } = await supabase.from("companies").delete().eq("id", c.id);
    if (error) toast.error(error.message);
    else load();
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Registered Companies</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          New users must type one of these company names exactly (capital letters don't matter) when signing up.
          Sign-ups with any other company name are refused.
        </p>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New company name"
            maxLength={150}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button size="sm" className="gap-1 shrink-0" onClick={add} disabled={saving}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        <ul className="divide-y divide-border rounded-md border border-border">
          {companies.length === 0 && <li className="p-3 text-xs text-muted-foreground">No companies yet.</li>}
          {companies.map((c) => (
            <li key={c.id} className="flex items-center justify-between p-2 pl-3">
              <span className="text-sm text-foreground">{c.name}</span>
              <Button size="icon" variant="ghost" onClick={() => remove(c)} aria-label={`Remove ${c.name}`}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
