# UHF Tag Finder - Android project setup (Windows PowerShell)
#
# Usage (from the project root, in PowerShell):
#   powershell -ExecutionPolicy Bypass -File scripts\setup-android.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\setup-android.ps1 -SkipInstall
#
# Prerequisites: Node 20+ (or Bun), JDK 17, Android Studio + Android SDK,
# and the Zebra RFID Mobile SDK .aar (2.0.3+) placed in android\app\libs.

param([switch]$SkipInstall)

$ErrorActionPreference = "Stop"

$PkgPath  = "android\app\src\main\java\com\barcodewarehouse\uhftagfinder"
$LibsDir  = "android\app\libs"
$Manifest = "android\app\src\main\AndroidManifest.xml"
$Gradle   = "android\app\build.gradle"

function Say  ($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Warn ($m) { Write-Host "!   $m"  -ForegroundColor Yellow }
function Ok   ($m) { Write-Host "OK  $m"  -ForegroundColor Green }

# Must be run from the project root
if (-not (Test-Path "package.json")) {
  Warn "Run this from the project root (the folder containing package.json)."
  exit 1
}

# Pick a package runner
if (Get-Command bun -ErrorAction SilentlyContinue) { $PM = "bun"; $RUN = "bunx" }
else                                               { $PM = "npm"; $RUN = "npx" }
Ok "Using $PM / $RUN"

# --- 1. Dependencies ---------------------------------------------------------
if (-not $SkipInstall) {
  Say "Installing JS dependencies with $PM"
  & $PM install
  if ($LASTEXITCODE -ne 0) { throw "dependency install failed" }
  Ok "Dependencies installed"
}

# --- 2. Build web assets + add the Android platform --------------------------
Say "Building web bundle"
& $PM run build
if ($LASTEXITCODE -ne 0) { throw "web build failed" }
Ok "Web bundle built"

if (-not (Test-Path $PkgPath)) {
  Say "Adding the Android platform"
  & $RUN cap add android
  if ($LASTEXITCODE -ne 0) { throw "cap add android failed" }
  Ok "Android platform created"
} else {
  Ok "Android platform already present"
}

# --- 3. Zebra RFID SDK -------------------------------------------------------
New-Item -ItemType Directory -Force -Path $LibsDir | Out-Null
$aars = Get-ChildItem -Path $LibsDir -Filter *.aar -ErrorAction SilentlyContinue
$MissingAar = $false
if (-not $aars) {
  Warn "No Zebra SDK .aar found in $LibsDir"
  Warn "Download 'Zebra RFID Mobile SDK for Android' (2.0.3 or newer) from"
  Warn "https://developer.zebra.com/ and copy the .aar into $LibsDir, then re-run."
  $MissingAar = $true
} else {
  Ok ("Zebra SDK found: " + ($aars.Name -join " "))
}

# Make sure Gradle picks up local .aar files
if (Test-Path $Gradle) {
  $g = Get-Content $Gradle -Raw
  if ($g -notmatch "include:\s*\['\*\.aar'\]") {
    Say "Wiring libs/*.aar into $Gradle"
    $dep = "    implementation fileTree(include: ['*.aar'], dir: 'libs')`r`n"
    $g = [regex]::Replace($g, "dependencies\s*\{\r?\n", { param($m) $m.Value + $dep }, 1)
    Set-Content -Path $Gradle -Value $g -NoNewline
    Ok "Gradle configured"
  } else {
    Ok "Gradle already wired for .aar files"
  }
}

# --- 4. Copy the native plugin + MainActivity --------------------------------
Say "Installing native Kotlin sources"
New-Item -ItemType Directory -Force -Path $PkgPath | Out-Null
Copy-Item "android-plugin\ZebraRFD40Plugin.kt"    "$PkgPath\ZebraRFD40Plugin.kt" -Force
Copy-Item "android-plugin\MainActivity.kt.snippet" "$PkgPath\MainActivity.kt"    -Force
Ok "ZebraRFD40Plugin.kt and MainActivity.kt written to $PkgPath"

# --- 5. Permissions ----------------------------------------------------------
Say "Checking AndroidManifest permissions"
if (Test-Path $Manifest) {
  $m = Get-Content $Manifest -Raw
  $perms = @(
    "android.permission.BLUETOOTH",
    "android.permission.BLUETOOTH_ADMIN",
    "android.permission.BLUETOOTH_CONNECT",
    "android.permission.BLUETOOTH_SCAN",
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.INTERNET"
  )
  $add = ($perms | Where-Object { $m -notlike "*$_*" } |
          ForEach-Object { "    <uses-permission android:name=`"$_`" />`r`n" }) -join ""
  if ($add) {
    $m = $m -replace "</manifest>", "$add</manifest>"
    Set-Content -Path $Manifest -Value $m -NoNewline
    Ok "Permissions added"
  } else {
    Ok "All permissions already present"
  }
} else {
  Warn "Manifest not found at $Manifest"
}

# --- 6. Sync -----------------------------------------------------------------
Say "Syncing Capacitor"
& $RUN cap sync android
if ($LASTEXITCODE -ne 0) { throw "cap sync android failed" }
Ok "Sync complete"

Write-Host @"

------------------------------------------------------------
 Setup finished.
------------------------------------------------------------
Next steps:

 1. Open the project:      $RUN cap open android
                           (or open the .\android folder in Android Studio)
 2. Let Gradle sync, then Run onto the TC22R / TC22+RFD40.
 3. On the device, open DataWedge -> your app's profile ->
    disable the RFID trigger input, otherwise DataWedge swallows
    the trigger and the Geiger search never starts.

The WebView loads the published site defined in capacitor.config.ts
(currently https://rfid-zeba-android.lovable.app), so web-side changes
only need a Lovable publish - no APK rebuild.
"@

if ($MissingAar) {
  Warn "Reminder: drop the Zebra SDK .aar into $LibsDir and re-run this script before building."
}
