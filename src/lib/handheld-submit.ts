import { supabase } from "@/integrations/supabase/client";

/** Stable retry ID for identical submitted data, including after a browser reload. */
export function retryId(storage: Pick<Storage, "getItem" | "setItem">, key: string, request: string, generate: () => string): string {
  const saved = storage.getItem(`${key}:receipt`);
  if (saved) {
    try {
      const value = JSON.parse(saved) as { id: string; request: string };
      if (value.request === request && typeof value.id === "string") return value.id;
    } catch { /* Replace malformed receipt. */ }
  }
  const id = generate();
  storage.setItem(`${key}:receipt`, JSON.stringify({ id, request }));
  return id;
}

export async function submitHandheld(key: string, operation: "goods-in" | "stock-check" | "stock-movement", location: string, tags: [string, number][], source: string | null = null) {
  if (!navigator.onLine) throw new Error("You are offline. Your scan remains on this device; reconnect and submit again.");
  const ordered = [...tags].sort(([a], [b]) => a.localeCompare(b));
  const request = JSON.stringify({ operation, location, source, tags: ordered });
  let id: string;
  try { id = retryId(localStorage, key, request, () => crypto.randomUUID()); }
  catch { throw new Error("This device cannot save a safe retry receipt. Enable browser storage before submitting."); }
  const { data, error } = await supabase.rpc("submit_handheld_scan", { _id: id, _operation: operation, _location: location, _source: source ?? "", _tags: ordered });
  if (error) throw new Error(error.message);
  return data;
}

export function completeHandheld(key: string) {
  localStorage.removeItem(`${key}:receipt`);
  localStorage.removeItem(key);
}