import { Radio, CircleOff, Wifi, Keyboard, Cpu } from "lucide-react";
import type { WedgeStatus } from "@/hooks/use-rfid-scanner";
import type { ZebraSdkStatus } from "@/hooks/use-zebra-sdk";

interface ScannerStatusProps {
  isListening: boolean;
  tagCount: number;
  uniqueCount: number;
  wedgeStatus: WedgeStatus;
  sdkAvailable?: boolean;
  sdkStatus?: ZebraSdkStatus;
  sdkError?: string | null;
  sdkScanning?: boolean;
  readerName?: string | null;
  deviceType?: "integrated" | null;
}

const wedgeConfig: Record<WedgeStatus, { label: string; color: string; iconColor: string }> = {
  unknown: { label: "WAITING", color: "text-muted-foreground", iconColor: "text-muted-foreground" },
  detected: { label: "ENABLED", color: "text-success", iconColor: "text-success" },
  not_detected: { label: "DISABLED", color: "text-destructive", iconColor: "text-destructive" },
};

const sdkConfig: Record<ZebraSdkStatus, { label: string; color: string; iconColor: string }> = {
  unavailable: { label: "N/A", color: "text-muted-foreground", iconColor: "text-muted-foreground" },
  initializing: { label: "INIT…", color: "text-warning", iconColor: "text-warning" },
  ready: { label: "READY", color: "text-success", iconColor: "text-success" },
  error: { label: "ERROR", color: "text-destructive", iconColor: "text-destructive" },
};

export function ScannerStatus({
  isListening,
  tagCount,
  uniqueCount,
  wedgeStatus,
  sdkAvailable,
  sdkStatus,
  sdkError,
  sdkScanning,
  readerName,
  deviceType,
}: ScannerStatusProps) {
  const wedge = wedgeConfig[wedgeStatus];
  const sdk = sdkStatus ? sdkConfig[sdkStatus] : sdkConfig.unavailable;
  const deviceLabel =
    deviceType === "integrated" ? "Zebra built-in UHF (TC22R)" : "Zebra TC22R UHF reader";

  return (
    <div className="space-y-2">
      {/* Native SDK banner — only shown when running inside the Capacitor APK */}
      {sdkAvailable && (
        <div
          className={`flex items-center gap-2.5 rounded-lg border p-3 ${
            sdkStatus === "ready"
              ? "border-success/30 bg-success/5"
              : sdkStatus === "error"
                ? "border-destructive/30 bg-destructive/5"
                : "border-border bg-card"
          }`}
        >
          <Cpu
            className={`h-5 w-5 shrink-0 ${sdk.iconColor} ${sdkScanning ? "animate-pulse" : ""}`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">
              {deviceLabel} {readerName ? `· ${readerName}` : ""}
            </p>
            <p className={`text-sm font-bold ${sdk.color}`}>
              {sdk.label}
              {sdkScanning && " · SCANNING"}
            </p>
          </div>
          <span className="text-xs text-muted-foreground shrink-0 truncate max-w-[12rem]">
            {sdkStatus === "ready" && "Pull the trigger to scan"}
            {sdkStatus === "initializing" && "Connecting to reader…"}
            {sdkStatus === "error" && (sdkError ?? "Init failed")}
          </span>
        </div>
      )}


      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center rounded-lg bg-card p-3 border border-border">
          <div className={`mb-1 ${isListening ? "text-success animate-pulse" : "text-muted-foreground"}`}>
            {isListening ? <Radio className="h-5 w-5" /> : <CircleOff className="h-5 w-5" />}
          </div>
          <span className="text-xs text-muted-foreground">Status</span>
          <span className={`text-sm font-bold ${isListening ? "text-success" : "text-destructive"}`}>
            {isListening ? "ACTIVE" : "OFF"}
          </span>
        </div>

        <div className="flex flex-col items-center rounded-lg bg-card p-3 border border-border">
          <Wifi className="mb-1 h-5 w-5 text-primary" />
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-sm font-bold text-foreground">{tagCount}</span>
        </div>

        <div className="flex flex-col items-center rounded-lg bg-card p-3 border border-border">
          <div className="mb-1 h-5 w-5 flex items-center justify-center text-warning font-bold text-xs">#</div>
          <span className="text-xs text-muted-foreground">Unique</span>
          <span className="text-sm font-bold text-foreground">{uniqueCount}</span>
        </div>
      </div>
    </div>
  );
}
