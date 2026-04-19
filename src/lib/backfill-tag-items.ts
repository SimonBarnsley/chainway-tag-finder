import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { autoLinkEpcsToItems } from "@/lib/auto-link-epcs";
import { syncItemLocationsForEpcs } from "@/lib/sync-item-locations";

/**
 * Retroactively links existing rfid_scans EPCs to items based on
 * GS1 SGTIN decoding (company prefix + item reference matched against items.sku).
 */
export const backfillTagItems = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      companySlug: z.string().min(1).max(100),
    }).parse
  )
  .handler(async ({ data }) => {
    const { companySlug } = data;

    const { data: scans, error: scansErr } = await supabaseAdmin
      .from("rfid_scans")
      .select("epc")
      .eq("company_slug", companySlug);

    if (scansErr) {
      return { ok: false as const, error: scansErr.message, linked: 0, skipped: 0, unmatched: 0 };
    }

    const allEpcs = Array.from(new Set((scans || []).map((s) => s.epc)));
    if (allEpcs.length === 0) {
      return { ok: true as const, total: 0, linked: 0, skipped: 0, unmatched: 0, undecodable: 0 };
    }

    const result = await autoLinkEpcsToItems(companySlug, allEpcs);
    try {
      await syncItemLocationsForEpcs(companySlug, allEpcs);
    } catch (e) {
      console.error("sync-item-locations failed:", e);
    }
    return {
      ok: true as const,
      total: allEpcs.length,
      ...result,
    };
  });
