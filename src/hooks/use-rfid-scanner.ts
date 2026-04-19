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

    // Use a contenteditable <div> with inputmode="none" instead of an <input>.
    // On Android (TC22 included), focusing a real <input> auto-shows the soft
    // keyboard. inputmode="none" on a contenteditable element keeps focus —
    // so DataWedge keystrokes still land here — but suppresses the IME.
    interface HiddenScannerInput extends HTMLDivElement {
      value: string;
      setSelectionRange: (start: number, end: number) => void;
    }

    const hiddenInput = document.createElement("div") as HiddenScannerInput;
    hiddenInput.contentEditable = "true";
    hiddenInput.tabIndex = -1;
    hiddenInput.setAttribute("inputmode", "none");
    hiddenInput.setAttribute("autocomplete", "off");
    hiddenInput.setAttribute("autocapitalize", "off");
    hiddenInput.setAttribute("autocorrect", "off");
    hiddenInput.setAttribute("spellcheck", "false");
    hiddenInput.setAttribute("aria-hidden", "true");
    hiddenInput.setAttribute("data-rfid-hidden-input", "true");
    Object.assign(hiddenInput.style, {
      position: "fixed",
      width: "1px",
      height: "1px",
      right: "0",
      bottom: "0",
      opacity: "0.01",
      pointerEvents: "none",
      border: "0",
      padding: "0",
      margin: "0",
      background: "transparent",
      color: "transparent",
      caretColor: "transparent",
      overflow: "hidden",
      whiteSpace: "nowrap",
      zIndex: "2147483647",
      userSelect: "none",
      WebkitUserSelect: "none",
    });
    // Mirror the contenteditable text via a `value` accessor so the rest of
    // the hook can keep using `hiddenInput.value` (and assign to it).
    Object.defineProperty(hiddenInput, "value", {
      configurable: true,
      get() {
        return (this as HTMLElement).textContent ?? "";
      },
      set(v: string) {
        (this as HTMLElement).textContent = v;
      },
    });
    hiddenInput.setSelectionRange = () => {
      const range = document.createRange();
      range.selectNodeContents(hiddenInput);
      range.collapse(false);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    };
    document.body.appendChild(hiddenInput);

    const isRealInputElement = (element: HTMLElement | null) => {
      return !!(
        element != null &&
        element !== hiddenInput &&
        (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.isContentEditable)
      );
    };

    const focusHiddenInput = () => {
      const active = document.activeElement as HTMLElement | null;
      if (isRealInputElement(active)) return;

      if (document.activeElement !== hiddenInput) {
        hiddenInput.focus({ preventScroll: true });
      }

      const length = hiddenInput.value.length;
      try {
        hiddenInput.setSelectionRange(length, length);
      } catch {
        // ignore platforms that do not support selection on this input type
      }
    };

    const scheduleBufferFlush = (source: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!bufferRef.current && hiddenInput.value.length >= 4) {
          bufferRef.current = hiddenInput.value;
          emitDebug("buffer", `hidden input sync (${source}:timeout)=${JSON.stringify(hiddenInput.value)} (${hiddenInput.value.length})`);
        }

        if (bufferRef.current.length >= 4) {
          emitDebug("info", `${source} timeout flush buf="${bufferRef.current}"`);
          processBuffer();
          hiddenInput.value = "";
          focusHiddenInput();
        }
      }, 300);
    };

    const syncFromHiddenInput = (source: string) => {
      if (!hiddenInput.value) return false;
      bufferRef.current = hiddenInput.value;
      emitDebug("buffer", `hidden input sync (${source})=${JSON.stringify(hiddenInput.value)} (${hiddenInput.value.length})`);
      lastKeyTimeRef.current = Date.now();
      return true;
    };

    focusHiddenInput();
    const refocusInterval = window.setInterval(focusHiddenInput, 750);

    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isHiddenInputTarget = target === hiddenInput;
      const isRealInputTarget = isRealInputElement(target);

      if (isRealInputTarget) {
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
        hiddenInput.value = "";
      }
      lastKeyTimeRef.current = now;

      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (!bufferRef.current) {
          syncFromHiddenInput("terminator");
        }
        emitDebug("key", `TERMINATOR ${e.key} buf="${bufferRef.current}"`);
        processBuffer();
        hiddenInput.value = "";
        focusHiddenInput();
        return;
      }

      if (isHiddenInputTarget) {
        syncFromHiddenInput("keydown");
        scheduleBufferFlush("hidden-input-keydown");
        return;
      }

      if (e.key && e.key.length === 1) {
        bufferRef.current += e.key;
        emitDebug("buffer", `+${JSON.stringify(e.key)} code=${e.code} → "${bufferRef.current}" (${bufferRef.current.length})`);
        scheduleBufferFlush("window");
      } else if (e.key) {
        emitDebug("ignored", `special key=${e.key} code=${e.code}`);
      }
    };

    const handleBeforeInput = (e: InputEvent) => {
      const target = e.target as HTMLElement | null;
      const isHiddenInputTarget = target === hiddenInput;
      if (isRealInputElement(target)) return;

      if (isHiddenInputTarget) {
        if (syncFromHiddenInput(e.type)) {
          scheduleBufferFlush(`hidden-input-${e.type}`);
        }
        return;
      }

      const data = e.data;
      if (!data) return;

      emitDebug("buffer", `beforeinput data=${JSON.stringify(data)}`);
      bufferRef.current += data;
      lastKeyTimeRef.current = Date.now();
      scheduleBufferFlush("beforeinput");
    };

    const handleHiddenInputValue = () => {
      if (syncFromHiddenInput("input")) {
        scheduleBufferFlush("hidden-input-input");
      }
    };

    const handleRefocus = () => {
      window.setTimeout(focusHiddenInput, 0);
    };

    hiddenInput.addEventListener("beforeinput", handleBeforeInput as EventListener, true);
    hiddenInput.addEventListener("input", handleHiddenInputValue, true);
    hiddenInput.addEventListener("blur", handleRefocus);
    window.addEventListener("keydown", handleKey, true);
    window.addEventListener("keypress", handleKey, true);
    document.addEventListener("beforeinput", handleBeforeInput as EventListener, true);
    document.addEventListener("focusin", handleRefocus, true);
    document.addEventListener("visibilitychange", handleRefocus, true);
    window.addEventListener("focus", handleRefocus, true);
    window.addEventListener("pointerup", handleRefocus, true);

    emitDebug("info", "wedge listeners attached (focused hidden input keepalive)");

    return () => {
      window.clearInterval(refocusInterval);
      hiddenInput.removeEventListener("beforeinput", handleBeforeInput as EventListener, true);
      hiddenInput.removeEventListener("input", handleHiddenInputValue, true);
      hiddenInput.removeEventListener("blur", handleRefocus);
      window.removeEventListener("keydown", handleKey, true);
      window.removeEventListener("keypress", handleKey, true);
      document.removeEventListener("beforeinput", handleBeforeInput as EventListener, true);
      document.removeEventListener("focusin", handleRefocus, true);
      document.removeEventListener("visibilitychange", handleRefocus, true);
      window.removeEventListener("focus", handleRefocus, true);
      window.removeEventListener("pointerup", handleRefocus, true);
      hiddenInput.remove();
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
