import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Tables copied per company, in insert order (parents first).
const TABLES = [
  "company_settings",
  "locations",
  "items",
  "tag_items",
  "fixed_readers",
  "reader_antennas",
  "location_maps",
  "antenna_zones",
] as const;

type Bundle = {
  format: "scanloc8-export";
  version: 1;
  source_company: string;
  exported_at: string;
  tables: Record<string, any[]>;
  files: { bucket: string; path: string; data: string; type: string }[];
};

const blobToB64 = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = rej;
    r.readAsDataURL(b);
  });

const b64ToBlob = (b64: string, type: string) => {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
};

function itemImagePath(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/item-images\/(.+?)(\?|$)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function DataTransfer({ company }: { company: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    setBusy("Exporting…");
    try {
      const tables: Record<string, any[]> = {};
      for (const t of TABLES) {
        const { data, error } = await (supabase.from(t as any) as any).select("*").eq("company_slug", company);
        if (error) throw new Error(`${t}: ${error.message}`);
        tables[t] = data ?? [];
      }
      const files: Bundle["files"] = [];
      for (const it of tables.items) {
        const p = itemImagePath(it.image_url);
        if (!p) continue;
        const { data } = await supabase.storage.from("item-images").download(p);
        if (data) files.push({ bucket: "item-images", path: p, data: await blobToB64(data), type: data.type });
      }
      for (const m of tables.location_maps) {
        const { data } = await supabase.storage.from("location-maps").download(m.image_path);
        if (data) files.push({ bucket: "location-maps", path: m.image_path, data: await blobToB64(data), type: data.type });
      }
      const bundle: Bundle = {
        format: "scanloc8-export", version: 1, source_company: company,
        exported_at: new Date().toISOString(), tables, files,
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `scanloc8-${company}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const n = TABLES.reduce((s, t) => s + tables[t].length, 0);
      toast.success(`Exported ${n} records and ${files.length} images`);
    } catch (e: any) {
      toast.error(`Export failed: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (file: File) => {
    setBusy("Importing…");
    try {
      const bundle = JSON.parse(await file.text()) as Bundle;
      if (bundle.format !== "scanloc8-export") throw new Error("Not a ScanLoc8 export file");
      if (!confirm(`Import data from "${bundle.source_company}" into "${company}"? Existing records with the same IDs will be overwritten.`)) return;

      // Upload images first and remember new public URLs.
      const urlMap = new Map<string, string>();
      for (const f of bundle.files) {
        const path = f.bucket === "item-images" ? f.path : f.path;
        const { error } = await supabase.storage.from(f.bucket).upload(path, b64ToBlob(f.data, f.type), { contentType: f.type, upsert: true });
        if (error) throw new Error(`Image ${path}: ${error.message}`);
        if (f.bucket === "item-images") urlMap.set(f.path, supabase.storage.from("item-images").getPublicUrl(path).data.publicUrl);
      }

      let count = 0;
      for (const t of TABLES) {
        let rows = (bundle.tables[t] ?? []).map((r) => ({ ...r, company_slug: company }));
        if (t === "company_settings") rows = rows.map(({ id: _id, ...r }) => r);
        if (t === "items") rows = rows.map((r) => {
          const p = itemImagePath(r.image_url);
          return p && urlMap.has(p) ? { ...r, image_url: urlMap.get(p) } : r;
        });
        if (!rows.length) continue;
        const onConflict = t === "company_settings" ? "company_slug" : "id";
        const { error } = await (supabase.from(t as any) as any).upsert(rows, { onConflict });
        if (error) throw new Error(`${t}: ${error.message}`);
        count += rows.length;
      }
      toast.success(`Imported ${count} records and ${bundle.files.length} images`);
    } catch (e: any) {
      toast.error(`Import failed: ${e.message}`);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <h2 className="font-semibold">Export / Import company data</h2>
          <p className="text-sm text-muted-foreground">
            Items with photos, tags, locations, floor plans with zones, and fixed readers with antenna mapping for this company — in one file.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={doExport} disabled={!!busy}><Download className="h-4 w-4 mr-1" />Export</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={!!busy}><Upload className="h-4 w-4 mr-1" />Import</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); }} />
          {busy && <span className="text-sm text-muted-foreground self-center">{busy}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
