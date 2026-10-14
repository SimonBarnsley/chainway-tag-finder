import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/$company/alerts")({
  component: () => (
    <AuthGuard>
      <AlertsPage />
    </AuthGuard>
  ),
  head: () => ({
    meta: [
      { title: "My Alerts — ScanLoc8" },
      { name: "description", content: "Alerts raised by your ScanLoc8 rules." },
      { property: "og:title", content: "My Alerts — ScanLoc8" },
      { property: "og:description", content: "Alerts raised by your ScanLoc8 rules." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const db = supabase as unknown as { from: (t: string) => any };

interface Alert {
  id: string;
  message: string;
  epc: string | null;
  location: string | null;
  read_at: string | null;
  created_at: string;
}

function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const load = useCallback(async () => {
    const { data } = await db.from("alerts").select("*").order("created_at", { ascending: false }).limit(200);
    setAlerts(data ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const markAllRead = async () => {
    await db.from("alerts").update({ read_at: new Date().toISOString() }).is("read_at", null);
    window.dispatchEvent(new Event("alerts-changed"));
    load();
  };

  const clearAll = async () => {
    if (!window.confirm("Delete all alerts, including unread ones? This cannot be undone.")) return;
    await db.from("alerts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    window.dispatchEvent(new Event("alerts-changed"));
    load();
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold text-foreground">My Alerts</h2>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={markAllRead}>Mark all read</Button>
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={clearAll}>Clear all</Button>
          </div>
        </div>
        {alerts.length === 0 && <p className="text-sm text-muted-foreground">No alerts yet.</p>}
        {alerts.map((a) => (
          <Card key={a.id} className={a.read_at ? "opacity-70" : "border-primary/50"}>
            <CardContent className="p-4">
              <p className="font-medium text-foreground">{a.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(a.created_at).toLocaleString()} {a.epc && <span className="font-mono">· {a.epc}</span>}
              </p>
            </CardContent>
          </Card>
        ))}
      </main>
    </div>
  );
}
