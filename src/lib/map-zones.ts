// Shared types and helpers for floor-plan maps + antenna zones.

export type RectShape = { kind: "rect"; x: number; y: number; w: number; h: number };
export type PolygonShape = { kind: "polygon"; points: Array<{ x: number; y: number }> };
export type ZoneShape = RectShape | PolygonShape;

export interface AntennaZone {
  id: string;
  map_id: string;
  // Legacy antenna-based zones (kept for backward compat in types)
  reader_id: string | null;
  antenna_port: number | null;
  // New: location-based zones for the company-wide map
  location_id: string | null;
  shape_kind: "rect" | "polygon";
  shape_data: unknown;
  label: string | null;
  color: string;
  capacity?: number | null;
  max_capacity?: number | null;
}

/**
 * Color from green (0%) → yellow (50%) → red (100%) for capacity fill.
 */
export function capacityColor(capacity: number): string {
  const c = Math.max(0, Math.min(100, capacity));
  let r: number, g: number, b: number;
  if (c <= 50) {
    const t = c / 50;
    r = Math.round(16 + (245 - 16) * t);
    g = Math.round(185 + (158 - 185) * t);
    b = Math.round(129 + (11 - 129) * t);
  } else {
    const t = (c - 50) / 50;
    r = Math.round(245 + (239 - 245) * t);
    g = Math.round(158 + (68 - 158) * t);
    b = Math.round(11 + (68 - 11) * t);
  }
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export interface LocationMap {
  id: string;
  location_id: string | null;
  image_path: string;
  image_width: number;
  image_height: number;
}

/** Pretty palette for distinguishing zones */
export const ZONE_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
];

export function colorForIndex(i: number): string {
  return ZONE_COLORS[i % ZONE_COLORS.length];
}

/** Returns axis-aligned bounding box (in normalized 0-1) for any zone shape. */
export function zoneBounds(shape: ZoneShape): { x: number; y: number; w: number; h: number } {
  if (shape.kind === "rect") {
    return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  }
  const xs = shape.points.map((p) => p.x);
  const ys = shape.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Centroid of a zone in normalized 0-1 coords. */
export function zoneCenter(shape: ZoneShape): { x: number; y: number } {
  if (shape.kind === "rect") {
    return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 };
  }
  const sx = shape.points.reduce((a, p) => a + p.x, 0) / shape.points.length;
  const sy = shape.points.reduce((a, p) => a + p.y, 0) / shape.points.length;
  return { x: sx, y: sy };
}

/** Point-in-polygon (ray casting). All coords normalized 0-1. */
export function pointInPolygon(point: { x: number; y: number }, points: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Deterministic jittered point inside a zone for a given EPC.
 * Same EPC always lands in the same spot so pins don't dance.
 */
export function jitteredPointForEpc(shape: ZoneShape, epc: string): { x: number; y: number } {
  // Hash EPC -> two pseudo-random floats in [0,1)
  let h1 = 2166136261;
  let h2 = 5381;
  for (let i = 0; i < epc.length; i++) {
    const c = epc.charCodeAt(i);
    h1 = ((h1 ^ c) * 16777619) >>> 0;
    h2 = (((h2 << 5) + h2) ^ c) >>> 0;
  }
  const r1 = (h1 % 10000) / 10000;
  const r2 = (h2 % 10000) / 10000;

  if (shape.kind === "rect") {
    // inset 8% so pins don't sit on the edge
    const pad = 0.08;
    return {
      x: shape.x + (pad + r1 * (1 - 2 * pad)) * shape.w,
      y: shape.y + (pad + r2 * (1 - 2 * pad)) * shape.h,
    };
  }

  // For polygons, sample within bbox until we hit inside (max 25 tries)
  const bb = zoneBounds(shape);
  let rx = r1;
  let ry = r2;
  for (let i = 0; i < 25; i++) {
    const cand = { x: bb.x + rx * bb.w, y: bb.y + ry * bb.h };
    if (pointInPolygon(cand, shape.points)) return cand;
    // Re-mix
    rx = (rx * 9301 + 49297) % 1;
    ry = (ry * 4096 + 233280) % 1;
    rx = rx - Math.floor(rx);
    ry = ry - Math.floor(ry);
  }
  return zoneCenter(shape);
}

export function parseZoneShape(zone: AntennaZone): ZoneShape {
  if (zone.shape_kind === "rect") {
    const d = zone.shape_data as { x: number; y: number; w: number; h: number };
    return { kind: "rect", x: d.x, y: d.y, w: d.w, h: d.h };
  }
  const d = zone.shape_data as { points: Array<{ x: number; y: number }> };
  return { kind: "polygon", points: d.points };
}

/** Turn a polygon's normalized points into an SVG polygon `points` attribute string. */
export function polygonPointsAttr(
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number,
): string {
  return points.map((p) => `${(p.x * width).toFixed(2)},${(p.y * height).toFixed(2)}`).join(" ");
}
