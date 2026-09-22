import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, AlertTriangle, Copy } from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/AuthGuard";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { analyzeScanSession, type ScanAuditResult } from "@/lib/scan-audit.functions";

export const Route = createFileRoute("/$company/scan-audit")({
  component: ScanAuditPage,
  head: () => ({
    meta: [
      { title: "Scan Audit — ScanLoc8" },
      {
        name: "description",
        content: "Check an RFID scan session for duplicate or unusual tags with an AI summary.",
      },
      { property: "og:title", content: "Scan Audit — ScanLoc8" },
      {
        property: "og:description",
        content: "Check an RFID scan session for duplicate or unusual tags with an AI summary.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const severityClass: Record<string, string> = {
  high: "border-destructive/40 bg-destructive/5",
  medium: "border-primary/40 bg-primary/5",
  low: "border-border bg-card",
};

function ScanAuditPage() {
  const { company } = Route.useParams();
  const run = useServerFn(analyzeScanSession);

  const [mode, setMode] = useState<"recent" | "paste">("recent");
  const [hours, setHours] = useState("8");
  const [location, setLocation] = useState("");
  const [pasted, setPasted] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanAuditResult | null>(null);

  const handleRun = async () => {
    if (mode === "paste" && !pasted.trim()) {
      toast.error("Paste the tag numbers from your scan session first.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await run({
        data: {
          companySlug: company,
          mode,
          hours: Math.min(168, Math.max(1, Number(hours) || 8)),
          pasted,
          location,
        },
      });
      setResult(res);
      if (res.stats.uniqueEpcs === 0) toast.info("No scans found for that session.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const copyList = (rows: string[]) => {
    navigator.clipboard.writeText(rows.join("\n"));
    toast.success("Copied");
  };

  return (
    <AuthGuard requirePermission="scanner.use">
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader />

        <main className="flex-1 px-4 py-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Scan Session Check
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button
                  variant={mode === "recent" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setMode("recent")}
                >
                  Recent scans
                </Button>
                <Button
                  variant={mode === "paste" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setMode("paste")}
                >
                  Paste tag list
                </Button>
              </div>

              {mode === "recent" ? (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">Last (hours)</label>
                    <Input
                      value={hours}
                      inputMode="numeric"
                      onChange={(e) => setHours(e.target.value.replace(/[^0-9]/g, ""))}
                    />
                  </div>
                  <div className="flex-[2]">
                    <label className="text-xs text-muted-foreground">Location (optional)</label>
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. Goods In"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    placeholder="Paste tag numbers, one per line"
                    className="font-mono text-xs min-h-40"
                  />
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Location for this session (optional)"
                  />
                </div>
              )}

              <Button onClick={handleRun} disabled={loading} className="w-full gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {loading ? "Checking session..." : "Check session"}
              </Button>
            </CardContent>
          </Card>

          {result && (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-foreground whitespace-pre-line">{result.summary}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["Reads", result.stats.totalReads],
                      ["Unique tags", result.stats.uniqueEpcs],
                      ["Repeated", result.stats.duplicateEpcs],
                      ["Unlinked", result.stats.unlinkedEpcs],
                      ["Odd format", result.stats.malformedEpcs],
                      ["Wrong prefix", result.stats.prefixMismatches],
                      ["Multi-location", result.stats.multiLocationEpcs],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg border border-border bg-card p-2">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-lg font-semibold text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {result.findings.length > 0 && (
                <div className="space-y-2">
                  {result.findings.map((f, i) => (
                    <div key={i} className={`rounded-lg border p-3 ${severityClass[f.severity] ?? severityClass.low}`}>
                      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {f.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>
                    </div>
                  ))}
                </div>
              )}

              {result.recommendations.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Suggested next steps</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                      {result.recommendations.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {result.duplicates.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">Repeated tags</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyList(result.duplicates.map((d) => d.epc))}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-1 max-h-72 overflow-y-auto">
                    {result.duplicates.map((d) => (
                      <div key={d.epc} className="flex items-center justify-between rounded-md border border-border p-2">
                        <span className="font-mono text-xs truncate">{d.epc}</span>
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">×{d.reads}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {result.unusual.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">Unusual tags</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyList(result.unusual.map((u) => u.epc))}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-1 max-h-72 overflow-y-auto">
                    {result.unusual.map((u) => (
                      <div key={u.epc} className="rounded-md border border-border p-2">
                        <p className="font-mono text-xs truncate">{u.epc}</p>
                        <p className="text-xs text-muted-foreground">{u.reason}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
