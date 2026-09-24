import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Stethoscope, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/AuthGuard";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { diagnoseReaderLog, type LogDoctorResult } from "@/lib/log-doctor.functions";

const DESC = "Paste or upload RFID reader logs and get an AI diagnosis of connection, antenna and API-key problems.";

export const Route = createFileRoute("/$company/log-doctor")({
  component: LogDoctorPage,
  head: () => ({
    meta: [
      { title: "Reader Log Doctor — ScanLoc8" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Reader Log Doctor — ScanLoc8" },
      { property: "og:description", content: DESC },
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
const categoryLabel: Record<string, string> = {
  connection: "Connection",
  antenna: "Antenna",
  api_key: "API key",
  other: "Other",
};

function LogDoctorPage() {
  const { company } = Route.useParams();
  const run = useServerFn(diagnoseReaderLog);
  const [log, setLog] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LogDoctorResult | null>(null);

  const onFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 2_000_000) return toast.error("File is too large (max 2 MB).");
    const text = await file.text();
    setLog(text.slice(-200_000));
    toast.success(`Loaded ${file.name}`);
  };

  const handleRun = async () => {
    if (!log.trim()) return toast.error("Paste or upload a reader log first.");
    setLoading(true);
    setResult(null);
    try {
      setResult(await run({ data: { companySlug: company, log: log.slice(-200_000) } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Diagnosis failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthGuard requirePermission="scanner.use">
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="max-w-4xl mx-auto p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold text-foreground">Reader Log Doctor</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Paste or upload a log from your RFID reader. Keys and passwords are hidden before anything is analysed.
          </p>

          <Card>
            <CardContent className="p-4 space-y-3">
              <Textarea
                value={log}
                onChange={(e) => setLog(e.target.value)}
                placeholder="Paste reader log lines here…"
                className="min-h-[220px] font-mono text-xs"
              />
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <label className="cursor-pointer gap-1">
                    <Upload className="h-4 w-4" /> Upload log file
                    <input
                      type="file"
                      accept=".log,.txt,.csv,.json,.xml,text/*"
                      className="hidden"
                      onChange={(e) => onFile(e.target.files?.[0])}
                    />
                  </label>
                </Button>
                <Button size="sm" onClick={handleRun} disabled={loading} className="gap-1">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
                  {loading ? "Analysing…" : "Diagnose"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {result && (
            <>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Summary</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-foreground">{result.summary}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    {[
                      ["Lines", result.signals.lines],
                      ["Key rejected", result.signals.unauthorized],
                      ["Connection errors", result.signals.connectionErrors],
                      ["Timeouts", result.signals.timeouts],
                      ["Antenna mentions", result.signals.antennaMentions],
                      ["Success lines", result.signals.successLines],
                    ].map(([k, v]) => (
                      <div key={k as string} className="rounded border border-border p-2">
                        <div className="text-muted-foreground">{k}</div>
                        <div className="text-lg font-semibold text-foreground">{v}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {result.issues.length === 0 ? (
                <p className="text-sm text-muted-foreground">No likely issues found.</p>
              ) : (
                result.issues.map((i, idx) => (
                  <Card key={idx} className={severityClass[i.severity]}>
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                        <span>{categoryLabel[i.category]}</span>·<span>{i.severity}</span>
                      </div>
                      <div className="font-medium text-foreground">{i.title}</div>
                      <pre className="text-xs bg-muted rounded p-2 whitespace-pre-wrap break-all">{i.evidence}</pre>
                      <p className="text-sm text-foreground"><span className="font-medium">Fix: </span>{i.fix}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
