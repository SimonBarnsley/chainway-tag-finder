import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Map as MapIcon, ArrowLeft, Pencil, Radio, RefreshCw } from "lucide-react";
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

export const Route = createFileRoute("/$company/maps/$locationId/view")({
  component: MapViewPage,
  head: () => ({
    meta: [
      { title: "Floor Plan — Live RFID Map" },
      { name: "description", content: "Live view of RFID tags plotted on the warehouse floor plan." },
    ],
  }),
});

interface ScanRow {
  id: string;
  epc: string;
  location: string | null;
  last_seen: string;
}

const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // pin "live" if seen in last 5 min

function MapViewPage() {
  return (
    <AuthGuard>
      <Viewer />
    </AuthGuard>
  );
}

function Viewer() {
  const { company, locationId } = Route.useParams();
  const { companySlug } = useAuth();

  const [locationName, setLocationName] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [zones, setZones] = useState<AntennaZone[]>([]);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredEpc, setHoveredEpc] = useState<string | null>(null);

  // Map: location string → matching zones (an antenna's reader_antennas.location is the link)
  const [zoneByLocation, setZoneByLocation] = useState<Map<string, AntennaZone[]>>(new Map());

  const fetchAll = useCallback(async () => {
    if (!companySlug) return;
    setLoading(true);
    try {
      const [locRes, mapRes] = await Promise.all([
        supabase.from("locations").select("name").eq("id", locationId).maybeSingle(),
        supabase
          .from("location_maps")
          .select("id, image_path, image_width, image_height")
          .eq("location_id", locationId)
          .eq("company_slug", companySlug)
          .maybeSingle(),
      ]);
      if (locRes.error) throw locRes.error;
      if (mapRes.error) throw mapRes.error;
      setLocationName(locRes.data?.name ?? "Location");

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

      const [zoneRes, antRes] = await Promise.all([
        supabase.from("antenna_zones").select("*").eq("map_id", mapRes.data.id),
        supabase
          .from("reader_antennas")
          .select("reader_id, antenna_port, location")
          .eq("company_slug", companySlug),
      ]);
      if (zoneRes.error) throw zoneRes.error;
      if (antRes.error) throw antRes.error;

      const zoneList = (zoneRes.data ?? []) as AntennaZone[];
      setZones(zoneList);

      // Build location → zones lookup via reader_antennas
      const antLocByKey = new Map<string, string>();
      for (const a of antRes.data ?? []) {
        antLocByKey.set(`${a.reader_id}::${a.antenna_port}`, a.location);
      }
      const byLoc = new Map<string, AntennaZone[]>();
      for (const z of zoneList) {
        const loc = antLocByKey.get(`${z.reader_id}::${z.antenna_port}`);
        if (!loc) continue;
        const arr = byLoc.get(loc) ?? [];
        arr.push(z);
        byLoc.set(loc, arr);
      }
      setZoneByLocation(byLoc);

      // Fetch recent scans (last 5 min) for this company
      const since = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();
      const { data: sd, error: se } = await supabase
        .from("rfid_scans")
        .select("id, epc, location, last_seen")
        .eq("company_slug", companySlug)
        .gte("last_seen", since)
        .order("last_seen", { ascending: false })
        .limit(500);
      if (se) throw se;
      setScans(sd ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load map");
    } finally {
      setLoading(false);
    }
  }, [companySlug, locationId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime subscription on rfid_scans
  useEffect(() => {
    if (!companySlug) return;
    const channel = supabase
      .channel(`rfid-scans-map-${locationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rfid_scans", filter: `company_slug=eq.${companySlug}` },
        (payload) => {
          const newRow = (payload.new ?? null) as ScanRow | null;
          const oldRow = (payload.old ?? null) as { id?: string } | null;
          setScans((prev) => {
            if (payload.eventType === "DELETE" && oldRow?.id) {
              return prev.filter((s) => s.id !== oldRow.id);
            }
            if (!newRow) return prev;
            const idx = prev.findIndex((s) => s.id === newRow.id);
            if (idx === -1) return [newRow, ...prev].slice(0, 500);
            const next = prev.slice();
            next[idx] = newRow;
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companySlug, locationId]);

  // Sweep stale scans every 30s
  useEffect(() => {
    const t = setInterval(() => {
      const cutoff = Date.now() - ACTIVE_WINDOW_MS;
      setScans((prev) => prev.filter((s) => new Date(s.last_seen).getTime() >= cutoff));
    }, 30000);
    return () => clearInterval(t);
  }, []);

  // Compute pins: for each scan with a location matching a zone, place a jittered point
  const pins = useMemo(() => {
    const out: Array<{
      epc: string;
      x: number;
      y: number;
      color: string;
      zoneId: string;
      lastSeen: string;
    }> = [];
    for (const s of scans) {
      if (!s.location) continue;
      const zs = zoneByLocation.get(s.location);
      if (!zs || zs.length === 0) continue;
      // If multiple zones share the same location, use the first deterministically
      const z = zs[0];
      const shape = parseZoneShape(z);
      const p = jitteredPointForEpc(shape, s.epc);
      out.push({ epc: s.epc, x: p.x, y: p.y, color: z.color, zoneId: z.id, lastSeen: s.last_seen });
    }
    return out;
  }, [scans, zoneByLocation]);

  const renderWidth = 1000;
  const renderHeight = imgDims ? Math.round((imgDims.h / imgDims.w) * renderWidth) : 700;

  // Per-zone pin counts
  const zoneCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pins) m.set(p.zoneId, (m.get(p.zoneId) ?? 0) + 1);
    return m;
  }, [pins]);

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
            <h1 className="text-lg font-bold text-foreground truncate">{locationName} — Live</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={fetchAll}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Link to="/$company/maps/$locationId/edit" params={{ company, locationId }}>
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
              <p className="text-sm text-muted-foreground">No floor plan uploaded for this location yet</p>
              <Link to="/$company/maps/$locationId/edit" params={{ company, locationId }}>
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
                  {pins.length} active pin{pins.length === 1 ? "" : "s"} · {zones.length} zone{zones.length === 1 ? "" : "s"} · last 5 min
                </span>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardContent className="p-0 relative">
                <div className="relative w-full" style={{ aspectRatio: `${renderWidth} / ${renderHeight}` }}>
                  <img
                    src={imageUrl}
                    alt={locationName}
                    className="absolute inset-0 w-full h-full object-contain bg-muted select-none pointer-events-none"
                    draggable={false}
                  />
                  <svg
                    viewBox={`0 0 ${renderWidth} ${renderHeight}`}
                    className="absolute inset-0 w-full h-full"
                  >
                    {/* Zones */}
                    {zones.map((z) => {
                      const shape = parseZoneShape(z);
                      const c = zoneCenter(shape);
                      const count = zoneCounts.get(z.id) ?? 0;
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
                              points={polygonPointsAttr(shape.points, renderWidth, renderHeight)}
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
                            A{z.antenna_port}
                            {z.label ? ` · ${z.label}` : ""}
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

                    {/* Pins */}
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
                          <circle cx={cx} cy={cy} r={7} fill={p.color} stroke="white" strokeWidth={2} />
                          <circle cx={cx} cy={cy} r={2.5} fill="white" />
                        </g>
                      );
                    })}

                    {/* Hover tooltip */}
                    {hoveredEpc && (() => {
                      const p = pins.find((x) => x.epc === hoveredEpc);
                      if (!p) return null;
                      const cx = p.x * renderWidth;
                      const cy = p.y * renderHeight;
                      const labelW = Math.max(180, p.epc.length * 7);
                      const tx = Math.min(renderWidth - labelW - 8, Math.max(8, cx - labelW / 2));
                      const ty = cy - 38 < 8 ? cy + 14 : cy - 38;
                      return (
                        <g pointerEvents="none">
                          <rect x={tx} y={ty} width={labelW} height={28} rx={4} fill="rgba(15,23,42,0.92)" />
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

            {/* Empty state hint */}
            {zones.length === 0 && (
              <Card>
                <CardContent className="p-4 text-center text-xs text-muted-foreground">
                  <Radio className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
                  No antenna zones drawn yet. Use the Edit button to add some.
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
