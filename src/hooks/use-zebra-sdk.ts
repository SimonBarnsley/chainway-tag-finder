import { useEffect, useState, useCallback, useRef } from "react";
import type { RfidTag } from "@/hooks/use-rfid-scanner";

/**
 * Bridge to the native Zebra RFID SDK plugin (Android only).
 *
 * Targets the Zebra TC22R / TC27R all-in-one handheld, where the UHF RFID
 * reader is BUILT IN (SERVICE_SERIAL transport). Sled hardware (RFD40 and
 * Bluetooth snap-ons) is not supported.
 *
 * When running inside the Capacitor APK, `Capacitor.Plugins.ZebraRFID` is
 * injected by the native plugin (see android-plugin/ZebraTC22RPlugin.kt).
 * In a regular browser preview it's undefined and this hook becomes a no-op —
 * the keyboard wedge handler stays the source of truth.
 *
 * Native plugin contract (see android-plugin/ZebraTC22RPlugin.kt):
 *   ZebraRFID.init()       -> Promise<{ success: boolean; error?: string; readerName?: string }>
 *   ZebraRFID.startScan()  -> Promise<void>
 *   ZebraRFID.startLocate({ epc }) -> Promise<void>   (Tag Locationing / Geiger)
 *   ZebraRFID.stopLocate() -> Promise<void>
 *   ZebraRFID.stopScan()   -> Promise<void>
 *   ZebraRFID.release()    -> Promise<void>
 *   ZebraRFID.addListener("tagRead", (tag) => ...)
 *   ZebraRFID.addListener("triggerPressed", () => ...)
 *   ZebraRFID.addListener("triggerReleased", () => ...)
 *   ZebraRFID.addListener("readerStatus", ({ connected, name }) => ...)
 */

type NativeTag = { epc: string; rssi?: number; antenna?: number; tid?: string };
type ReaderStatus = { connected: boolean; name?: string };
type LocateProximity = { epc: string; proximity: number; rssi?: number };
type Listener<T> = (data: T) => void;
type RemovableHandle = { remove: () => void };

interface ZebraRFIDNative {
  init: (opts?: { transport?: "service_serial" }) => Promise<{
    success: boolean;
    error?: string;
    readerName?: string;
    transport?: string;
    deviceType?: "integrated";
  }>;
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  startLocate: (opts: { epc: string }) => Promise<void>;
  stopLocate: () => Promise<void>;
  release: () => Promise<void>;
  addListener: ((event: "tagRead", cb: Listener<NativeTag>) => Promise<RemovableHandle>) &
    ((event: "triggerPressed", cb: Listener<void>) => Promise<RemovableHandle>) &
    ((event: "triggerReleased", cb: Listener<void>) => Promise<RemovableHandle>) &
    ((event: "readerStatus", cb: Listener<ReaderStatus>) => Promise<RemovableHandle>) &
    ((event: "locateProximity", cb: Listener<LocateProximity>) => Promise<RemovableHandle>);
}

declare global {
  interface Window {
    Capacitor?: { isNativePlatform: () => boolean; Plugins?: { ZebraRFID?: ZebraRFIDNative } };
  }
}

export type ZebraSdkStatus = "unavailable" | "initializing" | "ready" | "error";

export function useZebraSdk(options: {
  enabled: boolean;
  onTagScanned?: (tag: RfidTag) => void;
  /** Called with a 0-100 proximity value while Tag Locationing (Geiger) runs */
  onProximity?: (data: { epc: string; proximity: number; rssi?: number }) => void;
}) {
  const [status, setStatus] = useState<ZebraSdkStatus>("unavailable");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [readerName, setReaderName] = useState<string | null>(null);
  const [deviceType, setDeviceType] = useState<"integrated" | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const onTagRef = useRef(options.onTagScanned);
  onTagRef.current = options.onTagScanned;
  const onProximityRef = useRef(options.onProximity);
  onProximityRef.current = options.onProximity;
  // EPC currently being located — kept in a ref so the trigger listener can
  // re-arm locationing on each trigger pull without re-registering listeners.
  const locateEpcRef = useRef<string | null>(null);
  const deviceTypeRef = useRef<"integrated" | null>(null);

  const isNative = typeof window !== "undefined" && window.Capacitor?.isNativePlatform() === true;
  const plugin = isNative ? window.Capacitor?.Plugins?.ZebraRFID : undefined;

  // Initialize the SDK once on mount (native only)
  useEffect(() => {
    if (!plugin || !options.enabled) return;
    let cancelled = false;
    setStatus("initializing");
    plugin
      .init()
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setStatus("ready");
          setErrorMessage(null);
          if (res.readerName) setReaderName(res.readerName);
          if (res.deviceType) setDeviceType(res.deviceType);
        } else {
          setStatus("error");
          setErrorMessage(res.error ?? "SDK init failed");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "SDK init threw");
      });
    return () => {
      cancelled = true;
      plugin.release().catch(() => undefined);
    };
  }, [plugin, options.enabled]);

  // Wire up tag + trigger + reader-status listeners
  useEffect(() => {
    if (!plugin || status !== "ready") return;
    const handles: RemovableHandle[] = [];

    plugin
      .addListener("tagRead", (tag) => {
        onTagRef.current?.({
          epc: tag.epc.toUpperCase(),
          rssi: tag.rssi,
          timestamp: new Date(),
        });
      })
      .then((h) => handles.push(h));

    plugin
      .addListener("locateProximity", (data) => {
        const target = locateEpcRef.current;
        if (!target || data.epc.toUpperCase() !== target) return;
        onProximityRef.current?.(data);
      })
      .then((h) => handles.push(h));

    plugin
      .addListener("triggerPressed", () => {
        // In Geiger mode the trigger drives Tag Locationing, not inventory.
        const epc = locateEpcRef.current;
        if (epc) {
          plugin.startLocate({ epc }).then(() => setIsLocating(true)).catch(() => undefined);
          return;
        }
        plugin.startScan().then(() => setIsScanning(true)).catch(() => undefined);
      })
      .then((h) => handles.push(h));

    plugin
      .addListener("triggerReleased", () => {
        if (locateEpcRef.current) {
          plugin.stopLocate().then(() => setIsLocating(false)).catch(() => undefined);
          return;
        }
        plugin.stopScan().then(() => setIsScanning(false)).catch(() => undefined);
      })
      .then((h) => handles.push(h));

    plugin
      .addListener("readerStatus", ({ connected, name }) => {
        if (name) setReaderName(name);
        if (!connected) {
          setStatus("error");
          setErrorMessage(
            "Built-in TC22R RFID reader unavailable",
          );
        } else {
          setStatus("ready");
          setErrorMessage(null);
        }
      })
      .then((h) => handles.push(h));

    return () => {
      handles.forEach((h) => h.remove());
      plugin.stopLocate().catch(() => undefined);
      plugin.stopScan().catch(() => undefined);
    };
  }, [plugin, status]);

  const startScan = useCallback(async () => {
    if (!plugin) return;
    await plugin.startScan();
    setIsScanning(true);
  }, [plugin]);

  const stopScan = useCallback(async () => {
    if (!plugin) return;
    await plugin.stopScan();
    setIsScanning(false);
  }, [plugin]);

  const startLocate = useCallback(async (epc: string) => {
    if (!plugin) return;
    locateEpcRef.current = epc.toUpperCase();
    await plugin.startLocate({ epc: epc.toUpperCase() });
    setIsLocating(true);
  }, [plugin]);

  const stopLocate = useCallback(async () => {
    if (!plugin) return;
    await plugin.stopLocate();
    setIsLocating(false);
  }, [plugin]);

  /** Arm/disarm the hardware trigger for Geiger mode without starting it. */
  const setLocateTarget = useCallback((epc: string | null) => {
    locateEpcRef.current = epc ? epc.toUpperCase() : null;
    if (!epc && plugin) {
      plugin.stopLocate().catch(() => undefined);
      setIsLocating(false);
    }
  }, [plugin]);

  deviceTypeRef.current = deviceType;

  return {
    isNativeSdkAvailable: !!plugin,
    isLocating,
    startLocate,
    stopLocate,
    setLocateTarget,
    status,
    errorMessage,
    isScanning,
    readerName,
    deviceType,
    startScan,
    stopScan,
  };
}
