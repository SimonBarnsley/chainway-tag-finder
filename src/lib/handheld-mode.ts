const KEY = "scanloc8-handheld-mode";

/**
 * True on phones/handhelds (and the Android APK's WebView); false on
 * desktop browsers (Windows PC, Mac, Linux desktop) so a handheld flag
 * left over from testing never hijacks a desktop login.
 */
export function isHandheldDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod/i.test(ua) || /;\s*wv\)/i.test(ua);
}

/** Remember that this device runs the handheld app (call from effects/handlers only). */
export function setHandheldMode(on: boolean) {
  if (typeof window === "undefined") return;
  if (on) window.localStorage.setItem(KEY, "1");
  else window.localStorage.removeItem(KEY);
}

export function isHandheldMode(): boolean {
  if (typeof window === "undefined") return false;
  if (!isHandheldDevice()) return false;
  return window.localStorage.getItem(KEY) === "1";
}
