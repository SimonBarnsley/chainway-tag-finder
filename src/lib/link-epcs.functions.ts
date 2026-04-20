import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
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

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("company_slug")
      .eq("user_id", userId)
      .single();

    if (profileErr || !profile?.company_slug) {
      throw new Error("No company assigned to your account");
    }

    const companySlug = profile.company_slug;
    const epcs = data.epcs.map((e) => e.toUpperCase());

    const result = await autoLinkEpcsToItems(companySlug, epcs);

    try {
      await syncItemLocationsForEpcs(companySlug, epcs);
    } catch (e) {
      console.error("[linkSavedEpcs] sync-item-locations failed:", e);
    }

    return { ok: true as const, ...result };
  });
