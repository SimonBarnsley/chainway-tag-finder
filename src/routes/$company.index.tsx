import { createFileRoute, useParams } from "@tanstack/react-router";
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
  const [companyName, setCompanyName] = useState(company);
  const [scanEnabled, setScanEnabled] = useState(true);
  const [tags, setTags] = useState<Map<string, TagEntry>>(new Map());
  const [totalScans, setTotalScans] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [location, setLocation] = useState("");
  const [geigerEpc, setGeigerEpc] = useState<string | null>(null);
  const [lastScannedEpc, setLastScannedEpc] = useState<string | null>(null);
  const [lastScannedTime, setLastScannedTime] = useState(0);

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
    setTotalScans((prev) => prev + 1);
    setLastScannedEpc(tag.epc);
    setLastScannedTime(Date.now());
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
    const unsaved = Array.from(tags.values()).filter((t) => !t.saved);
    if (unsaved.length === 0) {
      toast.info("All tags already saved");
      return;
    }

    setIsSaving(true);
    try {
      const records = unsaved.map((t) => ({
        epc: t.epc,
        scan_count: t.count,
        last_seen: t.lastSeen.toISOString(),
        location: location || null,
        company_slug: company,
      }));

      const { error } = await supabase.from("rfid_scans").upsert(records, {
        onConflict: "epc",
        ignoreDuplicates: false,
      });

      if (error) throw error;

      setTags((prev) => {
        const next = new Map(prev);
        for (const t of unsaved) {
          const entry = next.get(t.epc);
          if (entry) next.set(t.epc, { ...entry, saved: true });
        }
        return next;
      });

      toast.success(`${unsaved.length} tags saved to database`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error("Save failed: " + message);
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

        <ManualEntry onSubmit={addManualTag} />

        {geigerEpc && (
          <GeigerSearch
            targetEpc={geigerEpc}
            lastScannedEpc={lastScannedEpc}
            lastScannedTime={lastScannedTime}
            onClose={() => setGeigerEpc(null)}
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
