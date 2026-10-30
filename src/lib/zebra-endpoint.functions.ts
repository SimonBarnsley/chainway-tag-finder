import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenantAdmin } from "./tenant-access.server";

/**
 * Per-company reader key. Each company gets its own secret key, stored in the
 * server-only company_reader_keys table. Only admins/supervisors of that
 * company (or super admins) can view or regenerate it.
 */
function newKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const input = z.object({
  accessToken: z.string().optional(),
  company: z.string().min(1).max(100),
  regenerate: z.boolean().optional(),
});

export const getZebraApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input.parse)
  .handler(async ({ data, context }) => {
    await requireTenantAdmin(context, data.company);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("company_reader_keys")
      .select("api_key")
      .eq("company_slug", data.company)
      .maybeSingle();
    if (lookupError) throw new Error("Reader key lookup failed");
    let key = (existing as { api_key?: string } | null)?.api_key ?? "";

    if (!key || data.regenerate) {
      key = newKey();
      const { error: upErr } = await supabaseAdmin
        .from("company_reader_keys")
        .upsert({ company_slug: data.company, api_key: key }, { onConflict: "company_slug" });
      if (upErr) return { configured: false as const, apiKey: "", error: "save_failed" as string };
    }
    return { apiKey: key, configured: true, error: null as string | null };
  });
