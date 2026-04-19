import { useEffect, useState, useCallback, useRef } from "react";
import type { RfidTag } from "@/hooks/use-rfid-scanner";

/**
 * Bridge to the native Zebra RFID SDK plugin (Android only).
 *
 * Targets the Zebra RFD40 UHF sled paired with a TC22 mobile computer via the
 * e-Connex adapter (pin-based serial connection — no Bluetooth pairing needed).
 *
 * When running inside the Capacitor APK, `Capacitor.Plugins.ZebraRFID` is
 * injected by the native plugin (see android-plugin/ZebraRFD40Plugin.kt).
 * In a regular browser preview it's undefined and this hook becomes a no-op —
 * the keyboard wedge handler stays the source of truth.
 *
 * Native plugin contract (see android-plugin/ZebraRFD40Plugin.kt):
 *   ZebraRFID.init()       -> Promise<{ success: boolean; error?: string; readerName?: string }>
 *   ZebraRFID.startScan()  -> Promise<void>
 *   ZebraRFID.stopScan()   -> Promise<void>
 *   ZebraRFID.release()    -> Promise<void>
 *   ZebraRFID.addListener("tagRead", (tag) => ...)
 *   ZebraRFID.addListener("triggerPressed", () => ...)
 *   ZebraRFID.addListener("triggerReleased", () => ...)
 *   ZebraRFID.addListener("readerStatus", ({ connected, name }) => ...)
 */

type NativeTag = { epc: string; rssi?: number; antenna?: number; tid?: string };
type ReaderStatus = { connected: boolean; name?: string };
type Listener<T> = (data: T) => void;
type RemovableHandle = { remove: () => void };

interface ZebraRFIDNative {
  init: () => Promise<{ success: boolean; error?: string; readerName?: string }>;
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  release: () => Promise<void>;
  addListener: ((event: "tagRead", cb: Listener<NativeTag>) => Promise<RemovableHandle>) &
    ((event: "triggerPressed", cb: Listener<void>) => Promise<RemovableHandle>) &
    ((event: "triggerReleased", cb: Listener<void>) => Promise<RemovableHandle>) &
    ((event: "readerStatus", cb: Listener<ReaderStatus>) => Promise<RemovableHandle>);
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
}) {
  const [status, setStatus] = useState<ZebraSdkStatus>("unavailable");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [readerName, setReaderName] = useState<string | null>(null);
  const onTagRef = useRef(options.onTagScanned);
  onTagRef.current = options.onTagScanned;

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
      .addListener("triggerPressed", () => {
        plugin.startScan().then(() => setIsScanning(true)).catch(() => undefined);
      })
      .then((h) => handles.push(h));

    plugin
      .addListener("triggerReleased", () => {
        plugin.stopScan().then(() => setIsScanning(false)).catch(() => undefined);
      })
      .then((h) => handles.push(h));

    plugin
      .addListener("readerStatus", ({ connected, name }) => {
        if (name) setReaderName(name);
        if (!connected) {
          setStatus("error");
          setErrorMessage("RFD40 sled disconnected");
        } else {
          setStatus("ready");
          setErrorMessage(null);
        }
      })
      .then((h) => handles.push(h));

    return () => {
      handles.forEach((h) => h.remove());
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

  return {
    isNativeSdkAvailable: !!plugin,
    status,
    errorMessage,
    isScanning,
    readerName,
    startScan,
    stopScan,
  };
}
