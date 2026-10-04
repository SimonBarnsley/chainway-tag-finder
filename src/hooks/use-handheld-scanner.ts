import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRfidScanner, type RfidTag } from "@/hooks/use-rfid-scanner";
import { useZebraSdk } from "@/hooks/use-zebra-sdk";

/**
 * Shared tag capture for the handheld screens: native Zebra SDK when inside the
 * APK, keyboard wedge (DataWedge / Chainway) otherwise. Applies the company EPC
 * prefix filter and de-dupes into a Map of EPC -> read count.
 */
export function useHandheldScanner(companySlug: string | null, enabled = true) {
  const [tags, setTags] = useState<Map<string, number>>(new Map());
  const prefixRef = useRef("");

  useEffect(() => {
    if (!companySlug) return;
    let cancelled = false;
    supabase
      .from("company_settings")
      .select("epc_tag_prefix")
      .eq("company_slug", companySlug)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) prefixRef.current = (data?.epc_tag_prefix ?? "").toUpperCase();
      });
    return () => {
      cancelled = true;
    };
  }, [companySlug]);

  const onTag = useCallback((tag: RfidTag) => {
    const epc = tag.epc.toUpperCase();
    if (prefixRef.current && !epc.startsWith(prefixRef.current)) return;
    setTags((prev) => {
      const next = new Map(prev);
      next.set(epc, (next.get(epc) ?? 0) + 1);
      return next;
    });
    if (navigator.vibrate) navigator.vibrate(30);
  }, []);

  useRfidScanner({ enabled, onTagScanned: onTag });
  useZebraSdk({ enabled, onTagScanned: onTag, onProximity: useCallback(() => {}, []) });

  const clear = useCallback(() => setTags(new Map()), []);
  return { tags, clear };
}

/** Load locations list (names) for the company. */
export async function loadLocationNames(companySlug: string): Promise<string[]> {
  const { data } = await supabase
    .from("locations")
    .select("name")
    .eq("company_slug", companySlug)
    .order("name");
  return (data ?? []).map((l) => l.name);
}

/** EPC -> item name lookup. */
export async function loadItemNames(companySlug: string, epcs: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (epcs.length === 0) return out;
  const { data: links } = await supabase
    .from("tag_items")
    .select("epc, item_id")
    .eq("company_slug", companySlug)
    .in("epc", epcs);
  const ids = Array.from(new Set((links ?? []).map((l) => l.item_id)));
  if (ids.length === 0) return out;
  const { data: items } = await supabase.from("items").select("id, name").in("id", ids);
  const byId = new Map((items ?? []).map((i) => [i.id, i.name]));
  for (const l of links ?? []) {
    const n = byId.get(l.item_id);
    if (n) out.set(l.epc.toUpperCase(), n);
  }
  return out;
}
