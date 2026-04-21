import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decodeSgtin } from "@/lib/sgtin-decoder";

export interface AutoLinkResult {
  linked: number;
  skipped: number;
  unmatched: number;
  undecodable: number;
  itemsCreated: number;
}

/**
 * For a given list of EPCs (typically just-inserted scans), match each to an
 * item and create a tag_items link. Strategy per EPC:
 *
 *   1. Skip if already linked.
 *   2. If the EPC decodes as SGTIN, try to match an existing item by
 *      itemReference / companyPrefix+itemReference / GTIN-14.
 *   3. If still no match, auto-create a placeholder item:
 *        - SGTIN tags  → name "Item <gtin14>", sku/gtin = gtin14
 *        - Raw TIDs    → name "Tag <last 8 hex>", sku = full EPC
 *      and link the EPC to it.
 *
 * Safe to call repeatedly — already-linked EPCs are skipped.
 */
export async function autoLinkEpcsToItems(
  companySlug: string,
  epcs: string[]
): Promise<AutoLinkResult> {
  const result: AutoLinkResult = {
    linked: 0,
    skipped: 0,
    unmatched: 0,
    undecodable: 0,
    itemsCreated: 0,
  };
  const unique = Array.from(new Set(epcs.map((e) => e.toUpperCase())));
  if (unique.length === 0) return result;

  // Skip EPCs already linked for this company
  const { data: existing } = await supabaseAdmin
    .from("tag_items")
    .select("epc")
    .eq("company_slug", companySlug)
    .in("epc", unique);

  const alreadyLinked = new Set((existing || []).map((t) => t.epc));
  result.skipped = alreadyLinked.size;
  const toProcess = unique.filter((e) => !alreadyLinked.has(e));
  if (toProcess.length === 0) return result;

  // Decode each EPC (some will fail — those are raw chip TIDs)
  const decodedEntries = toProcess.map((epc) => {
    const d = decodeSgtin(epc);
    return "error" in d ? { epc, decoded: null } : { epc, decoded: d };
  });

  // Build candidate sku/gtin lookup set from decodable EPCs
  const candidates = new Set<string>();
  for (const e of decodedEntries) {
    if (!e.decoded) continue;
    candidates.add(e.decoded.itemReference);
    candidates.add(e.decoded.companyPrefix + e.decoded.itemReference);
    candidates.add(e.decoded.gtin14);
  }

  const skuMap = new Map<string, string>();
  const gtinMap = new Map<string, string>();
  if (candidates.size > 0) {
    const candidateList = Array.from(candidates);
    const { data: items } = await supabaseAdmin
      .from("items")
      .select("id, sku, gtin")
      .eq("company_slug", companySlug)
      .or(
        `sku.in.(${candidateList.map((c) => `"${c}"`).join(",")}),gtin.in.(${candidateList.map((c) => `"${c}"`).join(",")})`
      );
    for (const it of items || []) {
      if (it.sku) skuMap.set(it.sku, it.id);
      if (it.gtin) gtinMap.set(it.gtin, it.id);
    }
  }

  const inserts: { epc: string; item_id: string; gtin: string | null; company_slug: string }[] = [];

  for (const entry of decodedEntries) {
    let itemId: string | undefined;
    let gtinForLink: string | null = null;

    if (entry.decoded) {
      const { companyPrefix, itemReference, gtin14 } = entry.decoded;
      itemId =
        skuMap.get(itemReference) ||
        skuMap.get(companyPrefix + itemReference) ||
        gtinMap.get(gtin14);
      gtinForLink = gtin14;
    } else {
      result.undecodable++;
    }

    // No existing item — auto-create a placeholder
    if (!itemId) {
      const name = entry.decoded
        ? `Item ${entry.decoded.gtin14}`
        : `Tag ${entry.epc.slice(-8)}`;
      const sku = entry.decoded ? entry.decoded.gtin14 : entry.epc;
      const { data: created, error: createErr } = await supabaseAdmin
        .from("items")
        .insert({
          name,
          sku,
          gtin: gtinForLink,
          company_slug: companySlug,
        })
        .select("id")
        .single();

      if (createErr || !created) {
        console.error("[autoLinkEpcsToItems] item create error:", createErr?.message);
        result.unmatched++;
        continue;
      }
      itemId = created.id;
      result.itemsCreated++;
      // Cache so duplicate decoded EPCs in the same batch reuse this item
      if (entry.decoded) {
        skuMap.set(entry.decoded.gtin14, itemId);
        gtinMap.set(entry.decoded.gtin14, itemId);
      }
    }

    inserts.push({
      epc: entry.epc,
      item_id: itemId,
      gtin: gtinForLink,
      company_slug: companySlug,
    });
  }

  if (inserts.length === 0) return result;

  const { error } = await supabaseAdmin.from("tag_items").insert(inserts);
  if (error) {
    console.error("[autoLinkEpcsToItems] tag_items insert error:", error.message);
    return result;
  }
  result.linked = inserts.length;
  return result;
}
