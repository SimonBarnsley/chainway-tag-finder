# Android (Capacitor) — Zebra UHF RFID Wrapper (TC22R & RFD40)

Native wrapper for Zebra UHF RFID hardware. Two supported configurations, both
handled by the same plugin — the transport is auto-detected at `init()`:

| Device | RFID hardware | RFID3 transport |
| --- | --- | --- |
| **TC22R / TC27R** | **built into the device** | `ENUM_TRANSPORT.SERVICE_SERIAL` |
| TC22 + **RFD40** sled | e-Connex pin serial | `ENUM_TRANSPORT.SERIAL` |
| Snap-on / standalone sled | Bluetooth | `ENUM_TRANSPORT.BLUETOOTH` |

`init()` returns `{ readerName, transport, deviceType }` where `deviceType` is
`"integrated"` (TC22R built-in) or `"sled"`, and the UI labels itself
accordingly. You can force one with `init({ transport: "service_serial" })`.

### TC22R specifics

- Use **RFID3 SDK (API3) 2.0.3.x or newer** — earlier builds don't enumerate the
  integrated reader. Drop the `.aar` in `android/app/libs/`.
- The built-in reader appears via `GetAvailableRFIDReaderList()` on
  `SERVICE_SERIAL`, typically named `BUILTIN` / `RFD40-INTERNAL`.
- **DataWedge**: for this app's profile, disable the RFID input plugin (or the
  RFID trigger), otherwise DataWedge owns the radio and the SDK connect fails
  with a "reader in use" style error. Barcode scanning can stay enabled.
- Keep the **RFID Manager / Zebra RFID services** on the device up to date
  (Zebra ships them via LifeGuard); the SDK talks to them over SERVICE_SERIAL.
- The integrated trigger arrives as an SDK `HANDHELD_TRIGGER` status event and
  (depending on key config) as keycode `10036`; both paths are handled.
- Antenna power on the TC22R maxes lower than the RFD40 sled — expect shorter
  read range; there is no separate battery/charging state to monitor.

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

## How it talks to the reader

- **Transport**: auto-detected in order `SERVICE_SERIAL` (TC22R built-in) →
  `SERIAL` (RFD40 over e-Connex) → `BLUETOOTH`. The first transport that
  reports an available reader wins.
- **Trigger key**: the e-Connex passes the RFD40 trigger up as Android keycode
  **293** (some firmware uses **280**); the TC22R integrated trigger is
  **10036** (and also raises an SDK handheld-trigger event). `MainActivity`
  captures them and forwards `triggerPressed` / `triggerReleased` events to the plugin,
  which calls `Inventory.perform()` / `Inventory.stop()`.
- **Tag reads**: the plugin subscribes to `RfidEventsListener.eventReadNotify`
  and forwards each `TagData` to JS as `{ epc, rssi, antenna, tid }`.

## Geiger search (Zebra Tag Locationing)

The Geiger panel uses the RFID3 SDK's dedicated **Tag Locationing** mode rather
than raw RSSI, which is what 123RFID Mobile's "Locate Tag" screen uses:

- JS calls `ZebraRFID.startLocate({ epc })` →
  `reader.Actions.TagLocationing.Perform(epc, null, null)`.
- While locationing runs, `eventReadNotify` delivers only the target tag; the
  plugin reads `tagData.LocationInfo.relativeDistance` (0-100, where 100 means
  the tag is directly in front of the antenna) and emits a `locateProximity`
  event `{ epc, proximity, rssi }`.
- `ZebraRFID.stopLocate()` → `reader.Actions.TagLocationing.Stop()`.
- Inventory and locationing are mutually exclusive — the plugin stops inventory
  before starting locationing and rejects `startScan` while locating.
- Pulling the **hardware trigger** while the Geiger panel is open starts/stops
  locationing instead of a normal inventory scan (the JS hook keeps the armed
  target EPC in `locateEpcRef`).

In the UI the meter shows `SDK locate` when native proximity is driving it;
without the native plugin (browser preview / DataWedge) it falls back to RSSI
or read-rate.

## Fallback: DataWedge keyboard wedge

If the native plugin is unavailable (browser preview, SDK init failure, etc.)
the app falls back to keyboard-wedge input. Configure a DataWedge profile on
the TC22 to send EPC strings + Enter — the `useRfidScanner` hook will pick
them up automatically.

## Permissions

The Zebra RFID3 SDK needs no special runtime permissions for the TC22R
built-in reader or the e-Connex serial connection. If you switch to a Bluetooth-paired RFD40 variant, add:
```xml
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
```
to `android/app/src/main/AndroidManifest.xml`.

## Note: the WebView loads the published site (not bundled assets)

This app is server-rendered, so `dist/client` has no `index.html` and cannot be
packaged as static assets — `bunx cap sync` would fail with
"the web assets directory must contain an index.html file".

`capacitor.config.ts` therefore sets:

```ts
server: { url: "https://rfid-zeba-android.lovable.app", cleartext: false }
```

The native RFID plugin (trigger, inventory, **Geiger tag locationing**) still runs
on-device — only the UI is loaded over HTTPS. So to test new web-side changes you
just **publish/update** in Lovable and relaunch the app; you only need to rebuild
the APK when the Kotlin plugin changes.
