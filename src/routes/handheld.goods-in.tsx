import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, Trash2 } from "lucide-react";
import { HandheldShell } from "@/components/HandheldShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useHandheldScanner, loadLocationNames, loadItemNames } from "@/hooks/use-handheld-scanner";
import { supabase } from "@/integrations/supabase/client";
import { linkSavedEpcs } from "@/lib/link-epcs.functions";

export const Route = createFileRoute("/handheld/goods-in")({
  component: GoodsIn,
  head: () => ({
    meta: [
      { title: "Goods In — ScanLoc8 Handheld" },
      { name: "description", content: "Scan arriving RFID-tagged stock into a location." },
      { property: "og:title", content: "Goods In — ScanLoc8 Handheld" },
      { property: "og:description", content: "Scan arriving RFID-tagged stock into a location." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function GoodsIn() {
  const { companySlug, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const linkFn = useServerFn(linkSavedEpcs);
  const [locations, setLocations] = useState<string[]>([]);
  const [locStatus, setLocStatus] = useState<"loading" | "ready" | "error">("loading");
  const [locError, setLocError] = useState("");
  const [location, setLocation] = useState("");
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const { tags, clear } = useHandheldScanner(companySlug, true);

  useEffect(() => {
    if (!companySlug) return;
    setLocStatus("loading");
    loadLocationNames(companySlug)
      .then((l) => {
        setLocations(l);
        setLocStatus("ready");
      })
      .catch((e) => {
        setLocError(e instanceof Error ? e.message : String(e));
        setLocStatus("error");
      });
  }, [companySlug]);

  useEffect(() => {
    if (!companySlug || tags.size === 0) return;
    const t = setTimeout(() => loadItemNames(companySlug, Array.from(tags.keys())).then(setNames), 400);
    return () => clearTimeout(t);
  }, [companySlug, tags]);

  const save = async () => {
    if (!companySlug) return toast.error("No company assigned to your account.");
    if (!location) return toast.error("Pick a location first.");
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const epcs = Array.from(tags.keys());
      const { data: existing } = await supabase
        .from("rfid_scans")
        .select("epc, first_seen, scan_count")
        .eq("company_slug", companySlug)
        .in("epc", epcs);
      const ex = new Map((existing ?? []).map((r) => [r.epc, r]));
      const rows = epcs.map((epc) => ({
        epc,
        company_slug: companySlug,
        first_seen: ex.get(epc)?.first_seen ?? now,
        last_seen: now,
        scan_count: (ex.get(epc)?.scan_count ?? 0) + (tags.get(epc) ?? 1),
        location,
      }));
      const { error } = await supabase.from("rfid_scans").upsert(rows, { onConflict: "epc" });
      if (error) throw new Error(error.message);
      try {
        await linkFn({ data: { epcs } });
      } catch (e) {
        console.error("[goods-in] link failed", e);
      }
      toast.success(`${epcs.length} tag${epcs.length === 1 ? "" : "s"} booked into ${location}`);
      clear();
      setNames(new Map());
      navigate({ to: "/handheld" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <HandheldShell title="Goods In">
      <label className="block text-sm font-medium text-foreground">
        Receiving location
        <select
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            // Hand focus straight back to the hidden scanner input so tag
            // reads work immediately without tapping the screen.
            e.target.blur();
          }}
          className="mt-1 h-12 w-full rounded-md border border-input bg-background px-3 text-base"
        >
          <option value="">Pick a location…</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {!authLoading && !companySlug && (
        <p className="text-sm text-destructive">Your account has no company assigned, so there are no locations to pick.</p>
      )}
      {companySlug && locStatus === "loading" && <p className="text-sm text-muted-foreground">Loading locations…</p>}
      {companySlug && locStatus === "error" && (
        <p className="text-sm text-destructive">Couldn't load locations: {locError}</p>
      )}
      {companySlug && locStatus === "ready" && locations.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No locations found for company "{companySlug}". Add them on the Locations page in the full app.
        </p>
      )}

      <div className="rounded-lg border border-border bg-card p-4 text-center">
        <p className="text-4xl font-semibold text-foreground">{tags.size}</p>
        <p className="text-sm text-muted-foreground">tags scanned — pull the trigger</p>
      </div>

      <div className="flex gap-2">
        <Button className="h-12 flex-1 text-base" onClick={save} disabled={saving || tags.size === 0 || !location}>
          <Save className="mr-2 h-5 w-5" />
          {saving ? "Saving…" : "Book in"}
        </Button>
        <Button variant="outline" className="h-12" onClick={clear} disabled={tags.size === 0}>
          <Trash2 className="h-5 w-5" />
        </Button>
      </div>

      <ul className="space-y-1">
        {Array.from(tags.entries()).map(([epc, n]) => (
          <li key={epc} className="rounded-md border border-border bg-card px-3 py-2">
            <p className="truncate text-sm font-medium text-foreground">{names.get(epc) ?? "Unlinked tag"}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {epc} · ×{n}
            </p>
          </li>
        ))}
      </ul>
    </HandheldShell>
  );
}
