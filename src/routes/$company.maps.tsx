import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Map as MapIcon, Image as ImageIcon, Eye, Pencil, ChevronRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/$company/maps")({
  component: MapsPage,
  head: () => ({
    meta: [
      { title: "Floor Plan Maps — RFID Zone Mapping" },
      { name: "description", content: "Upload floor plan images and map antenna zones to visualize live tag reads." },
    ],
  }),
});

interface LocationWithMap {
  id: string;
  name: string;
  description: string | null;
  hasMap: boolean;
  mapId: string | null;
  zoneCount: number;
}

function MapsPage() {
  return (
    <AuthGuard>
      <MapsContent />
    </AuthGuard>
  );
}

function MapsContent() {
  const { company } = Route.useParams();
  const { companySlug } = useAuth();
  const [rows, setRows] = useState<LocationWithMap[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!companySlug) return;
    setLoading(true);
    try {
      const [locRes, mapRes, zoneRes] = await Promise.all([
        supabase.from("locations").select("id, name, description").eq("company_slug", companySlug).order("name"),
        supabase.from("location_maps").select("id, location_id").eq("company_slug", companySlug),
        supabase.from("antenna_zones").select("map_id").eq("company_slug", companySlug),
      ]);
      if (locRes.error) throw locRes.error;
      if (mapRes.error) throw mapRes.error;
      if (zoneRes.error) throw zoneRes.error;

      const mapByLoc = new Map<string, string>();
      for (const m of mapRes.data ?? []) mapByLoc.set(m.location_id, m.id);

      const zoneCounts = new Map<string, number>();
      for (const z of zoneRes.data ?? []) {
        zoneCounts.set(z.map_id, (zoneCounts.get(z.map_id) ?? 0) + 1);
      }

      setRows(
        (locRes.data ?? []).map((l) => {
          const mapId = mapByLoc.get(l.id) ?? null;
          return {
            id: l.id,
            name: l.name,
            description: l.description,
            hasMap: !!mapId,
            mapId,
            zoneCount: mapId ? zoneCounts.get(mapId) ?? 0 : 0,
          };
        })
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load maps");
    } finally {
      setLoading(false);
    }
  }, [companySlug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="flex-1 px-4 py-4 space-y-4 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <MapIcon className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">Floor Plan Maps</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Upload a JPG/PNG floor plan for each location, draw zones over your antennas,
          and see live tag reads as pins on the map.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <MapIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No locations yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create a location first, then upload its floor plan here.
              </p>
              <Link to="/$company/locations" params={{ company }} className="inline-block mt-3">
                <Button size="sm" variant="outline">Manage Locations</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                    {r.hasMap ? (
                      <ImageIcon className="h-5 w-5 text-primary" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.hasMap ? `${r.zoneCount} zone${r.zoneCount === 1 ? "" : "s"} mapped` : "No floor plan uploaded"}
                    </p>
                  </div>
                  {r.hasMap && (
                    <Link to="/$company/maps/$locationId/view" params={{ company, locationId: r.id }}>
                      <Button size="sm" variant="ghost" className="h-8 gap-1">
                        <Eye className="h-3.5 w-3.5" /> View
                      </Button>
                    </Link>
                  )}
                  <Link to="/$company/maps/$locationId/edit" params={{ company, locationId: r.id }}>
                    <Button size="sm" variant={r.hasMap ? "outline" : "default"} className="h-8 gap-1">
                      <Pencil className="h-3.5 w-3.5" />
                      {r.hasMap ? "Edit" : "Setup"}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
