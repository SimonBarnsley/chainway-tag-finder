import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { HandheldShell } from "@/components/HandheldShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useHandheldScanner, loadLocationNames, loadItemNames } from "@/hooks/use-handheld-scanner";
import { supabase } from "@/integrations/supabase/client";

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
  const { tags, clear } = useHandheldScanner(companySlug, !!location);

  useEffect(() => {
    if (companySlug) loadLocationNames(companySlug).then(setLocations);
  }, [companySlug]);

  useEffect(() => {
    clear();
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
          <Button variant="outline" className="h-12 w-full" onClick={clear}>
            Restart count
          </Button>
        </>
      )}
    </HandheldShell>
  );
}
