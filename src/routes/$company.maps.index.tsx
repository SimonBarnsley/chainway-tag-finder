import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Map as MapIcon, Eye, Pencil, Image as ImageIcon } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/$company/maps/")({
  component: MapsPage,
  head: () => ({
    meta: [
      { title: "Floor Plan Map — RFID Zone Mapping" },
      {
        name: "description",
        content:
          "Upload your company floor plan and map every location as a zone to visualize live tag reads.",
      },
    ],
  }),
});

function MapsPage() {
  return (
    <AuthGuard>
      <Content />
    </AuthGuard>
  );
}

function Content() {
  const { company } = Route.useParams();
  const { companySlug } = useAuth();
  const [hasMap, setHasMap] = useState(false);
  const [zoneCount, setZoneCount] = useState(0);
  const [locationCount, setLocationCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!companySlug) return;
    setLoading(true);
    try {
      const [mapRes, locRes] = await Promise.all([
        supabase
          .from("location_maps")
          .select("id")
          .eq("company_slug", companySlug)
          .is("location_id", null)
          .maybeSingle(),
        supabase
          .from("locations")
          .select("id", { count: "exact", head: true })
          .eq("company_slug", companySlug),
      ]);
      if (mapRes.error) throw mapRes.error;
      if (locRes.error) throw locRes.error;

      setLocationCount(locRes.count ?? 0);

      if (mapRes.data) {
        setHasMap(true);
        const { count, error } = await supabase
          .from("antenna_zones")
          .select("id", { count: "exact", head: true })
          .eq("map_id", mapRes.data.id)
          .not("location_id", "is", null);
        if (error) throw error;
        setZoneCount(count ?? 0);
      } else {
        setHasMap(false);
        setZoneCount(0);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load map");
    } finally {
      setLoading(false);
    }
  }, [companySlug]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="flex-1 px-4 py-4 space-y-4 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <MapIcon className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">Company Floor Plan</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          One floor plan covers your entire company. Draw a zone for each location on
          the map and watch live tag reads land in the right spot.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0">
                <ImageIcon
                  className={`h-6 w-6 ${hasMap ? "text-primary" : "text-muted-foreground"}`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {hasMap ? "Company floor plan uploaded" : "No floor plan yet"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {hasMap
                    ? `${zoneCount} of ${locationCount} location${
                        locationCount === 1 ? "" : "s"
                      } mapped as zones`
                    : "Upload a JPG/PNG to start mapping locations"}
                </p>
              </div>
              {hasMap && (
                <Link to="/$company/maps/view" params={{ company }}>
                  <Button size="sm" variant="ghost" className="h-8 gap-1">
                    <Eye className="h-3.5 w-3.5" /> View
                  </Button>
                </Link>
              )}
              <Link to="/$company/maps/edit" params={{ company }}>
                <Button size="sm" variant={hasMap ? "outline" : "default"} className="h-8 gap-1">
                  <Pencil className="h-3.5 w-3.5" />
                  {hasMap ? "Edit" : "Setup"}
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
