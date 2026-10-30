import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Trash2 } from "lucide-react";
import { HandheldShell } from "@/components/HandheldShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useHandheldScanner, loadLocationNames, loadItemNames } from "@/hooks/use-handheld-scanner";
import { supabase } from "@/integrations/supabase/client";
import { linkSavedEpcs } from "@/lib/link-epcs.functions";
import { draftKey } from "@/lib/handheld-draft";
import { submitHandheld, completeHandheld } from "@/lib/handheld-submit";

export const Route = createFileRoute("/handheld/stock-movement")({
  component: StockMovement,
  head: () => ({
    meta: [
      { title: "Stock Movement — ScanLoc8 Handheld" },
      { name: "description", content: "Move RFID-tagged stock from one location to another." },
      { property: "og:title", content: "Stock Movement — ScanLoc8 Handheld" },
      { property: "og:description", content: "Move RFID-tagged stock from one location to another." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function StockMovement() {
  const { companySlug, user } = useAuth();
  const navigate = useNavigate();
  const linkFn = useServerFn(linkSavedEpcs);
  const [locations, setLocations] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [atFrom, setAtFrom] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const recoveryKey = user && companySlug ? draftKey(user.id, companySlug, "stock-movement", from) : undefined;
  const { tags, clear, storageError } = useHandheldScanner(companySlug, !!from && !saving, recoveryKey);

  useEffect(() => {
    if (companySlug) loadLocationNames(companySlug).then(setLocations).catch(() => setLocations([]));
  }, [companySlug]);

  useEffect(() => {
    if (!companySlug || !from) return setAtFrom(new Set());
    supabase
      .from("rfid_scans")
      .select("epc")
      .eq("company_slug", companySlug)
      .eq("location", from)
      .then(({ data }) => setAtFrom(new Set((data ?? []).map((r) => r.epc.toUpperCase()))));
  }, [companySlug, from, clear]);

  // Only tags currently recorded at the start location count.
  const moving = useMemo(() => [...tags.entries()].filter(([epc]) => atFrom.has(epc)), [tags, atFrom]);
  const ignored = tags.size - moving.length;

  useEffect(() => {
    if (!companySlug || moving.length === 0) return;
    const t = setTimeout(() => loadItemNames(companySlug, moving.map(([e]) => e)).then(setNames), 400);
    return () => clearTimeout(t);
  }, [companySlug, moving]);

  const save = async () => {
    if (!companySlug || !from || !to || moving.length === 0) return;
    if (from === to) return toast.error("Pick a different destination.");
    setSaving(true);
    try {
      const epcs = moving.map(([e]) => e);
      if (!recoveryKey) throw new Error("Sign in before submitting");
      await submitHandheld(recoveryKey, "stock-movement", to, moving, from);
      await linkFn({ data: { epcs } });
      toast.success(`Moved ${epcs.length} tag${epcs.length === 1 ? "" : "s"} from ${from} to ${to}`);
      clear();
      completeHandheld(recoveryKey);
      navigate({ to: "/handheld" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Move failed");
    } finally {
      setSaving(false);
    }
  };

  const selectCls = "mt-1 h-12 w-full rounded-md border border-input bg-background px-3 text-base";

  return (
    <HandheldShell title="Stock Movement">
      <label className="block text-sm font-medium text-foreground">
        From location
        <select
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            e.target.blur();
          }}
          className={selectCls}
        >
          <option value="">Pick start location…</option>
          {locations.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </label>

      {from && (
        <>
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <p className="text-4xl font-semibold text-foreground">{moving.length}</p>
            <p className="text-sm text-muted-foreground">
              of {atFrom.size} tags in {from} scanned — pull the trigger
            </p>
            {ignored > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">{ignored} tag{ignored === 1 ? "" : "s"} from other locations ignored</p>
            )}
          </div>

          <label className="block text-sm font-medium text-foreground">
            Move to
            <select
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                e.target.blur();
              }}
              className={selectCls}
            >
              <option value="">Pick new location…</option>
              {locations.filter((l) => l !== from).map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>

          <div className="flex gap-2">
            {storageError && <p role="alert" className="text-sm text-destructive">This device cannot save a recovery copy. Keep this screen open until submitted.</p>}
            <Button className="h-12 flex-1 text-base" onClick={save} disabled={saving || !to || moving.length === 0}>
              <ArrowRight className="mr-2 h-5 w-5" />
              {saving ? "Moving…" : `Move ${moving.length} tag${moving.length === 1 ? "" : "s"}`}
            </Button>
            <Button variant="outline" className="h-12" onClick={clear} disabled={tags.size === 0} aria-label="Clear">
              <Trash2 className="h-5 w-5" />
            </Button>
          </div>

          <ul className="space-y-1">
            {moving.map(([epc, n]) => (
              <li key={epc} className="rounded-md border border-border bg-card px-3 py-2">
                <p className="truncate text-sm font-medium text-foreground">{names.get(epc) ?? "Unlinked tag"}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{epc} · ×{n}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </HandheldShell>
  );
}
