import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { autoLinkEpcsToItems } from "@/lib/auto-link-epcs";
import { syncItemLocationsForEpcs } from "@/lib/sync-item-locations";

const Input = z.object({
  epcs: z.array(z.string().min(1).max(256).regex(/^[0-9A-Fa-f]+$/)).min(1).max(5000),
});

/**
 * Auto-link a specific list of EPCs (typically just-saved scans) to items
 * by decoding their GS1 SGTIN and matching against items.sku / items.gtin.
 * Scoped to the authenticated user's company via their profile.
 */
export const linkSavedEpcs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const db = context.supabase;

    const { data: profile, error: profileErr } = await db
      .from("profiles")
      .select("company_slug")
      .eq("user_id", userId)
      .single();

    if (profileErr || !profile?.company_slug) {
      throw new Error("No company assigned to your account");
    }

    const companySlug = profile.company_slug;
    const epcs = data.epcs.map((e) => e.toUpperCase());

    const { data: saved, error: savedError } = await db.from("rfid_scans").select("epc").eq("company_slug", companySlug).in("epc", epcs);
    if (savedError || new Set((saved ?? []).map((row) => row.epc)).size !== new Set(epcs).size) {
      throw new Error("Only saved tags from your company can be linked");
    }
    const result = await autoLinkEpcsToItems(companySlug, epcs, db);

    try {
      await syncItemLocationsForEpcs(companySlug, epcs, db);
    } catch (e) {
      throw new Error("Tags saved, but item locations could not be updated. Retry submission.");
    }

    // Resolve per-EPC link details (item name + current scan location) for UI feedback
    const { data: links, error: linksError } = await db
      .from("tag_items")
      .select("epc, item_id, items:item_id (name)")
      .eq("company_slug", companySlug)
      .in("epc", epcs);

    const { data: scans, error: scansError } = await db
      .from("rfid_scans")
      .select("epc, location")
      .eq("company_slug", companySlug)
      .in("epc", epcs);
    if (linksError || scansError) throw new Error("Could not read back linked tags");

    const locByEpc = new Map((scans || []).map((s) => [s.epc, s.location]));

    type LinkRow = { epc: string; item_id: string; items: { name: string } | null };
    const details = ((links as unknown as LinkRow[]) || []).map((l) => ({
      epc: l.epc,
      itemId: l.item_id,
      itemName: l.items?.name ?? null,
      location: locByEpc.get(l.epc) ?? null,
    }));

    return { ok: true as const, ...result, details };
  });
