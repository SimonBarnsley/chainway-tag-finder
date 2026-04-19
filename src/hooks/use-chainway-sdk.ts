import { useEffect, useState, useCallback, useRef } from "react";
import type { RfidTag } from "@/hooks/use-rfid-scanner";

/**
 * Bridge to the native Chainway UHF SDK plugin (Android only).
 *
 * When running inside the Capacitor APK, `window.ChainwayUHF` is injected by
 * the native plugin. In a regular browser preview it's undefined and this
 * hook becomes a no-op — the keyboard wedge handler stays the source of truth.
 *
 * Native plugin contract (see android/app/src/main/java/.../ChainwayUHFPlugin.kt):
 *   ChainwayUHF.init()       -> Promise<{ success: boolean; error?: string }>
 *   ChainwayUHF.startScan()  -> Promise<void>
 *   ChainwayUHF.stopScan()   -> Promise<void>
 *   ChainwayUHF.release()    -> Promise<void>
 *   ChainwayUHF.addListener("tagRead", (tag) => ...)
 *   ChainwayUHF.addListener("triggerPressed", () => ...)
 *   ChainwayUHF.addListener("triggerReleased", () => ...)
 */

type NativeTag = { epc: string; rssi?: number };
type Listener<T> = (data: T) => void;
type RemovableHandle = { remove: () => void };

interface ChainwayUHFNative {
  init: () => Promise<{ success: boolean; error?: string }>;
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  release: () => Promise<void>;
  addListener: ((event: "tagRead", cb: Listener<NativeTag>) => Promise<RemovableHandle>) &
    ((event: "triggerPressed", cb: Listener<void>) => Promise<RemovableHandle>) &
    ((event: "triggerReleased", cb: Listener<void>) => Promise<RemovableHandle>);
}

declare global {
  interface Window {
    Capacitor?: { isNativePlatform: () => boolean; Plugins?: { ChainwayUHF?: ChainwayUHFNative } };
  }
}

export type ChainwaySdkStatus = "unavailable" | "initializing" | "ready" | "error";

export function useChainwaySdk(options: {
  enabled: boolean;
  onTagScanned?: (tag: RfidTag) => void;
}) {
  const [status, setStatus] = useState<ChainwaySdkStatus>("unavailable");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const onTagRef = useRef(options.onTagScanned);
  onTagRef.current = options.onTagScanned;

  const isNative = typeof window !== "undefined" && window.Capacitor?.isNativePlatform() === true;
  const plugin = isNative ? window.Capacitor?.Plugins?.ChainwayUHF : undefined;

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

  // Wire up tag + trigger listeners
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
    startScan,
    stopScan,
  };
}
