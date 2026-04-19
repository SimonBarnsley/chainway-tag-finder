import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for the Chainway UHF wrapper.
 *
 * Two modes:
 *  - Development (server.url set): WebView loads the live Lovable preview URL
 *    so you can iterate on the web UI without rebuilding the APK each time.
 *  - Production (server.url commented out): WebView loads the bundled
 *    `dist/` folder produced by `vite build`. Use this for sideload/distribution.
 */
const config: CapacitorConfig = {
  appId: "com.barcodewarehouse.uhftagfinder",
  appName: "UHF Tag Finder",
  webDir: "dist",
  // For live development against the published site, uncomment:
  // server: {
  //   url: "https://uhf-tag-finder.lovable.app",
  //   cleartext: false,
  // },
  android: {
    allowMixedContent: false,
  },
};

export default config;
