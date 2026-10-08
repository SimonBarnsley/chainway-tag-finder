import { useEffect, useRef } from "react";

export function validLocateProximity(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;
}

/** The displayed value comes exclusively from a Zebra locateProximity event. */
export function TagProximityMeter({ value }: { value: number | null }) {
  const meterRef = useRef<HTMLProgressElement>(null);

  useEffect(() => {
    // Omit value for an unknown reading without showing an animated/simulated fill.
    if (value === null) meterRef.current?.removeAttribute("value");
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">Tag proximity</span>
        {value === null ? (
          <span role="status" className="text-sm text-muted-foreground">Searching for tag…</span>
        ) : (
          <span className="text-2xl font-bold tabular-nums text-primary">{Math.round(value)}%</span>
        )}
      </div>
      <progress
        ref={meterRef}
        aria-label="Tag proximity"
        aria-valuetext={value === null ? "Searching for tag…" : `${value}%`}
        value={value ?? undefined}
        max={100}
        className="tag-proximity-meter block h-8 w-full overflow-hidden rounded-md"
      />
      <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>0%</span><span>100%</span>
      </div>
    </div>
  );
}