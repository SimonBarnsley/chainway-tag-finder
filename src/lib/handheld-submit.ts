import { supabase } from "@/integrations/supabase/client";
import { retryId } from "./handheld-retry";

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