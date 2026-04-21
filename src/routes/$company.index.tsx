import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { Save, Trash2, Power, PowerOff } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { ScannerStatus } from "@/components/ScannerStatus";
import { TagList } from "@/components/TagList";
import { ManualEntry } from "@/components/ManualEntry";
import { LocationSelector } from "@/components/LocationSelector";
import { LocationFilter } from "@/components/LocationFilter";
import { GeigerSearch } from "@/components/GeigerSearch";

import { useRfidScanner, type RfidTag } from "@/hooks/use-rfid-scanner";
import { useZebraSdk } from "@/hooks/use-zebra-sdk";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { linkSavedEpcs } from "@/lib/link-epcs.functions";
import { backfillTagItems } from "@/lib/backfill-tag-items";

export const Route = createFileRoute("/$company/")({
  component: ScannerPage,
  head: () => ({
    meta: [
      { title: "RFID Scanner — Zebra RFD40 + TC22" },
      { name: "description", content: "UHF RFID tag scanner for the Zebra RFD40 sled paired with a TC22 via e-Connex" },
    ],
  }),
});

interface TagEntry {
  epc: string;
  count: number;
  lastSeen: Date;
  saved: boolean;
}

function ScannerPage() {
  const { company } = Route.useParams();
  const { companySlug } = useAuth();
  const linkSavedEpcsFn = useServerFn(linkSavedEpcs);
  const backfillFn = useServerFn(backfillTagItems);
  const [companyName, setCompanyName] = useState(company);
  const [scanEnabled, setScanEnabled] = useState(true);
  const [tags, setTags] = useState<Map<string, TagEntry>>(new Map());
  const [totalScans, setTotalScans] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [location, setLocation] = useState("");
  const [geigerEpc, setGeigerEpc] = useState<string | null>(null);
  // Monotonic counter + last scan info — using a counter ensures the GeigerSearch
  // effect re-fires even when the SAME EPC is scanned repeatedly (which is the
  // normal case in geiger mode — the target tag is read over and over).
  const [lastScan, setLastScan] = useState<{ epc: string; rssi?: number; seq: number } | null>(null);

  useEffect(() => {
    const fetchCompanyName = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("company_name")
        .eq("company_slug", company)
        .limit(1)
        .single();
      if (data?.company_name) setCompanyName(data.company_name);
    };
    fetchCompanyName();
  }, [company]);

  const handleTagScanned = useCallback((tag: RfidTag) => {
    setTotalScans((prev) => {
      const next = prev + 1;
      setLastScan({ epc: tag.epc, rssi: tag.rssi, seq: next });
      return next;
    });
    setTags((prev) => {
      const next = new Map(prev);
      const existing = next.get(tag.epc);
      if (existing) {
        next.set(tag.epc, {
          ...existing,
          count: existing.count + 1,
          lastSeen: tag.timestamp,
        });
      } else {
        next.set(tag.epc, {
          epc: tag.epc,
          count: 1,
          lastSeen: tag.timestamp,
          saved: false,
        });
      }
      return next;
    });

    if (!geigerEpc && navigator.vibrate) {
      navigator.vibrate(50);
    }

  }, [geigerEpc]);

  const { isListening, wedgeStatus, addManualTag } = useRfidScanner({
    enabled: scanEnabled,
    onTagScanned: handleTagScanned,
  });

  // Native Zebra RFD40 SDK bridge — active only inside the Capacitor APK on a TC22
  // docked in the RFD40 sled (e-Connex pin connection). In a regular browser this
  // is a no-op and the keyboard wedge / DataWedge handles input.
  const zebra = useZebraSdk({
    enabled: scanEnabled,
    onTagScanned: handleTagScanned,
  });

  const handleSaveAll = async () => {
    const selectedLocation = location.trim();
    const allTags = Array.from(tags.values());
    const tagsToProcess = selectedLocation
      ? allTags
      : allTags.filter((t) => !t.saved);

    if (tagsToProcess.length === 0) {
      toast.info("All tags already saved");
      return;
    }

    if (!companySlug) {
      toast.error(
        "No company is assigned to your account yet — sign in or set up your company first."
      );
      return;
    }

    setIsSaving(true);
    let okCount = 0;
    let allocatedCount = 0;
    const errors: string[] = [];

    try {
      const epcs = tagsToProcess.map((t) => t.epc.toUpperCase());
      const { data: existingScans, error: existingError } = await supabase
        .from("rfid_scans")
        .select("epc, first_seen, scan_count, location")
        .eq("company_slug", companySlug)
        .in("epc", epcs);

      if (existingError) {
        throw new Error(existingError.message);
      }

      const existingByEpc = new Map((existingScans ?? []).map((scan) => [scan.epc, scan]));
      const payload = tagsToProcess.map((tag) => {
        const epc = tag.epc.toUpperCase();
        const existing = existingByEpc.get(epc);

        return {
          epc,
          company_slug: companySlug,
          first_seen: existing?.first_seen ?? tag.lastSeen.toISOString(),
          last_seen: tag.lastSeen.toISOString(),
          scan_count: Math.max(existing?.scan_count ?? 0, tag.count),
          location: selectedLocation || existing?.location || null,
        };
      });

      const { data: savedRows, error: saveError } = await supabase
        .from("rfid_scans")
        .upsert(payload, { onConflict: "epc" })
        .select("epc, location");

      if (saveError) {
        throw new Error(saveError.message);
      }

      const savedSet = new Set((savedRows ?? []).map((row) => row.epc));

      for (const tag of tagsToProcess) {
        const epc = tag.epc.toUpperCase();
        if (savedSet.has(epc)) {
          okCount++;
          if (selectedLocation) allocatedCount++;
          setTags((prev) => {
            const next = new Map(prev);
            const entry = next.get(tag.epc);
            if (entry) next.set(tag.epc, { ...entry, saved: true });
            return next;
          });
        } else {
          errors.push(`${epc.slice(-8)}: save not confirmed`);
        }
      }

      const summary: string[] = [`${okCount} saved`];
      if (allocatedCount) summary.push(`${allocatedCount} allocated to "${selectedLocation}"`);

      // Auto-link all EPCs currently in the scan buffer, not just freshly saved rows.
      // This lets previously-saved but still-unlinked tags retry automatically
      // instead of requiring the manual "Link to items" action from the dashboard.
      const savedEpcs = Array.from(
        new Set(allTags.map((tag) => tag.epc.toUpperCase()))
      );
      let linkDetails: Array<{ epc: string; itemId: string; itemName: string | null; location: string | null }> = [];
      if (savedEpcs.length > 0) {
        try {
          const linkRes = await linkSavedEpcsFn({ data: { epcs: savedEpcs } });
          if (linkRes?.linked) summary.push(`${linkRes.linked} linked`);
          if (linkRes?.itemsCreated) summary.push(`${linkRes.itemsCreated} new item${linkRes.itemsCreated === 1 ? "" : "s"} created`);
          if (linkRes?.unmatched) summary.push(`${linkRes.unmatched} unmatched`);
          linkDetails = linkRes?.details ?? [];
        } catch (linkErr) {
          console.error("[scanner] linkSavedEpcs failed:", linkErr);
        }
      }

      // Also run the full backfill across all company scans, mirroring the
      // dashboard's "Link EPCs" action so any previously-unlinked tags get
      // resolved automatically on every Save All.
      try {
        const backfillRes = await backfillFn({ data: { companySlug } });
        if (backfillRes?.ok) {
          const extras: string[] = [];
          if (backfillRes.linked) extras.push(`${backfillRes.linked} backfilled`);
          if (extras.length) summary.push(extras.join(" · "));
        }
      } catch (bfErr) {
        console.error("[scanner] backfillTagItems failed:", bfErr);
      }

      if (errors.length > 0) {
        toast.error(
          `${errors.length} failed: ${errors.slice(0, 2).join("; ")}${errors.length > 2 ? "…" : ""}`
        );
      }
      if (okCount > 0) {
        toast.success(summary.join(" · "));

        // Per-EPC confirmation toasts: show item name + saved location
        const detailByEpc = new Map(linkDetails.map((d) => [d.epc, d]));
        for (const tag of tagsToProcess) {
          const epc = tag.epc.toUpperCase();
          if (!savedSet.has(epc)) continue;
          const d = detailByEpc.get(epc);
          const itemLabel = d?.itemName ?? `Item ${d?.itemId?.slice(0, 8) ?? "—"}`;
          const loc = d?.location ?? selectedLocation ?? "no location";
          toast.success(itemLabel, {
            description: `EPC ${epc.slice(-12)} · ${loc}`,
          });
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save scans");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    setTags(new Map());
    setTotalScans(0);
    toast.info("Scan buffer cleared");
  };

  const tagList = Array.from(tags.values()).sort(
    (a, b) => b.lastSeen.getTime() - a.lastSeen.getTime()
  );

  return (
    <AuthGuard>
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />

      <main className="flex-1 px-4 py-4 space-y-4">
        <LocationSelector location={location} onLocationChange={setLocation} />

        <Button
          onClick={() => setScanEnabled(!scanEnabled)}
          variant={scanEnabled ? "default" : "outline"}
          className={`w-full h-14 text-base font-bold gap-2 ${
            scanEnabled
              ? "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(34,197,94,0.3)]"
              : ""
          }`}
        >
          {scanEnabled ? (
            <>
              <Power className="h-5 w-5" />
              SCANNING ACTIVE
            </>
          ) : (
            <>
              <PowerOff className="h-5 w-5" />
              SCANNER OFF
            </>
          )}
        </Button>

        <ScannerStatus
          isListening={isListening}
          tagCount={totalScans}
          uniqueCount={tags.size}
          wedgeStatus={wedgeStatus}
          sdkAvailable={zebra.isNativeSdkAvailable}
          sdkStatus={zebra.status}
          sdkError={zebra.errorMessage}
          sdkScanning={zebra.isScanning}
          readerName={zebra.readerName}
        />

        <div className="flex gap-2">
          <Button
            onClick={handleSaveAll}
            disabled={isSaving || tags.size === 0}
            variant="outline"
            className="flex-1 gap-2"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save All"}
          </Button>
          <Button
            onClick={handleClear}
            disabled={tags.size === 0}
            variant="outline"
            className="gap-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Clear
          </Button>
        </div>

        

        {geigerEpc && (
          <GeigerSearch
            targetEpc={geigerEpc}
            lastScan={lastScan}
            onClose={() => setGeigerEpc(null)}
            sdk={
              zebra.isNativeSdkAvailable
                ? {
                    available: true,
                    isScanning: zebra.isScanning,
                    startScan: zebra.startScan,
                    stopScan: zebra.stopScan,
                  }
                : undefined
            }
          />
        )}

        <div>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Browse by Location
          </h2>
          <LocationFilter onGeigerSearch={setGeigerEpc} companySlug={company} />
        </div>

        <div>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Scanned Tags
          </h2>
          <TagList tags={tagList} companySlug={company} onGeigerSearch={setGeigerEpc} />
        </div>
      </main>

      <footer className="border-t border-border px-4 py-2 text-center">
        <p className="text-xs text-muted-foreground">
          {companyName}
        </p>
      </footer>
    </div>
    </AuthGuard>
  );
}
