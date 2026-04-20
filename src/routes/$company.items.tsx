import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/AuthGuard";
import { useState, useEffect, useRef } from "react";
import { AppHeader } from "@/components/AppHeader";
import {
  Package,
  Plus,
  ArrowLeft,
  Trash2,
  Edit,
  Save,
  X,
  Search,
  Link as LinkIcon,
  ImagePlus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useRfidScanner } from "@/hooks/use-rfid-scanner";
import { GeigerSearch } from "@/components/GeigerSearch";
import { InlineItemForm } from "@/components/InlineItemForm";

export const Route = createFileRoute("/$company/items")({
  component: ItemsPage,
  head: () => ({
    meta: [
      { title: "Item Management — RFID Inventory" },
      { name: "description", content: "Manage inventory items linked to UHF RFID tags" },
    ],
  }),
});

interface Item {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  sku: string | null;
  gtin: string | null;
  weight: number | null;
  weight_unit: string | null;
  length: number | null;
  width: number | null;
  height: number | null;
  dimension_unit: string | null;
  price: number | null;
  currency: string | null;
  image_url: string | null;
  warehouse_location: string | null;
}

const emptyItem: Omit<Item, "id"> = {
  name: "",
  description: null,
  category: null,
  sku: null,
  gtin: null,
  weight: null,
  weight_unit: "kg",
  length: null,
  width: null,
  height: null,
  dimension_unit: "cm",
  price: null,
  currency: "USD",
  image_url: null,
  warehouse_location: null,
};

function ItemsPage() {
  const { company } = Route.useParams();
  const [items, setItems] = useState<Item[]>([]);
  const [itemScanLocations, setItemScanLocations] = useState<Record<string, string[]>>({});
  const [itemLocationCounts, setItemLocationCounts] = useState<Record<string, Record<string, number>>>({});
  const [allLocations, setAllLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Item | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [linkEpc, setLinkEpc] = useState("");
  const [linkingItemId, setLinkingItemId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [geigerEpc, setGeigerEpc] = useState<string | null>(null);
  const [lastScannedEpc, setLastScannedEpc] = useState<string | null>(null);
  const [lastScannedTime, setLastScannedTime] = useState(0);
  const [copiedEpc, setCopiedEpc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopyEpc = (epc: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(epc);
    setCopiedEpc(epc);
    setTimeout(() => setCopiedEpc(null), 1500);
  };

  useRfidScanner({
    enabled: !!geigerEpc,
    onTagScanned: (tag) => {
      setLastScannedEpc(tag.epc);
      setLastScannedTime(Date.now());
    },
  });

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("company_slug", company)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) toast.error("Failed to load items");
    else {
      setItems(data || []);
      if (data && data.length > 0) {
        const ids = data.map((i) => i.id);
        const { data: links } = await supabase
          .from("tag_items")
          .select("item_id, epc")
          .in("item_id", ids);

        const epcToItems: Record<string, string[]> = {};
        (links || []).forEach((l) => {
          if (!epcToItems[l.epc]) epcToItems[l.epc] = [];
          epcToItems[l.epc].push(l.item_id);
        });

        // Fetch scan locations for linked EPCs
        const allEpcs = Object.keys(epcToItems);
        const scanLocMap: Record<string, string[]> = {};
        const locCountMap: Record<string, Record<string, number>> = {};
        if (allEpcs.length > 0) {
          const { data: scans } = await supabase
            .from("rfid_scans")
            .select("epc, location")
            .eq("company_slug", company)
            .in("epc", allEpcs)
            .not("location", "is", null);
          (scans || []).forEach((s) => {
            if (!s.location) return;
            for (const itemId of epcToItems[s.epc] || []) {
              if (!scanLocMap[itemId]) scanLocMap[itemId] = [];
              if (!scanLocMap[itemId].includes(s.location)) scanLocMap[itemId].push(s.location);
              if (!locCountMap[itemId]) locCountMap[itemId] = {};
              locCountMap[itemId][s.location] = (locCountMap[itemId][s.location] || 0) + 1;
            }
          });
        }
        setItemScanLocations(scanLocMap);
        setItemLocationCounts(locCountMap);
      }

      // All distinct scan locations for this company (so dropdown shows everything)
      const { data: allScans } = await supabase
        .from("rfid_scans")
        .select("location")
        .eq("company_slug", company)
        .not("location", "is", null);
      const distinct = Array.from(
        new Set((allScans || []).map((s) => s.location).filter((l): l is string => !!l))
      ).sort();
      setAllLocations(distinct);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error("Name is required");
      return;
    }

    if (isNew) {
      const { name, description, category, sku, gtin, weight, weight_unit, length, width, height, dimension_unit, price, currency, image_url, warehouse_location } = editing;
      const { error } = await supabase.from("items").insert({
        name, description, category, sku, gtin, weight, weight_unit,
        length, width, height, dimension_unit, price, currency, image_url, warehouse_location,
        company_slug: company,
      });
      if (error) { toast.error("Failed to create item"); return; }
      toast.success("Item created");
    } else {
      const { id, ...rest } = editing;
      const { error } = await supabase.from("items").update(rest).eq("id", id);
      if (error) { toast.error("Failed to update item"); return; }

      const { data: links } = await supabase
        .from("tag_items")
        .select("epc")
        .eq("item_id", id);
      if (links && links.length > 0) {
        const epcs = links.map((l) => l.epc);
        await supabase
          .from("rfid_scans")
          .update({ location: editing.warehouse_location })
          .in("epc", epcs);
      }

      toast.success("Item updated");
    }
    setEditing(null);
    setIsNew(false);
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    const { data: links } = await supabase.from("tag_items").select("epc").eq("item_id", id);
    const epcs = links?.map(l => l.epc) ?? [];
    await supabase.from("tag_items").delete().eq("item_id", id);
    if (epcs.length > 0) {
      await supabase.from("rfid_scans").delete().in("epc", epcs);
    }
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) toast.error("Delete failed");
    else { toast.success("Item and linked scans deleted"); fetchItems(); }
  };

  const handleLinkEpc = async (itemId: string) => {
    if (!linkEpc.trim()) return;
    const item = items.find((i) => i.id === itemId);
    const { error } = await supabase.from("tag_items").upsert({
      epc: linkEpc.trim().toUpperCase(),
      item_id: itemId,
      gtin: item?.gtin || null,
      company_slug: company,
    }, { onConflict: "epc,item_id" });
    if (error) toast.error("Link failed: " + error.message);
    else { toast.success("EPC linked to item"); setLinkEpc(""); setLinkingItemId(null); }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }

    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("item-images").upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("item-images").getPublicUrl(path);
      setEditing({ ...editing, image_url: urlData.publicUrl });
      toast.success("Image uploaded");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveImage = async () => {
    if (!editing?.image_url) return;
    try {
      const url = new URL(editing.image_url);
      const match = url.pathname.match(/item-images\/(.+)$/);
      if (match) { await supabase.storage.from("item-images").remove([match[1]]); }
    } catch { /* ignore */ }
    setEditing({ ...editing, image_url: null });
  };

  const itemLocations = Array.from(
    new Set(items.map((i) => i.warehouse_location).filter((l): l is string => !!l))
  );
  const locations = Array.from(new Set([...itemLocations, ...allLocations])).sort();

  const filtered = items.filter((i) => {
    if (locationFilter !== "all") {
      const scanLocs = itemScanLocations[i.id] || [];
      if (i.warehouse_location !== locationFilter && !scanLocs.includes(locationFilter)) return false;
    }
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      i.name.toLowerCase().includes(s) ||
      i.sku?.toLowerCase().includes(s) ||
      i.gtin?.toLowerCase().includes(s) ||
      i.category?.toLowerCase().includes(s)
    );
  });

  if (editing && isNew) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur-sm px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={() => { setEditing(null); setIsNew(false); }} className="p-1 rounded-md hover:bg-accent text-muted-foreground">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <Package className="h-5 w-5 text-primary" />
            <h1 className="text-base font-bold text-foreground">New Item</h1>
          </div>
        </header>
        <main className="flex-1 px-4 py-4">
          <InlineItemForm
            companySlug={company}
            onSaved={() => { setEditing(null); setIsNew(false); fetchItems(); }}
            onCancel={() => { setEditing(null); setIsNew(false); }}
          />
        </main>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur-sm px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={() => { setEditing(null); setIsNew(false); }} className="p-1 rounded-md hover:bg-accent text-muted-foreground">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <Package className="h-5 w-5 text-primary" />
            <h1 className="text-base font-bold text-foreground">Edit Item</h1>
          </div>
        </header>
        <main className="flex-1 px-4 py-4 space-y-3">
          <Field label="Name *" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
          <Field label="Description" value={editing.description || ""} onChange={(v) => setEditing({ ...editing, description: v || null })} textarea />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" value={editing.category || ""} onChange={(v) => setEditing({ ...editing, category: v || null })} />
            <Field label="SKU" value={editing.sku || ""} onChange={(v) => setEditing({ ...editing, sku: v || null })} />
          </div>
          <Field label="GTIN" value={editing.gtin || ""} onChange={(v) => setEditing({ ...editing, gtin: v || null })} mono />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price" value={editing.price?.toString() || ""} onChange={(v) => setEditing({ ...editing, price: v ? Number(v) : null })} type="number" />
            <Field label="Currency" value={editing.currency || "USD"} onChange={(v) => setEditing({ ...editing, currency: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight" value={editing.weight?.toString() || ""} onChange={(v) => setEditing({ ...editing, weight: v ? Number(v) : null })} type="number" />
            <Field label="Unit" value={editing.weight_unit || "kg"} onChange={(v) => setEditing({ ...editing, weight_unit: v })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Length" value={editing.length?.toString() || ""} onChange={(v) => setEditing({ ...editing, length: v ? Number(v) : null })} type="number" />
            <Field label="Width" value={editing.width?.toString() || ""} onChange={(v) => setEditing({ ...editing, width: v ? Number(v) : null })} type="number" />
            <Field label="Height" value={editing.height?.toString() || ""} onChange={(v) => setEditing({ ...editing, height: v ? Number(v) : null })} type="number" />
          </div>
          <Field label="Warehouse Location" value={editing.warehouse_location || ""} onChange={(v) => setEditing({ ...editing, warehouse_location: v || null })} />

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Image</label>
            {editing.image_url ? (
              <div className="relative rounded-lg border border-border overflow-hidden">
                <img src={editing.image_url} alt="Item" className="w-full object-cover max-h-48 rounded-lg" />
                <div className="absolute top-2 right-2 flex gap-1">
                  <Button type="button" size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} className="h-7 text-[10px] gap-1">
                    <ImagePlus className="h-3 w-3" /> Replace
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={handleRemoveImage} className="h-7 text-[10px] gap-1">
                    <Trash2 className="h-3 w-3" /> Remove
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingImage} className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 py-8 transition-colors">
                {uploadingImage ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <><ImagePlus className="h-6 w-6 text-muted-foreground" /><span className="text-xs text-muted-foreground">Tap to upload image</span></>}
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />
          </div>

          <Button onClick={handleSave} className="w-full gap-2">
            <Save className="h-4 w-4" /> Save Changes
          </Button>
        </main>
      </div>
    );
  }

  return (
    <AuthGuard>
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader actions={
        <Button size="sm" className="gap-1" onClick={() => { setEditing({ id: "", ...emptyItem } as Item); setIsNew(true); }}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      } />

      <main className="flex-1 px-4 py-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items..." className="pl-9 text-xs" />
          </div>
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-[150px] text-xs">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc} value={loc}>{loc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-12">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <Package className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">No items yet</p>
            <p className="text-xs mt-1">Add items and link them to RFID tags</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    {item.image_url && (
                      <img src={item.image_url} alt={item.name} className="h-12 w-12 rounded-md object-cover border border-border shrink-0" loading="lazy" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{item.name}</p>
                      <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-muted-foreground">
                        {item.sku && <span>SKU: {item.sku}</span>}
                        {item.gtin && <span className="font-mono">GTIN: {item.gtin}</span>}
                        {item.category && <span>{item.category}</span>}
                        {item.price != null && <span>{item.price} {item.currency}</span>}
                        {item.warehouse_location && <span>📍 {item.warehouse_location}</span>}
                      </div>
                      {itemLocationCounts[item.id] && Object.keys(itemLocationCounts[item.id]).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {Object.entries(itemLocationCounts[item.id])
                            .sort((a, b) => b[1] - a[1])
                            .map(([loc, count]) => (
                              <span
                                key={loc}
                                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                                title={`${count} ${count === 1 ? "tag" : "tags"} in ${loc}`}
                              >
                                <span>📍 {loc}</span>
                                <span className="font-semibold">×{count}</span>
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 ml-2 shrink-0">
                      <button onClick={() => setLinkingItemId(linkingItemId === item.id ? null : item.id)} className="p-1.5 rounded hover:bg-accent text-muted-foreground" title="Link EPC">
                        <LinkIcon className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => { setEditing(item); setIsNew(false); }} className="p-1.5 rounded hover:bg-accent text-muted-foreground">
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded hover:bg-accent text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {linkingItemId === item.id && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-border">
                      <Input value={linkEpc} onChange={(e) => setLinkEpc(e.target.value.toUpperCase())} placeholder="Enter EPC to link..." className="font-mono text-xs flex-1" autoFocus />
                      <Button size="sm" onClick={() => handleLinkEpc(item.id)} disabled={!linkEpc.trim()}>Link</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setLinkingItemId(null); setLinkEpc(""); }}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {geigerEpc && (
        <div className="fixed bottom-0 left-0 right-0 z-20 p-3 bg-background/95 backdrop-blur-sm border-t border-border">
          <GeigerSearch targetEpc={geigerEpc} lastScannedEpc={lastScannedEpc} lastScannedTime={lastScannedTime} onClose={() => setGeigerEpc(null)} />
        </div>
      )}
    </div>
    </AuthGuard>
  );
}

function Field({ label, value, onChange, type = "text", textarea, mono }: { label: string; value: string; onChange: (v: string) => void; type?: string; textarea?: boolean; mono?: boolean }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      {textarea ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} className="text-xs" rows={2} />
      ) : (
        <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={`text-xs ${mono ? "font-mono" : ""}`} />
      )}
    </div>
  );
}
