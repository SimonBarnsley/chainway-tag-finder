import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decodeSgtin } from "@/lib/sgtin-decoder";

export interface AutoLinkResult {
  linked: number;
  skipped: number;
  unmatched: number;
  undecodable: number;
}

/**
 * For a given list of EPCs (typically just-inserted scans), decode each as
 * GS1 SGTIN, match against items.sku (item reference, then companyPrefix+itemRef,
 * then GTIN-14 fallback), and insert tag_items rows for any unmapped matches.
 *
 * Safe to call repeatedly — already-linked EPCs are skipped.
 */
export async function autoLinkEpcsToItems(
  companySlug: string,
  epcs: string[]
): Promise<AutoLinkResult> {
  const result: AutoLinkResult = { linked: 0, skipped: 0, unmatched: 0, undecodable: 0 };
  const unique = Array.from(new Set(epcs.map((e) => e.toUpperCase())));
  if (unique.length === 0) return result;

  // Skip EPCs that already have a tag_items mapping for this company
  const { data: existing } = await supabaseAdmin
    .from("tag_items")
    .select("epc")
    .eq("company_slug", companySlug)
    .in("epc", unique);

  const alreadyLinked = new Set((existing || []).map((t) => t.epc));
  result.skipped = alreadyLinked.size;
  const toProcess = unique.filter((e) => !alreadyLinked.has(e));
  if (toProcess.length === 0) return result;

  // Decode first to find which EPCs we can even match
  const decoded = toProcess
    .map((epc) => ({ epc, decoded: decodeSgtin(epc) }))
    .filter((d) => {
      if ("error" in d.decoded) {
        result.undecodable++;
        return false;
      }
      return true;
    }) as { epc: string; decoded: Exclude<ReturnType<typeof decodeSgtin>, { error: string }> }[];

  if (decoded.length === 0) return result;

  // Collect candidate sku/gtin values to look up in one query
  const candidates = new Set<string>();
  for (const d of decoded) {
    candidates.add(d.decoded.itemReference);
    candidates.add(d.decoded.companyPrefix + d.decoded.itemReference);
    candidates.add(d.decoded.gtin14);
  }

  const candidateList = Array.from(candidates);
  const { data: items } = await supabaseAdmin
    .from("items")
    .select("id, sku, gtin")
    .eq("company_slug", companySlug)
    .or(
      `sku.in.(${candidateList.map((c) => `"${c}"`).join(",")}),gtin.in.(${candidateList.map((c) => `"${c}"`).join(",")})`
    );

  const skuMap = new Map<string, string>();
  const gtinMap = new Map<string, string>();
  for (const it of items || []) {
    if (it.sku) skuMap.set(it.sku, it.id);
    if (it.gtin) gtinMap.set(it.gtin, it.id);
  }

  const inserts: { epc: string; item_id: string; gtin: string | null; company_slug: string }[] = [];
  for (const d of decoded) {
    const { companyPrefix, itemReference, gtin14 } = d.decoded;
    const itemId =
      skuMap.get(itemReference) ||
      skuMap.get(companyPrefix + itemReference) ||
      gtinMap.get(gtin14);
    if (!itemId) {
      result.unmatched++;
      continue;
    }
    inserts.push({ epc: d.epc, item_id: itemId, gtin: gtin14, company_slug: companySlug });
  }

  if (inserts.length === 0) return result;

  const { error } = await supabaseAdmin.from("tag_items").insert(inserts);
  if (error) {
    console.error("autoLinkEpcsToItems insert error:", error.message);
    return result;
  }
  result.linked = inserts.length;
  return result;
}
