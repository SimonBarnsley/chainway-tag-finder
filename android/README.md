# Android (Capacitor) — Zebra RFD40 + TC22 Wrapper

Native wrapper for using a **Zebra RFD40** UHF RFID sled paired with a **Zebra TC22**
mobile computer through the **e-Connex adapter** (pin-based serial connection — no
Bluetooth pairing required).

This folder is **not** generated yet. Capacitor scaffolds the Android Studio
project on your local machine — it cannot be created from inside the Lovable
preview because Android Studio + JDK + the Android SDK aren't available here.

## One-time local setup

1. **Install prerequisites** (on your dev machine):
   - [Android Studio](https://developer.android.com/studio) (Hedgehog or newer)
   - JDK 17 (Android Studio bundles one, or install Temurin 17)
   - Node.js 20+ and `bun` or `npm`

2. **Pull the project from GitHub** (use the Lovable → GitHub export):
   ```bash
   git clone <your-repo-url>
   cd <repo>
   bun install   # or: npm install
   ```

3. **Build the web bundle** (Capacitor copies `dist/` into the APK):
   ```bash
   bun run build
   ```

4. **Add the Android platform** (creates the `android/` folder):
   ```bash
   bunx cap add android
   bunx cap sync android
   ```

5. **Drop in the Zebra RFID3 SDK**:
   - Download the **Zebra RFID SDK for Android** from the
     [Zebra developer portal](https://developer.zebra.com/rfid-sdk-android).
   - Place the SDK files at `android/app/libs/`:
     - `API3_LIB-x.x.x.aar` (main RFID3 SDK)
     - `ASCII_SDK_API.jar` (if shipped alongside)
   - In `android/app/build.gradle`, ensure the `dependencies` block contains:
     ```gradle
     implementation fileTree(dir: 'libs', include: ['*.aar', '*.jar'])
     ```

6. **Copy the plugin source** from this repo into the Android project:
   - Copy `android-plugin/ZebraRFD40Plugin.kt` to:
     `android/app/src/main/java/com/barcodewarehouse/uhftagfinder/ZebraRFD40Plugin.kt`
   - Merge `android-plugin/MainActivity.kt.snippet` into your generated
     `MainActivity.kt`. It registers the plugin and forwards the e-Connex
     hardware trigger key (KEYCODE 293 / 280) to the plugin.

7. **Open in Android Studio and build**:
   ```bash
   bunx cap open android
   ```
   Then Build → Build Bundle(s) / APK(s) → Build APK(s).

8. **Sideload to the TC22** via USB (with the RFD40 docked via e-Connex):
   ```bash
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   ```

## Development loop

For fast iteration, point Capacitor at your live Lovable preview instead of
rebuilding the APK each time. Uncomment the `server.url` block in
`capacitor.config.ts`, run `bunx cap sync`, and rebuild the APK once. After
that, every change deployed to Lovable is reflected in the WebView on next
app open.

## How it talks to the sled

- **Transport**: `ENUM_TRANSPORT.SERIAL` — the e-Connex adapter exposes the
  RFD40 to the TC22 over a serial pin connection, so no Bluetooth pairing is
  needed and the connection is power-cycle stable.
- **Trigger key**: the e-Connex passes the RFD40 hardware trigger up as
  Android keycode **293** (some firmware uses **280**). `MainActivity` captures
  both and forwards `triggerPressed` / `triggerReleased` events to the plugin,
  which calls `Inventory.perform()` / `Inventory.stop()`.
- **Tag reads**: the plugin subscribes to `RfidEventsListener.eventReadNotify`
  and forwards each `TagData` to JS as `{ epc, rssi, antenna, tid }`.

## Fallback: DataWedge keyboard wedge

If the native plugin is unavailable (browser preview, SDK init failure, etc.)
the app falls back to keyboard-wedge input. Configure a DataWedge profile on
the TC22 to send EPC strings + Enter — the `useRfidScanner` hook will pick
them up automatically.

## Permissions

The Zebra RFID3 SDK over the e-Connex serial connection needs no special
runtime permissions. If you switch to a Bluetooth-paired RFD40 variant, add:
```xml
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
```
to `android/app/src/main/AndroidManifest.xml`.
