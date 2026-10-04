import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { HandheldShell } from "@/components/HandheldShell";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/handheld/inventory")({
  component: Inventory,
  head: () => ({
    meta: [
      { title: "Inventory — ScanLoc8 Handheld" },
      { name: "description", content: "Every item with its current location." },
      { property: "og:title", content: "Inventory — ScanLoc8 Handheld" },
      { property: "og:description", content: "Every item with its current location." },
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
}

function Inventory() {
  const { companySlug } = useAuth();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!companySlug) return;
    setLoading(true);
    supabase
      .from("items")
      .select("id, name, sku, warehouse_location, image_url")
      .eq("company_slug", companySlug)
      .order("name")
      .then(({ data }) => {
        setItems((data ?? []) as Row[]);
        setLoading(false);
      });
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
          </li>
        ))}
      </ul>
    </HandheldShell>
  );
}
