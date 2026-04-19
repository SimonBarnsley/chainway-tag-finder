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
      { title: "Scan History — RFID Scanner" },
      { name: "description", content: "View and manage saved RFID tag scan history" },
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
}

function HistoryPage() {
  const { company } = Route.useParams();
  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchRecords = async () => {
    setLoading(true);
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
  }, []);

  const filtered = records.filter((r) =>
    r.epc.toLowerCase().includes(search.toLowerCase())
  );

  const handleExport = () => {
    const csv = [
      "EPC,Scan Count,First Seen,Last Seen,Location,Device,Notes",
      ...filtered.map(
        (r) =>
          `${r.epc},${r.scan_count},${r.first_seen},${r.last_seen},${r.location || ""},${r.device_name || ""},${r.notes || ""}`
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rfid-scans-${new Date().toISOString().slice(0, 10)}.csv`;
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
    <AuthGuard>
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />

      <div className="px-4 py-3 space-y-3 border-b border-border">
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
          <Button onClick={handleDeleteAll} variant="outline" size="sm" className="gap-1 text-destructive hover:text-destructive" disabled={records.length === 0}>
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
                      <MapPin className="h-3 w-3" /> {r.location}
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
