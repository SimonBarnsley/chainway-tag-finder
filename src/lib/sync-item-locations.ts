import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * For the given EPCs, find their linked items and set each item's
 * warehouse_location to the most recent scan location across all of
 * that item's linked tags. Always overwrites — most recent scan wins.
 */
export async function syncItemLocationsForEpcs(
  companySlug: string,
  epcs: string[],
  db: SupabaseClient<Database> = supabaseAdmin
): Promise<{ updated: number }> {
  const unique = Array.from(new Set(epcs.map((e) => e.toUpperCase())));
  if (unique.length === 0) return { updated: 0 };

  // Find items linked to these EPCs
  const { data: links, error: linksError } = await db
    .from("tag_items")
    .select("item_id")
    .eq("company_slug", companySlug)
    .in("epc", unique);
  if (linksError) throw new Error("Could not load item links");

  const itemIds = Array.from(new Set((links || []).map((l) => l.item_id)));
  if (itemIds.length === 0) return { updated: 0 };

  // For each affected item, find ALL its linked EPCs, then most recent scan
  const { data: allLinks, error: allLinksError } = await db
    .from("tag_items")
    .select("item_id, epc")
    .eq("company_slug", companySlug)
    .in("item_id", itemIds);
  if (allLinksError) throw new Error("Could not load linked item tags");

  const itemEpcs = new Map<string, string[]>();
  for (const l of allLinks || []) {
    if (!itemEpcs.has(l.item_id)) itemEpcs.set(l.item_id, []);
    itemEpcs.get(l.item_id)?.push(l.epc);
  }

  const allEpcs = Array.from(new Set((allLinks || []).map((l) => l.epc)));
  const { data: scans, error: scansError } = await db
    .from("rfid_scans")
    .select("epc, location, last_seen")
    .eq("company_slug", companySlug)
    .in("epc", allEpcs)
    .not("location", "is", null)
    .order("last_seen", { ascending: false });
  if (scansError) throw new Error("Could not load item scan locations");

  // First scan we see for an EPC is its most recent (sorted desc)
  const epcLatest = new Map<string, { location: string; last_seen: string }>();
  for (const s of scans || []) {
    if (!epcLatest.has(s.epc) && s.location) {
      epcLatest.set(s.epc, { location: s.location, last_seen: s.last_seen });
    }
  }

  let updated = 0;
  for (const [itemId, epcList] of itemEpcs.entries()) {
    let best: { location: string; last_seen: string } | null = null;
    for (const epc of epcList) {
      const cur = epcLatest.get(epc);
      if (cur && (!best || cur.last_seen > best.last_seen)) best = cur;
    }
    if (!best) continue;

    const { error } = await db
      .from("items")
      .update({ warehouse_location: best.location })
      .eq("id", itemId)
      .eq("company_slug", companySlug);
    if (error) throw new Error("Could not update item location");
    updated++;
  }

  return { updated };
}
