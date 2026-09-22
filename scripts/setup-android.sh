#!/usr/bin/env bash
#
# UHF Tag Finder — Android project setup
# --------------------------------------
# Prepares the Capacitor Android project with the Zebra RFID plugin wired in,
# so all you have to do afterwards is open it in Android Studio and hit Run.
#
# Usage:
#   bash scripts/setup-android.sh              # full setup
#   bash scripts/setup-android.sh --skip-install
#
# Prerequisites (must already be installed on your machine):
#   * Node 20+ (or Bun), JDK 17, Android Studio + Android SDK
#   * Zebra RFID Mobile SDK .aar (see step 3 below)

set -euo pipefail

APP_PKG="com.barcodewarehouse.uhftagfinder"
PKG_PATH="android/app/src/main/java/com/barcodewarehouse/uhftagfinder"
LIBS_DIR="android/app/libs"
SKIP_INSTALL=0
[[ "${1:-}" == "--skip-install" ]] && SKIP_INSTALL=1

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!   %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓   %s\033[0m\n' "$*"; }

# Pick a package runner
if command -v bun >/dev/null 2>&1; then PM="bun"; RUN="bunx"; else PM="npm"; RUN="npx"; fi

# --- 1. Dependencies ---------------------------------------------------------
if [[ $SKIP_INSTALL -eq 0 ]]; then
  say "Installing JS dependencies with $PM"
  if [[ $PM == "bun" ]]; then bun install; else npm install; fi
  ok "Dependencies installed"
fi

# --- 2. Build web assets + add the Android platform --------------------------
say "Building web bundle"
$PM run build
ok "Web bundle built"

if [[ ! -d "$PKG_PATH" ]]; then
  say "Adding the Android platform"
  $RUN cap add android
  ok "Android platform created"
else
  ok "Android platform already present"
fi

# --- 3. Zebra RFID SDK -------------------------------------------------------
mkdir -p "$LIBS_DIR"
if ! ls "$LIBS_DIR"/*.aar >/dev/null 2>&1; then
  warn "No Zebra SDK .aar found in $LIBS_DIR"
  warn "Download 'Zebra RFID Mobile SDK for Android' (2.0.3 or newer) from"
  warn "https://developer.zebra.com/ and copy the .aar into $LIBS_DIR, then re-run."
  MISSING_AAR=1
else
  ok "Zebra SDK found: $(ls "$LIBS_DIR"/*.aar | xargs -n1 basename | tr '\n' ' ')"
  MISSING_AAR=0
fi

# Make sure Gradle picks up local .aar files
GRADLE="android/app/build.gradle"
if ! grep -q "libs.*aar" "$GRADLE"; then
  say "Wiring libs/*.aar into $GRADLE"
  python3 - "$GRADLE" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p).read()
dep = "    implementation fileTree(include: ['*.aar'], dir: 'libs')\n"
m = re.search(r"dependencies\s*\{\n", s)
if m and dep not in s:
    s = s[:m.end()] + dep + s[m.end():]
    open(p, "w").write(s)
    print("added aar fileTree dependency")
else:
    print("dependency block untouched")
PY
  ok "Gradle configured"
fi

# --- 4. Copy the native plugin + MainActivity --------------------------------
say "Installing native Kotlin sources"
mkdir -p "$PKG_PATH"
cp android-plugin/ZebraTC22RPlugin.kt "$PKG_PATH/ZebraTC22RPlugin.kt"
cp android-plugin/MainActivity.kt.snippet "$PKG_PATH/MainActivity.kt"
ok "ZebraTC22RPlugin.kt and MainActivity.kt written to $PKG_PATH"

# --- 5. Permissions ----------------------------------------------------------
MANIFEST="android/app/src/main/AndroidManifest.xml"
say "Checking AndroidManifest permissions"
python3 - "$MANIFEST" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
perms = [
    "android.permission.BLUETOOTH",
    "android.permission.BLUETOOTH_ADMIN",
    "android.permission.BLUETOOTH_CONNECT",
    "android.permission.BLUETOOTH_SCAN",
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.INTERNET",
]
add = [f'    <uses-permission android:name="{x}" />\n' for x in perms if x not in s]
if add:
    i = s.index("</manifest>")
    s = s[:i] + "".join(add) + s[i:]
    open(p, "w").write(s)
    print(f"added {len(add)} permission(s)")
else:
    print("all permissions already present")
PY
ok "Manifest ready"

# --- 6. Sync -----------------------------------------------------------------
say "Syncing Capacitor"
$RUN cap sync android
ok "Sync complete"

# --- Done --------------------------------------------------------------------
cat <<EOF

────────────────────────────────────────────────────────────
 Setup finished.
────────────────────────────────────────────────────────────
Next steps:

 1. Open the project:      $RUN cap open android
                           (or open the ./android folder in Android Studio)
 2. Let Gradle sync, then Run ▶ onto the TC22R.
 3. On the device, open DataWedge → your app's profile →
    disable the RFID trigger input, otherwise DataWedge swallows
    the trigger and the Geiger search never starts.

The WebView loads the published site defined in capacitor.config.ts
(currently https://rfid-zeba-android.lovable.app), so web-side changes
only need a Lovable publish — no APK rebuild.
EOF

if [[ "${MISSING_AAR:-0}" -eq 1 ]]; then
  warn "Reminder: drop the Zebra SDK .aar into $LIBS_DIR and re-run this script before building."
fi
