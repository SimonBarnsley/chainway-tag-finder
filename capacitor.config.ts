import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for the Zebra TC22R all-in-one UHF handheld.
 *
 * This app is server-rendered (TanStack Start), so `dist/client` contains no
 * index.html and CANNOT be bundled as static web assets. The WebView therefore
 * always loads the published site over `server.url`; the native RFID plugin
 * still runs locally, so the trigger/Geiger locate functions work as normal.
 *
 * Point `server.url` at whichever deployment you want the APK to open.
 */
const config: CapacitorConfig = {
  appId: "com.barcodewarehouse.uhftagfinder",
  appName: "ScanLoc8",
  webDir: "dist/client",
  server: {
    url: "https://www.scanloc8.com/handheld",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};


export default config;
