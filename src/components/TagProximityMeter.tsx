import { useEffect, useRef } from "react";

export function validLocateProximity(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;
}

// Display calibration: the TC22R's own locationing metric tops out around 80%
// even when the tag is right in front of the antenna (Zebra's 123RFID Mobile
// behaves the same way), so the reading is stretched to use the full 0-100%
// range. This only rescales what the user sees — the raw Zebra value is never
// modified, and no value is ever invented: a null reading stays null.
const PROXIMITY_DISPLAY_SCALE = 1.25;

export function displayProximity(value: number | null): number | null {
  return value === null ? null : Math.min(100, Math.round(value * PROXIMITY_DISPLAY_SCALE));
}

/** The displayed value comes exclusively from a Zebra locateProximity event. */
export function TagProximityMeter({ value }: { value: number | null }) {
  const meterRef = useRef<HTMLProgressElement>(null);
  // Bar and label always show the same calibrated number.
  const shown = displayProximity(value);

  useEffect(() => {
    // Omit value for an unknown reading without showing an animated/simulated fill.
    if (shown === null) meterRef.current?.removeAttribute("value");
  }, [shown]);

  return (
    <div className="space-y-2">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">Tag proximity</span>
        {shown === null ? (
          <span role="status" className="text-sm text-muted-foreground">Searching for tag…</span>
        ) : (
          <span className="text-2xl font-bold tabular-nums text-primary">{shown}%</span>
        )}
      </div>
      <progress
        ref={meterRef}
        aria-label="Tag proximity"
        aria-valuetext={shown === null ? "Searching for tag…" : `${shown}%`}
        value={shown ?? undefined}
        max={100}
        className="tag-proximity-meter block h-8 w-full overflow-hidden rounded-md"
      />
      <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>0%</span><span>100%</span>
      </div>
    </div>
  );
}
