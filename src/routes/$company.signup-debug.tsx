import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, RefreshCw, CheckCircle2, XCircle, Mail, Bug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getAuthDiagnostics } from "@/lib/auth-diagnostics.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/$company/signup-debug")({
  component: SignupDebugPage,
  head: () => ({
    meta: [{ title: "Admin — Signup Troubleshooting" }],
  }),
});

interface AuthLogEntry {
  id: string;
  timestamp: number;
  level: string | null;
  msg: string | null;
  path: string | null;
  status: string | null;
  error: string | null;
  raw: string;
}

interface RecentProfile {
  user_id: string;
  email: string | null;
  created_at: string;
  has_role: boolean;
}

interface Diagnostics {
  authLogs: AuthLogEntry[];
  recentProfiles: RecentProfile[];
  warnings: string[];
  error: string | null;
}

function SignupDebugPage() {
  return (
    <AuthGuard adminOnly>
      <SignupDebugContent />
    </AuthGuard>
  );
}

function SignupDebugContent() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const result = await getAuthDiagnostics({
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load diagnostics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const lastSignup = data?.authLogs.find((l) => l.path === "/signup") ?? null;
  const lastSignupSuccess = lastSignup && lastSignup.status === "200";
  const lastSignupError = lastSignup && lastSignup.status && parseInt(lastSignup.status) >= 400;

  // Email send detection: GoTrue logs an "Sent confirmation email" or similar
  // when it dispatches via the email provider. The status of the /signup call
  // tells us whether the auth row + email dispatch succeeded as a unit.
  const lastEmailLog = data?.authLogs.find(
    (l) => l.msg?.toLowerCase().includes("email") || l.msg?.toLowerCase().includes("mail")
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="flex-1 px-4 py-4 space-y-4 max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Signup Troubleshooting</h1>
          </div>
          <Button onClick={fetchData} disabled={loading} size="sm" variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {data?.warnings.map((w, i) => (
          <Alert key={i}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{w}</AlertDescription>
          </Alert>
        ))}

        {data?.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs font-mono">{data.error}</AlertDescription>
          </Alert>
        )}

        {/* Last signup summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Last Signup Event</CardTitle>
          </CardHeader>
          <CardContent>
            {!lastSignup ? (
              <p className="text-sm text-muted-foreground">
                {data
                  ? "No /signup events found in recent auth logs."
                  : "Loading..."}
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {lastSignupSuccess ? (
                    <Badge className="bg-success/20 text-success-foreground">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Success ({lastSignup.status})
                    </Badge>
                  ) : lastSignupError ? (
                    <Badge variant="destructive">
                      <XCircle className="h-3 w-3 mr-1" /> Failed ({lastSignup.status})
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{lastSignup.status ?? "unknown"}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(lastSignup.timestamp / 1000).toLocaleString()}
                  </span>
                </div>
                {lastSignup.msg && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Message</p>
                    <p className="text-sm font-mono bg-muted/50 p-2 rounded">
                      {lastSignup.msg}
                    </p>
                  </div>
                )}
                {lastSignup.error && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Error</p>
                    <p className="text-sm font-mono bg-destructive/10 text-destructive p-2 rounded">
                      {lastSignup.error}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Email dispatch indicator */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" /> Confirmation Email Dispatch
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!data ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : lastSignupSuccess ? (
              <div className="space-y-2">
                <Badge className="bg-success/20 text-success-foreground">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Triggered
                </Badge>
                <p className="text-xs text-muted-foreground">
                  Supabase accepted the signup (HTTP 200) which means the
                  confirmation email was queued with the default email provider.
                  If the recipient didn't receive it, check spam, the
                  recipient's domain reputation, or set up a custom sender
                  domain for better deliverability.
                </p>
                {lastEmailLog && (
                  <div className="text-xs font-mono bg-muted/50 p-2 rounded mt-2">
                    {lastEmailLog.msg}
                  </div>
                )}
              </div>
            ) : lastSignupError ? (
              <div className="space-y-2">
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" /> Not sent
                </Badge>
                <p className="text-xs text-muted-foreground">
                  The signup itself failed, so no confirmation email was
                  dispatched. See the error above.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No recent signup attempts to evaluate.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent profiles */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Profile Creations (DB)</CardTitle>
          </CardHeader>
          <CardContent>
            {!data ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : data.recentProfiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No profiles found.</p>
            ) : (
              <div className="space-y-2">
                {data.recentProfiles.map((p) => (
                  <div
                    key={p.user_id}
                    className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.email ?? p.user_id}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleString()}
                      </p>
                    </div>
                    {p.has_role ? (
                      <Badge variant="outline" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> role
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">
                        no role
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Raw auth log feed */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Auth Events</CardTitle>
          </CardHeader>
          <CardContent>
            {!data ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : data.authLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No live auth events available.
                {data.warnings.length > 0
                  ? " (See warning above.)"
                  : ""}
              </p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-auto">
                {data.authLogs.map((l) => (
                  <div
                    key={l.id}
                    className="text-xs font-mono border-b border-border pb-2 last:border-0"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={
                          l.status && parseInt(l.status) >= 400
                            ? "destructive"
                            : "outline"
                        }
                        className="text-[10px]"
                      >
                        {l.path ?? "-"} {l.status ?? ""}
                      </Badge>
                      <span className="text-muted-foreground">
                        {new Date(l.timestamp / 1000).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-foreground">{l.msg ?? "(no message)"}</p>
                    {l.error && (
                      <p className="text-destructive mt-1">{l.error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
