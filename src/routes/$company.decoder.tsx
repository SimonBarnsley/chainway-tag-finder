import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/AuthGuard";
import { useState, useCallback } from "react";
import { Radio, Search, Copy, Check } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { decodeSgtin, type SgtinDecoded } from "@/lib/sgtin-decoder";
import { toast } from "sonner";
import { useRfidScanner, type RfidTag } from "@/hooks/use-rfid-scanner";

export const Route = createFileRoute("/$company/decoder")({
  component: DecoderPage,
  head: () => ({
    meta: [
      { title: "SGTIN Decoder — GS1 EPC Tag Decoder" },
      { name: "description", content: "Decode UHF RFID tags encoded to GS1 SGTIN-96 and SGTIN-198 standards" },
    ],
  }),
});

function DecoderPage() {
  const [epcInput, setEpcInput] = useState("");
  const [prefixFilter, setPrefixFilter] = useState("");
  const [result, setResult] = useState<SgtinDecoded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const decodeEpc = useCallback((rawEpc: string): boolean => {
    const epc = rawEpc.trim();
    if (!epc) return false;

    const prefix = prefixFilter.trim().toUpperCase();
    if (prefix && !epc.toUpperCase().startsWith(prefix)) {
      setError(`EPC does not match filter prefix "${prefix}"`);
      setResult(null);
      return false;
    }

    const decoded = decodeSgtin(epc);
    if ("error" in decoded) {
      setError(decoded.error);
      setResult(null);
      return false;
    }
    setResult(decoded);
    setError(null);
    return true;
  }, [prefixFilter]);

  const handleDecode = (e?: React.FormEvent) => {
    e?.preventDefault();
    decodeEpc(epcInput);
  };

  const handleWedgeScan = useCallback((tag: RfidTag) => {
    const prefix = prefixFilter.trim().toUpperCase();
    if (prefix && !tag.epc.toUpperCase().startsWith(prefix)) {
      // Silently ignore non-matching scans so the wedge only acts on filtered tags
      return;
    }
    setEpcInput(tag.epc.toUpperCase());
    if (decodeEpc(tag.epc)) {
      toast.success(`Scanned ${tag.epc.slice(-12)}`);
    }
  }, [prefixFilter, decodeEpc]);

  useRfidScanner({ enabled: true, onTagScanned: handleWedgeScan });

  const handleCopy = (label: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(label);
    toast.success(`${label} copied`);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const fields: { label: string; value: string; mono?: boolean }[] = result
    ? [
        { label: "Format", value: result.format },
        { label: "Header", value: result.header, mono: true },
        { label: "Filter", value: `${result.filter} — ${result.filterDescription}` },
        { label: "Partition", value: result.partition.toString() },
        { label: "Company Prefix", value: result.companyPrefix, mono: true },
        { label: "Item Reference", value: result.itemReference, mono: true },
        { label: "Serial", value: result.serial, mono: true },
        { label: "GTIN-14", value: result.gtin14, mono: true },
        { label: "Pure Identity URI", value: result.pureIdentityUri, mono: true },
        { label: "Tag URI", value: result.tagUri, mono: true },
      ]
    : [];

  return (
    <AuthGuard>
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />

      <main className="flex-1 px-4 py-4 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground font-medium">
              Enter EPC Hex (SGTIN-96 or SGTIN-198)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              value={prefixFilter}
              onChange={(e) => setPrefixFilter(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="Filter: first 4 hex chars (e.g. 3034)"
              className="font-mono text-xs"
              maxLength={4}
            />
            <form onSubmit={handleDecode} className="flex gap-2">
              <Input value={epcInput} onChange={(e) => setEpcInput(e.target.value.toUpperCase())} placeholder="e.g. 3034257BF7194E4000001A85" className="font-mono text-xs flex-1" autoFocus />
              <Button type="submit" size="sm" className="gap-1" disabled={!epcInput.trim()}>
                <Search className="h-4 w-4" /> Decode
              </Button>
            </form>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive/50">
            <CardContent className="py-4">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {result && (
          <div className="space-y-1">
            {fields.map(({ label, value, mono }) => (
              <div key={label} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-sm text-foreground truncate ${mono ? "font-mono" : ""}`}>{value}</p>
                </div>
                <button onClick={() => handleCopy(label, value)} className="ml-2 p-2 rounded-md hover:bg-accent text-muted-foreground shrink-0">
                  {copiedField === label ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            ))}
          </div>
        )}

        {!result && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Radio className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">Paste an EPC hex string to decode</p>
            <p className="text-xs mt-1">Supports SGTIN-96 (24 hex) and SGTIN-198 (50 hex)</p>
          </div>
        )}
      </main>
    </div>
    </AuthGuard>
  );
}
