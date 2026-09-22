import { useState, useEffect, useRef, useCallback } from "react";
import { Crosshair, X, Volume2, VolumeX, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LastScan {
  epc: string;
  rssi?: number;
  seq: number;
}

interface GeigerSearchProps {
  targetEpc: string;
  /**
   * Most recent scan from the parent. Carries a monotonic `seq` so the effect
   * fires even when the SAME EPC is read repeatedly (the normal Geiger case).
   * `rssi` is in dBm (e.g. -30 = very close, -80 = far). When undefined (e.g.
   * keyboard-wedge mode in a browser), we fall back to read-rate as the signal.
   */
  lastScan: LastScan | null;
  onClose: () => void;
  /**
   * Live proximity from the Zebra SDK's Tag Locationing mode: 0-100, where 100
   * means the tag is right in front of the antenna. `seq` is monotonic so the
   * effect fires on every update, including repeats of the same value.
   */
  nativeProximity?: { value: number; seq: number } | null;
  /** Optional manual scan controls — shown when the native Zebra SDK is available */
  sdk?: {
    available: boolean;
    isScanning: boolean;
    startScan: () => Promise<void>;
    stopScan: () => Promise<void>;
    /** Zebra Tag Locationing (true Geiger) controls */
    isLocating?: boolean;
    startLocate?: () => Promise<void>;
    stopLocate?: () => Promise<void>;
  };
}

// RSSI dBm range we map to 0-100% signal.
// The TC22R built-in reader typically reports between roughly -80 (far/weak) and -30 (very close).
const RSSI_FAR = -80;
const RSSI_NEAR = -30;

function rssiToPercent(rssi: number): number {
  const clamped = Math.max(RSSI_FAR, Math.min(RSSI_NEAR, rssi));
  return Math.round(((clamped - RSSI_FAR) / (RSSI_NEAR - RSSI_FAR)) * 100);
}

export function GeigerSearch({ targetEpc, lastScan, onClose, sdk, nativeProximity }: GeigerSearchProps) {
  const [hitCount, setHitCount] = useState(0);
  const [signal, setSignal] = useState(0); // 0-100 (smoothed)
  const [lastRssi, setLastRssi] = useState<number | null>(null);
  const [hasRssi, setHasRssi] = useState(false);
  const [usingLocationing, setUsingLocationing] = useState(false);
  const lastProxSeqRef = useRef(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const decayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastHitRef = useRef(0);
  const lastSeqRef = useRef(0);
  const beepLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signalRef = useRef(0);
  signalRef.current = signal;

  // Decay signal slowly so the meter falls when reads stop or weaken
  useEffect(() => {
    decayRef.current = setInterval(() => {
      setSignal((prev) => Math.max(0, prev - 4));
    }, 250);
    return () => { if (decayRef.current) clearInterval(decayRef.current); };
  }, []);

  const playBeep = useCallback((strength: number) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 400 + (strength / 100) * 1400;
      osc.type = "square";
      gain.gain.value = 0.06 + (strength / 100) * 0.14;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      const duration = Math.max(0.03, 0.14 - (strength / 100) * 0.10);
      osc.stop(ctx.currentTime + duration);
    } catch { /* audio not available */ }
  }, []);

  // Native Zebra Tag Locationing — the SDK's own proximity metric (0-100).
  // This is the most accurate signal available and takes priority over RSSI.
  useEffect(() => {
    if (!nativeProximity) return;
    if (nativeProximity.seq === lastProxSeqRef.current) return;
    lastProxSeqRef.current = nativeProximity.seq;
    setUsingLocationing(true);
    setHitCount((c) => c + 1);
    const target = Math.max(0, Math.min(100, nativeProximity.value));
    setSignal((prev) => Math.round(prev * 0.35 + target * 0.65));
    if (navigator.vibrate) {
      navigator.vibrate(target > 70 ? [80] : target > 40 ? [50] : [25]);
    }
  }, [nativeProximity]);

  // React to scans — this fires reliably because `seq` is monotonic
  useEffect(() => {
    if (usingLocationing) return; // native proximity wins
    if (!lastScan) return;
    if (lastScan.seq === lastSeqRef.current) return; // already processed
    lastSeqRef.current = lastScan.seq;

    if (lastScan.epc.toUpperCase() !== targetEpc.toUpperCase()) return;

    const now = Date.now();
    const gap = now - lastHitRef.current;
    lastHitRef.current = now;

    setHitCount((c) => c + 1);

    let nextSignal: number;
    if (typeof lastScan.rssi === "number") {
      // Proximity mode (TC22R native SDK): RSSI directly indicates distance.
      setHasRssi(true);
      setLastRssi(lastScan.rssi);
      const target = rssiToPercent(lastScan.rssi);
      // Smooth toward the new RSSI reading so the meter doesn't jitter
      nextSignal = Math.round(signalRef.current * 0.4 + target * 0.6);
    } else {
      // Fallback (keyboard wedge / browser): infer proximity from read frequency
      const boost = gap < 300 ? 45 : gap < 600 ? 30 : gap < 1200 ? 18 : 10;
      nextSignal = Math.min(100, signalRef.current + boost);
    }

    setSignal(nextSignal);

    if (navigator.vibrate) {
      navigator.vibrate(nextSignal > 70 ? [80] : nextSignal > 40 ? [50] : [25]);
    }
  }, [lastScan, targetEpc, usingLocationing]);

  // Continuous beeping at a rate proportional to signal strength.
  // This is the classic Geiger-counter behavior — clicks get faster as you
  // get closer. Without this, the only audio feedback came on each tag read,
  // which on the TC22R happens at a fairly steady rate regardless of distance.
  useEffect(() => {
    if (!soundEnabled || signal < 5) {
      if (beepLoopRef.current) {
        clearInterval(beepLoopRef.current);
        beepLoopRef.current = null;
      }
      return;
    }
    // Interval: 800ms at weak signal -> 80ms at very strong signal
    const interval = Math.max(80, 800 - (signal / 100) * 720);
    if (beepLoopRef.current) clearInterval(beepLoopRef.current);
    beepLoopRef.current = setInterval(() => {
      playBeep(signalRef.current);
    }, interval);
    return () => {
      if (beepLoopRef.current) {
        clearInterval(beepLoopRef.current);
        beepLoopRef.current = null;
      }
    };
  }, [signal, soundEnabled, playBeep]);

  // Signal level for visual bars
  const barCount = 20;
  const activeBars = Math.round((signal / 100) * barCount);

  const getBarColor = (index: number) => {
    const pct = index / barCount;
    if (pct < 0.4) return "bg-red-500";
    if (pct < 0.7) return "bg-yellow-500";
    return "bg-green-500";
  };

  const signalLabel = signal === 0 ? "No signal" : signal < 30 ? "Weak" : signal < 60 ? "Medium" : signal < 85 ? "Strong" : "Very Strong";

  return (
    <div className="rounded-xl border-2 border-primary/50 bg-card p-4 space-y-4 shadow-[0_0_30px_rgba(34,197,94,0.15)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crosshair className="h-5 w-5 text-primary animate-pulse" />
          <span className="text-sm font-bold text-foreground">Geiger Search</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              // Resume audio context on first user gesture (required by browsers)
              if (!audioCtxRef.current) {
                try {
                  audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
                } catch { /* ignore */ }
              }
              audioCtxRef.current?.resume().catch(() => undefined);
              setSoundEnabled(!soundEnabled);
            }}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Target EPC */}
      <div className="rounded-lg bg-muted/50 border border-border p-2">
        <p className="text-[10px] text-muted-foreground mb-0.5">Target EPC</p>
        <p className="font-mono text-xs font-bold text-foreground truncate">{targetEpc}</p>
      </div>

      {/* Signal meter */}
      <div className="space-y-2">
        <div className="flex items-end gap-[3px] h-16 justify-center">
          {Array.from({ length: barCount }).map((_, i) => (
            <div
              key={i}
              className={`w-3 rounded-sm transition-all duration-150 ${
                i < activeBars ? getBarColor(i) : "bg-muted/40"
              }`}
              style={{
                height: `${20 + (i / barCount) * 80}%`,
                opacity: i < activeBars ? 1 : 0.3,
              }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span className={`text-xs font-bold ${signal > 60 ? "text-green-500" : signal > 30 ? "text-yellow-500" : "text-muted-foreground"}`}>
            {signalLabel}
          </span>
          <div className="flex items-center gap-3">
            {usingLocationing && (
              <span className="text-[10px] font-mono uppercase text-primary">
                SDK locate
              </span>
            )}
            {!usingLocationing && hasRssi && lastRssi !== null && (
              <span className="text-xs font-mono text-muted-foreground">
                {lastRssi} dBm
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {hitCount} hit{hitCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Manual scan control — bypasses the hardware trigger so you can verify
          the reader responds even if the hardware trigger key isn't being
          captured by MainActivity.dispatchKeyEvent. Always rendered so the user
          can see why it isn't usable when running in a regular browser. */}
      {sdk?.available ? (
        <Button
          onClick={() => {
            if (sdk.startLocate && sdk.stopLocate) {
              sdk.isLocating ? sdk.stopLocate() : sdk.startLocate();
              return;
            }
            sdk.isScanning ? sdk.stopScan() : sdk.startScan();
          }}
          variant={sdk.isLocating || sdk.isScanning ? "destructive" : "default"}
          className="w-full gap-2"
        >
          {sdk.isLocating || sdk.isScanning ? (
            <>
              <Square className="h-4 w-4" /> Stop locating
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> Start locating
            </>
          )}
        </Button>
      ) : (
        <div className="rounded-lg border border-border bg-muted/40 p-2 text-center">
          <p className="text-[11px] font-semibold text-foreground">Trigger scanning mode</p>
          <p className="text-[10px] text-muted-foreground">
            Hold the reader trigger and sweep — every read of this tag feeds the meter
          </p>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        {sdk?.available
          ? sdk.isLocating || sdk.isScanning
            ? "Sweep the reader around — beeps speed up as you get closer"
            : "Pull the TC22R trigger OR tap Start locating above"
          : "Beeps speed up the more often the tag is read. Keep this screen open while scanning."}
      </p>
    </div>
  );
}
