import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/AuthGuard";
import { AppHeader } from "@/components/AppHeader";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCostMetrics, type CostMetrics } from "@/lib/cost-metrics.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, DollarSign, Database, Activity, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/$company/cost-dashboard")({
  component: () => (
    <AuthGuard adminOnly>
      <CostDashboard />
    </AuthGuard>
  ),
  head: () => ({
    meta: [
      { title: "Cloud Cost Dashboard" },
      { name: "description", content: "Live monitoring of scan volume and database growth" },
    ],
  }),
});

function CostDashboard() {
  const { company } = Route.useParams();
  const fetchMetrics = useServerFn(getCostMetrics);
  const [data, setData] = useState<CostMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetchMetrics({
        data: { companySlug: company },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [fetchMetrics, company]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [auto, load]);

  const fmt = (n: number) => n.toLocaleString();
  const fmtGbp = (n: number) =>
    n < 0.01 && n > 0 ? `< £0.01` : `£${n.toFixed(2)}`;
  const fmtHour = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit" });
  const fmtDay = (s: string) => s.slice(5);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Cloud Cost Dashboard</h1>
            <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5">
              {company}
            </span>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setAuto(!auto)} size="sm" variant={auto ? "default" : "outline"}>
              <Activity className="h-3.5 w-3.5 mr-1.5" />
              {auto ? "Live (30s)" : "Auto refresh"}
            </Button>
            <Button onClick={load} size="sm" variant="outline" disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {!data ? (
          <div className="text-center py-12 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
            Loading metrics…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label="Scans · last 1h" value={fmt(data.scansLast1h)} hint="Updated rfid_scans rows" />
              <MetricCard
                label="Scans · last 24h"
                value={fmt(data.scansLast24h)}
                hint="Watch for abnormal spikes"
                warn={data.scansLast24h > 50000}
              />
              <MetricCard
                label="Est. cost · today"
                value={fmtGbp(data.estimatedCostTodayGbp)}
                hint="Approximate, from usage"
              />
              <MetricCard
                label="Est. cost · last 7d"
                value={fmtGbp(data.estimatedCost7dGbp)}
                hint="Approximate, from usage"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label="Scans · last 7d" value={fmt(data.scansLast7d)} />
              <MetricCard
                label="Debug logs · 24h"
                value={fmt(data.debugLogsLast24h)}
                hint={`${fmt(data.debugLogsTotal)} total stored`}
                warn={data.debugLogsLast24h > 1000}
              />
            </div>

            <CostSimulator />

            <MonthlyBillingBreakdown data={data} />

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Estimated daily cost — last 7d (GBP)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.dailyCosts}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="bucket" tickFormatter={fmtDay} className="text-xs" />
                      <YAxis
                        className="text-xs"
                        tickFormatter={(v: number) => `£${v.toFixed(3)}`}
                      />
                      <Tooltip
                        formatter={(value) => [`£${Number(value).toFixed(4)}`, "Est. cost"]}
                        labelFormatter={(v) => String(v)}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                      />
                      <Bar dataKey="costGbp" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Estimate only, based on scan and log volume. Your exact charges are shown in
                  Settings → Plans &amp; credits.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Scan request volume — last 24h (hourly)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.scanVolumeByHour}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="bucket" tickFormatter={fmtHour} className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip
                        labelFormatter={(v) => new Date(v as string).toLocaleString()}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Database className="h-4 w-4" /> Debug log growth — last 7d (daily)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.debugLogsByDay}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="bucket" tickFormatter={fmtDay} className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                      <Bar dataKey="count" fill="hsl(var(--destructive))" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Auto-cleanup runs daily; only anomalies are logged. Steady growth here means the handler
                  is hitting parse errors or zero-tag payloads.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Database className="h-4 w-4" /> Table row counts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="text-left py-2 font-medium">Table</th>
                        <th className="text-right py-2 font-medium">Rows</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.tables.map((t) => (
                        <tr key={t.name} className="border-b border-border/40">
                          <td className="py-2 font-mono text-xs">{t.name}</td>
                          <td className="py-2 text-right tabular-nums">
                            {fmt(t.rows)}
                            {t.name === "zebra_reader_debug_logs" && t.rows > 100000 && (
                              <AlertTriangle className="inline-block h-3.5 w-3.5 text-destructive ml-2" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-right">
              Generated {new Date(data.generatedAt).toLocaleString()}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <Card className={warn ? "border-destructive/50" : ""}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold tabular-nums mt-1 ${warn ? "text-destructive" : ""}`}>
          {value}
        </p>
        {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// Simulation only — nothing is saved. Uses the same unit rates as the live estimate.
const SIM_COST_PER_SCAN_GBP = 0.000002;
const SIM_COST_PER_DEBUG_LOG_GBP = 0.000001;
// Storage assumptions for the simulator's item count.
const ITEM_ROW_KB = 1; // one row in the items table
const ITEM_PHOTO_KB = 300; // one stored photo per item
const STORAGE_GBP_PER_GB_MONTH = 0.12; // assumed rate — Lovable does not publish per-unit storage rates
// Reader overhead: each fixed reader posts batches (plus quiet status posts) during
// working hours — roughly one post a minute, 7am–6pm. Small per-request overhead.
const READER_POSTS_PER_DAY = 660;
const SIM_COST_PER_READER_POST_GBP = 0.000001;
// A location or zone is one small row (~1 KB) in the database.
const LOC_ZONE_ROW_KB = 1;

function CostSimulator() {
  const [scansPerDay, setScansPerDay] = useState(1000);
  const [logsPerScan, setLogsPerScan] = useState(0.1);
  const [itemCount, setItemCount] = useState(500);
  const scanDaily = scansPerDay * SIM_COST_PER_SCAN_GBP + scansPerDay * logsPerScan * SIM_COST_PER_DEBUG_LOG_GBP;
  // Items add stored data: one item row (~1 KB) plus one photo (~300 KB) per item.
  const itemStorageGb = (itemCount * (ITEM_ROW_KB + ITEM_PHOTO_KB)) / (1024 * 1024);
  const itemStorageDaily = itemStorageGb * STORAGE_GBP_PER_GB_MONTH / 30;
  const daily = scanDaily + itemStorageDaily;
  const gbp = (v: number) => `£${v < 1 ? v.toFixed(4) : v.toFixed(2)}`;
  const hours = Array.from({ length: 24 }, (_, h) => ({ h, weight: h >= 7 && h < 18 ? 3 : 0.5 }));
  const totalW = hours.reduce((s, x) => s + x.weight, 0);
  const chart = hours.map(({ h, weight }) => ({
    hour: `${String(h).padStart(2, "0")}:00`,
    scans: Math.round((scansPerDay * weight) / totalW),
  }));
  const scanOnlyMonthly = scanDaily * 30;
  const withItemsMonthly = daily * 30;
  const scanOnlyYearly = scanDaily * 365;
  const withItemsYearly = daily * 365;
  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4" /> Live system simulator (preview only — no data saved)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex flex-col gap-1">
            Scans per day
            <input type="number" min={0} value={scansPerDay}
              onChange={(e) => setScansPerDay(Math.max(0, Number(e.target.value) || 0))}
              className="h-9 w-36 rounded-md border border-input bg-background px-2" />
          </label>
          <label className="flex flex-col gap-1">
            Debug logs per scan
            <input type="number" min={0} step={0.1} value={logsPerScan}
              onChange={(e) => setLogsPerScan(Math.max(0, Number(e.target.value) || 0))}
              className="h-9 w-36 rounded-md border border-input bg-background px-2" />
          </label>
          <label className="flex flex-col gap-1">
            Number of items
            <input type="number" min={0} value={itemCount}
              onChange={(e) => setItemCount(Math.max(0, Number(e.target.value) || 0))}
              className="h-9 w-36 rounded-md border border-input bg-background px-2" />
          </label>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <MetricCard label="Sim. scans · 1 day" value={scansPerDay.toLocaleString()} />
          <MetricCard label="Sim. items" value={itemCount.toLocaleString()} hint={`${itemStorageGb.toFixed(2)} GB stored (rows + photos)`} />
          <MetricCard label="Sim. cost · per day" value={gbp(daily)} hint={`Scans ${gbp(scanDaily)} + storage ${gbp(itemStorageDaily)}`} />
          <MetricCard label="Sim. cost · per month" value={gbp(withItemsMonthly)}
            hint={withItemsMonthly > scanOnlyMonthly ? `+${gbp(withItemsMonthly - scanOnlyMonthly)} from items` : "Scans only"} />
          <MetricCard label="Sim. cost · per year" value={gbp(withItemsYearly)}
            hint={withItemsYearly > scanOnlyYearly ? `+${gbp(withItemsYearly - scanOnlyYearly)} from items` : "Scans only"} />
          <MetricCard label="Scans only · per month" value={gbp(scanOnlyMonthly)} hint="Without items, for comparison" />
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => [v, "Scans"]} />
              <Bar dataKey="scans" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground">
          Estimate of database work for scans plus storage for items (one row of ~1 KB and one photo of ~300 KB
          per item, at an assumed {`£${STORAGE_GBP_PER_GB_MONTH.toFixed(2)}`} per GB per month). Increasing the item
          count changes the monthly and yearly figures only through storage — scan cost stays the same unless
          scans per day also rise. Your plan's base hosting charge and AI usage are extra — see Settings → Plans &amp; credits.
        </p>
      </CardContent>
    </Card>
  );
}

// 1-month projection across every Lovable Cloud billing element.
// Elements we can measure (database work from scan/log volume) use the same
// unit rates as the live estimate. Elements billed by plan/instance size are
// shown as plan-based, since Lovable does not publish per-unit rates for them.
function MonthlyBillingBreakdown({ data }: { data: CostMetrics }) {
  const scansPerMonth = (data.scansLast7d / 7) * 30;
  const logsPerMonth = (data.debugLogsLast24h || 0) * 30;
  const dbWorkGbp = scansPerMonth * SIM_COST_PER_SCAN_GBP + logsPerMonth * SIM_COST_PER_DEBUG_LOG_GBP;

  const scanRows = data.tables.find((t) => t.name === "rfid_scans")?.rows ?? 0;
  const logRows = data.tables.find((t) => t.name === "zebra_reader_debug_logs")?.rows ?? 0;
  // ~1 KB per scan row, ~0.5 KB per log row → database storage in MB
  const dbStorageMb = (scanRows * 1 + logRows * 0.5) / 1024;

  const gbp = (v: number) => (v < 0.01 && v > 0 ? "< £0.01" : `£${v.toFixed(2)}`);

  const rows: { element: string; monthly: string; basis: string }[] = [
    {
      element: "Database server (reads & writes)",
      monthly: gbp(dbWorkGbp),
      basis: `${Math.round(scansPerMonth).toLocaleString()} scans + ${Math.round(logsPerMonth).toLocaleString()} logs per month, at the page's unit rates`,
    },
    {
      element: "Database storage",
      monthly: `~${dbStorageMb < 1 ? dbStorageMb.toFixed(2) : dbStorageMb.toFixed(0)} MB stored`,
      basis: "Included in the smallest database size — no extra charge at this volume",
    },
    {
      element: "Compute (backend functions)",
      monthly: "Plan-based",
      basis: "Reader posts, sign-in and page loads — scales with traffic; no per-unit rate published",
    },
    {
      element: "Network / data transfer",
      monthly: "Plan-based",
      basis: "Reader HTTP posts and page views — small at RFID volumes",
    },
    {
      element: "File storage (item photos, floor plans)",
      monthly: "Plan-based",
      basis: "Charged by GB stored; check Cloud → Usage for your current total",
    },
    {
      element: "AI features",
      monthly: "£0.00",
      basis: "This app uses no AI features — nothing consumed",
    },
    {
      element: "App hosting",
      monthly: "Plan-based",
      basis: "Included in your plan's monthly Cloud allowance",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> 1-month projection — all billing elements
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left py-2 font-medium">Billing element</th>
                <th className="text-right py-2 font-medium">1 month</th>
                <th className="text-left py-2 pl-4 font-medium">Basis</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.element} className="border-b border-border/40">
                  <td className="py-2 pr-4">{r.element}</td>
                  <td className="py-2 text-right tabular-nums whitespace-nowrap">{r.monthly}</td>
                  <td className="py-2 pl-4 text-xs text-muted-foreground">{r.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Every plan includes 20 free Cloud credits and 4 free AI credits per month, which cover
          usage before anything is charged. Lovable bills Cloud usage in credits and doesn't publish
          per-unit rates, so "Plan-based" elements can only be seen exactly in More → Cloud → Usage
          or Settings → Plans &amp; credits. The database work figure above is this page's own
          estimate from your scan volume.
        </p>
      </CardContent>
    </Card>
  );
}
