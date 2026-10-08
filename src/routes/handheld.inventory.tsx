import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, MapPin } from "lucide-react";
import { HandheldShell } from "@/components/HandheldShell";
import { HandheldTagSearch } from "@/components/HandheldTagSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/handheld/inventory")({
  component: Inventory,
  head: () => ({
    meta: [
      { title: "Inventory — ScanLoc8 Handheld" },
      { name: "description", content: "Browse item locations and find linked RFID tags with handheld Geiger search." },
      { property: "og:title", content: "Inventory — ScanLoc8 Handheld" },
      { property: "og:description", content: "Browse item locations and find linked RFID tags with handheld Geiger search." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface Row {
  id: string;
  name: string;
  sku: string | null;
  warehouse_location: string | null;
  image_url: string | null;
  epcs: string[];
}

function Inventory() {
  const { companySlug } = useAuth();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selection, setSelection] = useState<{ item: Row; epc: string } | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selection) return;
    const frame = requestAnimationFrame(() => searchRef.current?.scrollIntoView({ block: "start", behavior: "instant" }));
    return () => cancelAnimationFrame(frame);
  }, [selection]);

  useEffect(() => {
    setSelection(null);
    if (!companySlug) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: its }, { data: links }, { data: scans }] = await Promise.all([
        supabase
          .from("items")
          .select("id, name, sku, warehouse_location, image_url")
          .eq("company_slug", companySlug)
          .order("name"),
        supabase.from("tag_items").select("epc, item_id").eq("company_slug", companySlug),
        supabase
          .from("rfid_scans")
          .select("epc, location, last_seen")
          .eq("company_slug", companySlug)
          .not("location", "is", null),
      ]);
      // Latest scan location per EPC, then latest across each item's tags
      const scanByEpc = new Map((scans ?? []).map((s) => [s.epc.toUpperCase(), s]));
      const best = new Map<string, { location: string; at: string }>();
      const epcsByItem = new Map<string, Set<string>>();
      for (const l of links ?? []) {
        const epc = l.epc.trim().toUpperCase();
        if (epc) {
          const epcs = epcsByItem.get(l.item_id) ?? new Set<string>();
          epcs.add(epc);
          epcsByItem.set(l.item_id, epcs);
        }
        const s = scanByEpc.get(l.epc.toUpperCase());
        if (!s?.location) continue;
        const cur = best.get(l.item_id);
        if (!cur || s.last_seen > cur.at) best.set(l.item_id, { location: s.location, at: s.last_seen });
      }
      if (cancelled) return;
      setItems(
        ((its ?? []) as Row[]).map((i) => ({
          ...i,
          warehouse_location: best.get(i.id)?.location ?? i.warehouse_location,
          epcs: [...(epcsByItem.get(i.id) ?? [])].sort(),
        })),
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companySlug]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((i) =>
      [i.name, i.sku, i.warehouse_location].some((v) => v?.toLowerCase().includes(s)),
    );
  }, [items, q]);

  return (
    <HandheldShell title="Inventory">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search item, SKU or location"
        className="h-12 text-base"
      />
      <p className="text-xs text-muted-foreground">
        {loading ? "Loading…" : `${filtered.length} of ${items.length} items`}
      </p>
      {selection && (
        <div ref={searchRef} className="scroll-mt-4 space-y-2">
          <h2 className="break-words text-base font-semibold text-foreground">{selection.item.name}</h2>
          {selection.item.epcs.length > 1 && (
            <label className="block space-y-1 text-sm text-foreground">
              <span>Tag to find ({selection.item.epcs.length})</span>
              <select
                aria-label="Tag to find"
                value={selection.epc}
                onChange={(e) => setSelection({ ...selection, epc: e.target.value })}
                className="h-12 w-full min-w-0 rounded-md border border-input bg-background px-3 font-mono text-xs"
              >
                {selection.item.epcs.map((epc) => <option key={epc} value={epc}>{epc}</option>)}
              </select>
            </label>
          )}
          <HandheldTagSearch key={`${selection.item.id}:${selection.epc}`} epc={selection.epc} onClose={() => setSelection(null)} />
        </div>
      )}
      <ul className="space-y-2">
        {filtered.map((i) => (
          <li key={i.id} className="flex items-center gap-3 rounded-md border border-border bg-card p-2">
            {i.image_url ? (
              <img src={i.image_url} alt={i.name} className="h-12 w-12 rounded object-cover" loading="lazy" />
            ) : (
              <div className="h-12 w-12 rounded bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{i.name}</p>
              {i.sku && <p className="truncate text-xs text-muted-foreground">{i.sku}</p>}
              <p className="flex items-center gap-1 truncate text-xs text-primary">
                <MapPin className="h-3 w-3" />
                {i.warehouse_location ?? "No location"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1 text-primary"
              aria-label={`Find ${i.name}`}
              disabled={i.epcs.length === 0}
              title={i.epcs.length === 0 ? "No linked RFID tags" : `Find ${i.name}`}
              onClick={() => {
                const epc = i.epcs[0];
                if (epc) setSelection({ item: i, epc });
              }}
            >
              <Crosshair className="h-4 w-4" />
              Find
            </Button>
          </li>
        ))}
      </ul>
    </HandheldShell>
  );
}
