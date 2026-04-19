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
    const raw = bufferRef.current;
    bufferRef.current = "";

    console.log("[RFID Wedge] processBuffer called with raw:", raw, "length:", raw.length);
    emitDebug("flush", `raw=${JSON.stringify(raw)} len=${raw.length}`);

    if (raw.length === 0) {
      emitDebug("info", "EMPTY flush — terminator received with no buffered chars");
      return;
    }

    // Try to extract a hex EPC from the raw buffer (strip spaces, dashes, prefixes)
    const hexOnly = raw.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
    // Fallback: use the trimmed raw string as-is if no hex found
    const epc = hexOnly.length >= 4 ? hexOnly : raw.trim().toUpperCase();

    emitDebug("info", `parsed epc="${epc}" (hexOnly=${hexOnly.length} chars, raw=${raw.length})`);

    if (epc.length >= 4) {
      const tag: RfidTag = { epc, timestamp: new Date() };

      console.log("[RFID Wedge] Emitting tag:", epc);
      emitDebug("info", `EMIT EPC ${epc}`);

      setWedgeStatus("detected");
      if (wedgeTimeoutRef.current) clearTimeout(wedgeTimeoutRef.current);
      wedgeTimeoutRef.current = setTimeout(() => setWedgeStatus("unknown"), 60_000);

      options.onTagScanned?.(tag);
    } else {
      console.log("[RFID Wedge] Buffer too short, discarded");
      emitDebug("ignored", `discarded — too short: "${epc}"`);
    }
  }, [options.onTagScanned]);

  useEffect(() => {
    if (!options.enabled) {
      setIsListening(false);
      return;
    }

    setIsListening(true);

    // Make body focusable so it can receive key events when no input is focused.
    // Some Chromium builds (incl. WebView on TC22) only deliver synthetic keys to
    // a focusable element. tabIndex=-1 lets us focus() it without making it tab-stoppable.
    const body = document.body;
    const prevTabIndex = body.getAttribute("tabindex");
    body.setAttribute("tabindex", "-1");
    body.style.outline = "none";
    // Focus body if nothing else is focused
    if (document.activeElement === body || document.activeElement === null) {
      body.focus();
    }

    const handleKey = (e: KeyboardEvent) => {
      // Skip if user is actively typing in an input/textarea
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        bufferRef.current = "";
        return;
      }

      const now = Date.now();
      const gap = now - lastKeyTimeRef.current;

      if (gap < 100 && gap > 0) {
        rapidKeyCountRef.current++;
        if (rapidKeyCountRef.current >= 3 && wedgeStatus !== "detected") {
          setWedgeStatus("detected");
        }
      } else {
        rapidKeyCountRef.current = 0;
      }

      if (gap > 500 && bufferRef.current.length > 0) {
        emitDebug("reset", `gap ${gap}ms — clearing "${bufferRef.current}"`);
        bufferRef.current = "";
      }
      lastKeyTimeRef.current = now;

      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        emitDebug("key", `TERMINATOR ${e.key} buf="${bufferRef.current}"`);
        processBuffer();
        return;
      }

      if (e.key && e.key.length === 1) {
        bufferRef.current += e.key;
        emitDebug("buffer", `+${JSON.stringify(e.key)} code=${e.code} → "${bufferRef.current}" (${bufferRef.current.length})`);

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          if (bufferRef.current.length >= 4) {
            emitDebug("info", `timeout flush buf="${bufferRef.current}"`);
            processBuffer();
          }
        }, 300);
      } else if (e.key) {
        emitDebug("ignored", `special key=${e.key} code=${e.code}`);
      }
    };

    // Also catch via beforeinput/input events — some WebView builds only fire
    // these for synthetic keystrokes from DataWedge.
    const handleBeforeInput = (e: InputEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      const data = e.data;
      if (!data) return;

      emitDebug("buffer", `beforeinput data=${JSON.stringify(data)}`);
      bufferRef.current += data;
      lastKeyTimeRef.current = Date.now();

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (bufferRef.current.length >= 4) {
          emitDebug("info", `beforeinput timeout flush buf="${bufferRef.current}"`);
          processBuffer();
        }
      }, 300);
    };

    // Use capture: true so we get events before any child component swallows them
    window.addEventListener("keydown", handleKey, true);
    window.addEventListener("keypress", handleKey, true);
    document.addEventListener("beforeinput", handleBeforeInput as EventListener, true);

    emitDebug("info", "wedge listeners attached (keydown + keypress + beforeinput, capture)");

    return () => {
      window.removeEventListener("keydown", handleKey, true);
      window.removeEventListener("keypress", handleKey, true);
      document.removeEventListener("beforeinput", handleBeforeInput as EventListener, true);
      if (prevTabIndex === null) {
        body.removeAttribute("tabindex");
      } else {
        body.setAttribute("tabindex", prevTabIndex);
      }
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
