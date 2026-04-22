import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Map as MapIcon, ArrowLeft, Pencil, RefreshCw, MapPin } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  type AntennaZone,
  parseZoneShape,
  polygonPointsAttr,
  jitteredPointForEpc,
  zoneCenter,
} from "@/lib/map-zones";

export const Route = createFileRoute("/$company/maps/view")({
  component: ViewPage,
  head: () => ({
    meta: [
      { title: "Company Floor Plan — Live RFID Map" },
      {
        name: "description",
        content: "Live view of RFID tags plotted on the company-wide floor plan.",
      },
    ],
  }),
});

interface ScanRow {
  id: string;
  epc: string;
  location: string | null;
  last_seen: string;
}

interface LocationRow {
  id: string;
  name: string;
}

// Pins for any tag whose latest scan location matches a zone (no time cutoff).
// Recent scans get a "live" pulse; older ones render as static pins.
const LIVE_WINDOW_MS = 5 * 60 * 1000;

function ViewPage() {
  return (
    <AuthGuard>
      <Viewer />
    </AuthGuard>
  );
}

function Viewer() {
  const { company } = Route.useParams();
  const { companySlug } = useAuth();

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [zones, setZones] = useState<AntennaZone[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredEpc, setHoveredEpc] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!companySlug) return;
    setLoading(true);
    try {
      const [mapRes, locRes] = await Promise.all([
        supabase
          .from("location_maps")
          .select("id, image_path, image_width, image_height")
          .eq("company_slug", companySlug)
          .is("location_id", null)
          .maybeSingle(),
        supabase
          .from("locations")
          .select("id, name")
          .eq("company_slug", companySlug),
      ]);
      if (mapRes.error) throw mapRes.error;
      if (locRes.error) throw locRes.error;

      setLocations(locRes.data ?? []);

      if (!mapRes.data) {
        setImageUrl(null);
        setImgDims(null);
        setZones([]);
        return;
      }

      const { data: pub } = supabase.storage
        .from("location-maps")
        .getPublicUrl(mapRes.data.image_path);
      setImageUrl(pub.publicUrl);
      setImgDims({ w: mapRes.data.image_width, h: mapRes.data.image_height });

      const { data: zd, error: ze } = await supabase
        .from("antenna_zones")
        .select("*")
        .eq("map_id", mapRes.data.id)
        .not("location_id", "is", null);
      if (ze) throw ze;
      setZones((zd ?? []) as AntennaZone[]);

      const { data: sd, error: se } = await supabase
        .from("rfid_scans")
        .select("id, epc, location, last_seen")
        .eq("company_slug", companySlug)
        .not("location", "is", null)
        .order("last_seen", { ascending: false })
        .limit(2000);
      if (se) throw se;
      // Deduplicate to the latest scan per EPC so each tag pins once.
      const seen = new Set<string>();
      const dedup: ScanRow[] = [];
      for (const s of sd ?? []) {
        if (seen.has(s.epc)) continue;
        seen.add(s.epc);
        dedup.push(s);
      }
      setScans(dedup);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load map");
    } finally {
      setLoading(false);
    }
  }, [companySlug]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime
  useEffect(() => {
    if (!companySlug) return;
    const channel = supabase
      .channel(`rfid-scans-company-map`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rfid_scans",
          filter: `company_slug=eq.${companySlug}`,
        },
        (payload) => {
          const newRow = (payload.new ?? null) as ScanRow | null;
          const oldRow = (payload.old ?? null) as { id?: string } | null;
          setScans((prev) => {
            if (payload.eventType === "DELETE" && oldRow?.id) {
              return prev.filter((s) => s.id !== oldRow.id);
            }
            if (!newRow || !newRow.location) return prev;
            // Keep one row per EPC (latest wins).
            const filtered = prev.filter((s) => s.epc !== newRow.epc);
            return [newRow, ...filtered].slice(0, 2000);
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companySlug]);


  // location name -> zone
  const zoneByLocationName = useMemo(() => {
    const nameById = new Map(locations.map((l) => [l.id, l.name.toLowerCase()]));
    const m = new Map<string, AntennaZone>();
    for (const z of zones) {
      if (!z.location_id) continue;
      const name = nameById.get(z.location_id);
      if (!name) continue;
      m.set(name, z);
    }
    return m;
  }, [zones, locations]);

  const pins = useMemo(() => {
    const out: Array<{
      epc: string;
      x: number;
      y: number;
      color: string;
      zoneId: string;
      lastSeen: string;
      isLive: boolean;
    }> = [];
    const liveCutoff = Date.now() - LIVE_WINDOW_MS;
    for (const s of scans) {
      if (!s.location) continue;
      const z = zoneByLocationName.get(s.location.toLowerCase());
      if (!z) continue;
      const shape = parseZoneShape(z);
      const p = jitteredPointForEpc(shape, s.epc);
      out.push({
        epc: s.epc,
        x: p.x,
        y: p.y,
        color: z.color,
        zoneId: z.id,
        lastSeen: s.last_seen,
        isLive: new Date(s.last_seen).getTime() >= liveCutoff,
      });
    }
    return out;
  }, [scans, zoneByLocationName]);

  const renderWidth = 1000;
  const renderHeight = imgDims ? Math.round((imgDims.h / imgDims.w) * renderWidth) : 700;

  const zoneCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pins) m.set(p.zoneId, (m.get(p.zoneId) ?? 0) + 1);
    return m;
  }, [pins]);

  const locationNameById = new Map(locations.map((l) => [l.id, l.name]));

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="flex-1 px-4 py-4 space-y-4 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link to="/$company/maps" params={{ company }}>
              <Button variant="ghost" size="sm" className="h-8 gap-1">
                <ArrowLeft className="h-4 w-4" /> Maps
              </Button>
            </Link>
            <MapIcon className="h-5 w-5 text-primary shrink-0" />
            <h1 className="text-lg font-bold text-foreground truncate">
              Company Floor Plan — Live
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={fetchAll}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Link to="/$company/maps/edit" params={{ company }}>
              <Button variant="outline" size="sm" className="h-8 gap-1">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            </Link>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !imageUrl ? (
          <Card>
            <CardContent className="p-6 text-center">
              <MapIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No company floor plan uploaded yet
              </p>
              <Link to="/$company/maps/edit" params={{ company }}>
                <Button size="sm" className="mt-3 gap-1">
                  <Pencil className="h-3.5 w-3.5" /> Set up map
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="p-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                  </span>
                  <span className="text-foreground font-medium">Live</span>
                </span>
                <span className="text-muted-foreground">
                  {pins.length} active pin{pins.length === 1 ? "" : "s"} · {zones.length} zone
                  {zones.length === 1 ? "" : "s"} · last 5 min
                </span>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardContent className="p-0 relative">
                <div
                  className="relative w-full"
                  style={{ aspectRatio: `${renderWidth} / ${renderHeight}` }}
                >
                  <img
                    src={imageUrl}
                    alt="Company floor plan"
                    className="absolute inset-0 w-full h-full object-contain bg-muted select-none pointer-events-none"
                    draggable={false}
                  />
                  <svg
                    viewBox={`0 0 ${renderWidth} ${renderHeight}`}
                    className="absolute inset-0 w-full h-full"
                  >
                    {zones.map((z) => {
                      const shape = parseZoneShape(z);
                      const c = zoneCenter(shape);
                      const count = zoneCounts.get(z.id) ?? 0;
                      const name = z.location_id
                        ? locationNameById.get(z.location_id) ?? z.label ?? "Location"
                        : z.label ?? "Zone";
                      return (
                        <g key={z.id}>
                          {shape.kind === "rect" ? (
                            <rect
                              x={shape.x * renderWidth}
                              y={shape.y * renderHeight}
                              width={shape.w * renderWidth}
                              height={shape.h * renderHeight}
                              fill={z.color}
                              fillOpacity={0.12}
                              stroke={z.color}
                              strokeWidth={2}
                            />
                          ) : (
                            <polygon
                              points={polygonPointsAttr(
                                shape.points,
                                renderWidth,
                                renderHeight,
                              )}
                              fill={z.color}
                              fillOpacity={0.12}
                              stroke={z.color}
                              strokeWidth={2}
                            />
                          )}
                          <text
                            x={c.x * renderWidth}
                            y={c.y * renderHeight - 14}
                            fill={z.color}
                            stroke="white"
                            strokeWidth={3}
                            paintOrder="stroke"
                            fontSize={16}
                            fontWeight={700}
                            textAnchor="middle"
                          >
                            {name}
                          </text>
                          {count > 0 && (
                            <text
                              x={c.x * renderWidth}
                              y={c.y * renderHeight + 6}
                              fill={z.color}
                              stroke="white"
                              strokeWidth={3}
                              paintOrder="stroke"
                              fontSize={14}
                              fontWeight={600}
                              textAnchor="middle"
                            >
                              {count} tag{count === 1 ? "" : "s"}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {pins.map((p) => {
                      const cx = p.x * renderWidth;
                      const cy = p.y * renderHeight;
                      const isHover = hoveredEpc === p.epc;
                      return (
                        <g
                          key={p.epc}
                          onMouseEnter={() => setHoveredEpc(p.epc)}
                          onMouseLeave={() => setHoveredEpc(null)}
                          style={{ cursor: "pointer" }}
                        >
                          {isHover && (
                            <circle cx={cx} cy={cy} r={14} fill={p.color} fillOpacity={0.25} />
                          )}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={7}
                            fill={p.color}
                            stroke="white"
                            strokeWidth={2}
                          />
                          <circle cx={cx} cy={cy} r={2.5} fill="white" />
                        </g>
                      );
                    })}

                    {hoveredEpc &&
                      (() => {
                        const p = pins.find((x) => x.epc === hoveredEpc);
                        if (!p) return null;
                        const cx = p.x * renderWidth;
                        const cy = p.y * renderHeight;
                        const labelW = Math.max(180, p.epc.length * 7);
                        const tx = Math.min(
                          renderWidth - labelW - 8,
                          Math.max(8, cx - labelW / 2),
                        );
                        const ty = cy - 38 < 8 ? cy + 14 : cy - 38;
                        return (
                          <g pointerEvents="none">
                            <rect
                              x={tx}
                              y={ty}
                              width={labelW}
                              height={28}
                              rx={4}
                              fill="rgba(15,23,42,0.92)"
                            />
                            <text
                              x={tx + 8}
                              y={ty + 18}
                              fill="white"
                              fontSize={12}
                              fontFamily="monospace"
                            >
                              {p.epc}
                            </text>
                          </g>
                        );
                      })()}
                  </svg>
                </div>
              </CardContent>
            </Card>

            {zones.length === 0 && (
              <Card>
                <CardContent className="p-4 text-center text-xs text-muted-foreground">
                  <MapPin className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
                  No locations mapped yet. Use the Edit button to add zones.
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
