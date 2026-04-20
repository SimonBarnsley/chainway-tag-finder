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
  /** Optional manual scan controls — shown when the native Zebra SDK is available */
  sdk?: {
    available: boolean;
    isScanning: boolean;
    startScan: () => Promise<void>;
    stopScan: () => Promise<void>;
  };
}

// RSSI dBm range we map to 0-100% signal.
// RFD40 typically reports between roughly -80 (far/weak) and -30 (very close).
const RSSI_FAR = -80;
const RSSI_NEAR = -30;

function rssiToPercent(rssi: number): number {
  const clamped = Math.max(RSSI_FAR, Math.min(RSSI_NEAR, rssi));
  return Math.round(((clamped - RSSI_FAR) / (RSSI_NEAR - RSSI_FAR)) * 100);
}

export function GeigerSearch({ targetEpc, lastScan, onClose, sdk }: GeigerSearchProps) {
  const [hitCount, setHitCount] = useState(0);
  const [signal, setSignal] = useState(0); // 0-100 (smoothed)
  const [lastRssi, setLastRssi] = useState<number | null>(null);
  const [hasRssi, setHasRssi] = useState(false);
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

  // React to scans — this fires reliably because `seq` is monotonic
  useEffect(() => {
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
      // Proximity mode (RFD40 native SDK): RSSI directly indicates distance.
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
  }, [lastScan, targetEpc]);

  // Continuous beeping at a rate proportional to signal strength.
  // This is the classic Geiger-counter behavior — clicks get faster as you
  // get closer. Without this, the only audio feedback came on each tag read,
  // which on the RFD40 happens at a fairly steady rate regardless of distance.
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
            {hasRssi && lastRssi !== null && (
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
          the RFD40 sled responds even if the e-Connex trigger key isn't being
          captured by MainActivity.dispatchKeyEvent. */}
      {sdk?.available && (
        <Button
          onClick={() => (sdk.isScanning ? sdk.stopScan() : sdk.startScan())}
          variant={sdk.isScanning ? "destructive" : "default"}
          className="w-full gap-2"
        >
          {sdk.isScanning ? (
            <>
              <Square className="h-4 w-4" /> Stop scanning
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> Start scanning
            </>
          )}
        </Button>
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        {sdk?.available
          ? sdk.isScanning
            ? "Sweep the RFD40 around — beeps speed up as you get closer"
            : "Pull the TC22 trigger OR tap Start scanning above"
          : hasRssi
            ? "Hold the trigger and sweep — beeps speed up as you get closer"
            : "Hold the trigger and sweep — keep the trigger held to keep reading"}
      </p>
    </div>
  );
}
