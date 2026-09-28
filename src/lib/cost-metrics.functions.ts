import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DailyCost {
  bucket: string; // YYYY-MM-DD
  scans: number;
  debugLogs: number;
  costGbp: number;
}

export interface CostMetrics {
  scansLast1h: number;
  scansLast24h: number;
  scansLast7d: number;
  debugLogsLast24h: number;
  debugLogsTotal: number;
  scanVolumeByHour: { bucket: string; count: number }[];
  debugLogsByDay: { bucket: string; count: number }[];
  dailyCosts: DailyCost[];
  estimatedCostTodayGbp: number;
  estimatedCost7dGbp: number;
  tables: { name: string; rows: number; sizeBytes: number; sizePretty: string }[];
  dbSizeBytes: number;
  dbSizePretty: string;
  generatedAt: string;
}

// Rough Lovable Cloud unit costs (GBP), used for the estimate only.
// ~£0.000002 per scan row write/read, ~£0.000001 per debug log row.
const COST_PER_SCAN_GBP = 0.000002;
const COST_PER_DEBUG_LOG_GBP = 0.000001;

export const getCostMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CostMetrics> => {
    // Verify admin
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    if (!roleSet.has("admin") && !roleSet.has("super_admin")) {
      throw new Error("Forbidden");
    }

    const now = new Date();
    const h1 = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      scansHead1h,
      scansHead24h,
      scansHead7d,
      debugHead24h,
      debugHeadTotal,
      scanRowsRes,
    ] = await Promise.all([
      supabaseAdmin.from("rfid_scans").select("*", { count: "exact", head: true }).gte("last_seen", h1),
      supabaseAdmin.from("rfid_scans").select("*", { count: "exact", head: true }).gte("last_seen", h24),
      supabaseAdmin.from("rfid_scans").select("*", { count: "exact", head: true }).gte("last_seen", d7),
      supabaseAdmin.from("zebra_reader_debug_logs").select("*", { count: "exact", head: true }).gte("created_at", h24),
      supabaseAdmin.from("zebra_reader_debug_logs").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("rfid_scans")
        .select("last_seen")
        .gte("last_seen", h24)
        .order("last_seen", { ascending: false })
        .limit(10000),
    ]);

    // Compute hourly bucket from the fetched scan rows
    const scanVolumeByHour: { bucket: string; count: number }[] = [];
    const hourMap = new Map<string, number>();
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      d.setMinutes(0, 0, 0);
      const key = d.toISOString();
      hourMap.set(key, 0);
    }
    const scanRows = (scanRowsRes.data ?? []) as { last_seen: string }[];
    for (const row of scanRows) {
      const d = new Date(row.last_seen);
      d.setMinutes(0, 0, 0);
      const key = d.toISOString();
      if (hourMap.has(key)) hourMap.set(key, (hourMap.get(key) || 0) + 1);
    }
    for (const [bucket, count] of hourMap.entries()) {
      scanVolumeByHour.push({ bucket, count });
    }

    // Debug logs by day (last 7d)
    const { data: debugRows } = await supabaseAdmin
      .from("zebra_reader_debug_logs")
      .select("created_at")
      .gte("created_at", d7)
      .limit(10000);
    const dayMap = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      d.setUTCHours(0, 0, 0, 0);
      dayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of (debugRows ?? []) as { created_at: string }[]) {
      const k = r.created_at.slice(0, 10);
      if (dayMap.has(k)) dayMap.set(k, (dayMap.get(k) || 0) + 1);
    }
    const debugLogsByDay = Array.from(dayMap.entries()).map(([bucket, count]) => ({ bucket, count }));

    // Table sizes — count rows per main table
    const tableNames = [
      "rfid_scans",
      "zebra_reader_debug_logs",
      "items",
      "tag_items",
      "locations",
      "fixed_readers",
      "antenna_zones",
      "location_maps",
      "email_send_log",
      "profiles",
    ];
    const tableCounts = await Promise.all(
      tableNames.map(async (name) => {
        const { count } = await supabaseAdmin.from(name as never).select("*", { count: "exact", head: true });
        return { name, rows: count ?? 0, sizeBytes: 0, sizePretty: "—" };
      })
    );

    return {
      scansLast1h: scansHead1h.count ?? 0,
      scansLast24h: scansHead24h.count ?? 0,
      scansLast7d: scansHead7d.count ?? 0,
      debugLogsLast24h: debugHead24h.count ?? 0,
      debugLogsTotal: debugHeadTotal.count ?? 0,
      scanVolumeByHour,
      debugLogsByDay,
      tables: tableCounts.sort((a, b) => b.rows - a.rows),
      dbSizeBytes: 0,
      dbSizePretty: "—",
      generatedAt: now.toISOString(),
    };
  });
