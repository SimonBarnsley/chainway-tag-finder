import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/AuthGuard";
import { useState, useRef } from "react";
import { AppHeader } from "@/components/AppHeader";
import {
  Upload,
  FileSpreadsheet,
  Check,
  AlertCircle,
  Loader2,
  Download,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/$company/bulk-upload")({
  component: BulkUploadPage,
  head: () => ({
    meta: [
      { title: "Bulk Upload — RFID Inventory" },
      { name: "description", content: "Bulk upload items with auto-generated SGTIN-96 EPCs" },
    ],
  }),
});

interface BulkItem {
  name: string;
  description: string;
  category: string;
  sku: string;
  gtin: string;
  price: string;
  warehouse_location: string;
  company_prefix: string;
  item_reference: string;
  filter: string;
  generated_epc: string;
  status: "pending" | "success" | "error";
  error?: string;
}

const EMPTY_ROW: BulkItem = {
  name: "",
  description: "",
  category: "",
  sku: "",
  gtin: "",
  price: "",
  warehouse_location: "",
  company_prefix: "0000000",
  item_reference: "",
  filter: "1",
  generated_epc: "",
  status: "pending",
};

function BulkUploadPage() {
  const { company } = Route.useParams();
  const [items, setItems] = useState<BulkItem[]>([]);
  const [defaultPrefix, setDefaultPrefix] = useState("0000000");
  const [defaultFilter, setDefaultFilter] = useState("1");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseCSV = (text: string): BulkItem[] => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/["\s]/g, ""));
    const rows: BulkItem[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === 0 || (values.length === 1 && !values[0])) continue;
      const get = (key: string) => {
        const idx = headers.indexOf(key);
        return idx >= 0 && idx < values.length ? values[idx].trim() : "";
      };
      const cp = get("company_prefix") || get("companyprefix") || defaultPrefix;
      const ir = get("item_reference") || get("itemreference") || "";
      const f = get("filter") || defaultFilter;
      rows.push({
        name: get("name"), description: get("description"), category: get("category"),
        sku: get("sku"), gtin: get("gtin"), price: get("price"),
        warehouse_location: get("warehouse_location") || get("warehouselocation") || get("location"),
        company_prefix: cp, item_reference: ir, filter: f,
        generated_epc: "", status: "pending",
      });
    }
    return rows;
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
      else { current += ch; }
    }
    result.push(current);
    return result;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) { toast.error("No valid rows found in CSV"); return; }
      setItems(parsed);
      toast.success(`Loaded ${parsed.length} items from CSV`);
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const addRow = () => {
    setItems((prev) => [...prev, { ...EMPTY_ROW, company_prefix: defaultPrefix, filter: defaultFilter }]);
  };

  const updateItem = (index: number, field: keyof BulkItem, value: string) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value, status: "pending" };
      return updated;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleBulkInsert = async () => {
    const valid = items.filter((i) => i.name.trim());
    if (valid.length === 0) { toast.error("No valid items to upload (need a name)"); return; }

    // Pre-flight: in-batch duplicate detection (name / sku / gtin)
    const seenNames = new Map<string, number>();
    const seenSkus = new Map<string, number>();
    const seenGtins = new Map<string, number>();
    const inBatchDupes: number[] = [];
    valid.forEach((it) => {
      const idx = items.indexOf(it);
      const n = it.name.trim().toLowerCase();
      const s = it.sku.trim().toLowerCase();
      const g = it.gtin.trim();
      let dup = false;
      if (seenNames.has(n)) dup = true; else seenNames.set(n, idx);
      if (s && seenSkus.has(s)) dup = true; else if (s) seenSkus.set(s, idx);
      if (g && seenGtins.has(g)) dup = true; else if (g) seenGtins.set(g, idx);
      if (dup) inBatchDupes.push(idx);
    });
    if (inBatchDupes.length > 0) {
      setItems((prev) => {
        const u = [...prev];
        inBatchDupes.forEach((i) => { u[i] = { ...u[i], status: "error", error: "Duplicate within batch (name/SKU/GTIN)" }; });
        return u;
      });
      toast.error(`${inBatchDupes.length} duplicate row(s) within the batch — fix and retry`);
      return;
    }

    setUploading(true);
    setProgress(0);
    let successCount = 0;
    for (let i = 0; i < valid.length; i++) {
      const item = valid[i];
      const idx = items.indexOf(item);
      try {
        // DB duplicate check (name / sku / gtin within company)
        const orParts: string[] = [`name.eq.${item.name.trim()}`];
        if (item.sku.trim()) orParts.push(`sku.eq.${item.sku.trim()}`);
        if (item.gtin.trim()) orParts.push(`gtin.eq.${item.gtin.trim()}`);
        const { data: existing, error: dupErr } = await supabase
          .from("items")
          .select("id, name, sku, gtin")
          .eq("company_slug", company)
          .or(orParts.join(","))
          .limit(1);
        if (dupErr) throw dupErr;
        if (existing && existing.length > 0) {
          const e = existing[0];
          const reason = e.sku && e.sku === item.sku.trim() ? `SKU "${e.sku}"` :
                         e.gtin && e.gtin === item.gtin.trim() ? `GTIN "${e.gtin}"` :
                         `name "${e.name}"`;
          throw new Error(`Duplicate ${reason} already exists`);
        }

        const { error: itemErr } = await supabase.from("items").insert({
          name: item.name.trim(), description: item.description || null, category: item.category || null,
          sku: item.sku || null, gtin: item.gtin || null, price: item.price ? Number(item.price) : null,
          warehouse_location: item.warehouse_location || null, company_slug: company,
        }).select("id").single();
        if (itemErr) throw itemErr;
        setItems((prev) => { const u = [...prev]; u[idx] = { ...u[idx], status: "success" }; return u; });
        successCount++;
      } catch (err: unknown) {
        setItems((prev) => { const u = [...prev]; u[idx] = { ...u[idx], status: "error", error: err instanceof Error ? err.message : "Insert failed" }; return u; });
      }
      setProgress(Math.round(((i + 1) / valid.length) * 100));
    }
    setUploading(false);
    toast.success(`Uploaded ${successCount} of ${valid.length} items`);
  };

  const downloadTemplate = () => {
    const csv =
      "name,description,category,sku,gtin,price,warehouse_location,company_prefix,item_reference,filter\n" +
      '"Widget A","A sample widget","Electronics","WDG-001","00614141000012","29.99","Aisle 3","0614141","200001","1"\n' +
      '"Widget B","Another widget","Electronics","WDG-002","00614141000029","39.99","Aisle 4","0614141","200002","1"';
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulk-upload-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportItemsCSV = () => {
    const escCSV = (v: string) => v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    const header = "name,description,category,sku,gtin,price,warehouse_location,company_prefix,item_reference,filter,generated_epc,status";
    const rows = items.map((i) =>
      [i.name, i.description, i.category, i.sku, i.gtin, i.price, i.warehouse_location, i.company_prefix, i.item_reference, i.filter, i.generated_epc, i.status]
        .map((v) => escCSV(v)).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bulk-items-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const namedCount = items.filter((i) => i.name.trim()).length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const successCount = items.filter((i) => i.status === "success").length;

  return (
    <AuthGuard adminOnly>
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader actions={
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={downloadTemplate}>
          <Download className="h-3.5 w-3.5" /> Template
        </Button>
      } />

      <main className="flex-1 px-4 py-4 space-y-4 max-w-7xl mx-auto w-full">
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <Zap className="h-3.5 w-3.5" /> GS1 SGTIN-96 Defaults
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Default Company Prefix</label>
                <Input value={defaultPrefix} onChange={(e) => setDefaultPrefix(e.target.value.replace(/\D/g, ""))} placeholder="0614141" className="text-xs font-mono h-8" maxLength={12} />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Default Filter (0-7)</label>
                <Input value={defaultFilter} onChange={(e) => setDefaultFilter(e.target.value)} type="number" min={0} max={7} className="text-xs font-mono h-8" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-2">
          <Button onClick={() => fileRef.current?.click()} variant="outline" className="gap-1.5 text-xs h-12 flex-col">
            <Upload className="h-4 w-4" /> Upload CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFileUpload} className="hidden" />
          <Button onClick={addRow} variant="outline" className="gap-1.5 text-xs h-12 flex-col">
            <Plus className="h-4 w-4" /> Add Row
          </Button>
          <Button onClick={exportItemsCSV} variant="outline" className="gap-1.5 text-xs h-12 flex-col" disabled={items.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>

        {items.length > 0 && (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{items.length} items loaded</span>
              <div className="flex gap-3">
                {namedCount > 0 && <span className="text-primary">{namedCount} ready</span>}
                {errorCount > 0 && <span className="text-destructive">{errorCount} errors</span>}
                {successCount > 0 && <span className="text-green-500">{successCount} uploaded</span>}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleBulkInsert} size="sm" className="gap-1.5 flex-1 text-xs" disabled={uploading || items.filter((i) => i.name.trim()).length === 0}>
                {uploading ? (<><Loader2 className="h-3.5 w-3.5 animate-spin" />{progress}%</>) : (<><Upload className="h-3.5 w-3.5" />Upload {items.filter((i) => i.name.trim()).length} Items</>)}
              </Button>
            </div>

            {uploading && (
              <div className="w-full bg-muted rounded-full h-1.5">
                <div className="bg-primary h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            )}

            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {items.map((item, idx) => (
                <Card key={idx} className={`overflow-hidden ${item.status === "success" ? "border-green-500/30 bg-green-500/5" : item.status === "error" ? "border-destructive/30 bg-destructive/5" : ""}`}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground font-mono">#{idx + 1}</span>
                        {item.status === "success" && <Check className="h-3.5 w-3.5 text-green-500" />}
                        {item.status === "error" && (
                          <span className="flex items-center gap-1 text-[10px] text-destructive">
                            <AlertCircle className="h-3 w-3" /> {item.error}
                          </span>
                        )}
                      </div>
                      <button onClick={() => removeItem(idx)} className="p-1 rounded hover:bg-accent text-muted-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Input value={item.name} onChange={(e) => updateItem(idx, "name", e.target.value)} placeholder="Name *" className="text-xs h-7" />
                      <Input value={item.category} onChange={(e) => updateItem(idx, "category", e.target.value)} placeholder="Category" className="text-xs h-7" />
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <Input value={item.sku} onChange={(e) => updateItem(idx, "sku", e.target.value)} placeholder="SKU" className="text-xs h-7" />
                      <Input value={item.gtin} onChange={(e) => updateItem(idx, "gtin", e.target.value)} placeholder="GTIN" className="text-xs font-mono h-7" />
                      <Input value={item.price} onChange={(e) => updateItem(idx, "price", e.target.value)} placeholder="Price" type="number" className="text-xs h-7" />
                    </div>
                    <Input value={item.warehouse_location} onChange={(e) => updateItem(idx, "warehouse_location", e.target.value)} placeholder="Warehouse location" className="text-xs h-7" />
                    <div className="grid grid-cols-3 gap-1.5">
                      <div>
                        <label className="text-[10px] text-muted-foreground">Company Prefix</label>
                        <Input value={item.company_prefix} onChange={(e) => updateItem(idx, "company_prefix", e.target.value.replace(/\D/g, ""))} className="text-xs font-mono h-7" maxLength={12} />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Item Ref</label>
                        <Input value={item.item_reference} onChange={(e) => updateItem(idx, "item_reference", e.target.value.replace(/\D/g, ""))} placeholder="Auto" className="text-xs font-mono h-7" maxLength={7} />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Filter</label>
                        <Input value={item.filter} onChange={(e) => updateItem(idx, "filter", e.target.value)} type="number" min={0} max={7} className="text-xs font-mono h-7" />
                      </div>
                    </div>
                    {item.generated_epc && (
                      <div className="rounded border border-primary/20 bg-primary/5 px-2 py-1">
                        <p className="text-[10px] text-muted-foreground">Generated EPC</p>
                        <p className="font-mono text-xs text-primary font-bold break-all">{item.generated_epc}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {items.length === 0 && (
          <div className="flex flex-col items-center py-16 text-muted-foreground">
            <FileSpreadsheet className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">No items loaded</p>
            <p className="text-xs mt-1 text-center max-w-xs">
              Upload a CSV file or add rows manually. Each item gets a unique SGTIN-96 EPC generated automatically.
            </p>
            <Button onClick={downloadTemplate} variant="link" className="mt-3 gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> Download CSV template
            </Button>
          </div>
        )}
      </main>
    </div>
    </AuthGuard>
  );
}
