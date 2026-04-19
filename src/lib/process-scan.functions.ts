import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decodeSgtin } from "@/lib/sgtin-decoder";

const ProcessScanInput = z.object({
  epc: z.string().min(1).max(256).regex(/^[0-9A-Fa-f]+$/, "EPC must be hexadecimal"),
  location: z.string().min(1).max(255).nullable().optional(),
  scanCount: z.number().int().min(1).max(1_000_000).optional(),
  lastSeen: z.string().datetime().optional(),
});

export interface ProcessScanResult {
  epc: string;
  decoded: boolean;
  gtin: string | null;
  itemId: string | null;
  itemCreated: boolean;
  linked: boolean;
  locationApplied: boolean;
}

/**
 * Handle a single scanned EPC end-to-end:
 *  1. Upsert the scan into rfid_scans (with the current location)
 *  2. Decode the EPC as SGTIN to get a GTIN-14
 *  3. Find a matching item (by gtin or sku) — if none exists, create a
 *     placeholder item carrying the decoded GTIN
 *  4. Link the EPC to the item in tag_items (idempotent)
 *  5. Update items.warehouse_location to the current scan location
 */
export const processScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProcessScanInput.parse(input))
  .handler(async ({ data, context }): Promise<ProcessScanResult> => {
    const { userId } = context;
    const epc = data.epc.toUpperCase();

    // Resolve the user's company_slug — RLS will block any other slug
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("company_slug")
      .eq("user_id", userId)
      .single();
    if (profileErr || !profile?.company_slug) {
      throw new Error("No company assigned to your account");
    }
    const companySlug = profile.company_slug;
    const location = data.location?.trim() || null;
    const scanCount = data.scanCount ?? 1;
    const lastSeen = data.lastSeen ?? new Date().toISOString();

    const result: ProcessScanResult = {
      epc,
      decoded: false,
      gtin: null,
      itemId: null,
      itemCreated: false,
      linked: false,
      locationApplied: false,
    };

    // ── 1. Upsert the scan row ───────────────────────────────────────
    const { error: scanErr } = await supabaseAdmin.from("rfid_scans").upsert(
      [
        {
          epc,
          scan_count: scanCount,
          last_seen: lastSeen,
          location,
          company_slug: companySlug,
        },
      ],
      { onConflict: "epc", ignoreDuplicates: false }
    );
    if (scanErr) {
      console.error("[processScan] rfid_scans upsert error:", scanErr.message);
      throw new Error(`Failed to save scan: ${scanErr.message}`);
    }

    // ── 2. Decode SGTIN ──────────────────────────────────────────────
    const decoded = decodeSgtin(epc);
    if ("error" in decoded) {
      // Not a valid SGTIN — scan saved, no item linkage possible
      return result;
    }
    result.decoded = true;
    result.gtin = decoded.gtin14;

    // ── 3. Find or create the item ───────────────────────────────────
    // First check if EPC is already linked
    const { data: existingLink } = await supabaseAdmin
      .from("tag_items")
      .select("item_id")
      .eq("company_slug", companySlug)
      .eq("epc", epc)
      .maybeSingle();

    let itemId: string | null = existingLink?.item_id ?? null;

    if (!itemId) {
      // Try to match by gtin or sku across candidate values
      const candidates = [
        decoded.gtin14,
        decoded.companyPrefix + decoded.itemReference,
        decoded.itemReference,
      ];
      const { data: matched } = await supabaseAdmin
        .from("items")
        .select("id, gtin, sku")
        .eq("company_slug", companySlug)
        .or(
          `gtin.in.(${candidates.map((c) => `"${c}"`).join(",")}),sku.in.(${candidates.map((c) => `"${c}"`).join(",")})`
        )
        .limit(1);

      if (matched && matched.length > 0) {
        itemId = matched[0].id;
      } else {
        // Auto-create a placeholder item carrying the decoded GTIN
        const { data: created, error: createErr } = await supabaseAdmin
          .from("items")
          .insert({
            name: `Item ${decoded.gtin14}`,
            gtin: decoded.gtin14,
            sku: decoded.gtin14,
            company_slug: companySlug,
            warehouse_location: location,
          })
          .select("id")
          .single();
        if (createErr || !created) {
          console.error("[processScan] item create error:", createErr?.message);
          throw new Error(`Failed to create item: ${createErr?.message ?? "unknown"}`);
        }
        itemId = created.id;
        result.itemCreated = true;
      }
    }

    result.itemId = itemId;

    // ── 4. Ensure tag_items link exists ──────────────────────────────
    if (!existingLink) {
      const { error: linkErr } = await supabaseAdmin.from("tag_items").insert({
        epc,
        item_id: itemId,
        gtin: decoded.gtin14,
        company_slug: companySlug,
      });
      if (linkErr && !linkErr.message.includes("duplicate")) {
        console.error("[processScan] tag_items insert error:", linkErr.message);
      } else {
        result.linked = true;
      }
    }

    // ── 5. Allocate location to the item ─────────────────────────────
    if (location) {
      const { error: locErr } = await supabaseAdmin
        .from("items")
        .update({ warehouse_location: location })
        .eq("id", itemId)
        .neq("warehouse_location", location);
      if (!locErr) result.locationApplied = true;
    }

    return result;
  });
