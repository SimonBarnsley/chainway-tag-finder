import { useState, useEffect, useRef, useCallback } from "react";
import { Crosshair, X, Volume2, VolumeX, Vibrate } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GeigerSearchProps {
  targetEpc: string;
  /** Called on every scan — parent passes all scanned EPCs here */
  lastScannedEpc: string | null;
  lastScannedTime: number;
  onClose: () => void;
}

export function GeigerSearch({ targetEpc, lastScannedEpc, lastScannedTime, onClose }: GeigerSearchProps) {
  const [hitCount, setHitCount] = useState(0);
  const [signal, setSignal] = useState(0); // 0-100
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const decayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastHitRef = useRef(0);

  // Decay signal over time
  useEffect(() => {
    decayRef.current = setInterval(() => {
      setSignal((prev) => Math.max(0, prev - 3));
    }, 200);
    return () => { if (decayRef.current) clearInterval(decayRef.current); };
  }, []);

  // React to scans
  useEffect(() => {
    if (!lastScannedEpc || lastScannedTime === 0) return;
    if (lastScannedEpc.toUpperCase() !== targetEpc.toUpperCase()) return;

    const now = Date.now();
    const gap = now - lastHitRef.current;
    lastHitRef.current = now;

    setHitCount((c) => c + 1);

    // Signal strength: faster reads = higher signal
    const boost = gap < 500 ? 40 : gap < 1000 ? 25 : gap < 2000 ? 15 : 10;
    setSignal((prev) => Math.min(100, prev + boost));

    // Haptic
    if (navigator.vibrate) {
      navigator.vibrate(gap < 500 ? [80] : [40]);
    }

    // Audio beep
    if (soundEnabled) {
      playBeep(Math.min(100, signal + boost));
    }
  }, [lastScannedEpc, lastScannedTime]);

  const playBeep = useCallback((strength: number) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      // Higher pitch = stronger signal
      osc.frequency.value = 400 + (strength / 100) * 1200;
      osc.type = "square";
      gain.gain.value = 0.08 + (strength / 100) * 0.12;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      const duration = Math.max(0.03, 0.15 - (strength / 100) * 0.12);
      osc.stop(ctx.currentTime + duration);
    } catch { /* audio not available */ }
  }, [signal]);

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
            onClick={() => setSoundEnabled(!soundEnabled)}
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
          <span className="text-xs text-muted-foreground">
            {hitCount} hit{hitCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        Move closer to the tagged item — signal increases with proximity
      </p>
    </div>
  );
}
