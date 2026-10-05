import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { HandheldShell } from "@/components/HandheldShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useHandheldScanner, loadLocationNames, loadItemNames } from "@/hooks/use-handheld-scanner";
import { supabase } from "@/integrations/supabase/client";
import { linkSavedEpcs } from "@/lib/link-epcs.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/handheld/stock-check")({
  component: StockCheck,
  head: () => ({
    meta: [
      { title: "Stock Check — ScanLoc8 Handheld" },
      { name: "description", content: "Count a location and see found, missing and unexpected items." },
      { property: "og:title", content: "Stock Check — ScanLoc8 Handheld" },
      { property: "og:description", content: "Count a location and see found, missing and unexpected items." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Tab = "found" | "missing" | "unexpected";

function StockCheck() {
  const { companySlug } = useAuth();
  const [locations, setLocations] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [expected, setExpected] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [tab, setTab] = useState<Tab>("missing");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { tags, clear } = useHandheldScanner(companySlug, !!location);
  const runLinkSavedEpcs = useServerFn(linkSavedEpcs);

  useEffect(() => {
    if (companySlug) loadLocationNames(companySlug).then(setLocations);
  }, [companySlug]);

  useEffect(() => {
    clear();
    setSubmitted(null);
    setSubmitError(null);
    if (!companySlug || !location) return setExpected(new Set());
    supabase
      .from("rfid_scans")
      .select("epc")
      .eq("company_slug", companySlug)
      .eq("location", location)
      .then(({ data }) => setExpected(new Set((data ?? []).map((r) => r.epc.toUpperCase()))));
  }, [companySlug, location, clear]);

  const { found, missing, unexpected } = useMemo(() => {
    const scanned = new Set(tags.keys());
    return {
      found: [...scanned].filter((e) => expected.has(e)),
      missing: [...expected].filter((e) => !scanned.has(e)),
      unexpected: [...scanned].filter((e) => !expected.has(e)),
    };
  }, [tags, expected]);

  useEffect(() => {
    if (!companySlug) return;
    const all = Array.from(new Set([...expected, ...tags.keys()]));
    const t = setTimeout(() => loadItemNames(companySlug, all).then(setNames), 400);
    return () => clearTimeout(t);
  }, [companySlug, expected, tags]);

  const lists: Record<Tab, string[]> = { found, missing, unexpected };

  const submit = async () => {
    if (!companySlug || !location || tags.size === 0) return;
    setSubmitting(true);
    setSubmitted(null);
    setSubmitError(null);
    try {
      const now = new Date().toISOString();
      const rows = [...tags.entries()].map(([epc, count]) => ({
        epc,
        first_seen: now,
        last_seen: now,
        scan_count: count,
        location,
        company_slug: companySlug,
      }));
      const { error } = await supabase
        .from("rfid_scans")
        .upsert(rows, { onConflict: "epc", ignoreDuplicates: false });
      if (error) throw new Error(error.message);

      // Link tags to items and move each linked item to this location.
      await runLinkSavedEpcs({ data: { epcs: [...tags.keys()] } });

      // Refresh the expected list so the new location's contents are current.
      const { data } = await supabase
        .from("rfid_scans")
        .select("epc")
        .eq("company_slug", companySlug)
        .eq("location", location);
      setExpected(new Set((data ?? []).map((r) => r.epc.toUpperCase())));
      setSubmitted(`Saved ${tags.size} tag${tags.size === 1 ? "" : "s"} to ${location}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <HandheldShell title="Stock Check">
      <select
        value={location}
        onChange={(e) => {
          setLocation(e.target.value);
          // Hand focus back to the hidden scanner input so reads start right away.
          e.target.blur();
        }}
        className="h-12 w-full rounded-md border border-input bg-background px-3 text-base"
      >
        <option value="">Pick a location to count…</option>
        {locations.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>

      {location && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {(["found", "missing", "unexpected"] as Tab[]).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-lg border-2 p-3 text-center ${tab === k ? "border-primary bg-primary/10" : "border-border bg-card"}`}
              >
                <p className="text-2xl font-semibold text-foreground">{lists[k].length}</p>
                <p className="text-xs capitalize text-muted-foreground">{k}</p>
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {expected.size} expected here · pull the trigger and walk the location
          </p>
          <ul className="space-y-1">
            {lists[tab].map((epc) => (
              <li key={epc} className="rounded-md border border-border bg-card px-3 py-2">
                <p className="truncate text-sm font-medium text-foreground">{names.get(epc) ?? "Unlinked tag"}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{epc}</p>
              </li>
            ))}
          </ul>
          {submitted && <p className="text-center text-sm font-medium text-green-600">{submitted}</p>}
          {submitError && <p className="text-center text-sm font-medium text-destructive">{submitError}</p>}
          <Button
            className="h-12 w-full"
            disabled={submitting || tags.size === 0}
            onClick={submit}
          >
            {submitting ? "Saving…" : `Submit count (${tags.size} tag${tags.size === 1 ? "" : "s"})`}
          </Button>
          <Button variant="outline" className="h-12 w-full" onClick={clear}>
            Restart count
          </Button>
        </>
      )}
    </HandheldShell>
  );
}
