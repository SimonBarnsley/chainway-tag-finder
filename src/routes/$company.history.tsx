import { csvRow } from "@/lib/csv-safe";
import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/AuthGuard";
import { useState, useEffect } from "react";
import { Search, Download, Trash2, RefreshCw, MapPin } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/$company/history")({
  component: HistoryPage,
  head: () => ({
    meta: [
      { title: "Scan History — ScanLoc8" },
      { name: "description", content: "View and manage saved RFID tag scan history" },
      { property: "og:title", content: "Scan History — ScanLoc8" },
      { property: "og:description", content: "Review last-seen tag snapshots and recorded location changes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface ScanRecord {
  id: string;
  epc: string;
  rssi: number | null;
  scan_count: number;
  first_seen: string;
  last_seen: string;
  device_name: string | null;
  notes: string | null;
  location: string | null;
  previous_location?: string | null;
}

function HistoryPage() {
  const { company } = Route.useParams();
  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"latest" | "events">("latest");

  const fetchRecords = async () => {
    setLoading(true);
    if (mode === "events") {
      const { data, error } = await supabase.from("scan_events")
        .select("id, epc, rssi, scan_count, observed_at, recorded_at, location, previous_location, device_name")
        .eq("company_slug", company).order("recorded_at", { ascending: false }).limit(200);
      if (error) toast.error("Failed to load location changes");
      else setRecords((data ?? []).map((event) => ({ ...event, first_seen: event.recorded_at, last_seen: event.observed_at, notes: null })));
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("rfid_scans")
      .select("*")
      .eq("company_slug", company)
      .order("last_seen", { ascending: false })
      .limit(200);

    if (error) {
      toast.error("Failed to load history");
    } else {
      setRecords(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRecords();
  }, [company, mode]);

  const filtered = records.filter((r) =>
    r.epc.toLowerCase().includes(search.toLowerCase())
  );

  const handleExport = () => {
    const csv = [
      "EPC,Scan Count,First Seen,Last Seen,Location,Device,Notes",
      ...filtered.map(
        (r) =>
          csvRow([r.epc, r.scan_count, r.first_seen, r.last_seen, r.location, r.device_name, r.notes])
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rfid-${mode}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const handleDeleteAll = async () => {
    if (!confirm("Delete ALL scan history? This cannot be undone.")) return;

    const { error } = await supabase.from("rfid_scans").delete().eq("company_slug", company).neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      toast.error("Delete failed");
    } else {
      setRecords([]);
      toast.success("All records deleted");
    }
  };

  return (
    <AuthGuard requirePermission="history.view">
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />

      <div className="px-4 py-3 space-y-3 border-b border-border">
        <div className="flex gap-2" role="group" aria-label="History view">
          <Button size="sm" variant={mode === "latest" ? "default" : "outline"} onClick={() => setMode("latest")}>Last seen</Button>
          <Button size="sm" variant={mode === "events" ? "default" : "outline"} onClick={() => setMode("events")}>Location changes</Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search EPC..." className="pl-9 font-mono text-xs" />
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchRecords} variant="outline" size="sm" className="gap-1 flex-1">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
          <Button onClick={handleExport} variant="outline" size="sm" className="gap-1 flex-1" disabled={filtered.length === 0}>
            <Download className="h-3 w-3" /> Export CSV
          </Button>
          <Button onClick={handleDeleteAll} variant="outline" size="sm" className="gap-1 text-destructive hover:text-destructive" disabled={records.length === 0 || mode === "events"} aria-label="Delete last-seen records">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <main className="flex-1 px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">No records found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-card p-3">
                <p className="font-mono text-xs font-medium text-foreground truncate">{r.epc}</p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                  <span>×{r.scan_count}</span>
                  <span>{new Date(r.last_seen).toLocaleString()}</span>
                  {r.location && (
                    <span className="flex items-center gap-1 text-primary">
                      <MapPin className="h-3 w-3" /> {mode === "events" && r.previous_location ? `${r.previous_location} → ` : "Last seen: "}{r.location}
                    </span>
                  )}
                  {r.device_name && <span>{r.device_name}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
    </AuthGuard>
  );
}
