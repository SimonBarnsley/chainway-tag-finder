import { toast } from "sonner";

/**
 * Known package names for Zebra's 123RFID Mobile app.
 * The Play Store listing uses `com.zebra.rfidreader`. Older / OEM-preloaded
 * builds shipped on TC-series devices sometimes use the demo/scanner package.
 * We try them in order and launch the first one installed.
 */
const RFID123_PACKAGES = [
  "com.zebra.rfidreader",
  "com.zebra.rfid.demo.scanner",
  "com.zebra.scanner",
];

interface CopyAndLaunchResult {
  copied: boolean;
  launched: boolean;
  package?: string;
}

interface ZebraRFIDLauncher {
  copyAndLaunch?: (opts: {
    text: string;
    packages: string[];
    label?: string;
  }) => Promise<CopyAndLaunchResult>;
}

function getLauncher(): ZebraRFIDLauncher | undefined {
  if (typeof window === "undefined") return undefined;
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform?.()) return undefined;
  return cap.Plugins?.ZebraRFID as ZebraRFIDLauncher | undefined;
}

/**
 * Copies the given EPC to the clipboard and tries to launch 123RFID Mobile
 * on Android. In a browser preview, falls back to clipboard-only.
 */
export async function copyEpcAndOpen123RFID(epc: string): Promise<void> {
  // Always try clipboard first (works in browser AND inside the APK as a fallback).
  try {
    await navigator.clipboard.writeText(epc);
  } catch {
    /* ignore — native plugin will set clipboard too */
  }

  const launcher = getLauncher();
  if (!launcher?.copyAndLaunch) {
    toast.success("EPC copied", {
      description: "Open 123RFID Mobile and paste it into the Locate Tag field.",
    });
    return;
  }

  try {
    const res = await launcher.copyAndLaunch({
      text: epc,
      packages: RFID123_PACKAGES,
      label: "EPC",
    });
    if (res.launched) {
      toast.success("Opening 123RFID Mobile", {
        description: "EPC copied — long-press the Locate Tag field and tap Paste.",
      });
    } else {
      toast.error("123RFID Mobile not installed", {
        description: "Install Zebra's 123RFID Mobile app from the Play Store.",
      });
    }
  } catch (e) {
    toast.error("Couldn't open 123RFID Mobile", {
      description: e instanceof Error ? e.message : String(e),
    });
  }
}
