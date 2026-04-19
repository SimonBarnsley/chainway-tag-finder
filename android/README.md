# Android (Capacitor) — Chainway UHF Wrapper

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

5. **Drop in the Chainway SDK**:
   - Get the `.aar` (or `.jar`) from Chainway (developer portal / device CD).
   - Place it at `android/app/libs/chainway-uhf.aar`.
   - In `android/app/build.gradle`, ensure the `dependencies` block contains:
     ```gradle
     implementation fileTree(dir: 'libs', include: ['*.aar', '*.jar'])
     ```

6. **Copy the plugin source** from this repo into the Android project:
   - Copy `android-plugin/ChainwayUHFPlugin.kt` to:
     `android/app/src/main/java/com/barcodewarehouse/uhftagfinder/ChainwayUHFPlugin.kt`
   - Register it in `android/app/src/main/java/com/.../MainActivity.java` (or `.kt`):
     ```java
     @Override
     public void onCreate(Bundle savedInstanceState) {
       registerPlugin(ChainwayUHFPlugin.class);
       super.onCreate(savedInstanceState);
     }
     ```

7. **Open in Android Studio and build**:
   ```bash
   bunx cap open android
   ```
   Then Build → Build Bundle(s) / APK(s) → Build APK(s).

8. **Sideload to the Chainway device** via USB:
   ```bash
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   ```

## Development loop

For fast iteration, point Capacitor at your live Lovable preview instead of
rebuilding the APK each time. Uncomment the `server.url` block in
`capacitor.config.ts`, run `bunx cap sync`, and rebuild the APK once. After
that, every change deployed to Lovable is reflected in the WebView on next
app open.

## Device model notes

The included plugin targets `com.rscja.deviceapi.RFIDWithUHFUART` which covers
most C-series handhelds (C72, C66, C61, etc.). For BLE variants (C4050, C5)
swap the import in `ChainwayUHFPlugin.kt` to the matching class — see the
SDK docs included with your device.

## Permissions

The plugin needs no special runtime permissions for the UHF radio itself
(it's an internal hardware module). If you later add features that need
camera, location, or storage, add them to
`android/app/src/main/AndroidManifest.xml`.
