import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { MapPin, Plus, Trash2, Edit3, X, Save, ScanBarcode, Radio } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/$company/locations")({
  component: LocationsPage,
  head: () => ({
    meta: [
      { title: "Locations — Manage warehouse locations" },
      {
        name: "description",
        content:
          "Create and manage the list of warehouse locations available in the RFID scanner.",
      },
    ],
  }),
});

interface LocationRow {
  id: string;
  name: string;
  description: string | null;
  barcode: string | null;
  created_at: string;
}

interface AntennaMappingRow {
  id: string;
  reader_id: string;
  reader_name: string;
  antenna_port: number;
  location: string;
  description: string | null;
}

function LocationsPage() {
  const { companySlug } = useAuth();
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", barcode: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [antennaMappings, setAntennaMappings] = useState<AntennaMappingRow[]>([]);
  const [isLoadingAntennas, setIsLoadingAntennas] = useState(true);

  const fetchLocations = useCallback(async () => {
    if (!companySlug) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("locations")
      .select("id, name, description, barcode, created_at")
      .eq("company_slug", companySlug)
      .order("name", { ascending: true });
    if (error) {
      toast.error(error.message);
    } else {
      setLocations(data ?? []);
    }
    setIsLoading(false);
  }, [companySlug]);

  const fetchAntennaMappings = useCallback(async () => {
    if (!companySlug) return;
    setIsLoadingAntennas(true);
    const { data, error } = await supabase
      .from("reader_antennas")
      .select("id, reader_id, antenna_port, location, description, fixed_readers!inner(name)")
      .eq("company_slug", companySlug)
      .order("location", { ascending: true });
    if (error) {
      toast.error(error.message);
    } else {
      const rows: AntennaMappingRow[] = (data ?? []).map((a) => {
        const reader = a.fixed_readers as unknown as { name: string };
        return {
          id: a.id,
          reader_id: a.reader_id,
          reader_name: reader?.name ?? "Reader",
          antenna_port: a.antenna_port,
          location: a.location,
          description: a.description ?? null,
        };
      });
      setAntennaMappings(rows);
    }
    setIsLoadingAntennas(false);
  }, [companySlug]);

  useEffect(() => {
    fetchLocations();
    fetchAntennaMappings();
  }, [fetchLocations, fetchAntennaMappings]);

  const resetForm = () => {
    setForm({ name: "", description: "", barcode: "" });
    setEditingId(null);
    setIsCreating(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      toast.error("Location name is required");
      return;
    }
    if (!companySlug) {
      toast.error("No company assigned to your account");
      return;
    }

    setIsSaving(true);
    const payload = {
      name,
      description: form.description.trim() || null,
      barcode: form.barcode.trim() || null,
      company_slug: companySlug,
    };

    if (editingId) {
      const { error } = await supabase
        .from("locations")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Location updated");
        resetForm();
        fetchLocations();
      }
    } else {
      const { error } = await supabase.from("locations").insert(payload);
      if (error) {
        toast.error(
          error.code === "23505"
            ? `A location named "${name}" already exists`
            : error.message,
        );
      } else {
        toast.success(`Created "${name}"`);
        resetForm();
        fetchLocations();
      }
    }
    setIsSaving(false);
  };

  const handleEdit = (loc: LocationRow) => {
    setEditingId(loc.id);
    setIsCreating(true);
    setForm({
      name: loc.name,
      description: loc.description ?? "",
      barcode: loc.barcode ?? "",
    });
  };

  const handleDelete = async (loc: LocationRow) => {
    if (!confirm(`Delete location "${loc.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("locations").delete().eq("id", loc.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Deleted "${loc.name}"`);
      fetchLocations();
    }
  };

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader />
        <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <MapPin className="h-6 w-6 text-primary" />
                Locations
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage warehouse locations available on the scanner page.
              </p>
            </div>
            {!isCreating && (
              <Button onClick={() => setIsCreating(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                New Location
              </Button>
            )}
          </div>

          {isCreating && (
            <form
              onSubmit={handleSave}
              className="rounded-lg border border-primary/40 bg-card p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">
                  {editingId ? "Edit location" : "New location"}
                </h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetForm}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Name *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Bay 7, Shelf B"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Description</label>
                <Textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Optional notes about this location"
                  rows={2}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <ScanBarcode className="h-3 w-3" />
                  Barcode (optional)
                </label>
                <Input
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  placeholder="Scan or type the location's barcode value"
                  className="font-mono text-xs"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={isSaving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving..." : editingId ? "Save changes" : "Create"}
                </Button>
                <Button type="button" variant="ghost" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          <div className="rounded-lg border border-border bg-card">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Loading locations...
              </div>
            ) : locations.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No locations yet. Click "New Location" to add your first one.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {locations.map((loc) => (
                  <li
                    key={loc.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors"
                  >
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {loc.name}
                      </p>
                      {loc.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {loc.description}
                        </p>
                      )}
                      {loc.barcode && (
                        <p className="text-xs font-mono text-muted-foreground truncate">
                          <ScanBarcode className="inline h-3 w-3 mr-1" />
                          {loc.barcode}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(loc)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(loc)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
