import { useCallback, useEffect, useState } from "react";
import { GeigerSearch } from "@/components/GeigerSearch";
import { validLocateProximity } from "@/components/TagProximityMeter";
import { useZebraSdk } from "@/hooks/use-zebra-sdk";

/** One selected EPC; the shared SDK hook remains the owner of trigger handling. */
export function HandheldTagSearch({ epc, onClose }: { epc: string; onClose: () => void }) {
  const [proximity, setProximity] = useState<{ value: number; rssi?: number; seq: number } | null>(null);
  const onProximity = useCallback((data: { epc: string; proximity: number; rssi?: number }) => {
    if (data.epc.toUpperCase() !== epc.toUpperCase()) return;
    const value = validLocateProximity(data.proximity);
    if (value === null) return;
    setProximity((previous) => ({ value, rssi: data.rssi, seq: (previous?.seq ?? 0) + 1 }));
  }, [epc]);

  const zebra = useZebraSdk({ enabled: true, onProximity });

  useEffect(() => {
    zebra.setLocateTarget(epc);
    return () => zebra.setLocateTarget(null);
  }, [epc, zebra.setLocateTarget]);

  return (
    <GeigerSearch
      proximityOnly
      targetEpc={epc}
      lastScan={null}
      nativeProximity={proximity}
      onClose={onClose}
      sdk={zebra.isNativeSdkAvailable ? {
        available: true,
        isScanning: zebra.isScanning,
        startScan: zebra.startScan,
        stopScan: zebra.stopScan,
        isLocating: zebra.isLocating,
        startLocate: () => zebra.startLocate(epc),
        stopLocate: zebra.stopLocate,
      } : undefined}
    />
  );
}