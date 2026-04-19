import { useEffect, useState } from "react";
import { X, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface WedgeDebugEvent {
  t: number;
  type: "key" | "ignored" | "buffer" | "flush" | "reset" | "info";
  detail: string;
}

/**
 * On-screen debug overlay for keyboard-wedge RFID input.
 * Useful on devices like the TC22 where the browser console isn't accessible.
 *
 * Subscribes to the global "rfid-wedge-debug" CustomEvent dispatched from
 * useRfidScanner. Toggle visibility with the floating bug button.
 */
export function WedgeDebugOverlay() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<WedgeDebugEvent[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<WedgeDebugEvent>;
      setEvents((prev) => {
        const next = [...prev, ce.detail];
        // Keep last 200 entries
        return next.length > 200 ? next.slice(-200) : next;
      });
    };
    window.addEventListener("rfid-wedge-debug", handler);
    return () => window.removeEventListener("rfid-wedge-debug", handler);
  }, []);

  if (!open) {
    return (
      <Button
        size="icon"
        variant="outline"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full shadow-lg"
        aria-label="Open RFID debug overlay"
      >
        <Bug className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <div className="fixed inset-x-2 bottom-2 top-16 z-50 flex flex-col rounded-lg border border-border bg-background/95 shadow-2xl backdrop-blur md:inset-x-auto md:right-4 md:w-[420px]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4" />
          <span className="text-sm font-semibold">RFID Wedge Debug</span>
          <span className="text-xs text-muted-foreground">{events.length} events</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEvents([])}>
            Clear
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2 font-mono text-xs">
        {events.length === 0 ? (
          <p className="p-2 text-muted-foreground">
            Pull the RFD40 trigger. Every keystroke and buffer event will appear here.
          </p>
        ) : (
          <ul className="space-y-1">
            {events.slice().reverse().map((ev, i) => (
              <li
                key={events.length - i}
                className={`rounded px-2 py-1 ${
                  ev.type === "flush"
                    ? "bg-primary/10 text-primary"
                    : ev.type === "ignored"
                      ? "bg-destructive/10 text-destructive"
                      : ev.type === "reset"
                        ? "bg-muted text-muted-foreground"
                        : "bg-card"
                }`}
              >
                <span className="text-muted-foreground">
                  {new Date(ev.t).toISOString().slice(11, 23)}
                </span>{" "}
                <span className="font-semibold">[{ev.type}]</span> {ev.detail}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
