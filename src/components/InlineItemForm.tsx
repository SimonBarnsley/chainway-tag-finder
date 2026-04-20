import { useState, useRef } from "react";
import { Save, X, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InlineItemFormProps {
  epc?: string;
  companySlug: string;
  onSaved: () => void;
  onCancel: () => void;
}

export function InlineItemForm({ epc, companySlug, onSaved, onCancel }: InlineItemFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [sku, setSku] = useState("");
  const [gtin, setGtin] = useState("");
  const [price, setPrice] = useState("");
  const [warehouseLocation, setWarehouseLocation] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Select an image"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Max 5MB"); return; }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("item-images").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("item-images").getPublicUrl(path);
      setImageUrl(data.publicUrl);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }

    setSaving(true);
    try {
      // 1. Create the item
      const { data: item, error: insertErr } = await supabase.from("items").insert({
        name: name.trim(),
        description: description || null,
        category: category || null,
        sku: sku || null,
        gtin: gtin || null,
        price: price ? Number(price) : null,
        warehouse_location: warehouseLocation || null,
        image_url: imageUrl,
        company_slug: companySlug,
      }).select("id").single();

      if (insertErr) throw insertErr;

      // 2. If an EPC was passed in (linking flow), link it to the new item
      if (epc) {
        const { error: linkErr } = await supabase.from("tag_items").upsert({
          epc: epc.toUpperCase(),
          item_id: item.id,
          gtin: gtin || null,
          company_slug: companySlug,
        }, { onConflict: "epc,item_id" });

        if (linkErr) throw linkErr;
        toast.success(`Item created & linked to EPC ${epc.slice(0, 12)}…`);
      } else {
        toast.success("Item created");
      }

      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-card p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          {epc ? "New Item for EPC" : "New Item"}
        </span>
        <button onClick={onCancel} className="p-1 rounded hover:bg-accent text-muted-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {epc && (
        <p className="font-mono text-[10px] text-muted-foreground truncate">{epc}</p>
      )}

      <div>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name *" className="text-xs" autoFocus />
      </div>
      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="text-xs" rows={2} />
      <div className="grid grid-cols-2 gap-2">
        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="text-xs" />
        <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" className="text-xs" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input value={gtin} onChange={(e) => setGtin(e.target.value)} placeholder="GTIN" className="text-xs font-mono" />
        <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" type="number" className="text-xs" />
      </div>
      <Input value={warehouseLocation} onChange={(e) => setWarehouseLocation(e.target.value)} placeholder="Warehouse location" className="text-xs" />

      {/* Image */}
      {imageUrl ? (
        <div className="relative rounded-md border border-border overflow-hidden">
          <img src={imageUrl} alt="Item" className="w-full object-cover max-h-32 rounded-md" />
          <Button
            type="button" size="sm" variant="destructive"
            onClick={() => setImageUrl(null)}
            className="absolute top-1 right-1 h-6 text-[10px] gap-1"
          >
            <Trash2 className="h-3 w-3" /> Remove
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 rounded-md border border-dashed border-border hover:border-primary/50 bg-muted/30 py-4 text-xs text-muted-foreground transition-colors"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ImagePlus className="h-4 w-4" /> Add photo</>}
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />

      <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full gap-2 text-xs" size="sm">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        {saving ? "Saving..." : epc ? "Create & Link" : "Create Item"}
      </Button>
    </div>
  );
}
