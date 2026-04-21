import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/AuthGuard";
import { useState, useEffect, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/AppHeader";
import {
  Radio,
  Search,
  RefreshCw,
  Download,
  MapPin,
  Clock,
  Tag,
  ArrowUpDown,
  Filter,
  Package,
  Copy,
  Check,
  Layers,
  ChevronDown,
  ChevronRight,
  Link2,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { backfillTagItems } from "@/lib/backfill-tag-items";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ItemDetails } from "@/components/ItemDetails";

export const Route = createFileRoute("/$company/dashboard")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "RFID Dashboard — Tag Reads" },
      { name: "description", content: "Real-time dashboard for UHF RFID tag scan data" },
      { property: "og:title", content: "RFID Dashboard — Tag Reads" },
      { property: "og:description", content: "Real-time dashboard for UHF RFID tag scan data" },
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
  tid: string | null;
  sku?: string | null;
  item_name?: string | null;
  item_description?: string | null;
}

type SortField = "last_seen" | "epc" | "scan_count" | "location";
type SortDir = "asc" | "desc";

interface SkuGroup {
  sku: string;
  item_name: string | null;
  item_description: string | null;
  records: ScanRecord[];
  totalScans: number;
  lastSeen: string;
  firstSeen: string;
}

function DashboardPage() {
  const { company } = Route.useParams();
  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("last_seen");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedEpc, setExpandedEpc] = useState<string | null>(null);
  const [copiedEpc, setCopiedEpc] = useState<string | null>(null);
  const [groupBySku, setGroupBySku] = useState(true);
  const [expandedSku, setExpandedSku] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const backfillFn = useServerFn(backfillTagItems);

  const handleBackfill = async () => {
    setBackfilling(true);
    try {
      const res = await backfillFn({ data: { companySlug: company } });
      if (!res.ok) {
        toast.error(`Backfill failed: ${res.error}`);
      } else {
        toast.success(
          `Linked ${res.linked} tags · ${res.unmatched ?? 0} unmatched · ${res.skipped} already linked`
        );
        await fetchRecords();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backfill failed");
    } finally {
      setBackfilling(false);
    }
  };

  const handleCopyEpc = (epc: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(epc);
    setCopiedEpc(epc);
    setTimeout(() => setCopiedEpc(null), 1500);
  };

  const fetchRecords = async () => {
    setLoading(true);
    const { data: scans, error } = await supabase
      .from("rfid_scans")
      .select("*")
      .eq("company_slug", company)
      .order("last_seen", { ascending: false })
      .limit(500);

    if (error) {
      toast.error("Failed to load data");
      setLoading(false);
      return;
    }

    const epcs = (scans || []).map((s) => s.epc);
    const epcItemMap = new Map<string, { sku: string | null; name: string | null; description: string | null }>();

    if (epcs.length > 0) {
      const { data: links } = await supabase
        .from("tag_items")
        .select("epc, item_id")
        .eq("company_slug", company)
        .in("epc", epcs);

      const itemIds = Array.from(new Set((links || []).map((link) => link.item_id)));
      const itemMap = new Map<string, { sku: string | null; name: string | null; description: string | null }>();

      if (itemIds.length > 0) {
        const { data: items } = await supabase
          .from("items")
          .select("id, sku, name, description")
          .eq("company_slug", company)
          .in("id", itemIds);

        for (const item of items || []) {
          itemMap.set(item.id, {
            sku: item.sku,
            name: item.name,
            description: item.description,
          });
        }
      }

      for (const link of links || []) {
        const item = itemMap.get(link.item_id);
        if (item && !epcItemMap.has(link.epc)) {
          epcItemMap.set(link.epc, item);
        }
      }
    }

    const enriched: ScanRecord[] = (scans || []).map((s) => {
      const itemInfo = epcItemMap.get(s.epc);
      return {
        ...s,
        sku: itemInfo?.sku || null,
        item_name: itemInfo?.name || null,
        item_description: itemInfo?.description || null,
      };
    });

    setRecords(enriched);
    setLoading(false);
  };

  useEffect(() => {
    fetchRecords();
  }, [company]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchRecords, 10_000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const locations = useMemo(() => {
    const counts = new Map<string, number>();
    records.forEach((r) => {
      if (r.location) counts.set(r.location, (counts.get(r.location) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([loc, count]) => ({ loc, count }));
  }, [records]);

  const filtered = useMemo(() => {
    let result = records.filter((r) => {
      const matchesSearch =
        !search ||
        r.epc.toLowerCase().includes(search.toLowerCase()) ||
        (r.sku && r.sku.toLowerCase().includes(search.toLowerCase())) ||
        (r.item_name && r.item_name.toLowerCase().includes(search.toLowerCase())) ||
        (r.location && r.location.toLowerCase().includes(search.toLowerCase()));
      const matchesLocation =
        locationFilter === "all" || r.location === locationFilter;
      return matchesSearch && matchesLocation;
    });

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "last_seen":
          cmp = new Date(a.last_seen).getTime() - new Date(b.last_seen).getTime();
          break;
        case "epc":
          cmp = a.epc.localeCompare(b.epc);
          break;
        case "scan_count":
          cmp = a.scan_count - b.scan_count;
          break;
        case "location":
          cmp = (a.location || "").localeCompare(b.location || "");
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [records, search, locationFilter, sortField, sortDir]);

  const skuGroups = useMemo((): SkuGroup[] => {
    if (!groupBySku) return [];
    const groups = new Map<string, SkuGroup>();
    const ungrouped: ScanRecord[] = [];

    for (const r of filtered) {
      if (r.sku) {
        const existing = groups.get(r.sku);
        if (existing) {
          existing.records.push(r);
          existing.totalScans += r.scan_count;
          if (new Date(r.last_seen) > new Date(existing.lastSeen)) {
            existing.lastSeen = r.last_seen;
          }
        } else {
          groups.set(r.sku, {
            sku: r.sku,
            item_name: r.item_name || null,
            item_description: r.item_description || null,
            records: [r],
            totalScans: r.scan_count,
            lastSeen: r.last_seen,
          });
        }
      } else {
        ungrouped.push(r);
      }
    }

    const result: SkuGroup[] = [];
    const singletons: ScanRecord[] = [...ungrouped];
    for (const group of groups.values()) {
      // Always render SKU groups, even when only 1 record passes the filter,
      // so users don't lose tags into "Ungrouped" after applying a location filter.
      result.push(group);
    }

    if (singletons.length > 0) {
      result.push({
        sku: "__ungrouped__",
        item_name: null,
        item_description: null,
        records: singletons,
        totalScans: singletons.reduce((s, r) => s + r.scan_count, 0),
        lastSeen: singletons[0]?.last_seen || "",
      });
    }

    return result.sort((a, b) => {
      if (a.sku === "__ungrouped__") return 1;
      if (b.sku === "__ungrouped__") return -1;
      return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
    });
  }, [filtered, groupBySku]);

  const stats = useMemo(() => {
    const totalTags = records.length;
    const totalScans = records.reduce((sum, r) => sum + r.scan_count, 0);
    const uniqueLocations = new Set(
      records.filter((r) => r.location).map((r) => r.location)
    ).size;
    const latest = records[0]
      ? new Date(records[0].last_seen).toLocaleString()
      : "—";
    return { totalTags, totalScans, uniqueLocations, latest };
  }, [records]);

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
    a.download = `rfid-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  return (
    <AuthGuard>
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<Tag className="h-5 w-5" />} label="Unique Tags" value={stats.totalTags.toString()} />
          <StatCard icon={<Radio className="h-5 w-5" />} label="Total Scans" value={stats.totalScans.toString()} />
          <StatCard icon={<MapPin className="h-5 w-5" />} label="Locations" value={stats.uniqueLocations.toString()} />
          <StatCard icon={<Clock className="h-5 w-5" />} label="Latest Scan" value={stats.latest} small />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search EPC, SKU, or location..." className="pl-9 font-mono text-xs" />
          </div>

          <div className="flex gap-2 flex-wrap">
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-[160px] text-xs">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations.map(({ loc, count }) => (
                  <SelectItem key={loc} value={loc}>
                    <span className="flex items-center justify-between gap-3 w-full">
                      <span>{loc}</span>
                      <span className="text-muted-foreground text-[10px] tabular-nums">{count}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={fetchRecords} variant="outline" size="sm" className="gap-1.5" disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            <Button onClick={() => setAutoRefresh(!autoRefresh)} variant={autoRefresh ? "default" : "outline"} size="sm" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {autoRefresh ? "Live" : "Auto"}
            </Button>

            <Button onClick={handleExport} variant="outline" size="sm" className="gap-1.5" disabled={filtered.length === 0}>
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>

            <Button onClick={() => setGroupBySku(!groupBySku)} variant={groupBySku ? "default" : "outline"} size="sm" className="gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              {groupBySku ? "Grouped" : "Group SKU"}
            </Button>

            <Button onClick={handleBackfill} variant="outline" size="sm" className="gap-1.5" disabled={backfilling}>
              <Link2 className={`h-3.5 w-3.5 ${backfilling ? "animate-pulse" : ""}`} />
              {backfilling ? "Linking..." : "Link EPCs"}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {filtered.length} of {records.length} tags
            {autoRefresh && <span className="ml-2 text-success">● Live updates</span>}
          </span>
          <span>Sorted by {sortField.replace("_", " ")} ({sortDir})</span>
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <SortHeader label="EPC" field="epc" current={sortField} dir={sortDir} onSort={toggleSort} />
                  {groupBySku && <th className="px-3 py-2 text-left font-medium text-muted-foreground">SKU</th>}
                  <SortHeader label="Scans" field="scan_count" current={sortField} dir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Location" field="location" current={sortField} dir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Last Seen" field="last_seen" current={sortField} dir={sortDir} onSort={toggleSort} />
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">First Seen</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={groupBySku ? 7 : 6} className="px-3 py-12 text-center">
                      <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">Loading...</p>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={groupBySku ? 7 : 6} className="px-3 py-12 text-center text-muted-foreground">
                      No tag reads found
                    </td>
                  </tr>
                ) : groupBySku ? (
                  skuGroups.map((group) => (
                    <>
                      <tr
                        key={`group-${group.sku}`}
                        className="bg-muted/40 border-b border-border cursor-pointer hover:bg-muted/60 transition-colors"
                        onClick={() => setExpandedSku(expandedSku === group.sku ? null : group.sku)}
                      >
                        <td colSpan={groupBySku ? 7 : 6} className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            {expandedSku === group.sku ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <Package className="h-3.5 w-3.5 text-primary" />
                            <span className="font-medium text-foreground">
                              {group.sku === "__ungrouped__" ? "Ungrouped Tags" : `SKU: ${group.sku}`}
                            </span>
                            {group.item_name && (
                              <span className="text-muted-foreground">— {group.item_name}</span>
                            )}
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-primary font-medium ml-auto">
                              {group.records.length} tag{group.records.length !== 1 ? "s" : ""} · {group.totalScans} scans
                            </span>
                            {group.sku === "__ungrouped__" && (
                              <>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => e.stopPropagation()}
                                      className="h-7 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Delete all
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        Delete all {group.records.length} ungrouped tag{group.records.length !== 1 ? "s" : ""}?
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently remove all ungrouped scan records
                                        and unlink them from any items. This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={async () => {
                                          const epcs = group.records.map((r) => r.epc);
                                          const ids = group.records.map((r) => r.id);
                                          const [scanRes, tagRes] = await Promise.all([
                                            supabase.from("rfid_scans").delete().in("id", ids),
                                            supabase
                                              .from("tag_items")
                                              .delete()
                                              .eq("company_slug", company)
                                              .in("epc", epcs),
                                          ]);
                                          if (scanRes.error || tagRes.error) {
                                            toast.error("Failed to delete ungrouped tags");
                                            return;
                                          }
                                          toast.success(`Deleted ${ids.length} ungrouped tag${ids.length !== 1 ? "s" : ""}`);
                                          fetchRecords();
                                        }}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Delete all
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedSku === group.sku && group.item_description && (
                        <tr key={`desc-${group.sku}`} className="bg-muted/20 border-b border-border/50">
                          <td colSpan={groupBySku ? 7 : 6} className="px-3 py-2 pl-10 text-xs text-muted-foreground italic">
                            {group.item_description}
                          </td>
                        </tr>
                      )}
                      {expandedSku === group.sku && group.records.map((r) => (
                        <ScanRow
                          key={r.id}
                          r={r}
                          showSku={groupBySku}
                          expandedEpc={expandedEpc}
                          setExpandedEpc={setExpandedEpc}
                          copiedEpc={copiedEpc}
                          handleCopyEpc={handleCopyEpc}
                          fetchRecords={fetchRecords}
                          companySlug={company}
                          indent
                        />
                      ))}
                    </>
                  ))
                ) : (
                  filtered.map((r) => (
                    <ScanRow
                      key={r.id}
                      r={r}
                      showSku={false}
                      expandedEpc={expandedEpc}
                      setExpandedEpc={setExpandedEpc}
                      copiedEpc={copiedEpc}
                      handleCopyEpc={handleCopyEpc}
                      fetchRecords={fetchRecords}
                      companySlug={company}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
    </AuthGuard>
  );
}

function ScanRow({
  r,
  showSku,
  expandedEpc,
  setExpandedEpc,
  copiedEpc,
  handleCopyEpc,
  fetchRecords,
  indent,
  companySlug,
}: {
  r: ScanRecord;
  showSku: boolean;
  expandedEpc: string | null;
  setExpandedEpc: (epc: string | null) => void;
  copiedEpc: string | null;
  handleCopyEpc: (epc: string, e: React.MouseEvent) => void;
  fetchRecords: () => void;
  indent?: boolean;
  companySlug: string;
}) {
  return (
    <tr
      className={`border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer ${indent ? "bg-background" : ""}`}
      onClick={() => setExpandedEpc(expandedEpc === r.epc ? null : r.epc)}
    >
      <td className={`px-3 py-2.5 font-mono font-medium text-foreground whitespace-nowrap ${indent ? "pl-8" : ""}`}>
        <div className="flex items-center gap-1.5">
          {r.epc}
          <button
            onClick={(e) => handleCopyEpc(r.epc, e)}
            className="p-0.5 rounded hover:bg-accent text-muted-foreground"
            title="Copy EPC"
          >
            {copiedEpc === r.epc ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
        {expandedEpc === r.epc && (
          <div className="mt-2 max-w-xs" onClick={(e) => e.stopPropagation()}>
            <ItemDetails epc={r.epc} companySlug={companySlug} onClose={() => setExpandedEpc(null)} onDeleted={() => { setExpandedEpc(null); fetchRecords(); }} />
          </div>
        )}
      </td>
      {showSku && (
        <td className="px-3 py-2.5 font-mono text-muted-foreground whitespace-nowrap">
          {r.sku || "—"}
        </td>
      )}
      <td className="px-3 py-2.5 text-center">
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-primary font-medium">
          {r.scan_count}
        </span>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {r.location ? (
          <span className="inline-flex items-center gap-1 text-primary">
            <MapPin className="h-3 w-3" />
            {r.location}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
        {new Date(r.last_seen).toLocaleString()}
      </td>
      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
        {new Date(r.first_seen).toLocaleString()}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Delete tag"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this tag scan?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the scan record for EPC{" "}
                <span className="font-mono text-xs">{r.epc}</span> and unlink it
                from any item. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  const [scanRes, tagRes] = await Promise.all([
                    supabase.from("rfid_scans").delete().eq("id", r.id),
                    supabase.from("tag_items").delete().eq("epc", r.epc).eq("company_slug", companySlug),
                  ]);
                  if (scanRes.error || tagRes.error) {
                    toast.error("Failed to delete tag");
                    return;
                  }
                  toast.success("Tag deleted");
                  fetchRecords();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </td>
    </tr>
  );
}

function StatCard({ icon, label, value, small }: { icon: React.ReactNode; label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`font-bold text-foreground truncate ${small ? "text-xs" : "text-xl"}`}>{value}</p>
    </div>
  );
}

function SortHeader({ label, field, current, dir, onSort }: { label: string; field: SortField; current: SortField; dir: SortDir; onSort: (f: SortField) => void }) {
  const active = current === field;
  return (
    <th className="px-3 py-2 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none" onClick={() => onSort(field)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "text-primary" : "opacity-30"}`} />
        {active && <span className="text-primary text-[10px]">{dir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}
