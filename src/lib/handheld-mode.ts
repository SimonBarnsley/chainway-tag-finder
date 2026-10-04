const KEY = "scanloc8-handheld-mode";

/** Remember that this device runs the handheld app (call from effects/handlers only). */
export function setHandheldMode(on: boolean) {
  if (typeof window === "undefined") return;
  if (on) window.localStorage.setItem(KEY, "1");
  else window.localStorage.removeItem(KEY);
}

export function isHandheldMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}
