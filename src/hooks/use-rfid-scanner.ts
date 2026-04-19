import { useState, useEffect, useCallback, useRef } from "react";

export interface RfidTag {
  epc: string;
  rssi?: number;
  timestamp: Date;
}

export type WedgeStatus = "unknown" | "detected" | "not_detected";

type DebugType = "key" | "ignored" | "buffer" | "flush" | "reset" | "info";

function emitDebug(type: DebugType, detail: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("rfid-wedge-debug", {
      detail: { t: Date.now(), type, detail },
    })
  );
}

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

    console.log("[RFID Wedge] processBuffer called with raw:", raw, "length:", raw.length);
    emitDebug("flush", `raw="${raw}" len=${raw.length}`);

    if (raw.length >= 4) {
      const epc = raw.toUpperCase();
      const tag: RfidTag = {
        epc,
        timestamp: new Date(),
      };

      console.log("[RFID Wedge] Emitting tag:", epc);
      emitDebug("info", `EMIT EPC ${epc}`);

      // A successful rapid-keystroke scan confirms wedge mode
      setWedgeStatus("detected");

      // Reset the "not detected" timeout — wedge is alive
      if (wedgeTimeoutRef.current) clearTimeout(wedgeTimeoutRef.current);
      wedgeTimeoutRef.current = setTimeout(() => {
        // If no scan in 60s, mark as unknown (device may have disconnected)
        setWedgeStatus("unknown");
      }, 60_000);

      options.onTagScanned?.(tag);
    } else {
      console.log("[RFID Wedge] Buffer too short, discarded");
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

      // Track rapid keystrokes (< 100ms apart = wedge/scanner speed)
      if (gap < 100 && gap > 0) {
        rapidKeyCountRef.current++;
        if (rapidKeyCountRef.current >= 3 && wedgeStatus !== "detected") {
          setWedgeStatus("detected");
        }
      } else {
        rapidKeyCountRef.current = 0;
      }

      // Reset buffer if there's a long gap between keystrokes (new scan starting)
      if (gap > 500 && bufferRef.current.length > 0) {
        console.log("[RFID Wedge] Buffer reset due to gap:", bufferRef.current);
        bufferRef.current = "";
      }
      lastKeyTimeRef.current = now;

      // Enter / Tab terminates a scan
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        console.log("[RFID Wedge] Terminator received, buffer:", bufferRef.current);
        emitDebug("key", `TERMINATOR ${e.key} buf="${bufferRef.current}"`);
        processBuffer();
        return;
      }

      // Accept ANY printable single character (we'll sanitize the buffer at flush time).
      // Some DataWedge profiles emit non-hex prefixes, separators, or send EPCs as
      // ASCII/Base64. Capturing everything lets us see what the reader actually sends.
      if (e.key.length === 1) {
        bufferRef.current += e.key;
        emitDebug("buffer", `+${JSON.stringify(e.key)} code=${e.code} → "${bufferRef.current}" (${bufferRef.current.length})`);

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          if (bufferRef.current.length >= 4) {
            console.log("[RFID Wedge] Timeout flush, buffer:", bufferRef.current);
            emitDebug("info", `timeout flush buf="${bufferRef.current}"`);
            processBuffer();
          }
        }, 300);
      } else {
        // Special keys (Shift, Ctrl, Arrow, etc.) — log so we can see them
        emitDebug("ignored", `special key=${e.key} code=${e.code}`);
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
