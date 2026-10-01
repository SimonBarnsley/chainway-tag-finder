import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Map as MapIcon,
  Upload,
  Square,
  Hexagon,
  X,
  ArrowLeft,
  Eye,
  Trash2,
  Wand2,
  MapPin,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  type AntennaZone,
  type ZoneShape,
  parseZoneShape,
  polygonPointsAttr,
  zoneCenter,
  colorForIndex,
  capacityColor,
} from "@/lib/map-zones";

export const Route = createFileRoute("/$company/maps/edit")({
  component: EditPage,
  head: () => ({
    meta: [
      { title: "Edit Company Floor Plan — RFID Zone Editor" },
      {
        name: "description",
        content: "Upload your company floor plan and draw a zone for each location.",
      },
    ],
  }),
});

interface LocationOption {
  id: string;
  name: string;
}

type DraftRect = { kind: "rect"; x: number; y: number; w: number; h: number };
type DraftPoly = { kind: "polygon"; points: Array<{ x: number; y: number }> };
type Draft = DraftRect | DraftPoly | null;

function EditPage() {
  return (
    <AuthGuard adminOnly>
      <Editor />
    </AuthGuard>
  );
}

function Editor() {
  const { company } = Route.useParams();
  const { companySlug } = useAuth();

  const [mapId, setMapId] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);

  const [zones, setZones] = useState<AntennaZone[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);

  const [tool, setTool] = useState<"rect" | "polygon" | null>(null);
  const [draft, setDraft] = useState<Draft>(null);
  const [draftStart, setDraftStart] = useState<{ x: number; y: number } | null>(null);
  const [pendingShape, setPendingShape] = useState<ZoneShape | null>(null);
  const [pendingLocationId, setPendingLocationId] = useState<string>("");
  const [pendingLabel, setPendingLabel] = useState("");

  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const fileRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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
          .eq("company_slug", companySlug)
          .order("name"),
      ]);
      if (mapRes.error) throw mapRes.error;
      if (locRes.error) throw locRes.error;

      // Bring reader antenna locations into the managed location list so they
      // can be picked for zones.
      let locList = locRes.data ?? [];
      const { data: antData } = await supabase
        .from("reader_antennas")
        .select("location")
        .eq("company_slug", companySlug);
      const known = new Set(locList.map((l) => l.name.trim().toLowerCase()));
      const missing = Array.from(
        new Set(
          (antData ?? [])
            .map((a) => a.location?.trim())
            .filter((v): v is string => !!v && !known.has(v.toLowerCase())),
        ),
      );
      if (missing.length > 0) {
        const { data: inserted, error: insErr } = await supabase
          .from("locations")
          .insert(missing.map((name) => ({ name, company_slug: companySlug })))
          .select("id, name");
        if (!insErr && inserted) {
          locList = [...locList, ...inserted].sort((a, b) => a.name.localeCompare(b.name));
        }
      }

      setLocations(locList);

      let activeMapId: string | null = null;
      if (mapRes.data) {
        activeMapId = mapRes.data.id;
        setMapId(mapRes.data.id);
        setImagePath(mapRes.data.image_path);
        setImgDims({ w: mapRes.data.image_width, h: mapRes.data.image_height });
        const { data: pub } = supabase.storage
          .from("location-maps")
          .getPublicUrl(mapRes.data.image_path);
        setImageUrl(pub.publicUrl);
      } else {
        setMapId(null);
        setImagePath(null);
        setImgDims(null);
        setImageUrl(null);
      }

      if (activeMapId) {
        const { data: zd, error: ze } = await supabase
          .from("antenna_zones")
          .select("*")
          .eq("map_id", activeMapId)
          .not("location_id", "is", null);
        if (ze) throw ze;
        setZones((zd ?? []) as AntennaZone[]);
      } else {
        setZones([]);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [companySlug]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleUpload = async (file: File) => {
    if (!companySlug) return;
    setUploading(true);
    try {
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => reject(new Error("Could not read image"));
        img.src = URL.createObjectURL(file);
      });

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${companySlug}/company-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("location-maps")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      if (mapId) {
        const oldPath = imagePath;
        const { error: updErr } = await supabase
          .from("location_maps")
          .update({ image_path: path, image_width: dims.w, image_height: dims.h })
          .eq("id", mapId);
        if (updErr) throw updErr;
        if (oldPath && oldPath !== path) {
          await supabase.storage.from("location-maps").remove([oldPath]);
        }
      } else {
        const { error: insErr } = await supabase.from("location_maps").insert({
          company_slug: companySlug,
          location_id: null,
          image_path: path,
          image_width: dims.w,
          image_height: dims.h,
        });
        if (insErr) throw insErr;
      }

      toast.success("Floor plan uploaded");
      fetchAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const eventToNormalized = (
    e: React.MouseEvent<SVGSVGElement>,
  ): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  };

  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!tool || pendingShape) return;
    const p = eventToNormalized(e);
    if (!p) return;
    if (tool === "rect") {
      setDraftStart(p);
      setDraft({ kind: "rect", x: p.x, y: p.y, w: 0, h: 0 });
    } else {
      if (!draft || draft.kind !== "polygon") {
        setDraft({ kind: "polygon", points: [p] });
      } else {
        setDraft({ kind: "polygon", points: [...draft.points, p] });
      }
    }
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!draft) return;
    if (draft.kind !== "rect" || !draftStart) return;
    const p = eventToNormalized(e);
    if (!p) return;
    setDraft({
      kind: "rect",
      x: Math.min(draftStart.x, p.x),
      y: Math.min(draftStart.y, p.y),
      w: Math.abs(p.x - draftStart.x),
      h: Math.abs(p.y - draftStart.y),
    });
  };

  const handleSvgMouseUp = () => {
    if (!draft) return;
    if (draft.kind === "rect") {
      if (draft.w < 0.01 || draft.h < 0.01) {
        setDraft(null);
        setDraftStart(null);
        return;
      }
      setPendingShape(draft);
      setDraft(null);
      setDraftStart(null);
    }
  };

  const finishPolygon = () => {
    if (!draft || draft.kind !== "polygon") return;
    if (draft.points.length < 3) {
      toast.error("Polygon needs at least 3 points");
      return;
    }
    setPendingShape(draft);
    setDraft(null);
  };

  const cancelDraw = () => {
    setDraft(null);
    setDraftStart(null);
    setPendingShape(null);
    setPendingLocationId("");
    setPendingLabel("");
    setTool(null);
  };

  const handleSaveZone = async () => {
    if (!pendingShape || !companySlug || !mapId) return;
    if (!pendingLocationId) {
      toast.error("Pick a location first");
      return;
    }
    if (zones.some((z) => z.location_id === pendingLocationId)) {
      toast.error("That location already has a zone on this map");
      return;
    }

    const shape_data =
      pendingShape.kind === "rect"
        ? { x: pendingShape.x, y: pendingShape.y, w: pendingShape.w, h: pendingShape.h }
        : { points: pendingShape.points };

    const color = colorForIndex(zones.length);

    try {
      const { error } = await supabase.from("antenna_zones").insert({
        company_slug: companySlug,
        map_id: mapId,
        location_id: pendingLocationId,
        reader_id: null,
        antenna_port: null,
        shape_kind: pendingShape.kind,
        shape_data,
        label: pendingLabel.trim() || null,
        color,
      });
      if (error) throw error;
      toast.success("Location zone saved");
      cancelDraw();
      fetchAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save zone");
    }
  };

  const handleAutoCreateZones = async () => {
    if (!companySlug || !mapId) return;
    if (locations.length === 0) {
      toast.error("No locations yet — add them on the Locations page first.");
      return;
    }

    const existing = new Set(zones.map((z) => z.location_id));
    const toCreate = locations.filter((l) => !existing.has(l.id));
    if (toCreate.length === 0) {
      toast.info("Every location already has a zone on this map");
      return;
    }

    const cols = 4;
    const cellW = 0.22;
    const cellH = 0.22;
    const gapX = (1 - cols * cellW) / (cols + 1);
    const gapY = 0.04;
    const startIndex = zones.length;

    const rows = toCreate.map((l, i) => {
      const idx = startIndex + i;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gapX + col * (cellW + gapX);
      const y = Math.min(0.9 - cellH, gapY + row * (cellH + gapY));
      return {
        company_slug: companySlug,
        map_id: mapId,
        location_id: l.id,
        reader_id: null,
        antenna_port: null,
        shape_kind: "rect",
        shape_data: { x, y, w: cellW, h: cellH },
        label: l.name,
        color: colorForIndex(idx),
      };
    });

    try {
      const { error } = await supabase.from("antenna_zones").insert(rows);
      if (error) throw error;
      toast.success(
        `Created ${rows.length} zone${rows.length === 1 ? "" : "s"} (drag to reposition them on the map)`,
      );
      fetchAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to auto-create zones");
    }
  };

  const handleDeleteZone = async (id: string) => {
    try {
      const { error } = await supabase.from("antenna_zones").delete().eq("id", id);
      if (error) throw error;
      toast.success("Zone deleted");
      fetchAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };


  const handleMaxCapacityChange = (id: string, max_capacity: number) => {
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, max_capacity } : z)));
  };

  const handleMaxCapacityCommit = async (id: string, max_capacity: number) => {
    try {
      const { error } = await supabase
        .from("antenna_zones")
        .update({ max_capacity })
        .eq("id", id);
      if (error) throw error;
      toast.success("Max capacity updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update max capacity");
      fetchAll();
    }
  };

  const renderWidth = 1000;
  const renderHeight = imgDims ? Math.round((imgDims.h / imgDims.w) * renderWidth) : 700;

  const locationNameById = new Map(locations.map((l) => [l.id, l.name]));
  const availableLocations = locations.filter(
    (l) => !zones.some((z) => z.location_id === l.id),
  );

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
              Company Floor Plan — Edit
            </h1>
          </div>
          {mapId && (
            <Link to="/$company/maps/view" params={{ company }}>
              <Button variant="outline" size="sm" className="h-8 gap-1">
                <Eye className="h-3.5 w-3.5" /> Live View
              </Button>
            </Link>
          )}
        </div>

        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center shrink-0">
              <Upload className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {imageUrl ? "Replace company floor plan" : "Upload company floor plan"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {imageUrl
                  ? "Uploading a new file replaces the current map. Existing zones are kept."
                  : "JPG, PNG or WebP. Recommended: a top-down plan covering all locations."}
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              size="sm"
              className="gap-1 shrink-0"
            >
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : imageUrl ? "Replace" : "Upload Map"}
            </Button>
          </CardContent>
        </Card>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !imageUrl ? (
          <Card>
            <CardContent className="p-6 text-center space-y-2">
              <MapIcon className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">No floor plan uploaded yet</p>
              <p className="text-xs text-muted-foreground">
                Use the <span className="font-semibold text-foreground">Upload Map</span> button
                above to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="p-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground mr-1">Draw:</span>
                <Button
                  size="sm"
                  variant={tool === "rect" ? "default" : "outline"}
                  className="h-8 gap-1"
                  onClick={() => {
                    setTool(tool === "rect" ? null : "rect");
                    setDraft(null);
                    setDraftStart(null);
                  }}
                >
                  <Square className="h-3.5 w-3.5" /> Rectangle
                </Button>
                <Button
                  size="sm"
                  variant={tool === "polygon" ? "default" : "outline"}
                  className="h-8 gap-1"
                  onClick={() => {
                    setTool(tool === "polygon" ? null : "polygon");
                    setDraft(null);
                    setDraftStart(null);
                  }}
                >
                  <Hexagon className="h-3.5 w-3.5" /> Polygon
                </Button>
                {tool === "polygon" && draft?.kind === "polygon" && (
                  <Button size="sm" variant="secondary" className="h-8" onClick={finishPolygon}>
                    Finish polygon ({draft.points.length} pts)
                  </Button>
                )}
                <span className="ml-auto" />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1"
                  onClick={handleAutoCreateZones}
                  disabled={availableLocations.length === 0}
                  title="Drop a default rectangle for every location not yet on the map"
                >
                  <Wand2 className="h-3.5 w-3.5" /> Auto-create zones
                </Button>
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
                    ref={svgRef}
                    viewBox={`0 0 ${renderWidth} ${renderHeight}`}
                    className="absolute inset-0 w-full h-full"
                    onMouseDown={handleSvgMouseDown}
                    onMouseMove={handleSvgMouseMove}
                    onMouseUp={handleSvgMouseUp}
                    style={{ cursor: tool ? "crosshair" : "default" }}
                  >
                    {/* Saved zones */}
                    {zones.map((z) => {
                      const shape = parseZoneShape(z);
                      const c = zoneCenter(shape);
                      const name = z.location_id
                        ? locationNameById.get(z.location_id) ?? z.label ?? "Location"
                        : z.label ?? "Zone";
                      const cap = 0;
                      const fill = capacityColor(cap);
                      return (
                        <g key={z.id}>
                          {shape.kind === "rect" ? (
                            <rect
                              x={shape.x * renderWidth}
                              y={shape.y * renderHeight}
                              width={shape.w * renderWidth}
                              height={shape.h * renderHeight}
                              fill={fill}
                              fillOpacity={0.45}
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
                              fill={fill}
                              fillOpacity={0.45}
                              stroke={z.color}
                              strokeWidth={2}
                            />
                          )}
                          <text
                            x={c.x * renderWidth}
                            y={c.y * renderHeight}
                            fill={z.color}
                            stroke="white"
                            strokeWidth={3}
                            paintOrder="stroke"
                            fontSize={16}
                            fontWeight={700}
                            textAnchor="middle"
                          >
                            {cap}%
                          </text>
                        </g>
                      );
                    })}

                    {/* Draft */}
                    {draft && draft.kind === "rect" && (
                      <rect
                        x={draft.x * renderWidth}
                        y={draft.y * renderHeight}
                        width={draft.w * renderWidth}
                        height={draft.h * renderHeight}
                        fill="#3b82f6"
                        fillOpacity={0.2}
                        stroke="#3b82f6"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                      />
                    )}
                    {draft && draft.kind === "polygon" && draft.points.length > 0 && (
                      <>
                        {draft.points.length >= 2 && (
                          <polyline
                            points={polygonPointsAttr(
                              draft.points,
                              renderWidth,
                              renderHeight,
                            )}
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            strokeDasharray="6 4"
                          />
                        )}
                        {draft.points.map((p, i) => (
                          <circle
                            key={i}
                            cx={p.x * renderWidth}
                            cy={p.y * renderHeight}
                            r={4}
                            fill="#3b82f6"
                          />
                        ))}
                      </>
                    )}

                    {/* Pending preview */}
                    {pendingShape && pendingShape.kind === "rect" && (
                      <rect
                        x={pendingShape.x * renderWidth}
                        y={pendingShape.y * renderHeight}
                        width={pendingShape.w * renderWidth}
                        height={pendingShape.h * renderHeight}
                        fill="#f59e0b"
                        fillOpacity={0.25}
                        stroke="#f59e0b"
                        strokeWidth={2}
                      />
                    )}
                    {pendingShape && pendingShape.kind === "polygon" && (
                      <polygon
                        points={polygonPointsAttr(
                          pendingShape.points,
                          renderWidth,
                          renderHeight,
                        )}
                        fill="#f59e0b"
                        fillOpacity={0.25}
                        stroke="#f59e0b"
                        strokeWidth={2}
                      />
                    )}
                  </svg>
                </div>
              </CardContent>
            </Card>

            {pendingShape && (
              <Card className="border-amber-500/40">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-amber-500" />
                    <p className="text-sm font-semibold">Assign this zone to a location</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-7 w-7 p-0"
                      onClick={cancelDraw}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Select
                      value={pendingLocationId}
                      onValueChange={setPendingLocationId}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Pick a location…" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableLocations.length === 0 ? (
                          <div className="px-2 py-2 text-xs text-muted-foreground">
                            All locations already have zones
                          </div>
                        ) : (
                          availableLocations.map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Optional label (defaults to location name)"
                      value={pendingLabel}
                      onChange={(e) => setPendingLabel(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={cancelDraw}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveZone}>
                      Save zone
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  Mapped locations ({zones.length} of {locations.length})
                </p>
                {zones.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Pick a draw tool above and outline each location on the map.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {zones.map((z) => {
                      const name = z.location_id
                        ? locationNameById.get(z.location_id) ?? "Unknown"
                        : "Unassigned";
                      return (
                        <li key={z.id} className="py-2 text-sm space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 rounded-sm shrink-0"
                              style={{ backgroundColor: z.color }}
                            />
                            <span className="font-medium truncate flex-1">{name}</span>
                            {z.label && (
                              <span className="text-xs text-muted-foreground truncate italic">
                                {z.label}
                              </span>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteZone(z.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-3 pl-5">
                            <span className="text-xs text-muted-foreground w-16 shrink-0">
                              Max units
                            </span>
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              value={z.max_capacity ? String(z.max_capacity) : ""}
                              placeholder="0"
                              onChange={(e) => {
                                const v = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value) || 0);
                                handleMaxCapacityChange(z.id, v);
                              }}
                              onBlur={(e) =>
                                handleMaxCapacityCommit(z.id, Math.max(0, Number(e.target.value) || 0))
                              }
                              className="h-8 w-28"
                            />
                            <span className="text-xs text-muted-foreground">
                              {(z.max_capacity ?? 0) === 0 ? "no limit" : "items max"}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
