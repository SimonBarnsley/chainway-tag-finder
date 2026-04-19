import { useState, useEffect, useCallback, useRef } from "react";

export interface RfidTag {
  epc: string;
  rssi?: number;
  timestamp: Date;
}

export type WedgeStatus = "unknown" | "detected" | "not_detected";

/**
 * Hook that captures RFID tag data from a Zebra RFD40 sled (via TC22 + e-Connex)
 * configured to act as a keyboard wedge through DataWedge.
 * The wedge sends EPC data as rapid keystrokes followed by Enter — this hook
 * detects that pattern and extracts the EPC. Used as a fallback when the
 * native Zebra RFID3 SDK plugin is unavailable.
 */
export function useRfidScanner(options: {
  enabled: boolean;
  onTagScanned?: (tag: RfidTag) => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const [wedgeStatus, setWedgeStatus] = useState<WedgeStatus>("unknown");
  const bufferRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyTimeRef = useRef(0);
  const rapidKeyCountRef = useRef(0);
  const wedgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processBuffer = useCallback(() => {
    const raw = bufferRef.current.trim();
    bufferRef.current = "";

    if (raw.length >= 4) {
      const epc = raw.toUpperCase();
      const tag: RfidTag = {
        epc,
        timestamp: new Date(),
      };

      // A successful rapid-keystroke scan confirms wedge mode
      setWedgeStatus("detected");

      // Reset the "not detected" timeout — wedge is alive
      if (wedgeTimeoutRef.current) clearTimeout(wedgeTimeoutRef.current);
      wedgeTimeoutRef.current = setTimeout(() => {
        // If no scan in 60s, mark as unknown (device may have disconnected)
        setWedgeStatus("unknown");
      }, 60_000);

      options.onTagScanned?.(tag);
    }
  }, [options.onTagScanned]);

  useEffect(() => {
    if (!options.enabled) {
      setIsListening(false);
      return;
    }

    setIsListening(true);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        bufferRef.current = "";
        return;
      }

      const now = Date.now();
      const gap = now - lastKeyTimeRef.current;

      // Track rapid keystrokes (< 80ms apart = wedge/scanner speed)
      if (gap < 80 && gap > 0) {
        rapidKeyCountRef.current++;
        // 4+ rapid keys in a row strongly indicates a hardware scanner
        if (rapidKeyCountRef.current >= 4 && wedgeStatus !== "detected") {
          setWedgeStatus("detected");
        }
      } else {
        rapidKeyCountRef.current = 0;
      }

      // DataWedge sends keys very rapidly (< 50ms between keys)
      if (now - lastKeyTimeRef.current > 300 && bufferRef.current.length > 0) {
        bufferRef.current = "";
      }
      lastKeyTimeRef.current = now;

      if (e.key === "Enter") {
        e.preventDefault();
        processBuffer();
        return;
      }

      // Only accept hex chars
      if (/^[a-fA-F0-9]$/.test(e.key)) {
        bufferRef.current += e.key;

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          if (bufferRef.current.length >= 4) {
            processBuffer();
          }
        }, 200);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wedgeTimeoutRef.current) clearTimeout(wedgeTimeoutRef.current);
    };
  }, [options.enabled, processBuffer, wedgeStatus]);

  const addManualTag = useCallback(
    (epc: string) => {
      if (epc.trim().length >= 4) {
        const tag: RfidTag = {
          epc: epc.trim().toUpperCase(),
          timestamp: new Date(),
        };
        options.onTagScanned?.(tag);
      }
    },
    [options.onTagScanned]
  );

  return { isListening, wedgeStatus, addManualTag };
}
