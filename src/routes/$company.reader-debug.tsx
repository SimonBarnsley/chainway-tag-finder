import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RefreshCw, Trash2, Radio } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/$company/reader-debug")({
  component: ReaderDebugPage,
  head: () => ({
    meta: [
      { title: "Reader Debug — Live POST capture" },
      { name: "description", content: "Inspect raw payloads sent to /api/zebra-reader" },
    ],
  }),
});

interface DebugLog {
  id: string;
  created_at: string;
  reader_hostname: string | null;
  remote_ip: string | null;
  content_type: string | null;
  content_length: number | null;
  user_agent: string | null;
  query_string: string | null;
  headers: Record<string, string> | null;
  raw_body: string | null;
  parsed_tag_count: number | null;
  parse_error: string | null;
}

function ReaderDebugPage() {
  const { company } = Route.useParams();
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchLogs = async () => {
    const { data, error } = await supabase
      .from("zebra_reader_debug_logs")
      .select("*")
      .eq("company_slug", company)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast.error("Failed to load debug logs");
    } else {
      setLogs((data as DebugLog[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchLogs, 3000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const handleClear = async () => {
    if (!confirm("Delete all debug logs for this company?")) return;
    const { error } = await supabase
      .from("zebra_reader_debug_logs")
      .delete()
      .eq("company_slug", company);
    if (error) toast.error("Delete failed");
    else {
      setLogs([]);
      toast.success("Cleared");
    }
  };

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader />
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio className={`h-4 w-4 ${autoRefresh ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
            <span className="text-sm font-medium">Live reader POSTs (last 50)</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setAutoRefresh((x) => !x)}>
              {autoRefresh ? "Pause" : "Live"}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchLogs} className="gap-1">
              <RefreshCw className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleClear} className="gap-1 text-destructive hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <main className="flex-1 px-4 py-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : logs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              <p>No requests captured yet.</p>
              <p className="mt-2 text-xs">
                When the FX9600 POSTs to <code className="font-mono">/api/zebra-reader?company={company}</code> it will appear here within seconds.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => {
                const isOpen = expanded === log.id;
                return (
                  <div key={log.id} className="rounded-lg border border-border bg-card">
                    <button
                      onClick={() => setExpanded(isOpen ? null : log.id)}
                      className="w-full text-left p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="font-mono text-muted-foreground">
                            {new Date(log.created_at).toLocaleTimeString()}
                          </span>
                          {log.parse_error ? (
                            <span className="text-destructive font-medium">ERROR</span>
                          ) : (
                            <span className="text-primary font-medium">
                              {log.parsed_tag_count ?? 0} tag{log.parsed_tag_count === 1 ? "" : "s"}
                            </span>
                          )}
                          {log.reader_hostname && <span className="text-muted-foreground">{log.reader_hostname}</span>}
                          {log.remote_ip && <span className="text-muted-foreground">{log.remote_ip}</span>}
                          <span className="text-muted-foreground">
                            {log.content_type || "no content-type"} · {log.content_length ?? 0}B
                          </span>
                        </div>
                        {log.parse_error && (
                          <p className="mt-1 text-xs text-destructive truncate">{log.parse_error}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{isOpen ? "−" : "+"}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border p-3 space-y-3 text-xs">
                        <div>
                          <p className="text-muted-foreground mb-1">Query string</p>
                          <pre className="font-mono bg-muted/40 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                            {log.query_string || "(none)"}
                          </pre>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">User-Agent</p>
                          <pre className="font-mono bg-muted/40 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                            {log.user_agent || "(none)"}
                          </pre>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Headers</p>
                          <pre className="font-mono bg-muted/40 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                            {JSON.stringify(log.headers, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Raw body ({log.content_length ?? 0} bytes)</p>
                          <pre className="font-mono bg-muted/40 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all max-h-96">
                            {log.raw_body || "(empty)"}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
