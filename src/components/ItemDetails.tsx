import { useState, useEffect } from "react";
import { Package, MapPin, DollarSign, Ruler, Weight, Tag, X, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { InlineItemForm } from "./InlineItemForm";

interface ItemInfo {
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

interface ItemDetailsProps {
  epc: string;
  companySlug: string;
  onClose?: () => void;
  onDeleted?: () => void;
}

export function ItemDetails({ epc, companySlug, onClose, onDeleted }: ItemDetailsProps) {
  const [item, setItem] = useState<ItemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!item) return;
    if (!confirm(`Delete item "${item.name}" and unlink from this EPC?`)) return;
    setDeleting(true);
    // Remove tag_item link
    await supabase.from("tag_items").delete().eq("epc", epc).eq("item_id", item.id);
    // Remove the item itself
    await supabase.from("items").delete().eq("id", item.id);
    // Remove the associated rfid_scans record
    await supabase.from("rfid_scans").delete().eq("epc", epc);
    toast.success("Item and scan record deleted");
    setItem(null);
    setDeleting(false);
    onDeleted?.();
  };

  const fetchItem = async () => {
    setLoading(true);
    const { data: tagItem } = await supabase
      .from("tag_items")
      .select("item_id, items(*)")
      .eq("epc", epc)
      .limit(1)
      .maybeSingle();

    if (tagItem?.items) {
      const i = tagItem.items as unknown as ItemInfo;
      setItem(i);
    } else {
      setItem(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchItem();
  }, [epc]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 animate-pulse">
        <div className="h-4 w-24 bg-muted rounded mb-2" />
        <div className="h-3 w-48 bg-muted rounded" />
      </div>
    );
  }

  if (showForm) {
    return (
      <InlineItemForm
        epc={epc}
        companySlug={companySlug}
        onSaved={() => { setShowForm(false); fetchItem(); }}
        onCancel={() => setShowForm(false)}
      />
    );
  }

  if (!item) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
        <p className="text-xs text-muted-foreground">No item linked to this EPC</p>
        <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs" onClick={() => setShowForm(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add Item Details
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-card p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="h-8 w-8 rounded-md object-cover border border-border" />
          ) : (
            <Package className="h-4 w-4 text-primary" />
          )}
          <h3 className="text-sm font-bold text-foreground">{item.name}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleDelete} disabled={deleting} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete item">
            <Trash2 className="h-3 w-3" />
          </button>
          {onClose && (
            <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {item.description && (
        <p className="text-xs text-muted-foreground">{item.description}</p>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        {item.category && <Detail icon={<Tag className="h-3 w-3" />} label="Category" value={item.category} />}
        {item.sku && <Detail icon={<Tag className="h-3 w-3" />} label="SKU" value={item.sku} />}
        {item.gtin && <Detail icon={<Tag className="h-3 w-3" />} label="GTIN" value={item.gtin} />}
        {item.price != null && <Detail icon={<DollarSign className="h-3 w-3" />} label="Price" value={`${item.price} ${item.currency || "USD"}`} />}
        {item.weight != null && <Detail icon={<Weight className="h-3 w-3" />} label="Weight" value={`${item.weight} ${item.weight_unit || "kg"}`} />}
        {(item.length != null || item.width != null || item.height != null) && (
          <Detail icon={<Ruler className="h-3 w-3" />} label="Dimensions" value={`${item.length ?? "—"}×${item.width ?? "—"}×${item.height ?? "—"} ${item.dimension_unit || "cm"}`} />
        )}
        {item.warehouse_location && <Detail icon={<MapPin className="h-3 w-3" />} label="Warehouse" value={item.warehouse_location} />}
      </div>

      {item.image_url && (
        <img src={item.image_url} alt={item.name} className="w-full rounded-md border border-border object-cover max-h-40" loading="lazy" />
      )}
    </div>
  );
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div>
        <p className="text-muted-foreground text-[10px]">{label}</p>
        <p className="text-foreground font-mono">{value}</p>
      </div>
    </div>
  );
}
