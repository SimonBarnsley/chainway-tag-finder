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
